import {
onAuthStateChanged
}
from
"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
auth
}
from
"./firebase-config.js";

let _redirecting=false;

let _authDebounce=null;
let _pendingUser=null;

export function initRouter(){

console.log(
"[Router] Started"
);

onAuthStateChanged(
auth,
(user)=>{

if(_redirecting){

return;

}

_pendingUser=user;

clearTimeout(
_authDebounce
);

_authDebounce=
setTimeout(()=>{

const u=_pendingUser;

const path=
window.location.pathname
.split("/")
.pop()
||
"index.html";

const publicPages=[

"index.html",
"login.html",
"signup.html"

];

window.dispatchEvent(

new CustomEvent(
"auth-resolved",
{
detail:{
user:u,
path
}
}
)

);

if(
!u &&
!publicPages.includes(
path
)
){

_redirecting=true;

window.location.replace(
"login.html"
);

}

else if(

u &&
publicPages.includes(
path
) &&
!_redirecting

){

_redirecting=true;

window.location.replace(
"dashboard.html"
);

}

else if(u){

window.CURRENT_USER=u;

}

},300);

}

);

}

export function markRedirecting(){

_redirecting=true;

}