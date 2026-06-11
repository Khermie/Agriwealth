import { 
  runTransaction, 
  doc, 
  serverTimestamp, 
  increment,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js?v=23";
import { showToast, setLoading } from "./utils.js?v=23";

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

    console.log("[Paystack] Checking for duplicate transaction...");
    const existingTx = await getDoc(txRef);
    
    if (existingTx.exists()) {
      console.warn("[Paystack] ⚠️ Duplicate detected - transaction already exists:", response.reference);
      showToast("Payment already processed. Redirecting to dashboard...", "warning");
      setTimeout(() => {
        window.location.replace("dashboard.html");
      }, 2000);
      return;
    }

    console.log("[Paystack] No duplicate found - proceeding with wallet update...");

    await runTransaction(db, async (transaction) => {
      console.log("[Paystack] 🔥 Starting Firestore transaction...");
      
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        console.log("[Paystack] ⚠️ User profile not found - creating it now...");
        
        const user = auth.currentUser;
        const email = user?.email || "unknown";
        const displayName = user?.displayName || "User";
        const nameParts = displayName.split(" ");
        const firstName = nameParts[0] || "User";
        const lastName = nameParts.slice(1).join(" ") || "";

        transaction.set(userRef, {
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
      }

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

      if (paymentData.paymentType === "investment") {
        const invRef = doc(db, "investments", `inv_${response.reference}`);
        const maturityDate = new Date(Date.now() + ((paymentData.durationHours || 0) * 3600000));
        
        const expectedReturn = paymentData.expectedReturn || paymentData.amount;
        const profit = expectedReturn - paymentData.amount;
        const roiPercent = paymentData.amount > 0 ? (profit / paymentData.amount) * 100 : 0;

        transaction.set(invRef, {
          userId: userId,
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
          lastDeposit: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.update(userRef, {
          walletBalance: increment(paymentData.amount),
          totalDeposits: increment(paymentData.amount),
          lastDepositAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    console.log("[Paystack] ✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY");
    showToast("✅ Deposit successful! Wallet updated.", "success");
    
    // 🔥 MOBILE DETECTION - Longer delay for mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const redirectDelay = isMobile ? 4000 : 2000;
    
    console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}, Redirecting in ${redirectDelay}ms...`);
    
    setTimeout(() => {
      console.log("[Paystack] 🔄 Redirecting to dashboard...");
      window.location.replace("dashboard.html?refresh=" + Date.now());
    }, redirectDelay);

  } catch (error) {
    console.error("[Paystack] ❌❌❌ TRANSACTION FAILED");
    console.error("[Paystack] ❌ Transaction error:", error);
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

    console.log("[Paystack] Payment started");

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
        console.log("[Paystack] Callback fired with reference:", response.reference);
        
        if (typeof onSuccess === 'function') {
          try {
            onSuccess(response);
          } catch (err) {
            console.warn("[Paystack] onSuccess callback error:", err);
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