// Shared UI helpers used on every page:
//   setLoading(button, on, label)  spinner + text inside a button while an action runs
//   confirmDialog({...})           themed replacement for confirm() (and alert() for errors)
//   toast(message, { type })       small success / error / info message
//   toastNext(message, type)       show a toast on the NEXT page (after a redirect)
//   friendlyError(err, fallback)   readable message instead of a raw Firebase code
//   formSnapshot / confirmDiscard  "Discard changes?" for popups and forms
//   setDirtyCheck(fn)              warn before leaving a page that has unsaved typing

// ---------------------------------------------------------------------------
// Friendly errors
// ---------------------------------------------------------------------------

const NETWORK_CODES = new Set([
  "unavailable", "deadline-exceeded", "network-request-failed", "auth/network-request-failed"
]);

// The raw error is always logged by the caller; the user only sees a readable message.
export function friendlyError(err, fallback = "Something went wrong. Please try again.") {
  const code = String(err?.code || "").replace(/^firestore\//, "");

  if (code === "permission-denied") {
    return "You don't have permission to do that. Check that the Firestore rules are published.";
  }
  if (code === "unauthenticated") {
    return "Your session expired. Please sign in again.";
  }
  if (NETWORK_CODES.has(code) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Loading button: spinner + label inside the button, width kept so nothing jumps.
// setLoading(btn, false) restores the original content and re-enables the button;
// callers that need the button to stay disabled afterwards set that themselves.
// ---------------------------------------------------------------------------

export function setLoading(button, loading, label = "Loading...") {
  if (!button) return;

  if (loading) {
    if (button.dataset.loading === "1") return;
    button.dataset.loading = "1";
    button._originalHTML = button.innerHTML;
    button.style.minWidth = `${button.offsetWidth}px`;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.disabled = true;

    const spinner = document.createElement("span");
    spinner.className = "btn-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;

    button.replaceChildren(spinner, text);
    return;
  }

  if (button.dataset.loading !== "1") return;
  delete button.dataset.loading;
  button.innerHTML = button._originalHTML ?? button.innerHTML;
  button._originalHTML = undefined;
  button.style.minWidth = "";
  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
  button.disabled = false;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

const TOAST_KEY = "ojt-next-toast";
const TOAST_ICONS = {
  success: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>'
};

function toastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.append(stack);
  }
  return stack;
}

export function toast(message, { type = "success", duration } = {}) {
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.setAttribute("role", type === "error" ? "alert" : "status");

  item.innerHTML =
    `<svg class="toast-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">${TOAST_ICONS[type] || TOAST_ICONS.info}</svg>`;

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  item.append(text);

  const dismiss = () => {
    if (!item.isConnected) return;
    item.classList.add("toast-out");
    setTimeout(() => item.remove(), 200);
  };
  item.addEventListener("click", dismiss);

  toastStack().append(item);
  setTimeout(dismiss, duration ?? (type === "error" ? 6000 : 3500));
  return item;
}

// For actions that redirect right away (saving a log, signing out).
export function toastNext(message, type = "success") {
  try { sessionStorage.setItem(TOAST_KEY, JSON.stringify({ message, type })); } catch {}
}

export function cancelToastNext() {
  try { sessionStorage.removeItem(TOAST_KEY); } catch {}
}

try {
  const pending = sessionStorage.getItem(TOAST_KEY);
  if (pending) {
    sessionStorage.removeItem(TOAST_KEY);
    const { message, type } = JSON.parse(pending);
    setTimeout(() => toast(message, { type }), 150);
  }
} catch {}

// ---------------------------------------------------------------------------
// Confirm dialog
//
//   const ok = await confirmDialog({
//     title, message, confirmText, cancelText, danger,
//     loadingText,          // text inside the confirm button while `action` runs
//     action                // optional async function; the dialog stays open (with the
//                           // button loading) until it finishes. If it throws, the
//                           // message is shown in the dialog and the person can retry.
//   });
//
// Resolves true when confirmed (and `action` succeeded), false when cancelled.
// ---------------------------------------------------------------------------

export function confirmDialog({
  title,
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  loadingText = "Working...",
  errorText = "Something went wrong. Please try again.",
  action = null
}) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const uid = Math.random().toString(36).slice(2, 8);

    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const box = document.createElement("div");
    box.className = "name-modal confirm-dialog";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", `cd-title-${uid}`);
    box.setAttribute("aria-describedby", `cd-text-${uid}`);

    const heading = document.createElement("h2");
    heading.id = `cd-title-${uid}`;
    heading.textContent = title;

    const text = document.createElement("p");
    text.id = `cd-text-${uid}`;
    text.className = "confirm-text";
    text.textContent = message;

    const error = document.createElement("p");
    error.className = "message confirm-error";
    error.setAttribute("role", "alert");

    const actions = document.createElement("div");
    actions.className = "actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn secondary";
    cancel.textContent = cancelText;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = danger ? "btn danger" : "btn primary";
    confirm.textContent = confirmText;

    actions.append(cancel, confirm);
    box.append(heading, text, error, actions);
    overlay.append(box);
    document.body.append(overlay);

    let busy = false;

    const finish = result => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      resolve(result);
    };

    // Runs before every other Escape handler on the page, so a popup underneath
    // does not close at the same time.
    function onKey(event) {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (!busy) finish(false);
        return;
      }

      if (event.key === "Tab") {
        const buttons = [cancel, confirm].filter(btn => !btn.disabled);
        if (!buttons.length) { event.preventDefault(); return; }
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!box.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);

    overlay.addEventListener("mousedown", event => {
      if (event.target === overlay && !busy) finish(false);
    });
    cancel.addEventListener("click", () => { if (!busy) finish(false); });

    confirm.addEventListener("click", async () => {
      if (busy) return;
      if (!action) { finish(true); return; }

      busy = true;
      error.textContent = "";
      cancel.disabled = true;
      setLoading(confirm, true, loadingText);

      try {
        await action();
        finish(true);
      } catch (err) {
        console.error("Confirmed action failed:", err);
        busy = false;
        setLoading(confirm, false);
        cancel.disabled = false;
        error.textContent = friendlyError(err, errorText);
        confirm.focus();
      }
    });

    // Destructive actions start on Cancel so Enter can't delete by accident.
    (danger ? cancel : confirm).focus();
  });
}

// ---------------------------------------------------------------------------
// Unsaved changes
// ---------------------------------------------------------------------------

// A string describing what is currently typed in a form or popup.
export function formSnapshot(root) {
  return JSON.stringify(
    [...root.querySelectorAll("input, textarea, select")]
      .filter(field => field.type !== "file" && field.type !== "hidden")
      .map(field => (field.type === "checkbox" || field.type === "radio")
        ? field.checked : field.value)
  );
}

export function confirmDiscard() {
  return confirmDialog({
    title: "Discard changes?",
    message: "You have unsaved changes. If you leave now, they will be lost.",
    confirmText: "Discard",
    cancelText: "Keep editing",
    danger: true
  });
}

// A page with typed-but-unsaved work registers a check; the browser then warns
// before the tab is closed or the page is left.
let dirtyCheck = null;

export function setDirtyCheck(fn) { dirtyCheck = fn; }

// Switch the warning off while leaving on purpose; call the returned function to put it back.
export function suspendDirtyCheck() {
  const previous = dirtyCheck;
  dirtyCheck = null;
  return () => { dirtyCheck = previous; };
}

export function hasUnsavedChanges() {
  try { return Boolean(dirtyCheck && dirtyCheck()); } catch { return false; }
}

window.addEventListener("beforeunload", event => {
  if (hasUnsavedChanges()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
