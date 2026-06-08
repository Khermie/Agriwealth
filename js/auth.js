import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { showToast } from "./utils.js";

console.log("[Auth] Module loaded");

export async function signupUser(firstName, lastName, email, password, phone, country) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: `${firstName} ${lastName}` });
    
    await setDoc(doc(db, "users", cred.user.uid), {
      firstName, lastName, email, phone, country,
      profileImage: null, kycStatus: "pending",
      walletBalance: 0, totalInvestment: 0, activeInvestmentCount: 0,
      createdAt: serverTimestamp(), lastLogin: serverTimestamp()
    });

    await sendEmailVerification(cred.user);
    showToast("Account created! Please verify your email.", "success");
    return true;
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
    return false;
  }
}

export async function loginUser(email, password) {
  try {
    // Just sign in. DO NOT REDIRECT HERE. The router will handle it.
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Welcome back!", "success");
    return true; 
  } catch (err) {
    console.error(err);
    showToast(err.message || "Login failed", "error");
    return false;
  }
}

export async function loginWithProvider(providerType) {
  try {
    const provider = providerType === "google" ? new GoogleAuthProvider() : new FacebookAuthProvider();
    await signInWithPopup(auth, provider);
    return true;
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
    return false;
  }
}

export async function resetPassword(email) {
  try {
    const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    await sendPasswordResetEmail(auth, email);
    showToast("Reset link sent!", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}