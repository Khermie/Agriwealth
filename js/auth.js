import { 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  signInWithPopup, GoogleAuthProvider, FacebookAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db, authReady } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { markRedirecting } from "./router.js";

console.log("[Auth] Firebase auth module initialized");

export async function signupUser(firstName, lastName, email, password, phone, country) {
  // ✅ No setLoading - signup page handles button disabling instead of full-screen overlay
  // The full-screen overlay was stealing focus from input fields and causing blinking
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
}

export async function loginUser(email, password) {
  console.log("[Auth] Login started for:", email);
  try {
    console.log("[Auth] Waiting for auth persistence...");
    await authReady;

    console.log("[Auth] Attempting sign in");
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("[Auth] User authenticated");

    const user = userCredential?.user;
    // If email verification exists, do not silently block login.
    if (user && user.emailVerified === false) {
      showToast("Please verify your email", "warning");
    }

    console.log("[Auth] Login completed, auth state will handle redirect");
    showToast('Welcome back!', 'success');
    return true;
  } catch (err) {
    console.error("[Auth] Login failed:", err.code, err.message);
    showToast(err?.message || 'Invalid email or password', 'error');
    // Ensure login.html can surface debug info if it logs/handles the throw.
    throw err;
  }
}


export async function loginWithProvider(providerType) {
  // ✅ No setLoading - login page handles button disabling instead of full-screen overlay
  console.log("[Auth] Social login started:", providerType);
  try {
    const provider = providerType === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    await signInWithPopup(auth, provider);
    console.log("[Auth] Social login completed, redirecting to dashboard");
    showToast('Login successful', 'success');
    // ✅ Mark redirecting so router doesn't double-redirect
    markRedirecting();
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error("[Auth] Social login failed:", err.message);
    showToast(err.message, 'error');
  }
}

export async function resetPassword(email) {
  console.log("[Auth] Password reset requested for:", email);
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Reset link sent!', 'success');
  } catch (err) {
    console.error("[Auth] Password reset failed:", err.message);
    showToast(err.message, 'error');
  }
}

export async function logoutUser() {
  console.log("[Auth] Logging out");
  await signOut(auth);
  window.location.href = 'index.html';
}
