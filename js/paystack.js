import { 
  runTransaction, 
  doc, 
  serverTimestamp, 
  increment 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js?v=11";
import { showToast, setLoading } from "./utils.js?v=11";

const PAYSTACK_PUBLIC_KEY = 'pk_live_14393bf34af171d50eb5d2a530c088c7dccf2a1b';

let paystackScriptPromise = null;
let paymentInProgress = false;

function loadPaystackScript() {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (paystackScriptPromise) return paystackScriptPromise;

  paystackScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => resolve(window.PaystackPop);
    script.onerror = () => {
      paystackScriptPromise = null;
      reject(new Error('Paystack script failed to load.'));
    };
    document.head.appendChild(script);
  });

  return paystackScriptPromise;
}

// 🔥 DIRECT DATABASE UPDATE - No Cloud Function needed
async function savePaymentToFirestore(payment) {
  const uid = payment.user.uid;
  const userRef = doc(db, "users", uid);
  const txRef = doc(db, "transactions", `tx_${payment.reference}`);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error("User profile not found");

    const userData = userDoc.data();

    // 1. Create transaction record
    transaction.set(txRef, {
      userId: uid,
      type: payment.paymentType === "investment" ? "investment" : "deposit",
      amount: payment.amount,
      paymentMethod: payment.method || "paystack",
      provider: "paystack",
      status: "completed",
      reference: payment.reference,
      animalType: payment.animalType || null,
      createdAt: serverTimestamp()
    });

    // 2. If it's an investment, create investment record
    if (payment.paymentType === "investment") {
      const invRef = doc(db, "investments", `inv_${payment.reference}`);
      const durationHours = payment.durationHours || 0;
      const maturityDate = new Date(Date.now() + (durationHours * 3600000));
      
      const expectedReturn = payment.expectedReturn || payment.amount;
      const profit = expectedReturn - payment.amount;
      const roiPercent = payment.amount > 0 ? (profit / payment.amount) * 100 : 0;

      transaction.set(invRef, {
        userId: uid,
        animalType: payment.animalType,
        amount: payment.amount,
        expectedReturn: expectedReturn,
        profit: profit,
        roiPercent: roiPercent,
        durationHours: durationHours,
        status: "active",
        paymentMethod: payment.method || "paystack",
        paymentReference: payment.reference,
        payoutProcessed: false,
        startDate: serverTimestamp(),
        maturityDate: maturityDate,
        createdAt: serverTimestamp()
      });

      // 3. Update user stats for investment
      transaction.update(userRef, {
        totalInvestment: increment(payment.amount),
        activeInvestmentCount: increment(1),
        walletBalance: increment(-payment.amount), // Deduct from wallet
        lastDeposit: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      // 4. For deposits, just update wallet
      transaction.update(userRef, {
        walletBalance: increment(payment.amount),
        totalDeposits: increment(payment.amount),
        lastDeposit: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  });

  console.log("✅ Payment saved to Firestore");
}

function showReceiptModal(payment) {
  const oldModal = document.getElementById("paystackReceiptModal");
  if (oldModal) oldModal.remove();

  const modal = document.createElement("div");
  modal.id = "paystackReceiptModal";
  Object.assign(modal.style, {
    position: "fixed",
    inset: "0",
    display: "grid",
    placeItems: "center",
    background: "rgba(10,15,12,0.82)",
    zIndex: "10000",
    padding: "20px"
  });

  const isInvestment = payment.paymentType === "investment";
  const title = isInvestment ? "Investment Successful" : "Payment Successful";
  const details = isInvestment ? `
    <p style="color:var(--pale-green);margin:12px 0;"><strong>Asset:</strong> ${payment.animalType}</p>
    <p style="color:var(--pale-green);margin:12px 0;"><strong>Duration:</strong> ${payment.durationHours} hours</p>
    <p style="color:var(--bright-green);margin:12px 0;"><strong>Expected Return:</strong> GHS ${(payment.expectedReturn || payment.amount).toFixed(2)}</p>
  ` : '';

  modal.innerHTML = `
    <div class="glass" style="width:100%;max-width:420px;padding:28px;">
      <h3 style="margin-bottom:16px;color:var(--cream);">${title}</h3>
      <p style="color:var(--pale-green);margin:12px 0;"><strong>Amount:</strong> GHS ${payment.amount.toFixed(2)}</p>
      ${details}
      <p style="color:var(--pale-green);margin:12px 0;"><strong>Reference:</strong> ${payment.reference}</p>
      <p style="color:var(--bright-green);margin:12px 0;"><strong>Status:</strong> ${isInvestment ? 'Investment Active' : 'Wallet Updated'}</p>
      <button class="btn" id="paystackReceiptDone" style="width:100%;margin-top:20px;">Go to Dashboard</button>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("paystackReceiptDone").onclick = () => {
    modal.remove();
    window.location.href = "dashboard.html";
  };
}

export async function openPaystack(amount, email, onSuccess, options = {}) {
  if (paymentInProgress) {
    showToast("A payment is already in progress.", "warning");
    return;
  }

  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    showToast("Please enter a valid amount", "warning");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    showToast("Please login first", "warning");
    window.location.href = "login.html";
    return;
  }

  const customerEmail = String(email || user.email || "").trim();
  if (!customerEmail || !customerEmail.includes("@")) {
    showToast("Valid email required", "warning");
    return;
  }

  const paymentType = options.paymentType || "deposit";
  const animalType = options.animalType || null;
  const durationHours = options.durationHours || options.duration || 0;
  const expectedReturn = options.expectedReturn || options.baseReturn || numericAmount;

  try {
    paymentInProgress = true;
    setLoading(true);
    showToast("Loading payment gateway...", "info");
    await loadPaystackScript();

    const amountInKobo = Math.round(numericAmount * 100);
    const reference = `AGW_${paymentType.toUpperCase()}_${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    console.log("💳 Starting payment:", { amount: numericAmount, type: paymentType, reference });

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: customerEmail,
      amount: amountInKobo,
      currency: "GHS",
      ref: reference,
      metadata: {
        userId: user.uid,
        paymentType: paymentType,
        animalType: animalType,
        durationHours: durationHours,
        expectedReturn: expectedReturn,
        custom_fields: [
          { display_name: "User ID", variable_name: "user_id", value: user.uid },
          { display_name: "Payment Type", variable_name: "payment_type", value: paymentType }
        ]
      },
      channels: ["card", "mobile_money", "bank"],
      callback: async function(response) {
        console.log("✅ Paystack success:", response);
        showToast("Payment successful! Updating records...", "info");

        try {
          // 🔥 DIRECT DATABASE UPDATE
          await savePaymentToFirestore({
            user,
            amount: numericAmount,
            reference: response.reference || reference,
            method: "paystack",
            paymentType: paymentType,
            animalType: animalType,
            durationHours: durationHours,
            expectedReturn: expectedReturn
          });

          showToast("✅ Records updated successfully!", "success");
          
          if (onSuccess) await onSuccess(response);
          
          showReceiptModal({
            amount: numericAmount,
            reference: response.reference || reference,
            paymentType: paymentType,
            animalType: animalType,
            durationHours: durationHours,
            expectedReturn: expectedReturn
          });

        } catch (err) {
          console.error("❌ Database update failed:", err);
          showToast("Payment received but update failed. Contact support with ref: " + (response.reference || reference), "error");
        } finally {
          paymentInProgress = false;
          setLoading(false);
        }
      },
      onClose: function() {
        paymentInProgress = false;
        setLoading(false);
        showToast("Payment cancelled", "info");
      }
    });

    setLoading(false);
    handler.openIframe();

  } catch (error) {
    paymentInProgress = false;
    setLoading(false);
    console.error("❌ Payment failed:", error);
    showToast(error.message || "Failed to open payment", "error");
  }
}