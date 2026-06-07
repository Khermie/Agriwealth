import {
  runTransaction,
  doc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { db, auth, app } from "./firebase-config.js";
import { showToast, setLoading } from "./utils.js";

const PAYSTACK_PUBLIC_KEY =
  window.AGRIWEALTH_PAYSTACK_PUBLIC_KEY ||
  "pk_live_14393bf34af171d50eb5d2a530c088c7dccf2a1b";

let paystackScriptPromise = null;
let paymentInProgress = false;
const handledReferences = new Set();

function loadPaystackScript() {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (paystackScriptPromise) return paystackScriptPromise;

  paystackScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');

    const finishLoad = () => {
      if (!window.PaystackPop) {
        reject(new Error("Paystack checkout failed to initialize."));
        return;
      }

      console.log("Paystack initialized");
      resolve(window.PaystackPop);
    };

    if (existing) {
      existing.addEventListener("load", finishLoad, { once: true });
      existing.addEventListener("error", () => reject(new Error("Paystack script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = finishLoad;
    script.onerror = () => {
      paystackScriptPromise = null;
      reject(new Error("Paystack script failed to load. Check your internet connection."));
    };
    document.head.appendChild(script);
  });

  return paystackScriptPromise;
}

function getCurrentUser() {
  return auth.currentUser;
}

function validateAmount(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Please enter a valid amount.");
  }

  return Math.round(numericAmount * 100) / 100;
}

function makeReference(uid, paymentType) {
  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `AGW_${paymentType.toUpperCase()}_${uid}_${Date.now()}_${randomPart}`;
}

function normalizeOptions(options = {}) {
  return {
    paymentType: options.paymentType || options.type || "deposit",
    method: options.method || "paystack",
    animalType: options.animalType || null,
    durationHours: Number(options.durationHours || options.duration || 0),
    minimumInvestment: Number(options.minimumInvestment || 0),
    baseReturn: Number(options.baseReturn || 0),
    expectedReturn: Number(options.expectedReturn || 0),
    profit: Number(options.profit || 0),
    roiPercent: Number(options.roiPercent || 0),
    maturityDate: options.maturityDate || null
  };
}

function buildNotification(payment) {
  if (payment.paymentType === "investment") {
    return {
      title: "Investment Confirmed",
      message: `GHS ${payment.amount.toFixed(2)} invested in ${payment.animalType}.`,
      type: "investment_success"
    };
  }

  return {
    title: "Payment Successful",
    message: `GHS ${payment.amount.toFixed(2)} added to your wallet.`,
    type: "deposit_success"
  };
}

async function savePaymentToFirestore(payment) {
  const uid = payment.user.uid;
  const transactionRef = doc(db, "transactions", `paystack_${payment.reference}`);
  const userRef = doc(db, "users", uid);
  const investmentRef =
    payment.paymentType === "investment"
      ? doc(db, "investments", `inv_${payment.reference}`)
      : null;

  await runTransaction(db, async (t) => {
    const userSnap = await t.get(userRef);
    if (!userSnap.exists()) {
      throw new Error("Authenticated user profile was not found.");
    }

    const existingTransaction = await t.get(transactionRef);
    if (existingTransaction.exists()) {
      return;
    }

    const transactionType = payment.paymentType === "investment" ? "investment" : "deposit";

    t.set(transactionRef, {
      userId: uid,
      type: transactionType,
      amount: payment.amount,
      paymentMethod: payment.method,
      provider: "paystack",
      status: payment.verified ? "verified" : "completed",
      reference: payment.reference,
      paystackReference: payment.reference,
      paystackResponse: payment.response || null,
      animalType: payment.animalType || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (payment.paymentType === "investment") {
      const maturityMs = Number(payment.durationHours) * 3600000;
      const calculatedMaturity = payment.maturityDate ? new Date(payment.maturityDate) : new Date(Date.now() + maturityMs);
      const calculatedExpectedReturn = payment.expectedReturn || ((payment.amount / (payment.minimumInvestment || payment.amount)) * (payment.baseReturn || 0));
      const calculatedProfit = payment.profit || (calculatedExpectedReturn - payment.amount);
      const calculatedRoiPercent = payment.roiPercent || ((calculatedProfit / payment.amount) * 100);

      t.set(investmentRef, {
        userId: uid,
        animalType: payment.animalType,
        amount: payment.amount,
        minimumInvestment: payment.minimumInvestment || payment.amount,
        baseReturn: payment.baseReturn || 0,
        expectedReturn: calculatedExpectedReturn,
        profit: calculatedProfit,
        roiPercent: calculatedRoiPercent,
        durationHours: Number(payment.durationHours) || 0,
        status: "active",
        paymentMethod: payment.method,
        paymentReference: payment.reference,
        payoutProcessed: false,
        startDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        maturityDate: calculatedMaturity
      });

      t.update(userRef, {
        totalInvestment: increment(payment.amount),
        activeInvestmentCount: increment(1),
        totalDeposits: increment(payment.amount),
        lastDeposit: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      t.update(userRef, {
        walletBalance: increment(payment.amount),
        totalDeposits: increment(payment.amount),
        lastDeposit: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  });

  console.log("Firestore transaction saved");
  console.warn("Notification creation requires the Paystack Cloud Function under current Firestore rules.");
}

async function verifyViaCloudFunction(payment) {
  const functions = getFunctions(app);
  const verifyPaystack = httpsCallable(functions, "verifyPaystackDeposit");
  const result = await verifyPaystack({
    reference: payment.reference,
    amount: payment.amount,
    method: payment.method,
    paymentType: payment.paymentType,
    animalType: payment.animalType,
    duration: payment.duration,
    roi: payment.roi
  });

  if (!result.data?.success) {
    throw new Error(result.data?.message || "Payment verification was unsuccessful.");
  }

  return result.data;
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

  const receiptTitle = payment.paymentType === "investment" ? "Investment Receipt" : "Payment Receipt";
  const receiptDetail =
    payment.paymentType === "investment"
      ? `<p><strong>Asset:</strong> ${payment.animalType}</p>`
      : "";

  modal.innerHTML = `
    <div class="glass" style="width:100%;max-width:420px;padding:28px;">
      <h3 style="margin-bottom:16px;">${receiptTitle}</h3>
      <p><strong>Amount:</strong> GHS ${payment.amount.toFixed(2)}</p>
      ${receiptDetail}
      <p><strong>Reference:</strong> ${payment.reference}</p>
      <p><strong>Status:</strong> Successful</p>
      <button class="btn" id="paystackReceiptDone" style="width:100%;margin-top:20px;">Done</button>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("paystackReceiptDone").onclick = () => {
    modal.remove();
    window.location.href = "dashboard.html";
  };
}

function canUseClientFallback(error) {
  const code = String(error?.code || "");
  return [
    "functions/unavailable",
    "functions/not-found",
    "functions/deadline-exceeded",
    "functions/internal"
  ].some((allowedCode) => code.includes(allowedCode));
}

async function finalizePayment(payment, onSuccess) {
  if (handledReferences.has(payment.reference)) return;
  handledReferences.add(payment.reference);

  setLoading(true);
  try {
    let verifiedData = null;

    try {
      verifiedData = await verifyViaCloudFunction(payment);
      payment.verified = true;
      console.log("Firestore transaction saved");
    } catch (error) {
      if (!canUseClientFallback(error)) {
        throw error;
      }

      console.warn("Paystack server verification unavailable; saving client-confirmed payment.", error);
      payment.verified = false;
      await savePaymentToFirestore(payment);
    }

    console.log("Payment successful");
    showToast("Payment successful", "success");

    if (onSuccess) {
      await onSuccess({ ...payment, verification: verifiedData });
    }

    showReceiptModal(payment);
  } catch (error) {
    handledReferences.delete(payment.reference);
    console.error("Paystack payment finalization failed:", error);
    showToast(error.message || "Payment could not be saved. Contact support with your reference.", "error");
  } finally {
    paymentInProgress = false;
    setLoading(false);
  }
}

export async function openPaystack(amount, email, onSuccess, options = {}) {
  if (paymentInProgress) {
    showToast("A payment is already in progress.", "warning");
    return;
  }

  let numericAmount;
  try {
    numericAmount = validateAmount(amount);
  } catch (error) {
    showToast(error.message, "warning");
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    showToast("Please login first.", "warning");
    window.location.href = "login.html";
    return;
  }

  const customerEmail = String(email || user.email || "").trim();
  if (!customerEmail || !customerEmail.includes("@")) {
    showToast("A valid account email is required for payment.", "warning");
    return;
  }

  const paymentOptions = normalizeOptions(options);
  if (paymentOptions.paymentType === "investment" && !paymentOptions.animalType) {
    showToast("Please select an investment asset.", "warning");
    return;
  }

  try {
    paymentInProgress = true;
    setLoading(true);
    showToast("Loading payment gateway...", "info");
    await loadPaystackScript();

    const amountInKobo = Math.round(numericAmount * 100);
    const reference = makeReference(user.uid, paymentOptions.paymentType);

    console.log("Payment started");

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: customerEmail,
      amount: amountInKobo,
      currency: "GHS",
      ref: reference,
      metadata: {
        userId: user.uid,
        paymentType: paymentOptions.paymentType,
        animalType: paymentOptions.animalType,
        durationHours: paymentOptions.durationHours,
        minimumInvestment: paymentOptions.minimumInvestment,
        baseReturn: paymentOptions.baseReturn,
        expectedReturn: paymentOptions.expectedReturn,
        profit: paymentOptions.profit,
        roiPercent: paymentOptions.roiPercent,
        maturityDate: paymentOptions.maturityDate,
        custom_fields: [
          { display_name: "User ID", variable_name: "user_id", value: user.uid },
          { display_name: "Payment Type", variable_name: "payment_type", value: paymentOptions.paymentType }
        ]
      },
      channels: ["card", "mobile_money", "bank"],
      callback: function (response) {
        finalizePayment({
          ...paymentOptions,
          user,
          email: customerEmail,
          amount: numericAmount,
          amountInKobo,
          reference: response.reference || reference,
          response
        }, onSuccess);
      },
      onClose: function () {
        if (!handledReferences.has(reference)) {
          paymentInProgress = false;
          showToast("Payment cancelled", "info");
          console.log("Payment cancelled");
        }
      }
    });

    setLoading(false);
    handler.openIframe();
  } catch (error) {
    paymentInProgress = false;
    setLoading(false);
    console.error("Paystack initialization failed:", error);
    showToast(error.message || "Failed to open payment.", "error");
  }
}

export async function depositToWallet() {
  console.warn("depositToWallet is handled by openPaystack after payment confirmation.");
  return true;
}
