
import { auth } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");

onAuthStateChanged(auth, user => {
  if (user) {
    window.location.replace("dashboard.html");
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  message.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );

    window.location.replace("dashboard.html");

  } catch (error) {
    console.error("Login error:", error.code, error.message);
    message.textContent = "Login failed. Check your email and password.";
  }
});
