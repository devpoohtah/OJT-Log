import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

// =====================================
// PURE HELPERS (no DOM / Firebase)
// =====================================

export function toMinutes(time) {           // "08:30" -> 510
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Returns net worked minutes, or null if the range is invalid.
export function workedMinutes(timeIn, timeOut, breakMinutes = 0) {
  if (!timeIn || !timeOut) return null;
  const net = toMinutes(timeOut) - toMinutes(timeIn) - (Number(breakMinutes) || 0);
  return net > 0 ? net : null;
}

export const toHours = minutes => minutes / 60;

function localDateString(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localTimeString(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function format12h(time) {
  if (!time) return "--:--";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// =====================================
// ELEMENTS
// =====================================

const $ = id => document.getElementById(id);
const el = {
  totalHours: $("totalHours"), totalDays: $("totalDays"),
  monthHours: $("monthHours"), monthDays: $("monthDays"),
  remainingHours: $("remainingHours"), requiredHours: $("requiredHours"),
  todayLabel: $("todayLabel"), todayIn: $("todayIn"), todayOut: $("todayOut"),
  todayHours: $("todayHours"), timeInBtn: $("timeInBtn"), timeOutBtn: $("timeOutBtn"),
  todayMessage: $("todayMessage"),
  manualForm: $("manualForm"), mDate: $("mDate"), mIn: $("mIn"), mOut: $("mOut"),
  mBreak: $("mBreak"), manualSave: $("manualSave"), manualMessage: $("manualMessage"),
  manualTitle: $("manualTitle"), cancelEdit: $("cancelEdit"),
  monthFilter: $("monthFilter"), dtrBody: $("dtrBody"), printBtn: $("printBtn")
};

// =====================================
// STATE
// =====================================

let currentUser = null;
let records = [];                       // sorted newest first
const DEFAULT_BREAK = 60;

const docRef = date => doc(db, "dtrRecords", `${currentUser.uid}_${date}`);
const requiredKey = () => `ojt-required-hours-${currentUser.uid}`;

// =====================================
// DATA
// =====================================

async function loadRecords() {
  // Single-field query on userId (same pattern as dailyLogs) - no composite index needed.
  const snap = await getDocs(
    query(collection(db, "dtrRecords"), where("userId", "==", currentUser.uid))
  );
  records = snap.docs.map(d => d.data()).sort((a, b) => b.date.localeCompare(a.date));
  render();
}

async function saveRecord({ date, timeIn, timeOut, breakMinutes }) {
  const minutes = timeOut ? workedMinutes(timeIn, timeOut, breakMinutes) : null;

  await setDoc(docRef(date), {
    userId: currentUser.uid,
    date,
    timeIn,
    timeOut: timeOut || null,
    breakMinutes: Number(breakMinutes) || 0,
    totalMinutes: minutes,              // null while still clocked in
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// =====================================
// RENDER
// =====================================

function render() {
  renderToday();
  renderStats();
  renderTable();
}

function renderToday() {
  const today = localDateString();
  const rec = records.find(r => r.date === today);

  el.todayLabel.textContent = parseDate(today).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
  el.todayIn.textContent = format12h(rec?.timeIn);
  el.todayOut.textContent = format12h(rec?.timeOut);
  el.todayHours.textContent = rec?.totalMinutes
    ? toHours(rec.totalMinutes).toFixed(2) : "--";

  el.timeInBtn.disabled = Boolean(rec?.timeIn);
  el.timeOutBtn.disabled = !rec?.timeIn || Boolean(rec?.timeOut);
}

function renderStats() {
  const done = records.filter(r => r.totalMinutes);
  const total = done.reduce((s, r) => s + toHours(r.totalMinutes), 0);

  el.totalHours.textContent = total.toFixed(2);
  el.totalDays.textContent = `${done.length} day${done.length === 1 ? "" : "s"}`;

  const month = el.monthFilter.value;
  const inMonth = done.filter(r => r.date.startsWith(month));
  const monthTotal = inMonth.reduce((s, r) => s + toHours(r.totalMinutes), 0);
  el.monthHours.textContent = monthTotal.toFixed(2);
  el.monthDays.textContent = `${inMonth.length} day${inMonth.length === 1 ? "" : "s"}`;

  const required = Number(el.requiredHours.value);
  el.remainingHours.textContent = required > 0
    ? Math.max(required - total, 0).toFixed(2) : "—";
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function actionButton(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function renderTable() {
  const month = el.monthFilter.value;
  const rows = records.filter(r => r.date.startsWith(month));
  el.dtrBody.replaceChildren();

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.append(cell("No records for this month.", "muted"));
    tr.firstChild.colSpan = 7;
    el.dtrBody.append(tr);
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    const day = parseDate(r.date).toLocaleDateString("en-US", { weekday: "short" });

    tr.append(
      cell(r.date), cell(day), cell(format12h(r.timeIn)), cell(format12h(r.timeOut)),
      cell(`${r.breakMinutes || 0} min`),
      cell(r.totalMinutes ? toHours(r.totalMinutes).toFixed(2) : "In progress")
    );

    const actions = document.createElement("td");
    actions.className = "no-print dtr-row-actions";
    actions.append(
      actionButton("Edit", "link-btn", () => startEdit(r)),
      actionButton("Delete", "link-btn danger", () => removeRecord(r))
    );
    tr.append(actions);
    el.dtrBody.append(tr);
  }
}

// =====================================
// CLOCK IN / OUT
// =====================================

el.timeInBtn.addEventListener("click", async () => {
  el.timeInBtn.disabled = true;
  el.todayMessage.textContent = "Saving...";
  try {
    await saveRecord({
      date: localDateString(), timeIn: localTimeString(),
      timeOut: null, breakMinutes: DEFAULT_BREAK
    });
    el.todayMessage.textContent = "Timed in.";
    await loadRecords();
  } catch (err) {
    console.error(err);
    el.todayMessage.textContent = `Unable to save: ${err.code || err.message}`;
    el.timeInBtn.disabled = false;
  }
});

el.timeOutBtn.addEventListener("click", async () => {
  const rec = records.find(r => r.date === localDateString());
  if (!rec?.timeIn) return;

  const timeOut = localTimeString();
  if (!workedMinutes(rec.timeIn, timeOut, rec.breakMinutes)) {
    el.todayMessage.textContent =
      "Net hours would be zero or negative. Adjust the break or use the manual form below.";
    return;
  }

  el.timeOutBtn.disabled = true;
  el.todayMessage.textContent = "Saving...";
  try {
    await saveRecord({
      date: rec.date, timeIn: rec.timeIn, timeOut, breakMinutes: rec.breakMinutes
    });
    el.todayMessage.textContent = "Timed out.";
    await loadRecords();
  } catch (err) {
    console.error(err);
    el.todayMessage.textContent = `Unable to save: ${err.code || err.message}`;
    el.timeOutBtn.disabled = false;
  }
});

// =====================================
// MANUAL ADD / EDIT
// =====================================

function resetForm() {
  el.manualForm.reset();
  el.mDate.value = localDateString();
  el.mBreak.value = DEFAULT_BREAK;
  el.manualTitle.textContent = "Add / Edit a Record";
  el.cancelEdit.hidden = true;
}

function startEdit(r) {
  el.mDate.value = r.date;
  el.mIn.value = r.timeIn || "";
  el.mOut.value = r.timeOut || "";
  el.mBreak.value = r.breakMinutes ?? DEFAULT_BREAK;
  el.manualTitle.textContent = `Editing ${r.date}`;
  el.cancelEdit.hidden = false;
  el.manualForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

el.cancelEdit.addEventListener("click", () => {
  resetForm();
  el.manualMessage.textContent = "";
});

el.manualForm.addEventListener("submit", async event => {
  event.preventDefault();

  const entry = {
    date: el.mDate.value, timeIn: el.mIn.value, timeOut: el.mOut.value,
    breakMinutes: Number(el.mBreak.value) || 0
  };

  if (!workedMinutes(entry.timeIn, entry.timeOut, entry.breakMinutes)) {
    el.manualMessage.textContent =
      "Time Out must be later than Time In (after subtracting break).";
    return;
  }

  el.manualSave.disabled = true;
  el.manualMessage.textContent = "Saving...";
  try {
    await saveRecord(entry);
    el.manualMessage.textContent = "Record saved.";
    resetForm();
    await loadRecords();
  } catch (err) {
    console.error(err);
    el.manualMessage.textContent = `Unable to save: ${err.code || err.message}`;
  } finally {
    el.manualSave.disabled = false;
  }
});

async function removeRecord(r) {
  if (!confirm(`Delete the DTR record for ${r.date}?`)) return;
  try {
    await deleteDoc(docRef(r.date));
    await loadRecords();
  } catch (err) {
    console.error(err);
    alert(`Unable to delete: ${err.code || err.message}`);
  }
}

// =====================================
// MISC UI
// =====================================

el.monthFilter.addEventListener("change", () => { renderStats(); renderTable(); });
el.printBtn.addEventListener("click", () => window.print());

el.requiredHours.addEventListener("input", () => {
  try { localStorage.setItem(requiredKey(), el.requiredHours.value); } catch {}
  renderStats();
});

// =====================================
// INIT
// =====================================

requireAuth(async user => {
  currentUser = user;
  el.monthFilter.value = localDateString().slice(0, 7);
  resetForm();

  try { el.requiredHours.value = localStorage.getItem(requiredKey()) || ""; } catch {}

  try {
    await loadRecords();
  } catch (err) {
    console.error(err);
    el.dtrBody.replaceChildren();
    const tr = document.createElement("tr");
    tr.append(cell(`Unable to load records: ${err.code || err.message}`, "muted"));
    tr.firstChild.colSpan = 7;
    el.dtrBody.append(tr);
  }
});
