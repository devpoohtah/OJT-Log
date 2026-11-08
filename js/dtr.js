import { requireAuth, setupLogout } from "./auth.js";
import {
  DEFAULT_BREAK, localDateString, localTimeString, addDays, formatLongDate,
  format12h, toHours, isNextDay, workedMinutes,
  fetchRecords, saveRecord, deleteRecord
} from "./dtr-core.js";

setupLogout();

const $ = id => document.getElementById(id);
const el = {
  todayLabel: $("todayLabel"), todayNote: $("todayNote"),
  todayIn: $("todayIn"), todayOut: $("todayOut"), todayHours: $("todayHours"),
  timeInBtn: $("timeInBtn"), timeOutBtn: $("timeOutBtn"), todayMessage: $("todayMessage"),
  manualForm: $("manualForm"), mDate: $("mDate"), mIn: $("mIn"), mOut: $("mOut"),
  mBreak: $("mBreak"), mPreview: $("mPreview"), manualSave: $("manualSave"),
  manualMessage: $("manualMessage"), manualTitle: $("manualTitle"),
  cancelEdit: $("cancelEdit")
};

let currentUser = null;
let records = [];                 // newest first
let editingDate = null;           // date of the record being edited, if any

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
  el.todayOut.textContent = rec?.timeOut
    ? format12h(rec.timeOut) + (rec.nextDay ? " +1" : "")
    : "--:--";
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
      timeOut: null, breakMinutes: DEFAULT_BREAK, nextDay: false
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

  let nextDay;
  if (open.date === today) {
    nextDay = false;
  } else if (open.date === addDays(today, -1)) {
    nextDay = true;                          // night shift ending this morning
  } else {
    el.todayMessage.textContent =
      `The shift from ${open.date} was never closed. Enter its Time Out in the form below.`;
    startEdit(open);
    return;
  }

  const minutes = workedMinutes(open.timeIn, timeOut, open.breakMinutes, nextDay);
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
      breakMinutes: open.breakMinutes, nextDay
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

function updatePreview() {
  const timeIn = el.mIn.value;
  const timeOut = el.mOut.value;

  if (!timeIn || !timeOut) {
    el.mPreview.textContent = "";
    return;
  }

  const next = isNextDay(timeIn, timeOut);
  const minutes = workedMinutes(timeIn, timeOut, el.mBreak.value, next);

  el.mPreview.textContent =
    (next ? "Time Out is the next day (+1). " : "") +
    (minutes ? `${toHours(minutes).toFixed(2)} hrs` : "Hours would be zero or negative.");
}

function resetForm() {
  editingDate = null;
  el.manualForm.reset();
  el.mDate.value = localDateString();
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
  el.manualTitle.textContent = `Editing ${record.date}`;
  el.cancelEdit.hidden = false;
  updatePreview();
  el.manualForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

[el.mIn, el.mOut, el.mBreak].forEach(input =>
  input.addEventListener("input", updatePreview));

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
    breakMinutes: Number(el.mBreak.value) || 0
  };
  entry.nextDay = isNextDay(entry.timeIn, entry.timeOut);

  if (!workedMinutes(entry.timeIn, entry.timeOut, entry.breakMinutes, entry.nextDay)) {
    el.manualMessage.textContent =
      "Hours would be zero or negative. Check the times and the break.";
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
// INIT
// =====================================

requireAuth(async user => {
  currentUser = user;
  resetForm();

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
