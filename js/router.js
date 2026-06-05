import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { setLoading } from "./utils.js";

export function initRouter() {
  setLoading(true);
  onAuthStateChanged(auth, (user) => {
    setLoading(false);
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'login.html', 'signup.html'];
    
    if (!user && !publicPages.includes(path)) window.location.href = 'login.html';
    else if (user && publicPages.includes(path)) window.location.href = 'dashboard.html';
    else if (user) window.CURRENT_USER = user;
  });
}