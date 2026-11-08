import { auth } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Shows the signed-in user's name in the sidebar.
// Name is stored in Firebase Auth (displayName) - no extra Firestore rules needed.

const sidebar = document.querySelector(".sidebar");
const brand = sidebar?.querySelector("h2");

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(word => word[0].toUpperCase()).join("");
}

function buildUserCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.id = "sidebarUser";
  card.className = "sidebar-user";
  card.title = "Click to edit your name";

  const avatar = document.createElement("span");
  avatar.className = "sidebar-avatar";

  const text = document.createElement("span");
  text.className = "sidebar-user-text";

  const name = document.createElement("strong");
  name.id = "sidebarUserName";

  const hint = document.createElement("small");
  hint.textContent = "Intern · Edit name";

  text.append(name, hint);
  card.append(avatar, text);
  brand.insertAdjacentElement("afterend", card);

  return { card, avatar, name };
}

function render(ui, user) {
  const name = user.displayName?.trim() || "Set your name";
  ui.name.textContent = name;
  ui.avatar.textContent = user.displayName ? initials(name) : "?";
}

function askForName(user, ui, { required }) {
  const overlay = document.createElement("div");
  overlay.className = "name-modal-overlay";

  const box = document.createElement("form");
  box.className = "name-modal";

  const title = document.createElement("h2");
  title.textContent = required ? "Welcome! What's your name?" : "Edit your name";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 60;
  input.required = true;
  input.placeholder = "e.g. Juan Dela Cruz";
  input.value = user.displayName || "";

  const error = document.createElement("p");
  error.className = "message";

  const actions = document.createElement("div");
  actions.className = "actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn primary";
  save.textContent = "Save";

  if (!required) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn secondary";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => overlay.remove());
    actions.append(cancel);
  }

  actions.append(save);
  box.append(title, input, error, actions);
  overlay.append(box);
  document.body.append(overlay);
  input.focus();

  box.addEventListener("submit", async event => {
    event.preventDefault();
    const value = input.value.trim().replace(/\s+/g, " ");
    if (!value) return;

    save.disabled = true;
    try {
      await updateProfile(auth.currentUser, { displayName: value });
      render(ui, auth.currentUser);
      overlay.remove();
    } catch (err) {
      console.error("Name update failed:", err);
      error.textContent = "Could not save your name. Try again.";
      save.disabled = false;
    }
  });
}

if (sidebar && brand) {
  const ui = buildUserCard();

  requireAuth(user => {
    render(ui, user);
    if (!user.displayName) askForName(user, ui, { required: true });
    ui.card.onclick = () => askForName(auth.currentUser, ui, { required: false });
  });
}
