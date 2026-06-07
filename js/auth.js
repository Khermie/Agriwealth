import { 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  signInWithPopup, GoogleAuthProvider, FacebookAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { showToast, setLoading } from "./utils.js";

console.log("[Auth] Firebase auth module initialized");

export async function signupUser(firstName, lastName, email, password, phone, country) {
  setLoading(true);
  console.log("[Auth] Signup started for:", email);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log("[Auth] User created, updating profile...");
    await updateProfile(cred.user, { displayName: `${firstName} ${lastName}` });
    await setDoc(doc(db, 'users', cred.user.uid), {
      firstName, lastName, email, phone, country,
      profileImage: null, kycStatus: 'pending',
      walletBalance: 0, totalInvestment: 0, activeInvestmentCount: 0,
      totalReturns: 0,
      createdAt: serverTimestamp(), lastLogin: serverTimestamp()
    });
    await sendEmailVerification(cred.user);
    console.log("[Auth] Signup completed, verification email sent");
    showToast('Account created! Check email to verify.', 'success');
    return true;
  } catch (err) {
    console.error("[Auth] Signup failed:", err.message);
    showToast(err.message || 'Signup failed', 'error');
    return false;
  }
  finally { setLoading(false); }
}

export async function loginUser(email, password) {
  setLoading(true);
  console.log("[Auth] Login started for:", email);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("[Auth] Login completed, auth state will handle redirect");
    showToast('Welcome back!', 'success');
    return true;
  } catch (err) {
    console.error("[Auth] Login failed:", err.message);
    showToast('Invalid email or password', 'error');
    return false;
  }
  finally { setLoading(false); }
}

export async function loginWithProvider(providerType) {
  setLoading(true);
  console.log("[Auth] Social login started:", providerType);
  try {
    const provider = providerType === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    await signInWithPopup(auth, provider);
    console.log("[Auth] Social login completed, redirecting to dashboard");
    showToast('Login successful', 'success');
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error("[Auth] Social login failed:", err.message);
    showToast(err.message, 'error');
  }
  finally { setLoading(false); }
}

export async function resetPassword(email) {
  setLoading(true);
  try { await sendPasswordResetEmail(auth, email); showToast('Reset link sent!', 'success'); }
  catch (err) { showToast(err.message, 'error'); }
  finally { setLoading(false); }
}

export async function logoutUser() {
  console.log("[Auth] Logging out");
  await signOut(auth);
  window.location.href = 'index.html';
}
