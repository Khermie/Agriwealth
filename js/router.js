import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

let _redirecting = false;

export function initRouter() {
  console.log("[Router] Registering onAuthStateChanged listener (once)");

  onAuthStateChanged(auth, (user) => {
    // If a redirect is already in progress, skip all further auth events
    if (_redirecting) {
      console.log("[Router] Already redirecting — skipping auth event");
      return;
    }

    const path = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'login.html', 'signup.html'];

    console.log("[Router] Auth state:", user ? `signed in (${user.uid})` : "no user", "| page:", path);

    // Notify auth pages that auth state has been checked
    window.dispatchEvent(new CustomEvent('auth-resolved', {
      detail: { user, path }
    }));

    // Redirect rules — only ONE redirect ever happens because _redirecting guards
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

// Called by login/signup pages BEFORE they redirect after a successful sign-in.
// This prevents the onAuthStateChanged listener from also trying to redirect.
export function markRedirecting() {
  console.log("[Router] Redirect marked by caller — auth listener will skip");
  _redirecting = true;
}
