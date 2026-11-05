
import { auth } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireAuth(callback) {
  return onAuthStateChanged(auth, user => {
    if (!user) {
      window.location.replace("index.html");
      return;
    }

    callback(user);
  });
}

export function setupLogout() {
  const button = document.getElementById("logout");

  if (button) {
    button.addEventListener("click", async () => {
      await signOut(auth);
      window.location.replace("index.html");
    });
  }
}
