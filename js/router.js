import { onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth }
from "./firebase-config.js";

let _redirecting = false;
let _routerInitialized = false;

export function initRouter(){

// Prevent router from registering twice
if(_routerInitialized){
    console.log("[Router] Already initialized");
    return;
}

_routerInitialized = true;

console.log("[Router] Initializing");

onAuthStateChanged(auth,(user)=>{

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
window.CURRENT_USER = user || null;

// Stop if redirect already started
if(_redirecting){
    return;
}

// User not logged in on protected page
if(!user && !publicPages.includes(path)){

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
user &&
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

});

}

export function markRedirecting(){

_redirecting=true;

}