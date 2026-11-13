import { auth } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  loadProfile, saveProfile, saveSignature, saveSupervisorSignature, saveColorTheme
} from "./profile.js";
import { processSignature } from "./signature.js";
import { setLoading, toast, friendlyError, formSnapshot, confirmDiscard } from "./ui.js";
import { addDateHints, formatDateWithWeekday } from "./format.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ICONS, makeThemeButton } from "./icons.js";

// Sidebar user card: name (Firebase Auth displayName) + optional company/department/supervisor
// (Firestore /profiles/{uid}). Fires "profile:updated" on window after a save.
// The gear button beside the app name opens Settings (color theme).

const sidebar = document.querySelector(".sidebar");
const brand = sidebar?.querySelector("h2");

let profile = {
  company: "", department: "", supervisor: "", signature: "", supervisorSignature: "", colorTheme: ""
};

let settingsButton = null;      // gear button beside the app name (see setupSidebarChrome)

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

// ---------------------------------------------------------------------------
// Signature upload box (used for the student's and the supervisor's signature).
// Returns the box, a hint line and an error line, plus live accessors for the result.
// ---------------------------------------------------------------------------
function createSignatureField({ initial = "", alt, hint }) {
  let value = initial;
  let changed = false;

  const box = document.createElement("div");
  box.className = "signature-box";

  const preview = document.createElement("img");
  preview.className = "signature-preview";
  preview.alt = alt;

  const empty = document.createElement("span");
  empty.className = "signature-empty muted";
  empty.textContent = "No signature uploaded";

  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp";
  file.hidden = true;

  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "small-btn";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "small-btn delete-btn";
  remove.textContent = "Remove";

  const note = document.createElement("small");
  note.className = "muted";
  note.textContent = hint;

  const error = document.createElement("p");
  error.className = "message";

  const render = () => {
    preview.hidden = !value;
    empty.hidden = Boolean(value);
    remove.hidden = !value;
    upload.textContent = value ? "Replace" : "Upload";
    if (value) preview.src = value;
  };

  upload.addEventListener("click", () => file.click());
  remove.addEventListener("click", () => {
    value = "";
    changed = true;
    error.textContent = "";
    render();
  });
  file.addEventListener("change", async () => {
    const picked = file.files[0];
    file.value = "";
    if (!picked) return;
    error.textContent = "Processing...";
    try {
      value = await processSignature(picked);
      changed = true;
      error.textContent = "";
      render();
    } catch (err) {
      error.textContent = err.message || "Couldn't use that image.";
    }
  });

  const buttons = document.createElement("div");
  buttons.className = "signature-buttons";
  buttons.append(upload, remove);
  box.append(preview, empty, buttons, file);
  render();

  return {
    box, note, error,
    get value() { return value; },
    get changed() { return changed; }
  };
}

function profileColumn(heading, children) {
  const col = document.createElement("div");
  col.className = "profile-col";
  const title = document.createElement("h3");
  title.textContent = heading;
  col.append(title, ...children);
  return col;
}

// ---------------------------------------------------------------------------
// Profile popup: two columns, student on the left, supervisor on the right.
// ---------------------------------------------------------------------------
function openProfileModal(user, ui, { required }) {
  const overlay = document.createElement("div");
  overlay.className = "name-modal-overlay";

  const box = document.createElement("form");
  box.className = "name-modal profile-modal";

  const title = document.createElement("h2");
  title.textContent = required ? "Welcome! Set up your profile" : "Edit profile";

  // ----- student column -----
  const nameInput = textInput({
    value: user.displayName || "", placeholder: "e.g. Juan Dela Cruz", required: true
  });
  const companyInput = textInput({
    value: profile.company, placeholder: "Optional"
  });
  const deptInput = textInput({
    value: profile.department, placeholder: "Optional"
  });
  const studentSig = createSignatureField({
    initial: profile.signature || "",
    alt: "Your signature",
    hint: "Use a clear photo of your signature in dark pen on white paper. " +
          "The white background is removed automatically."
  });

  // ----- supervisor column (everything optional) -----
  const supervisorInput = textInput({
    value: profile.supervisor, placeholder: "Optional"
  });
  const supervisorSig = createSignatureField({
    initial: profile.supervisorSignature || "",
    alt: "Supervisor's signature",
    hint: "Optional. Only add this if your supervisor agreed to it. Otherwise leave it " +
          "empty and have them sign the printed report."
  });

  const columns = document.createElement("div");
  columns.className = "profile-cols";
  columns.append(
    profileColumn("Student", [
      ...field("Name", nameInput),
      ...field("Company (optional)", companyInput),
      ...field("Department (optional)", deptInput),
      ...field("Signature (optional)", studentSig.box),
      studentSig.note, studentSig.error
    ]),
    profileColumn("Supervisor", [
      ...field("Supervisor name (optional)", supervisorInput),
      ...field("Supervisor signature (optional)", supervisorSig.box),
      supervisorSig.note, supervisorSig.error
    ])
  );

  const error = document.createElement("p");
  error.className = "message";

  const actions = document.createElement("div");
  actions.className = "actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn primary";
  save.textContent = "Save";

  // Closing with typed changes asks first. The first-time popup can't be dismissed.
  let saving = false;
  let snapshot = "";
  const isDirty = () =>
    formSnapshot(box) !== snapshot || studentSig.changed || supervisorSig.changed;

  const closeProfile = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  const requestClose = async () => {
    if (saving || required) return;
    if (isDirty() && !(await confirmDiscard())) return;
    closeProfile();
  };

  function onKey(event) {
    if (event.key === "Escape") requestClose();
  }

  if (!required) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn secondary";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", requestClose);
    actions.append(cancel);

    document.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", event => {
      if (event.target === overlay) requestClose();
    });
  }
  actions.append(save);

  box.append(title, columns, error, actions);
  overlay.append(box);
  document.body.append(overlay);
  snapshot = formSnapshot(box);
  nameInput.focus();

  box.addEventListener("submit", async event => {
    event.preventDefault();

    const name = nameInput.value.trim().replace(/\s+/g, " ");
    const company = companyInput.value.trim();
    const department = deptInput.value.trim();
    const supervisor = supervisorInput.value.trim();
    if (!name) return;

    saving = true;
    error.textContent = "";
    setLoading(save, true, "Saving...");

    try {
      await updateProfile(auth.currentUser, { displayName: name });
    } catch (err) {
      console.error("Name update failed:", err);
      error.textContent = friendlyError(err, "Couldn't save your name. Please try again.");
      saving = false;
      setLoading(save, false);
      return;
    }

    let profileSaved = true;
    try {
      await saveProfile(user.uid, { company, department, supervisor });
      if (studentSig.changed) await saveSignature(user.uid, studentSig.value);
      if (supervisorSig.changed) await saveSupervisorSignature(user.uid, supervisorSig.value);
      profile = {
        ...profile, company, department, supervisor,
        signature: studentSig.value,
        supervisorSignature: supervisorSig.value
      };
    } catch (err) {
      console.error("Profile save failed:", err);
      profileSaved = false;
    }

    render(ui, auth.currentUser);
    window.dispatchEvent(new CustomEvent("profile:updated", {
      detail: { name, ...profile }
    }));

    saving = false;
    if (profileSaved) {
      closeProfile();
      toast("Profile saved.");
    } else {
      error.textContent =
        "Name saved, but the rest of your profile could not be saved. " +
        "Check that the Firestore rules for /profiles are published.";
      setLoading(save, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Settings popup (gear button next to the app name): color theme.
// A color previews instantly, is kept only when Save is pressed, and closing
// the popup any other way puts the saved color back.
// ---------------------------------------------------------------------------
function openSettingsModal(user) {
  const Theme = window.OJTTheme;

  const overlay = document.createElement("div");
  overlay.className = "name-modal-overlay";

  const box = document.createElement("form");
  box.className = "name-modal settings-modal";

  const title = document.createElement("h2");
  title.textContent = "Settings";

  let committedColor = Theme ? Theme.getColor() : "classic";
  let pickedColor = committedColor;

  const picker = document.createElement("div");
  picker.className = "theme-picker";
  picker.setAttribute("role", "radiogroup");
  picker.setAttribute("aria-label", "Color theme");

  const markPicked = () => {
    picker.querySelectorAll(".theme-option").forEach(btn => {
      btn.setAttribute("aria-checked", String(btn.dataset.color === pickedColor));
    });
  };

  (Theme?.COLORS || []).forEach(color => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "theme-option";
    option.dataset.color = color.id;
    option.setAttribute("role", "radio");

    const swatch = document.createElement("span");
    swatch.className = "theme-swatch";
    swatch.style.background =
      `linear-gradient(135deg, ${color.swatch[0]} 50%, ${color.swatch[1]} 50%)`;

    const label = document.createElement("span");
    label.textContent = color.name;

    option.append(swatch, label);
    option.addEventListener("click", () => {
      pickedColor = color.id;
      Theme.previewColor(pickedColor);          // instant, no reload, not saved yet
      markPicked();
    });
    picker.append(option);
  });
  markPicked();

  const error = document.createElement("p");
  error.className = "message";

  const close = () => {
    Theme?.previewColor(committedColor);        // undo an unsaved preview
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = event => { if (event.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", event => { if (event.target === overlay) close(); });

  const actions = document.createElement("div");
  actions.className = "actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn secondary";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", close);

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn primary";
  save.textContent = "Save";
  actions.append(cancel, save);

  box.append(title, ...field("Color theme", picker), error, actions);
  overlay.append(box);
  document.body.append(overlay);

  box.addEventListener("submit", async event => {
    event.preventDefault();

    if (!Theme || pickedColor === committedColor) {
      close();
      return;
    }

    error.textContent = "";
    setLoading(save, true, "Saving...");
    try {
      await saveColorTheme(user.uid, pickedColor);
      Theme.setColor(pickedColor);              // also cached on this device
      committedColor = pickedColor;
      profile = { ...profile, colorTheme: committedColor };
      close();
      toast("Color theme saved.");
    } catch (err) {
      console.error("Color theme save failed:", err);
      error.textContent = friendlyError(
        err, "Couldn't save the color theme. Check that the Firestore rules for /profiles are published.");
      setLoading(save, false);
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

  // Gear button beside the app name: opens Settings (color theme).
  settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "settings-btn";
  settingsButton.title = "Settings";
  settingsButton.setAttribute("aria-label", "Open settings");
  settingsButton.innerHTML = ICONS.settings;
  brand.append(settingsButton);

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

    // The color saved in Firestore wins, so a new device picks it up after login.
    if (window.OJTTheme && OJTTheme.isValidColor(profile.colorTheme)
        && profile.colorTheme !== OJTTheme.getColor()) {
      OJTTheme.setColor(profile.colorTheme);
    }

    if (!user.displayName) openProfileModal(user, ui, { required: true });
    settingsButton.onclick = () => {
      document.body.classList.remove("nav-open");
      openSettingsModal(auth.currentUser);
    };
    ui.card.onclick = () => {
      document.body.classList.remove("nav-open");          // close the phone drawer first
      openProfileModal(auth.currentUser, ui, { required: false });
    };
  });
}
