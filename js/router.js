import { onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth }
from "./firebase-config.js";

let _redirecting = false;
let _routerInitialized = false;
let _authDebounce = null;
let _pendingUser = null;

export function initRouter(){

// Prevent router from registering twice
if(_routerInitialized){
    console.log("[Router] Already initialized");
    return;
}

_routerInitialized = true;

console.log("[Router] Initializing");

onAuthStateChanged(auth,(user)=>{

// DEBOUNCE: wait 300ms for auth state to settle (prevents mobile blinking)
_pendingUser = user;
clearTimeout(_authDebounce);

_authDebounce = setTimeout(()=>{

const u = _pendingUser;
const path =
window.location.pathname
.split("/")
.pop() ||
"index.html";

const publicPages = [
"index.html",
"login.html",
"signup.html"
];

// Store current user only
window.CURRENT_USER = u || null;

// Stop if redirect already started
if(_redirecting){
    console.log("[Router] Already redirecting - skip");
    return;
}

console.log("[Router] Auth state settled:", u ? `signed in (${u.uid})` : "no user", "| page:", path);

window.dispatchEvent(new CustomEvent('auth-resolved', {
  detail: { user: u, path }
}));

// User not logged in on protected page
if(!u && !publicPages.includes(path)){

console.log(
"[Router] Redirect → login"
);

_redirecting=true;

window.location.replace(
"login.html"
);

return;
}

// User logged in on login/signup page
if(
u &&
publicPages.includes(path)
){

console.log(
"[Router] Redirect → dashboard"
);

_redirecting=true;

window.location.replace(
"dashboard.html"
);

return;
}

// User is logged in - expose to window
if(u){
  console.log("[Router] User available:", u.uid);
}

}, 300); // 300ms debounce delay

});

}

export function markRedirecting(){

_redirecting=true;

}