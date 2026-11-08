import { requireAuth, setupLogout } from "./auth.js";
import { loadProfile, saveRequiredHours } from "./profile.js";
import {
  DEFAULT_BREAK, localDateString, localTimeString, addDays, daysBetween,
  formatLongDate, formatShortDate, format12h, toHours, isNextDay, workedMinutes,
  timeOutLabel, timeOutDateOf, fetchRecords, saveRecord, deleteRecord
} from "./dtr-core.js";

setupLogout();

const $ = id => document.getElementById(id);
const el = {
  todayLabel: $("todayLabel"), todayNote: $("todayNote"),
  todayIn: $("todayIn"), todayOut: $("todayOut"), todayHours: $("todayHours"),
  timeInBtn: $("timeInBtn"), timeOutBtn: $("timeOutBtn"), todayMessage: $("todayMessage"),
  manualForm: $("manualForm"), mDate: $("mDate"), mIn: $("mIn"),
  mOutDate: $("mOutDate"), mOut: $("mOut"), mBreak: $("mBreak"),
  mPreview: $("mPreview"), manualSave: $("manualSave"),
  manualMessage: $("manualMessage"), manualTitle: $("manualTitle"),
  cancelEdit: $("cancelEdit")
};

let currentUser = null;
let records = [];                 // newest first
let editingDate = null;           // date of the record being edited, if any
let outDateTouched = false;       // true once the user changes Time Out Date by hand

const openShift = () => records.find(r => !r.timeOut);   // latest unclosed record

// =====================================
// TODAY / OPEN SHIFT
// =====================================

function renderToday() {
  const today = localDateString();
  const open = openShift();
  const rec = open ?? records.find(r => r.date === today);

  el.todayLabel.textContent = formatLongDate(today);
  el.todayNote.textContent = open && open.date !== today
    ? `Open shift started ${formatLongDate(open.date)}. Time Out will close it.`
    : "";

  el.todayIn.textContent = format12h(rec?.timeIn);
  el.todayOut.textContent = rec ? timeOutLabel(rec) : "--:--";
  el.todayHours.textContent = rec?.totalMinutes
    ? toHours(rec.totalMinutes).toFixed(2) : "--";

  // One record per start date; can't clock in again while a shift is open.
  el.timeInBtn.disabled = Boolean(open) || records.some(r => r.date === today);
  el.timeOutBtn.disabled = !open;
}

async function refresh() {
  records = await fetchRecords(currentUser.uid);
  renderToday();
}

el.timeInBtn.addEventListener("click", async () => {
  el.timeInBtn.disabled = true;
  el.todayMessage.textContent = "Saving...";
  try {
    await saveRecord(currentUser.uid, {
      date: localDateString(), timeIn: localTimeString(),
      timeOut: null, timeOutDate: null, breakMinutes: DEFAULT_BREAK
    });
    el.todayMessage.textContent = "Timed in.";
    await refresh();
  } catch (err) {
    console.error(err);
    el.todayMessage.textContent = `Unable to save: ${err.code || err.message}`;
    renderToday();
  }
});

el.timeOutBtn.addEventListener("click", async () => {
  const open = openShift();
  if (!open) return;

  const today = localDateString();
  const timeOut = localTimeString();
  const offset = daysBetween(open.date, today);

  if (offset < 0 || offset > 1) {
    el.todayMessage.textContent =
      `The shift from ${open.date} was never closed. Enter its Time Out in the form below.`;
    startEdit(open);
    return;
  }

  const minutes = workedMinutes(open.timeIn, timeOut, open.breakMinutes, offset);
  if (!minutes) {
    el.todayMessage.textContent =
      "Net hours would be zero or negative. Adjust the break or use the form below.";
    return;
  }

  el.timeOutBtn.disabled = true;
  el.todayMessage.textContent = "Saving...";
  try {
    await saveRecord(currentUser.uid, {
      date: open.date, timeIn: open.timeIn, timeOut,
      timeOutDate: today, breakMinutes: open.breakMinutes
    });
    el.todayMessage.textContent = toHours(minutes) > 16
      ? "Timed out. Over 16 hours recorded; edit the record if that's wrong."
      : "Timed out.";
    await refresh();
  } catch (err) {
    console.error(err);
    el.todayMessage.textContent = `Unable to save: ${err.code || err.message}`;
    renderToday();
  }
});

// =====================================
// MANUAL ADD / EDIT
// =====================================

// Default Time Out Date: same day, or the next day when Time Out < Time In.
function defaultOutDate() {
  const date = el.mDate.value;
  if (!date) return "";
  return isNextDay(el.mIn.value, el.mOut.value) ? addDays(date, 1) : date;
}

function syncOutDate() {
  if (!outDateTouched) el.mOutDate.value = defaultOutDate();
}

function updatePreview() {
  const { value: date } = el.mDate;
  const { value: timeIn } = el.mIn;
  const { value: timeOut } = el.mOut;
  const { value: outDate } = el.mOutDate;

  if (!date || !timeIn || !timeOut || !outDate) {
    el.mPreview.textContent = "";
    return;
  }

  const offset = daysBetween(date, outDate);
  if (offset < 0) {
    el.mPreview.textContent = "Time Out Date can't be before the shift start date.";
    return;
  }

  const minutes = workedMinutes(timeIn, timeOut, el.mBreak.value, offset);
  el.mPreview.textContent = minutes
    ? `${toHours(minutes).toFixed(2)} hrs` +
      (offset > 0 ? ` · ends ${formatShortDate(outDate)}` : "")
    : "Hours would be zero or negative.";
}

function resetForm() {
  editingDate = null;
  outDateTouched = false;
  el.manualForm.reset();
  el.mDate.value = localDateString();
  el.mOutDate.value = el.mDate.value;
  el.mBreak.value = DEFAULT_BREAK;
  el.manualTitle.textContent = "Add / Edit a Record";
  el.cancelEdit.hidden = true;
  el.mPreview.textContent = "";
}

function startEdit(record) {
  editingDate = record.date;
  el.mDate.value = record.date;
  el.mIn.value = record.timeIn || "";
  el.mOut.value = record.timeOut || "";
  el.mBreak.value = record.breakMinutes ?? DEFAULT_BREAK;

  el.mOutDate.value = record.timeOut ? timeOutDateOf(record) : record.date;
  outDateTouched = el.mOutDate.value !== defaultOutDate();   // keep unusual dates

  el.manualTitle.textContent = `Editing ${record.date}`;
  el.cancelEdit.hidden = false;
  updatePreview();
  el.manualForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

[el.mDate, el.mIn, el.mOut].forEach(input =>
  input.addEventListener("input", () => { syncOutDate(); updatePreview(); }));

el.mOutDate.addEventListener("input", () => {
  outDateTouched = true;
  updatePreview();
});

el.mBreak.addEventListener("input", updatePreview);

el.cancelEdit.addEventListener("click", () => {
  resetForm();
  el.manualMessage.textContent = "";
});

el.manualForm.addEventListener("submit", async event => {
  event.preventDefault();

  const entry = {
    date: el.mDate.value,
    timeIn: el.mIn.value,
    timeOut: el.mOut.value,
    timeOutDate: el.mOutDate.value,
    breakMinutes: Number(el.mBreak.value) || 0
  };

  const offset = daysBetween(entry.date, entry.timeOutDate);
  if (offset < 0) {
    el.manualMessage.textContent =
      "Time Out Date can't be before the shift start date.";
    return;
  }

  if (!workedMinutes(entry.timeIn, entry.timeOut, entry.breakMinutes, offset)) {
    el.manualMessage.textContent =
      "Hours would be zero or negative. Check the dates, times and the break.";
    return;
  }

  const replacing = records.some(r => r.date === entry.date) && entry.date !== editingDate;
  if (replacing && !confirm(`A record for ${entry.date} already exists. Replace it?`)) {
    return;
  }

  el.manualSave.disabled = true;
  el.manualMessage.textContent = "Saving...";
  try {
    await saveRecord(currentUser.uid, entry);

    // Date was changed while editing: remove the record under the old date.
    if (editingDate && editingDate !== entry.date) {
      await deleteRecord(currentUser.uid, editingDate);
    }

    el.manualMessage.textContent = "Record saved.";
    resetForm();
    await refresh();
  } catch (err) {
    console.error(err);
    el.manualMessage.textContent = `Unable to save: ${err.code || err.message}`;
  } finally {
    el.manualSave.disabled = false;
  }
});

// =====================================
// OJT SETTINGS (required hours, saved in Firestore /profiles)
// =====================================

const settingsForm = $("settingsForm");
const requiredInput = $("requiredHours");
const settingsSave = $("settingsSave");
const settingsMessage = $("settingsMessage");

async function initSettings() {
  const profile = await loadProfile(currentUser.uid);
  let hours = profile.requiredHours;

  // One-time migration of the value an older version kept in this browser.
  if (hours === null) {
    let legacy = 0;
    const key = `ojt-required-hours-${currentUser.uid}`;
    try { legacy = Number(localStorage.getItem(key)) || 0; } catch {}

    if (legacy > 0) {
      hours = legacy;
      if (profile.loaded) {
        try {
          await saveRequiredHours(currentUser.uid, legacy);
          localStorage.removeItem(key);
        } catch (err) {
          console.warn("Could not migrate required hours:", err.code || err.message);
        }
      }
    }
  }

  requiredInput.value = hours > 0 ? hours : "";
}

settingsForm.addEventListener("submit", async event => {
  event.preventDefault();

  const value = Number(requiredInput.value);
  const hours = value > 0 ? value : null;

  settingsSave.disabled = true;
  settingsMessage.textContent = "Saving...";
  try {
    await saveRequiredHours(currentUser.uid, hours);
    settingsMessage.textContent = hours
      ? `Saved. Required hours: ${hours}.` : "Saved. Required hours cleared.";
  } catch (err) {
    console.error(err);
    settingsMessage.textContent =
      "Couldn't save. Check that the Firestore rules for /profiles are published.";
  } finally {
    settingsSave.disabled = false;
  }
});

// =====================================
// INIT
// =====================================

requireAuth(async user => {
  currentUser = user;
  resetForm();
  initSettings().catch(err => console.warn("Settings load failed:", err));

  try {
    await refresh();
  } catch (err) {
    console.error(err);
    el.todayMessage.textContent = `Unable to load records: ${err.code || err.message}`;
    return;
  }

  // Coming from DTR Records -> Edit (dtr.html?edit=YYYY-MM-DD)
  const wanted = new URLSearchParams(location.search).get("edit");
  if (wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted)) {
    const record = records.find(r => r.date === wanted);
    if (record) startEdit(record);
  }
});
