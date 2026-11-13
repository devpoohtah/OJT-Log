
import { auth } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { ICONS, makeThemeButton } from "./icons.js";
import { setLoading, friendlyError } from "./ui.js";

document.getElementById("themeSlot")?.append(makeThemeButton());

// Show / hide password
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("togglePassword");

function renderPasswordToggle() {
  const visible = passwordInput.type === "text";
  passwordToggle.innerHTML = visible ? ICONS.eyeOff : ICONS.eye;
  passwordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  passwordToggle.setAttribute("aria-pressed", String(visible));
}

passwordToggle.addEventListener("click", () => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  renderPasswordToggle();
});
renderPasswordToggle();

const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
let signingIn = false;

const BAD_CREDENTIALS = new Set([
  "auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"
]);

function loginErrorMessage(error) {
  if (BAD_CREDENTIALS.has(error.code)) return "Login failed. Check your email and password.";
  if (error.code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return friendlyError(error, "Couldn't sign in. Please try again.");
}

onAuthStateChanged(auth, user => {
  if (user) {
    window.location.replace("dashboard.html");
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (signingIn) return;             // ignore a double click / double Enter

  signingIn = true;
  message.textContent = "";
  setLoading(loginButton, true, "Signing in...");

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );

    window.location.replace("dashboard.html");   // button keeps loading until the page changes

  } catch (error) {
    console.error("Login error:", error.code, error.message);
    message.textContent = loginErrorMessage(error);
    setLoading(loginButton, false);
    signingIn = false;
  }
});
