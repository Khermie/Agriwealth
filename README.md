# 🌾 AgriWealth - Frontend + Firebase Backend

## 🚀 Quick Start
1. Create a Firebase Project at https://console.firebase.google.com
2. Enable Authentication: Email/Password, Google, Facebook
3. Create Firestore Database (start in test mode for local dev)
4. Enable Storage
5. Replace `firebaseConfig` in `js/firebase-config.js` with your keys
6. Replace Paystack public key in `js/paystack.js` (`pk_test_...`)
7. Run with **Live Server** (VS Code Extension) → Right-click `index.html` → "Open with Live Server"

## 📁 Architecture
- Vanilla HTML/CSS/JS (No frameworks)
- Firebase Auth, Firestore, Storage (Modular v10)
- Atomic transactions for wallet & investments
- Real-time listeners for dashboard & notifications
- Secure routing & session persistence

## 🔒 Security Rules (Paste in Firebase Console)
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if request.auth != null; }
  }
}