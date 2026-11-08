import { auth } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { loadProfile, saveProfile } from "./profile.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Sidebar user card: name (Firebase Auth displayName) + optional company/department
// (Firestore /profiles/{uid}). Fires "profile:updated" on window after a save.

const sidebar = document.querySelector(".sidebar");
const brand = sidebar?.querySelector("h2");

let profile = { company: "", department: "" };

const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2)
  .map(word => word[0].toUpperCase()).join("");

function buildUserCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "sidebar-user";
  card.title = "Click to edit your profile";

  const avatar = document.createElement("span");
  avatar.className = "sidebar-avatar";

  const text = document.createElement("span");
  text.className = "sidebar-user-text";

  const name = document.createElement("strong");
  const sub = document.createElement("small");

  text.append(name, sub);
  card.append(avatar, text);
  brand.insertAdjacentElement("afterend", card);

  return { card, avatar, name, sub };
}

function render(ui, user) {
  const name = user.displayName?.trim();
  ui.name.textContent = name || "Set your name";
  ui.avatar.textContent = name ? initials(name) : "?";

  const org = [profile.company, profile.department].filter(Boolean).join(" · ");
  ui.sub.textContent = org || "Intern · Edit profile";
}

function field(labelText, input) {
  const label = document.createElement("label");
  label.textContent = labelText;
  return [label, input];
}

function textInput({ value = "", placeholder = "", required = false }) {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 100;
  input.value = value;
  input.placeholder = placeholder;
  input.required = required;
  return input;
}

function openProfileModal(user, ui, { required }) {
  const overlay = document.createElement("div");
  overlay.className = "name-modal-overlay";

  const box = document.createElement("form");
  box.className = "name-modal";

  const title = document.createElement("h2");
  title.textContent = required ? "Welcome! Set up your profile" : "Edit profile";

  const nameInput = textInput({
    value: user.displayName || "", placeholder: "e.g. Juan Dela Cruz", required: true
  });
  const companyInput = textInput({
    value: profile.company, placeholder: "Optional"
  });
  const deptInput = textInput({
    value: profile.department, placeholder: "Optional"
  });

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

  box.append(
    title,
    ...field("Name", nameInput),
    ...field("Company (optional)", companyInput),
    ...field("Department (optional)", deptInput),
    error, actions
  );
  overlay.append(box);
  document.body.append(overlay);
  nameInput.focus();

  box.addEventListener("submit", async event => {
    event.preventDefault();

    const name = nameInput.value.trim().replace(/\s+/g, " ");
    const company = companyInput.value.trim();
    const department = deptInput.value.trim();
    if (!name) return;

    save.disabled = true;
    error.textContent = "";

    try {
      await updateProfile(auth.currentUser, { displayName: name });
    } catch (err) {
      console.error("Name update failed:", err);
      error.textContent = "Could not save your name. Try again.";
      save.disabled = false;
      return;
    }

    let profileSaved = true;
    try {
      await saveProfile(user.uid, { company, department });
      profile = { company, department };
    } catch (err) {
      console.error("Profile save failed:", err);
      profileSaved = false;
    }

    render(ui, auth.currentUser);
    window.dispatchEvent(new CustomEvent("profile:updated", {
      detail: { name, ...profile }
    }));

    if (profileSaved) {
      overlay.remove();
    } else {
      error.textContent =
        "Name saved, but company/department could not be saved. " +
        "Check that the Firestore rules for /profiles are published.";
      save.disabled = false;
    }
  });
}

if (sidebar && brand) {
  const ui = buildUserCard();

  requireAuth(async user => {
    render(ui, user);
    profile = await loadProfile(user.uid);
    render(ui, auth.currentUser);

    if (!user.displayName) openProfileModal(user, ui, { required: true });
    ui.card.onclick = () => openProfileModal(auth.currentUser, ui, { required: false });
  });
}
