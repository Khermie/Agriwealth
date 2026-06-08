import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

let _redirecting = false;

export function initRouter() {
  console.log("[Router] Initializing");

  onAuthStateChanged(auth, (user) => {
    if (_redirecting) {
      console.log("[Router] Already redirecting — skipping auth event");
      return;
    }

    // Get the current page name from the URL
    const fullPath = window.location.pathname.split('/').pop() || 'index.html';
    
    // ✅ CRITICAL FIX: Remove '.html' so it matches Vercel's cleanUrls
    const currentPage = fullPath.replace('.html', '');
    
    // ✅ CRITICAL FIX: List public pages WITHOUT '.html'
    const publicPages = ['index', 'login', 'signup'];

    console.log("[Router] Auth state settled:", user ? `signed in (${user.uid})` : "no user", "| page:", currentPage);

    // Redirect rules
    if (!user && !publicPages.includes(currentPage)) {
      console.log("[Router] No user on protected page → redirecting to login");
      _redirecting = true;
      window.location.href = 'login.html';
    } else if (user && publicPages.includes(currentPage)) {
      console.log("[Router] User on public page → redirecting to dashboard");
      _redirecting = true;
      window.location.href = 'dashboard.html';
    } else if (user) {
      window.CURRENT_USER = user;
    }
  });
}

// Called by login/signup pages BEFORE they redirect
export function markRedirecting() {
  console.log("[Router] Redirect marked by caller");
  _redirecting = true;
}