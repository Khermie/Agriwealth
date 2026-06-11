import { 
  runTransaction, 
  doc, 
  serverTimestamp, 
  increment,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js?v=24";
import { showToast, setLoading } from "./utils.js?v=24";

const PAYSTACK_PUBLIC_KEY = 'pk_test_db1821c1832ae2649f294e91c1a443ba1507ae2d';

// 🔥 GLOBAL HANDLER
window.handlePaystackCallback = async function(response, paymentData, userId) {
  console.log("[Paystack] Payment successful:", response);
  console.log("[Paystack] User ID:", userId);
  console.log("[Paystack] Payment data:", paymentData);

  try {
    if (!userId) {
      throw new Error("User ID not found. Please login again.");
    }

    const txRef = doc(db, "transactions", `tx_${response.reference}`);
    const userRef = doc(db, "users", userId);

    // Check for duplicate transaction
    console.log("[Paystack] Checking for duplicate...");
    const existingTx = await getDoc(txRef);
    if (existingTx.exists()) {
      console.warn("[Paystack] Duplicate transaction detected");
      showToast("Payment already processed. Redirecting...", "warning");
      setTimeout(() => {
        window.location.replace("dashboard.html");
      }, 2000);
      return;
    }

    console.log("[Paystack] Starting wallet update...");

    // 🔥 SIMPLIFIED: Use setDoc with merge instead of complex transaction
    await runTransaction(db, async (transaction) => {
      // Get user doc
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        // Create user profile if it doesn't exist
        const user = auth.currentUser;
        const email = user?.email || "unknown";
        const displayName = user?.displayName || "User";
        const nameParts = displayName.split(" ");
        const firstName = nameParts[0] || "User";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Create user document
        await setDoc(userRef, {
          firstName: firstName,
          lastName: lastName,
          email: email,
          phone: "",
          country: "",
          profileImage: null,
          kycStatus: "pending",
          walletBalance: 0,
          totalInvestment: 0,
          activeInvestmentCount: 0,
          totalReturns: 0,
          totalDeposits: 0,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log("[Paystack] User profile created");
      }

      // Create transaction record
      transaction.set(txRef, {
        userId: userId,
        type: paymentData.paymentType || "deposit",
        amount: paymentData.amount,
        paymentMethod: paymentData.method || "paystack",
        provider: "paystack",
        status: "success",
        reference: response.reference,
        paystackReference: response.reference,
        animalType: paymentData.animalType || null,
        createdAt: serverTimestamp()
      });

      // Update wallet balance
      if (paymentData.paymentType === "investment") {
        // For investment: deduct from wallet
        transaction.update(userRef, {
          totalInvestment: increment(paymentData.amount),
          activeInvestmentCount: increment(1),
          walletBalance: increment(-paymentData.amount),
          lastDeposit: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // For deposit: add to wallet
        transaction.update(userRef, {
          walletBalance: increment(paymentData.amount),
          totalDeposits: increment(paymentData.amount),
          lastDepositAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    console.log("[Paystack] ✅ Transaction successful!");
    showToast("✅ Deposit successful! Wallet updated.", "success");
    
    // Redirect to dashboard
    setTimeout(() => {
      window.location.replace("dashboard.html?refresh=" + Date.now());
    }, 2000);

  } catch (error) {
    console.error("[Paystack] ❌ Transaction failed:", error);
    console.error("[Paystack] Error code:", error.code);
    console.error("[Paystack] Error message:", error.message);
    
    // More specific error messages
    let errorMsg = "Payment received but update failed. ";
    if (error.code === "permission-denied") {
      errorMsg += "Permission error. Contact support.";
    } else if (error.code === "already-exists") {
      errorMsg += "Transaction already exists.";
    } else {
      errorMsg += "Contact support with ref: " + response.reference;
    }
    
    showToast(errorMsg, "error");
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

    let script = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      document.head.appendChild(script);
    }

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

    console.log("[Paystack] Initializing:", { amount: numericAmount, ref: reference });

    window.currentPaymentData = {
      amount: numericAmount,
      paymentType: paymentType,
      animalType: animalType,
      durationHours: durationHours,
      expectedReturn: expectedReturn,
      roiPercent: roiPercent,
      method: method,
      reference: reference,
      userId: user.uid
    };

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: customerEmail,
      amount: amountInKobo,
      currency: "GHS",
      ref: reference,
      callback: function(response) {
        console.log("[Paystack] Callback fired:", response.reference);
        
        if (typeof onSuccess === 'function') {
          try {
            onSuccess(response);
          } catch (err) {
            console.warn("[Paystack] onSuccess error:", err);
          }
        }
        
        window.handlePaystackCallback(response, window.currentPaymentData, window.currentPaymentData.userId);
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