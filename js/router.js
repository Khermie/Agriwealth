import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

// ✅ FIX: Removed setLoading(true) to prevent full-screen blink on every page load
// The router now only redirects without showing a blocking loader overlay
// Auth state resolves fast from cached persistence - no loader needed

let _redirecting = false;

export function initRouter() {
  onAuthStateChanged(auth, (user) => {
    // Prevent acting on auth state if already redirecting
    if (_redirecting) return;

    const path = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'login.html', 'signup.html'];

    if (!user && !publicPages.includes(path)) {
      console.log("[Router] No user on protected page → redirecting to login");
      _redirecting = true;
      window.location.href = 'login.html';
    } else if (user && publicPages.includes(path)) {
      console.log("[Router] User on public page → redirecting to dashboard");
      _redirecting = true;
      window.location.href = 'dashboard.html';
    } else if (user) {
      window.CURRENT_USER = user;
    }
  });
}

// Allow external code to mark that a redirect is in progress
// (prevents the auth listener from double-redirecting after login/signup)
export function markRedirecting() {
  _redirecting = true;
}
