import { requireAuth, setupLogout } from "./auth.js";
import { loadProfile, saveRequiredHours } from "./profile.js";
import {
  localDateString, parseDate, format12h, toHours,
  fetchRecords, deleteRecord
} from "./dtr-core.js";

setupLogout();

const $ = id => document.getElementById(id);
const el = {
  totalHours: $("totalHours"), totalDays: $("totalDays"),
  monthLabel: $("monthLabel"), monthHours: $("monthHours"), monthDays: $("monthDays"),
  remainingHours: $("remainingHours"), requiredHours: $("requiredHours"),
  requiredStatus: $("requiredStatus"),
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

const legacyRequiredKey = () => `ojt-required-hours-${currentUser.uid}`;

// =====================================
// HELPERS
// =====================================

const weekday = (date, style = "short") =>
  parseDate(date).toLocaleDateString("en-US", { weekday: style });

const hoursText = r => (r.totalMinutes ? toHours(r.totalMinutes).toFixed(2) : "In progress");
const timeOutText = r =>
  r.timeOut ? format12h(r.timeOut) + (r.nextDay ? " +1" : "") : "--:--";

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

const sumHours = list => list.reduce((sum, r) => sum + toHours(r.totalMinutes), 0);
const plural = n => `${n} day${n === 1 ? "" : "s"}`;

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
// STATS
// =====================================

function renderStats() {
  const done = records.filter(r => r.totalMinutes);
  const total = sumHours(done);

  el.totalHours.textContent = total.toFixed(2);
  el.totalDays.textContent = plural(done.length);

  const month = el.monthFilter.value;
  const scoped = month ? done.filter(r => r.date.startsWith(month)) : done;

  el.monthLabel.textContent = month ? "Selected Month" : "All Records";
  el.monthHours.textContent = sumHours(scoped).toFixed(2);
  el.monthDays.textContent = plural(scoped.length);

  const required = Number(el.requiredHours.value);
  el.remainingHours.textContent = required > 0
    ? Math.max(required - total, 0).toFixed(2) : "—";
}

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
    edit.addEventListener("click", () => {
      window.location.href = `dtr.html?edit=${encodeURIComponent(record.date)}`;
    });

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
  renderStats();
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

// =====================================
// REQUIRED HOURS (saved in Firestore /profiles)
// =====================================

el.printBtn.addEventListener("click", () => window.print());

el.requiredHours.addEventListener("input", renderStats);

el.requiredHours.addEventListener("change", async () => {
  const value = Number(el.requiredHours.value);
  const hours = value > 0 ? value : null;

  el.requiredStatus.textContent = "Saving...";
  try {
    await saveRequiredHours(currentUser.uid, hours);
    el.requiredStatus.textContent = "Saved";
    setTimeout(() => { el.requiredStatus.textContent = ""; }, 2000);
  } catch (err) {
    console.error(err);
    el.requiredStatus.textContent =
      "Couldn't save. Check the Firestore rules for /profiles.";
  }
});

async function initRequiredHours(profile) {
  let hours = profile.requiredHours;

  // One-time migration of the value the old version kept in this browser.
  if (hours === null) {
    let legacy = 0;
    try { legacy = Number(localStorage.getItem(legacyRequiredKey())) || 0; } catch {}

    if (legacy > 0) {
      hours = legacy;
      if (profile.loaded) {
        try {
          await saveRequiredHours(currentUser.uid, legacy);
          localStorage.removeItem(legacyRequiredKey());
        } catch (err) {
          console.warn("Could not migrate required hours:", err.code || err.message);
        }
      }
    }
  }

  el.requiredHours.value = hours > 0 ? hours : "";
}

// =====================================
// INIT
// =====================================

requireAuth(async user => {
  currentUser = user;
  el.monthFilter.value = localDateString().slice(0, 7);

  const profile = await loadProfile(user.uid);
  setPrintProfile({ name: user.displayName, ...profile });
  await initRequiredHours(profile);

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
