/**
 * AgriWealth Cloud Functions
 * Paystack verification is isolated here so the existing frontend flow can keep working.
 */

const crypto = require("crypto");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineString } = require("firebase-functions/params");

const paystackSecret = defineString("PAYSTACK_SECRET_KEY");

admin.initializeApp();

function getPaystackSecret() {
  const secret = paystackSecret.value();
  if (!secret || secret.includes("your_secret_key_here")) {
    throw new functions.https.HttpsError(
      "internal",
      "Paystack secret key is not configured."
    );
  }

  return secret;
}

function normalizeAmount(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "A valid amount is required.");
  }

  return Math.round(numericAmount * 100) / 100;
}

async function verifyPaystackReference(reference, expectedAmount) {
  if (!reference || typeof reference !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "A valid Paystack reference is required.");
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecret()}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      }
    }
  );

  const body = await response.json();
  if (!response.ok || !body.status) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      body.message || "Paystack verification request failed."
    );
  }

  const tx = body.data;
  if (tx.status !== "success") {
    throw new functions.https.HttpsError("failed-precondition", `Payment status is ${tx.status}.`);
  }

  const expectedKobo = Math.round(expectedAmount * 100);
  if (Number(tx.amount) < expectedKobo) {
    throw new functions.https.HttpsError("failed-precondition", "Payment amount does not match.");
  }

  if (tx.currency !== "GHS") {
    throw new functions.https.HttpsError("failed-precondition", "Payment currency does not match.");
  }

  return tx;
}

function notificationFor(paymentType, amount, animalType) {
  if (paymentType === "investment") {
    return {
      title: "Investment Confirmed",
      message: `GHS ${amount.toFixed(2)} invested in ${animalType}.`,
      type: "investment_success"
    };
  }

  return {
    title: "Payment Verified",
    message: `GHS ${amount.toFixed(2)} deposit via Paystack confirmed.`,
    type: "deposit_success"
  };
}

async function saveVerifiedPaystackPayment({
  uid,
  reference,
  amount,
  method = "paystack",
  paymentType = "deposit",
  animalType = null,
  duration = 6,
  roi = 15,
  paystackData = null
}) {
  const firestore = admin.firestore();
  const userRef = firestore.collection("users").doc(uid);
  const transactionRef = firestore.collection("transactions").doc(`paystack_${reference}`);
  const notificationRef = firestore.collection("notifications").doc(`paystack_${reference}`);
  const investmentRef =
    paymentType === "investment"
      ? firestore.collection("investments").doc(`inv_${reference}`)
      : null;

  await firestore.runTransaction(async (t) => {
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Authenticated user profile was not found.");
    }

    const existingTransaction = await t.get(transactionRef);
    if (existingTransaction.exists) {
      return;
    }

    const notification = notificationFor(paymentType, amount, animalType);
    const transactionType = paymentType === "investment" ? "investment" : "deposit";

    t.set(transactionRef, {
      userId: uid,
      type: transactionType,
      amount,
      paymentMethod: method,
      provider: "paystack",
      status: "verified",
      reference,
      paystackReference: reference,
      paystackData,
      animalType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    t.set(notificationRef, {
      userId: uid,
      title: notification.title,
      message: notification.message,
      read: false,
      type: notification.type,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (paymentType === "investment") {
      t.set(investmentRef, {
        userId: uid,
        animalType,
        amount,
        duration,
        roi,
        status: "active",
        paymentMethod: method,
        paymentReference: reference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        maturityDate: new Date(Date.now() + Number(duration) * 30 * 86400000)
      });

      t.update(userRef, {
        totalInvestment: admin.firestore.FieldValue.increment(amount),
        activeInvestmentCount: admin.firestore.FieldValue.increment(1),
        totalDeposits: admin.firestore.FieldValue.increment(amount),
        lastDeposit: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      t.update(userRef, {
        walletBalance: admin.firestore.FieldValue.increment(amount),
        totalDeposits: admin.firestore.FieldValue.increment(amount),
        lastDeposit: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });
}

exports.verifyPaystackDeposit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
  }

  const uid = context.auth.uid;
  const amount = normalizeAmount(data.amount);
  const paymentType = data.paymentType === "investment" ? "investment" : "deposit";
  const animalType = paymentType === "investment" ? String(data.animalType || "").trim() : null;

  if (paymentType === "investment" && !animalType) {
    throw new functions.https.HttpsError("invalid-argument", "Investment asset is required.");
  }

  const tx = await verifyPaystackReference(data.reference, amount);

  await saveVerifiedPaystackPayment({
    uid,
    reference: data.reference,
    amount,
    method: data.method || tx.channel || "paystack",
    paymentType,
    animalType,
    duration: Number(data.duration || 6),
    roi: Number(data.roi || 15),
    paystackData: {
      transactionId: tx.id,
      channel: tx.channel,
      paidAt: tx.paid_at,
      gatewayResponse: tx.gateway_response,
      customerEmail: tx.customer?.email || null
    }
  });

  console.log("Firestore transaction saved", data.reference);

  return {
    success: true,
    reference: data.reference,
    amount,
    paymentType
  };
});

exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const secret = getPaystackSecret();
  const signature = req.get("x-paystack-signature");
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) {
    res.status(401).send("Invalid signature");
    return;
  }

  const event = req.body;
  if (event.event !== "charge.success") {
    res.status(200).send("Ignored");
    return;
  }

  const data = event.data || {};
  const metadata = data.metadata || {};
  const uid = metadata.userId || metadata.user_id;
  const reference = data.reference;

  if (!uid || !reference) {
    res.status(200).send("Missing metadata");
    return;
  }

  const amount = normalizeAmount(Number(data.amount) / 100);
  const paymentType = metadata.paymentType === "investment" ? "investment" : "deposit";
  const animalType = paymentType === "investment" ? metadata.animalType || null : null;

  await saveVerifiedPaystackPayment({
    uid,
    reference,
    amount,
    method: data.channel || "paystack",
    paymentType,
    animalType,
    duration: Number(metadata.duration || 6),
    roi: Number(metadata.roi || 15),
    paystackData: {
      transactionId: data.id,
      channel: data.channel,
      paidAt: data.paid_at,
      gatewayResponse: data.gateway_response,
      customerEmail: data.customer?.email || null
    }
  });

  console.log("Firestore transaction saved", reference);
  res.status(200).send("OK");
});

exports.healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "agriwealth-functions",
    timestamp: new Date().toISOString()
  });
});
