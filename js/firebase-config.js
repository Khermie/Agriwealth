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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

export const storage = getStorage(app);

// Set persistence. We also export a promise so login can await deterministically.
export const authReady = setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("[Firebase] Persistence set to browserLocalPersistence");
    return true;
  })
  .catch(err => {
    console.warn("[Firebase] Persistence failed, using default:", err);
    return false;
  });

