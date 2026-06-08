import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0SqJEYi6HqdXD0QDTTI1lzbXO_NlA0Qk",
  authDomain: "agriwealth-dev.firebaseapp.com",
  projectId: "agriwealth-dev",
  storageBucket: "agriwealth-dev.firebasestorage.app",
  messagingSenderId: "795909844984",
  appId: "1:795909844984:web:1f2167f8687739313df00d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence);

// 🔥 CRITICAL: This MUST be at the bottom of the file
export const authReady = new Promise(resolve => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  });
});