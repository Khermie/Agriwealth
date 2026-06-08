import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, authReady } from "./firebase-config.js";

export async function initRouter() {
  console.log("[Router] Waiting for Firebase...");
  await authReady; // Wait for initial auth check
  console.log("[Router] Firebase ready. Listening for changes.");

  onAuthStateChanged(auth, (user) => {
    // Get current page name without .html
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const currentPage = path.replace('.html', '');
    const publicPages = ['index', 'login', 'signup'];

    console.log("[Router] User:", user ? "Logged In" : "Logged Out", "| Page:", currentPage);

    // If logged out and on a protected page -> go to login
    if (!user && !publicPages.includes(currentPage)) {
      console.log("[Router] -> Redirecting to login");
      window.location.href = 'login.html';
    } 
    // If logged in and on a public page -> go to dashboard
    else if (user && publicPages.includes(currentPage)) {
      console.log("[Router] -> Redirecting to dashboard");
      window.location.href = 'dashboard.html';
    }
  });
}