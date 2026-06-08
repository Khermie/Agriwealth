import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, authReady } from "./firebase-config.js";

let _redirecting = false;

export async function initRouter() {
  // 🔥 CRITICAL: Wait for Firebase to finish its initial check
  await authReady; 
  
  onAuthStateChanged(auth, (user) => {
    if (_redirecting) return;

    const fullPath = window.location.pathname.split('/').pop() || 'index.html';
    const currentPage = fullPath.replace('.html', ''); // Fixes Vercel cleanUrls
    const publicPages = ['index', 'login', 'signup'];

    if (!user && !publicPages.includes(currentPage)) {
      _redirecting = true;
      window.location.href = 'login.html';
    } else if (user && publicPages.includes(currentPage)) {
      _redirecting = true;
      window.location.href = 'dashboard.html';
    } else if (user) {
      window.CURRENT_USER = user;
    }
  });
}

export function markRedirecting() {
  _redirecting = true;
}