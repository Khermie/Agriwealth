import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

let _redirecting = false;

export function initRouter() {
  console.log("[Router] Registering onAuthStateChanged listener");

  onAuthStateChanged(auth, (user) => {
    // Prevent acting on auth state if already redirecting
    if (_redirecting) {
      console.log("[Router] Already redirecting, skipping auth event");
      return;
    }

    const path = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'login.html', 'signup.html'];

    console.log("[Router] Auth state resolved:", user ? `user ${user.uid}` : "no user", "| page:", path);

    // ✅ Dispatch custom event so auth pages know when to show their forms
    // This prevents the "blink" where the form appears briefly before redirect
    window.dispatchEvent(new CustomEvent('auth-resolved', {
      detail: { user, path }
    }));

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
  console.log("[Router] Redirect marked, auth listener will skip future events");
  _redirecting = true;
}
