import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  auth,
  db,
  authReady
} from "./firebase-config.js";

import { showToast } from "./utils.js";
import { markRedirecting } from "./router.js";

console.log("[Auth] Firebase auth module initialized");

export async function signupUser(
  firstName,
  lastName,
  email,
  password,
  phone,
  country
){

  console.log("[Auth] Signup started:",email);

  try{

    const cred=
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(
      cred.user,
      {
        displayName:
        `${firstName} ${lastName}`
      }
    );

    await setDoc(
      doc(
        db,
        "users",
        cred.user.uid
      ),
      {
        firstName,
        lastName,
        email,
        phone,
        country,
        profileImage:null,
        kycStatus:"pending",
        walletBalance:0,
        totalInvestment:0,
        activeInvestmentCount:0,
        totalReturns:0,
        createdAt:serverTimestamp(),
        lastLogin:serverTimestamp()
      }
    );

    await sendEmailVerification(
      cred.user
    );

    showToast(
      "Account created! Verify email",
      "success"
    );

    return true;

  }catch(err){

    console.error(
      err.code,
      err.message
    );

    showToast(
      err.message,
      "error"
    );

    return false;
  }
}



export async function loginUser(
  email,
  password
){

console.log(
"[Auth] Login started"
);

try{

await authReady;

const userCredential=
await signInWithEmailAndPassword(
auth,
email,
password
);

const user=userCredential.user;

if(
user &&
!user.emailVerified
){

showToast(
"Please verify your email",
"warning"
);

}

showToast(
"Welcome back!",
"success"
);

// PREVENT ROUTER DUPLICATE REDIRECTS
markRedirecting();

console.log(
"[Auth] Redirecting..."
);

setTimeout(()=>{

window.location.replace(
"dashboard.html"
);

},500);

return true;

}catch(err){

console.error(
"[Auth]",
err.code,
err.message
);

showToast(
err.message ||
"Login failed",
"error"
);

return false;

}

}



export async function loginWithProvider(providerType){

try{

const provider=
providerType==="google"
?
new GoogleAuthProvider()
:
new FacebookAuthProvider();

await signInWithPopup(
auth,
provider
);

markRedirecting();

window.location.replace(
"dashboard.html"
);

}catch(err){

console.error(
err.code,
err.message
);

showToast(
err.message,
"error"
);

}

}



export async function resetPassword(
email
){

try{

await sendPasswordResetEmail(
auth,
email
);

showToast(
"Reset link sent!",
"success"
);

}catch(err){

showToast(
err.message,
"error"
);

}

}



export async function logoutUser(){

await signOut(auth);

window.location.replace(
"index.html"
);

}