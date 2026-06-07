import { doc, getDoc, onSnapshot, query, collection, where, orderBy, limit, runTransaction, serverTimestamp, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

export function getUserData(uid) { return getDoc(doc(db, 'users', uid)).then(s => s.data()); }
export function watchUser(uid, cb) { return onSnapshot(doc(db, 'users', uid), s => cb(s.data())); }
export function watchTransactions(uid, cb) {
  return onSnapshot(query(collection(db, 'transactions'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(50)), 
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function watchNotifications(uid, cb) {
  return onSnapshot(query(collection(db, 'notifications'), where('userId', '==', uid), where('read', '==', false), orderBy('createdAt', 'desc')),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ✅ Watch all active investments for a user
// Using a single listener that covers both active and completed
export function watchInvestments(uid, cb) {
  return onSnapshot(
    query(collection(db, 'investments'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function createInvestment(uid, type, amount, durationHours, options = {}) {
  const minimumInvestment = options.minimumInvestment || amount;
  const baseReturn = options.baseReturn || 0;
  const expectedReturn = options.expectedReturn || ((amount / minimumInvestment) * baseReturn);
  const profit = options.profit || (expectedReturn - amount);
  const roiPercent = options.roiPercent || ((profit / amount) * 100);
  const maturityMs = Number(durationHours) * 3600000;
  const maturityDate = new Date(Date.now() + maturityMs);

  return runTransaction(db, async (t) => {
    const ref = doc(db, 'users', uid);
    const snap = await t.get(ref);
    const bal = snap.data().walletBalance || 0;
    if (bal < amount) throw new Error('Insufficient wallet balance');
    t.update(ref, {
      walletBalance: bal - amount,
      totalInvestment: (snap.data().totalInvestment || 0) + amount,
      activeInvestmentCount: (snap.data().activeInvestmentCount || 0) + 1
    });
    const invId = `inv_${Date.now()}`;
    t.set(doc(db, 'investments', invId), {
      userId: uid,
      animalType: type,
      amount,
      minimumInvestment,
      baseReturn,
      expectedReturn,
      profit,
      roiPercent,
      durationHours: Number(durationHours),
      durationLabel: options.durationLabel || `${durationHours}h`,
      status: 'active',
      startDate: serverTimestamp(),
      maturityDate,
      payoutProcessed: false,
      createdAt: serverTimestamp()
    });
    t.set(doc(db, 'transactions', `tx_${Date.now()}`), {
      userId: uid, type: 'investment', amount, paymentMethod: 'wallet', status: 'completed', createdAt: serverTimestamp()
    });
    t.set(doc(db, 'notifications', `n_${Date.now()}`), {
      userId: uid, title: 'Investment Confirmed', message: `₵${amount} invested in ${type}. Expected return: GHS ${expectedReturn.toFixed(2)}.`, read: false, createdAt: serverTimestamp()
    });
  });
}

// ✅ Process matured investment - credit wallet, mark completed, create notification
export async function processMaturedInvestment(investmentId, investment) {
  if (investment.payoutProcessed || investment.status === 'completed') return;

  await runTransaction(db, async (t) => {
    const invRef = doc(db, 'investments', investmentId);
    const invSnap = await t.get(invRef);

    if (!invSnap.exists()) return;
    const invData = invSnap.data();

    // Double-check to prevent duplicate payouts
    if (invData.payoutProcessed || invData.status === 'completed') return;

    const userRef = doc(db, 'users', invData.userId);
    const userSnap = await t.get(userRef);
    if (!userSnap.exists()) return;

    const expectedReturn = invData.expectedReturn || invData.amount;

    // Mark investment as completed
    t.update(invRef, {
      status: 'completed',
      payoutProcessed: true,
      completedAt: serverTimestamp(),
      payoutAmount: expectedReturn
    });

    // Credit wallet with return amount
    t.update(userRef, {
      walletBalance: increment(expectedReturn),
      totalReturns: increment(expectedReturn),
      activeInvestmentCount: Math.max(0, (userSnap.data().activeInvestmentCount || 1) - 1),
      updatedAt: serverTimestamp()
    });

    // Create payout transaction
    t.set(doc(db, 'transactions', `tx_ret_${Date.now()}`), {
      userId: invData.userId,
      type: 'return',
      amount: expectedReturn,
      investmentId: investmentId,
      animalType: invData.animalType,
      paymentMethod: 'wallet',
      status: 'completed',
      createdAt: serverTimestamp()
    });

    // Create notification
    t.set(doc(db, 'notifications', `n_ret_${Date.now()}`), {
      userId: invData.userId,
      title: 'Investment Matured',
      message: `Your ${invData.animalType} investment has matured successfully. GHS ${expectedReturn.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} has been credited.`,
      read: false,
      type: 'investment_matured',
      createdAt: serverTimestamp()
    });
  });
}
