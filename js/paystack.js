import { 
  runTransaction, 
  doc, 
  serverTimestamp, 
  increment 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js?v=14";
import { showToast, setLoading } from "./utils.js?v=14";

const PAYSTACK_PUBLIC_KEY = 'pk_live_14393bf34af171d50eb5d2a530c088c7dccf2a1b';

// 🔥 GLOBAL HANDLER
window.handlePaystackCallback = async function(response, paymentData) {
  console.log("✅ Paystack Callback Triggered:", response);
  showToast("Payment successful! Updating wallet...", "info");

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not logged in");

    const txRef = doc(db, "transactions", `tx_${response.reference}`);
    const userRef = doc(db, "users", user.uid);

    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) throw new Error("User not found");

      // Create transaction record
      transaction.set(txRef, {
        userId: user.uid,
        type: paymentData.paymentType || "deposit",
        amount: paymentData.amount,
        paymentMethod: paymentData.method || "paystack",
        provider: "paystack",
        status: "completed",
        reference: response.reference,
        animalType: paymentData.animalType || null,
        createdAt: serverTimestamp()
      });

      // Update wallet or create investment
      if (paymentData.paymentType === "investment") {
        const invRef = doc(db, "investments", `inv_${response.reference}`);
        const maturityDate = new Date(Date.now() + ((paymentData.durationHours || 0) * 3600000));
        
        const expectedReturn = paymentData.expectedReturn || paymentData.amount;
        const profit = expectedReturn - paymentData.amount;
        const roiPercent = paymentData.amount > 0 ? (profit / paymentData.amount) * 100 : 0;

        transaction.set(invRef, {
          userId: user.uid,
          animalType: paymentData.animalType,
          amount: paymentData.amount,
          expectedReturn: expectedReturn,
          profit: profit,
          roiPercent: roiPercent,
          durationHours: paymentData.durationHours || 0,
          status: "active",
          paymentMethod: paymentData.method || "paystack",
          paymentReference: response.reference,
          payoutProcessed: false,
          startDate: serverTimestamp(),
          maturityDate: maturityDate,
          createdAt: serverTimestamp()
        });

        transaction.update(userRef, {
          totalInvestment: increment(paymentData.amount),
          activeInvestmentCount: increment(1),
          walletBalance: increment(-paymentData.amount),
          lastDeposit: serverTimestamp()
        });
      } else {
        // Simple deposit
        transaction.update(userRef, {
          walletBalance: increment(paymentData.amount),
          totalDeposits: increment(paymentData.amount),
          lastDeposit: serverTimestamp()
        });
      }
    });

    showToast("✅ Wallet updated! Redirecting...", "success");
    
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1500);

  } catch (error) {
    console.error("❌ Callback error:", error);
    showToast("Payment received but update failed. Contact support with ref: " + response.reference, "error");
  }
};

export async function openPaystack(amount, email, onSuccess, options = {}) {
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
  const roiPercent = options.roiPercent || 0;
  const method = options.method || "paystack";

  try {
    setLoading(true);
    showToast("Loading Paystack...", "info");

    // Load Paystack script
    let script = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      document.head.appendChild(script);
    }

    // Wait for Paystack to be ready
    await new Promise((resolve, reject) => {
      if (window.PaystackPop) {
        resolve();
      } else {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Paystack failed to load"));
        setTimeout(() => reject(new Error("Paystack timeout")), 10000);
      }
    });

    const amountInKobo = Math.round(numericAmount * 100);
    const reference = `AGW_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    console.log("💳 Initializing Paystack:", { amount: numericAmount, email: customerEmail, ref: reference });

    // Store payment data globally
    window.currentPaymentData = {
      amount: numericAmount,
      paymentType: paymentType,
      animalType: animalType,
      durationHours: durationHours,
      expectedReturn: expectedReturn,
      roiPercent: roiPercent,
      method: method,
      reference: reference
    };

    // 🔥 SIMPLE CALLBACK - Just call the global handler
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: customerEmail,
      amount: amountInKobo,
      currency: "GHS",
      ref: reference,
      callback: function(response) {
        console.log("✅ Paystack callback fired!");
        
        // ✅ FIXED: Check if onSuccess is a function before calling it
        if (typeof onSuccess === 'function') {
          try {
            onSuccess(response);
          } catch (err) {
            console.warn("onSuccess callback error:", err);
          }
        }
        
        // Call the global handler
        window.handlePaystackCallback(response, window.currentPaymentData);
      },
      onClose: function() {
        console.log("Payment cancelled");
        setLoading(false);
        showToast("Payment cancelled", "info");
      }
    });

    setLoading(false);
    handler.openIframe();

  } catch (error) {
    console.error("❌ Paystack error:", error);
    setLoading(false);
    showToast(error.message || "Failed to open payment", "error");
  }
}