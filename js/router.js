import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, authReady } from "./firebase-config.js?v=8"; // 🔥 ADDED ?v=8

export async function initRouter() {
  console.log("[Router] Waiting for Firebase...");
  await authReady; 
  console.log("[Router] Firebase ready. Listening for changes.");

  onAuthStateChanged(auth, (user) => {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const currentPage = path.replace('.html', '');
    const publicPages = ['index', 'login', 'signup'];

    console.log("[Router] User:", user ? "Logged In" : "Logged Out", "| Page:", currentPage);

    if (!user && !publicPages.includes(currentPage)) {
      console.log("[Router] -> Redirecting to login");
      window.location.href = 'login.html';
    } else if (user && publicPages.includes(currentPage)) {
      console.log("[Router] -> Redirecting to dashboard");
      window.location.href = 'dashboard.html';
    }
  });
}