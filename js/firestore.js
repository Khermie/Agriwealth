import { doc, getDoc, onSnapshot, query, collection, where, orderBy, limit, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

export async function createInvestment(uid, type, amount, duration) {
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
      userId: uid, animalType: type, amount, duration, roi: 15, status: 'active',
      createdAt: serverTimestamp(), maturityDate: new Date(Date.now() + duration * 30 * 86400000)
    });
    t.set(doc(db, 'transactions', `tx_${Date.now()}`), {
      userId: uid, type: 'investment', amount, paymentMethod: 'wallet', status: 'completed', createdAt: serverTimestamp()
    });
    t.set(doc(db, 'notifications', `n_${Date.now()}`), {
      userId: uid, title: 'Investment Confirmed', message: `₵${amount} invested in ${type}.`, read: false, createdAt: serverTimestamp()
    });
  });
}