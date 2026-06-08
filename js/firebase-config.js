import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0SqJEYi6HqdXD0QDTTI1lzbXO_NlA0Qk",
  authDomain: "agriwealth-dev.firebaseapp.com",
  projectId: "agriwealth-dev",
  storageBucket: "agriwealth-dev.firebasestorage.app",
  messagingSenderId: "795909844984",
  appId: "1:795909844984:web:1f2167f8687739313df00d",
  measurementId: "G-B95515W9W6"
};

console.log("[Firebase] Initializing Firebase app...");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ✅ FIX: Modern Firestore initialization (removes deprecation warning)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

export const storage = getStorage(app);

// ✅ CRITICAL FIX: Await setPersistence before any onAuthStateChanged listener registers.
// Without await, Firebase fires onAuthStateChanged TWICE:
//   1st: null (before persistence reads localStorage)
//   2nd: user (after persistence resolves and reads stored session)
// This double-firing was the root cause of login page blinking/redirect loops.
try {
  await setPersistence(auth, browserLocalPersistence);
  console.log("[Firebase] Persistence set to browserLocalPersistence - auth state is now reliable");
} catch (err) {
  // If persistence fails (e.g. localStorage disabled), fall back to default session persistence
  // The app still works - user just won't stay logged in across browser sessions
  console.warn("[Firebase] Failed to set persistence, using default:", err);
}
