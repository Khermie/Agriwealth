import { 
  doc, 
  serverTimestamp, 
  increment,
  getDoc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js?v=25";
import { showToast, setLoading } from "./utils.js?v=25";

const PAYSTACK_PUBLIC_KEY = 'pk_live_dd2186054955f667ffb1af8ea935dfca127d01a2';

// 🔥 GLOBAL HANDLER - Simplified without transactions
window.handlePaystackCallback = async function(response, paymentData, userId) {
  console.log("[Paystack] Payment successful:", response);
  console.log("[Paystack] User ID:", userId);
  console.log("[Paystack] Auth UID:", auth.currentUser?.uid);

  try {
    if (!userId) {
      throw new Error("User ID not found");
    }

    const userRef = doc(db, "users", userId);
    const txRef = doc(db, "transactions", `tx_${response.reference}`);

    // Step 1: Check if user exists, create if not
    console.log("[Paystack] Checking user document...");
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log("[Paystack] Creating user profile...");
      const user = auth.currentUser;
      
      await setDoc(userRef, {
        firstName: user?.displayName?.split(" ")[0] || "User",
        lastName: user?.displayName?.split(" ").slice(1).join(" ") || "",
        email: user?.email || "unknown",
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
      console.log("[Paystack] ✅ User profile created");
    }

    // Step 2: Create transaction record
    console.log("[Paystack] Creating transaction record...");
    await setDoc(txRef, {
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
    console.log("[Paystack] ✅ Transaction record created");

    // Step 3: Update wallet balance
    console.log("[Paystack] Updating wallet...");
    if (paymentData.paymentType === "investment") {
      await updateDoc(userRef, {
        totalInvestment: increment(paymentData.amount),
        activeInvestmentCount: increment(1),
        walletBalance: increment(-paymentData.amount),
        lastDeposit: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log("[Paystack] ✅ Investment recorded");
    } else {
      await updateDoc(userRef, {
        walletBalance: increment(paymentData.amount),
        totalDeposits: increment(paymentData.amount),
        lastDepositAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log("[Paystack] ✅ Wallet updated");
    }

    console.log("[Paystack] ✅✅✅ ALL OPERATIONS SUCCESSFUL");
    showToast("✅ Deposit successful! Wallet updated.", "success");
    
    setTimeout(() => {
      window.location.replace("dashboard.html?refresh=" + Date.now());
    }, 2000);

  } catch (error) {
    console.error("[Paystack] ❌ Error:", error);
    console.error("[Paystack] Error code:", error.code);
    console.error("[Paystack] Error message:", error.message);
    
    let errorMsg = "Payment received but update failed. ";
    
    if (error.code === "permission-denied") {
      errorMsg += "Permission denied. Check Firestore rules.";
      console.error("[Paystack] Firestore Rules Issue - Current user:", auth.currentUser);
    } else if (error.code === "not-found") {
      errorMsg += "Document not found.";
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

    console.log("[Paystack] Initializing:", { amount: numericAmount, ref: reference, uid: user.uid });

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