import { requireAuth, setupLogout } from "./auth.js";
import { loadProfile } from "./profile.js";
import {
  DEFAULT_BREAK, localDateString, parseDate, addDays, daysBetween, formatShortDate,
  format12h, toHours, isNextDay, workedMinutes, timeOutLabel, timeOutDateOf,
  fetchRecords, saveRecord, deleteRecord
} from "./dtr-core.js";

setupLogout();

const $ = id => document.getElementById(id);
const el = {
  addBtn: $("addBtn"),
  modal: $("recordModal"), modalTitle: $("recordModalTitle"),
  form: $("recordForm"), close: $("recordClose"), cancel: $("recordCancel"),
  rDate: $("rDate"), rIn: $("rIn"), rOutDate: $("rOutDate"), rOut: $("rOut"),
  rBreak: $("rBreak"), rPreview: $("rPreview"), rMessage: $("rMessage"),
  save: $("recordSave"),
  search: $("search"), monthFilter: $("monthFilter"),
  dtrBody: $("dtrBody"), recordCount: $("recordCount"),
  prevPage: $("prevPage"), nextPage: $("nextPage"), pageInfo: $("pageInfo"),
  printBtn: $("printBtn"), printName: $("printName"), printCompany: $("printCompany"),
  printDepartment: $("printDepartment"), printPeriod: $("printPeriod")
};

const missing = Object.entries(el).filter(([, node]) => !node).map(([id]) => id);
if (missing.length) {
  console.error("Missing DTR Records HTML elements:", missing);
  throw new Error("DTR Records HTML elements are missing.");
}

// =====================================
// STATE
// =====================================

const PAGE_SIZE = 10;                 // same as Task History

let currentUser = null;
let records = [];                     // newest first
let currentPage = 1;
let printAll = false;                 // true while printing: show every row, no paging

let editingDate = null;               // date of the record being edited (null = adding)
let outDateTouched = false;           // true once Time Out Date is changed by hand

// =====================================
// HELPERS
// =====================================

const weekday = (date, style = "short") =>
  parseDate(date).toLocaleDateString("en-US", { weekday: style });

const hoursText = r => (r.totalMinutes ? toHours(r.totalMinutes).toFixed(2) : "In progress");
const timeOutText = timeOutLabel;

function getFilteredRecords() {
  const month = el.monthFilter.value;               // "" = all months
  const term = el.search.value.trim().toLowerCase();

  return records
    .filter(r => !month || r.date.startsWith(month))
    .filter(r => {
      if (!term) return true;
      return [
        r.date, weekday(r.date, "long"), format12h(r.timeIn),
        timeOutText(r), hoursText(r)
      ].join(" ").toLowerCase().includes(term);
    });
}

// =====================================
// PRINT HEADER
// =====================================

function setPrintProfile({ name, company, department }) {
  el.printName.textContent = name || "-";
  el.printCompany.textContent = company || "-";
  el.printDepartment.textContent = department || "-";
}

function setPrintPeriod() {
  const value = el.monthFilter.value;
  el.printPeriod.textContent = value
    ? parseDate(`${value}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "All records";
}

window.addEventListener("profile:updated", event => setPrintProfile(event.detail));

// Print every matching row, not just the current page.
window.addEventListener("beforeprint", () => { printAll = true; renderTable(); });
window.addEventListener("afterprint", () => { printAll = false; renderTable(); });

// =====================================
// TABLE + PAGINATION (same pattern as Task History)
// =====================================

function createCell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderTable() {
  el.dtrBody.replaceChildren();

  const rows = getFilteredRecords();
  const totalPages = printAll ? 1 : Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = printAll ? rows : rows.slice(start, start + PAGE_SIZE);

  if (!pageRows.length) {
    const tr = document.createElement("tr");
    const td = createCell(
      records.length ? "No matching DTR records found." : "No DTR records yet.",
      "empty-state"
    );
    td.colSpan = 7;
    tr.append(td);
    el.dtrBody.append(tr);
  }

  pageRows.forEach(record => {
    const tr = document.createElement("tr");

    tr.append(
      createCell(record.date),
      createCell(weekday(record.date)),
      createCell(format12h(record.timeIn)),
      createCell(timeOutText(record)),
      createCell(`${record.breakMinutes || 0} min`),
      createCell(hoursText(record), "activity-title")
    );

    const actions = document.createElement("td");
    actions.className = "table-actions no-print";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "small-btn";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openModal(record));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "small-btn delete-btn";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeRecord(record, del));

    actions.append(edit, del);
    tr.append(actions);
    el.dtrBody.append(tr);
  });

  el.recordCount.textContent =
    `${rows.length} ${rows.length === 1 ? "record" : "records"} found`;
  el.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  el.prevPage.disabled = currentPage <= 1;
  el.nextPage.disabled = currentPage >= totalPages;
}

function render() {
  setPrintPeriod();
  renderTable();
}

el.prevPage.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

el.nextPage.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(getFilteredRecords().length / PAGE_SIZE));
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
});

el.search.addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});

el.monthFilter.addEventListener("change", () => {
  currentPage = 1;
  render();
});

// =====================================
// DELETE
// =====================================

async function removeRecord(record, button) {
  if (!confirm(`Delete the DTR record for ${record.date}?`)) return;

  button.disabled = true;
  try {
    await deleteRecord(currentUser.uid, record.date);
    records = await fetchRecords(currentUser.uid);
    render();
  } catch (err) {
    console.error(err);
    alert(`Unable to delete: ${err.code || err.message}`);
    button.disabled = false;
  }
}

el.printBtn.addEventListener("click", () => window.print());

// =====================================
// ADD / EDIT MODAL
// =====================================

function defaultOutDate() {
  const date = el.rDate.value;
  if (!date) return "";
  return isNextDay(el.rIn.value, el.rOut.value) ? addDays(date, 1) : date;
}

function syncOutDate() {
  if (!outDateTouched) el.rOutDate.value = defaultOutDate();
}

function updatePreview() {
  const { value: date } = el.rDate;
  const { value: timeIn } = el.rIn;
  const { value: timeOut } = el.rOut;
  const { value: outDate } = el.rOutDate;

  if (!date || !timeIn || !timeOut || !outDate) {
    el.rPreview.textContent = "";
    return;
  }

  const offset = daysBetween(date, outDate);
  if (offset < 0) {
    el.rPreview.textContent = "Time Out Date can't be before the shift start date.";
    return;
  }

  const minutes = workedMinutes(timeIn, timeOut, el.rBreak.value, offset);
  el.rPreview.textContent = minutes
    ? `${toHours(minutes).toFixed(2)} hrs` +
      (offset > 0 ? ` · ends ${formatShortDate(outDate)}` : "")
    : "Hours would be zero or negative.";
}

function openModal(record = null) {
  editingDate = record ? record.date : null;
  el.form.reset();
  el.rMessage.textContent = "";

  if (record) {
    el.modalTitle.textContent = `Edit DTR Record`;
    el.rDate.value = record.date;
    el.rIn.value = record.timeIn || "";
    el.rOut.value = record.timeOut || "";
    el.rBreak.value = record.breakMinutes ?? DEFAULT_BREAK;
    el.rOutDate.value = record.timeOut ? timeOutDateOf(record) : record.date;
    outDateTouched = el.rOutDate.value !== defaultOutDate();   // keep unusual dates
  } else {
    el.modalTitle.textContent = "Add DTR Record";
    outDateTouched = false;
    el.rDate.value = localDateString();
    el.rOutDate.value = el.rDate.value;
    el.rBreak.value = DEFAULT_BREAK;
  }

  updatePreview();
  el.modal.hidden = false;
  document.body.classList.add("modal-open");
  (record ? el.rIn : el.rDate).focus();
}

function closeModal() {
  el.modal.hidden = true;
  document.body.classList.remove("modal-open");
  editingDate = null;
}

[el.rDate, el.rIn, el.rOut].forEach(input =>
  input.addEventListener("input", () => { syncOutDate(); updatePreview(); }));

el.rOutDate.addEventListener("input", () => {
  outDateTouched = true;
  updatePreview();
});
el.rBreak.addEventListener("input", updatePreview);

el.addBtn.addEventListener("click", () => openModal());
el.close.addEventListener("click", closeModal);
el.cancel.addEventListener("click", closeModal);
el.modal.addEventListener("click", event => {
  if (event.target === el.modal) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !el.modal.hidden) closeModal();
});

el.form.addEventListener("submit", async event => {
  event.preventDefault();

  const entry = {
    date: el.rDate.value,
    timeIn: el.rIn.value,
    timeOut: el.rOut.value,
    timeOutDate: el.rOutDate.value,
    breakMinutes: Number(el.rBreak.value) || 0
  };

  const offset = daysBetween(entry.date, entry.timeOutDate);
  if (offset < 0) {
    el.rMessage.textContent = "Time Out Date can't be before the shift start date.";
    return;
  }

  if (!workedMinutes(entry.timeIn, entry.timeOut, entry.breakMinutes, offset)) {
    el.rMessage.textContent =
      "Hours would be zero or negative. Check the dates, times and the break.";
    return;
  }

  const replacing = records.some(r => r.date === entry.date) && entry.date !== editingDate;
  if (replacing && !confirm(`A record for ${entry.date} already exists. Replace it?`)) {
    return;
  }

  el.save.disabled = true;
  el.rMessage.textContent = "Saving...";
  try {
    await saveRecord(currentUser.uid, entry);

    // Date was changed while editing: remove the record under the old date.
    if (editingDate && editingDate !== entry.date) {
      await deleteRecord(currentUser.uid, editingDate);
    }

    records = await fetchRecords(currentUser.uid);
    closeModal();
    render();
  } catch (err) {
    console.error(err);
    el.rMessage.textContent = `Unable to save: ${err.code || err.message}`;
  } finally {
    el.save.disabled = false;
  }
});

// =====================================
// INIT
// =====================================

requireAuth(async user => {
  currentUser = user;
  el.monthFilter.value = localDateString().slice(0, 7);

  const profile = await loadProfile(user.uid);
  setPrintProfile({ name: user.displayName, ...profile });

  try {
    records = await fetchRecords(user.uid);
    render();
  } catch (err) {
    console.error(err);
    el.dtrBody.replaceChildren();
    const tr = document.createElement("tr");
    const td = createCell(
      `Unable to load DTR records: ${err.code || err.message}`, "empty-state"
    );
    td.colSpan = 7;
    tr.append(td);
    el.dtrBody.append(tr);
  }
});
