import { 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  signInWithPopup, GoogleAuthProvider, FacebookAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { showToast, setLoading } from "./utils.js";

export async function signupUser(firstName, lastName, email, password, phone, country) {
  setLoading(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: `${firstName} ${lastName}` });
    await setDoc(doc(db, 'users', cred.user.uid), {
      firstName, lastName, email, phone, country,
      profileImage: null, kycStatus: 'pending',
      walletBalance: 0, totalInvestment: 0, activeInvestmentCount: 0,
      createdAt: serverTimestamp(), lastLogin: serverTimestamp()
    });
    await sendEmailVerification(cred.user);
    showToast('Account created! Check email to verify.', 'success');
    return true;
  } catch (err) { showToast(err.message || 'Signup failed', 'error'); return false; }
  finally { setLoading(false); }
}

export async function loginUser(email, password) {
  setLoading(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast('Welcome back!', 'success');
    return true;
  } catch (err) { showToast('Invalid email or password', 'error'); return false; }
  finally { setLoading(false); }
}

export async function loginWithProvider(providerType) {
  setLoading(true);
  try {
    const provider = providerType === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    await signInWithPopup(auth, provider);
    showToast('Login successful', 'success');
    window.location.href = 'dashboard.html';
  } catch (err) { showToast(err.message, 'error'); }
  finally { setLoading(false); }
}

export async function resetPassword(email) {
  setLoading(true);
  try { await sendPasswordResetEmail(auth, email); showToast('Reset link sent!', 'success'); }
  catch (err) { showToast(err.message, 'error'); }
  finally { setLoading(false); }
}

export async function logoutUser() {
  await signOut(auth);
  window.location.href = 'index.html';
}