
import { auth } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  confirmDialog, toastNext, cancelToastNext, hasUnsavedChanges, suspendDirtyCheck
} from "./ui.js";

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
      const unsaved = hasUnsavedChanges();

      await confirmDialog({
        title: "Sign out?",
        message: unsaved
          ? "You have unsaved changes on this page. They will be lost if you sign out."
          : "You'll need to sign in again to see your logs.",
        confirmText: "Sign Out",
        loadingText: "Signing out...",
        errorText: "Couldn't sign out. Please try again.",
        danger: unsaved,
        action: async () => {
          // The page's own auth listener redirects as soon as signOut() finishes, so the
          // toast is queued first and the "unsaved changes" browser prompt is switched off.
          const restore = suspendDirtyCheck();
          toastNext("You've been signed out.", "info");
          try {
            await signOut(auth);
          } catch (err) {
            cancelToastNext();
            restore();
            throw err;
          }
          window.location.replace("index.html");
          await new Promise(() => {});    // keep the button loading while the page changes
        }
      });
    });
  }
}
