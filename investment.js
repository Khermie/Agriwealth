import { 
  doc, 
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js?v=28";
import { showToast } from "./utils.js?v=28";

/**
 * Invest from wallet balance (no Paystack needed)
 * Deducts from user's wallet and creates investment record
 */
export async function investFromWallet(amount, assetName, durationHours, expectedReturn, roiPercent, profit) {
  console.log("[Investment] Starting wallet investment...");
  console.log("[Investment] Amount:", amount, "Asset:", assetName);

  const user = auth.currentUser;
  if (!user) {
    showToast("Please login first", "warning");
    window.location.href = "login.html";
    return false;
  }

  const uid = user.uid;
  const userRef = doc(db, "users", uid);
  const invRef = doc(db, "investments", `inv_${Date.now()}_${uid}`);
  const txRef = doc(db, "transactions", `tx_inv_${Date.now()}_${uid}`);

  try {
    // 🔥 STEP 1: Fetch fresh wallet balance from server
    console.log("[Investment] Fetching fresh wallet balance...");
    const userSnap = await getDocFromServer(userRef);
    
    if (!userSnap.exists()) {
      showToast("User profile not found. Please deposit first.", "error");
      return false;
    }

    const userData = userSnap.data();
    const currentBalance = userData.walletBalance || 0;
    
    console.log("[Investment] Current wallet balance:", currentBalance);
    console.log("[Investment] Investment amount:", amount);

    // 🔥 STEP 2: Check if user has sufficient funds
    if (currentBalance < amount) {
      const shortfall = amount - currentBalance;
      console.warn("[Investment] ❌ Insufficient funds!");
      console.warn("[Investment] Shortfall:", shortfall);
      
      showToast(
        `Insufficient funds! You need GHS ${shortfall.toFixed(2)} more. Please deposit first.`,
        "warning"
      );
      
      // Redirect to deposit page after 2 seconds
      setTimeout(() => {
        window.location.href = "payment.html";
      }, 2500);
      
      return false;
    }

    // 🔥 STEP 3: Use transaction to atomically deduct + create investment
    console.log("[Investment] ✅ Sufficient funds - proceeding with investment...");
    
    const maturityDate = new Date(Date.now() + (durationHours * 3600000));
    
    await runTransaction(db, async (transaction) => {
      // Re-read user doc inside transaction for consistency
      const freshUserSnap = await transaction.get(userRef);
      const freshBalance = freshUserSnap.data().walletBalance || 0;
      
      // Double-check balance (in case it changed between read and transaction)
      if (freshBalance < amount) {
        throw new Error(`Insufficient funds. Current balance: GHS ${freshBalance.toFixed(2)}`);
      }

      // 1. Deduct from wallet
      transaction.update(userRef, {
        walletBalance: increment(-amount),
        totalInvestment: increment(amount),
        activeInvestmentCount: increment(1),
        lastInvestmentAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Create investment record
      transaction.set(invRef, {
        userId: uid,
        animalType: assetName,
        amount: amount,
        expectedReturn: expectedReturn,
        profit: profit,
        roiPercent: roiPercent,
        durationHours: durationHours,
        status: "active",
        paymentMethod: "wallet",
        payoutProcessed: false,
        startDate: serverTimestamp(),
        maturityDate: maturityDate,
        createdAt: serverTimestamp()
      });

      // 3. Create transaction record
      transaction.set(txRef, {
        userId: uid,
        type: "investment",
        amount: amount,
        paymentMethod: "wallet",
        provider: "internal",
        status: "success",
        reference: invRef.id,
        animalType: assetName,
        createdAt: serverTimestamp()
      });
    });

    console.log("[Investment] ✅✅✅ INVESTMENT SUCCESSFUL");
    console.log("[Investment] Amount deducted:", amount);
    console.log("[Investment] Asset:", assetName);
    console.log("[Investment] Maturity:", maturityDate.toLocaleString());
    
    showToast(`✅ Investment successful! GHS ${amount} allocated to ${assetName}`, "success");
    return true;

  } catch (error) {
    console.error("[Investment] ❌ Error:", error);
    console.error("[Investment] Error code:", error.code);
    console.error("[Investment] Error message:", error.message);
    
    if (error.message.includes("Insufficient funds")) {
      showToast(error.message, "warning");
      setTimeout(() => {
        window.location.href = "payment.html";
      }, 2500);
    } else {
      showToast("Investment failed: " + error.message, "error");
    }
    
    return false;
  }
}