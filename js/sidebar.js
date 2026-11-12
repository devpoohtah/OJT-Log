import { auth } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { loadProfile, saveProfile, saveSignature } from "./profile.js";
import { processSignature } from "./signature.js";
import { addDateHints, formatDateWithWeekday } from "./format.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ICONS, makeThemeButton } from "./icons.js";

// Sidebar user card: name (Firebase Auth displayName) + optional company/department
// (Firestore /profiles/{uid}). Fires "profile:updated" on window after a save.

const sidebar = document.querySelector(".sidebar");
const brand = sidebar?.querySelector("h2");

let profile = { company: "", department: "", signature: "" };

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
  (sidebar.querySelector(".sidebar-date") || brand).insertAdjacentElement("afterend", card);

  return { card, avatar, name, sub };
}

function render(ui, user) {
  const name = user.displayName?.trim();
  ui.name.textContent = name || "Set your name";
  if (name) ui.avatar.textContent = initials(name);
  else ui.avatar.innerHTML = ICONS.user;      // generic person icon, nothing to download

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

  // ----- signature (optional): stored as a small PNG string in the profile -----
  let signatureValue = profile.signature || "";
  let signatureChanged = false;

  const sigBox = document.createElement("div");
  sigBox.className = "signature-box";

  const sigPreview = document.createElement("img");
  sigPreview.className = "signature-preview";
  sigPreview.alt = "Your signature";

  const sigEmpty = document.createElement("span");
  sigEmpty.className = "signature-empty muted";
  sigEmpty.textContent = "No signature uploaded";

  const sigFile = document.createElement("input");
  sigFile.type = "file";
  sigFile.accept = "image/png,image/jpeg,image/webp";
  sigFile.hidden = true;

  const sigUpload = document.createElement("button");
  sigUpload.type = "button";
  sigUpload.className = "small-btn";

  const sigRemove = document.createElement("button");
  sigRemove.type = "button";
  sigRemove.className = "small-btn delete-btn";
  sigRemove.textContent = "Remove";

  const sigNote = document.createElement("small");
  sigNote.className = "muted";
  sigNote.textContent =
    "Use a clear photo of your signature in dark pen on white paper. " +
    "The white background is removed automatically.";

  const sigError = document.createElement("p");
  sigError.className = "message";

  const renderSignature = () => {
    sigPreview.hidden = !signatureValue;
    sigEmpty.hidden = Boolean(signatureValue);
    sigRemove.hidden = !signatureValue;
    sigUpload.textContent = signatureValue ? "Replace" : "Upload";
    if (signatureValue) sigPreview.src = signatureValue;
  };

  sigUpload.addEventListener("click", () => sigFile.click());
  sigRemove.addEventListener("click", () => {
    signatureValue = "";
    signatureChanged = true;
    sigError.textContent = "";
    renderSignature();
  });
  sigFile.addEventListener("change", async () => {
    const file = sigFile.files[0];
    sigFile.value = "";
    if (!file) return;
    sigError.textContent = "Processing...";
    try {
      signatureValue = await processSignature(file);
      signatureChanged = true;
      sigError.textContent = "";
      renderSignature();
    } catch (err) {
      sigError.textContent = err.message || "Couldn't use that image.";
    }
  });

  const sigButtons = document.createElement("div");
  sigButtons.className = "signature-buttons";
  sigButtons.append(sigUpload, sigRemove);
  sigBox.append(sigPreview, sigEmpty, sigButtons, sigFile);
  renderSignature();

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
    ...field("Signature (optional)", sigBox),
    sigNote, sigError,
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
      if (signatureChanged) await saveSignature(user.uid, signatureValue);
      profile = { ...profile, company, department, signature: signatureValue };
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

// =====================================
// SIDEBAR CHROME: nav icons, theme toggle, desktop collapse, phone drawer
// =====================================

const NAV_ICONS = {
  "dashboard.html": ICONS.tasks,
  "add-task.html": ICONS.add,
  "history.html": ICONS.history,
  "dtr.html": ICONS.clock,
  "dtr-records.html": ICONS.records
};

function setupSidebarChrome() {
  // Brand: full name normally, short "OJT" when the sidebar is collapsed.
  const full = brand.querySelector("span");
  const short = document.createElement("span");
  short.className = "brand-short";
  short.textContent = "OJT";
  full.classList.add("brand-full");
  brand.append(short);

  // Today's date under the app name.
  const today = document.createElement("p");
  today.className = "sidebar-date";
  const showToday = () => { today.textContent = formatDateWithWeekday(new Date()); };
  showToday();
  window.addEventListener("focus", showToday);        // refresh after midnight
  brand.after(today);

  // Nav links: icon + label (the label hides when collapsed).
  sidebar.querySelectorAll("nav a").forEach(link => {
    const label = link.textContent.trim();
    const icon = NAV_ICONS[link.getAttribute("href")] || ICONS.tasks;
    link.title = label;
    link.innerHTML = `${icon}<span class="nav-label">${label}</span>`;
  });

  const logout = sidebar.querySelector(".logout");

  // Tools row: theme toggle + desktop collapse button, just above Sign Out.
  const tools = document.createElement("div");
  tools.className = "sidebar-tools";

  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "collapse-toggle";
  collapse.title = "Collapse or expand the sidebar";
  collapse.setAttribute("aria-label", "Collapse or expand the sidebar");
  collapse.innerHTML = `${ICONS.collapse}<span class="nav-label">Collapse</span>`;
  collapse.addEventListener("click", () => {
    const collapsed = document.documentElement.classList.toggle("sidebar-collapsed");
    try { localStorage.setItem("ojt-sidebar", collapsed ? "collapsed" : "open"); } catch {}
  });

  tools.append(makeThemeButton({ label: true }), collapse);

  if (logout) {
    logout.title = "Sign Out";
    logout.innerHTML = `${ICONS.logout}<span class="nav-label">Sign Out</span>`;
    logout.before(tools);
  } else {
    sidebar.append(tools);
  }

  // Phone: hamburger button + dimmed backdrop; sidebar becomes a slide-in drawer.
  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "menu-toggle";
  menu.setAttribute("aria-label", "Open menu");
  menu.innerHTML = ICONS.menu;

  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";

  document.body.append(menu, backdrop);

  const setOpen = open => {
    document.body.classList.toggle("nav-open", open);
    menu.setAttribute("aria-expanded", String(open));
  };

  menu.addEventListener("click", () => setOpen(!document.body.classList.contains("nav-open")));
  backdrop.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("nav a").forEach(a => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });
  window.matchMedia("(min-width: 701px)").addEventListener("change", () => setOpen(false));
}

if (sidebar && brand) setupSidebarChrome();

addDateHints();


if (sidebar && brand) {
  const ui = buildUserCard();

  requireAuth(async user => {
    render(ui, user);
    profile = await loadProfile(user.uid);
    render(ui, auth.currentUser);

    if (!user.displayName) openProfileModal(user, ui, { required: true });
    ui.card.onclick = () => {
      document.body.classList.remove("nav-open");          // close the phone drawer first
      openProfileModal(auth.currentUser, ui, { required: false });
    };
  });
}
