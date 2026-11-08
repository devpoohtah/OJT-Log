// Weekly Accomplishment Report: date helpers, PDF builder and the export modal
// on Task History. jsPDF is loaded from a CDN only when the user exports.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parse(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---------- date helpers (exported for tests) ----------

// Previous calendar week, Monday to Friday, relative to `today`.
export function lastWeekRange(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const mondayThisWeek = new Date(base);
  mondayThisWeek.setDate(base.getDate() - ((base.getDay() + 6) % 7));

  const from = new Date(mondayThisWeek);
  from.setDate(from.getDate() - 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 4);

  return { from: ymd(from), to: ymd(to) };
}

const shortDate = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

// "Nov 3 – Nov 6, 2026", "Dec 30, 2026 – Jan 2, 2027", or "Nov 3, 2026"
export function formatRange(from, to) {
  const a = parse(from);
  const b = parse(to);

  if (from === to) return `${shortDate(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) {
    return `${shortDate(a)} \u2013 ${shortDate(b)}, ${b.getFullYear()}`;
  }
  return `${shortDate(a)}, ${a.getFullYear()} \u2013 ${shortDate(b)}, ${b.getFullYear()}`;
}

export function formatDutyDate(str) {
  const d = parse(str);
  return `${WEEKDAYS[d.getDay()]}, ${shortDate(d)}, ${d.getFullYear()}`;
}

// ---------- data ----------

// Flat list of activities whose duty date is inside [from, to], oldest first.
export function collectActivities(logs, from, to) {
  const rows = [];

  [...logs]
    .filter(log => log.date && log.date >= from && log.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(log => {
      (log.activities || []).forEach(activity => {
        rows.push({
          date: log.date,
          title: (activity.title || "").trim() || "Untitled activity",
          description: (activity.description || "").trim(),
          category: (activity.category || "").trim() || "-"
        });
      });
    });

  return rows;
}

// ---------- PDF ----------

// data: { rows, name, company, department, includeDescriptions }
// The date line shows the days that actually have logs (first to last row).
export function buildReportPdf(JsPDF, data, autoTableFn) {
  const { rows, name, company, department, includeDescriptions } = data;
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const ink = [23, 35, 56];
  const grey = [100, 110, 128];

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ink);
  doc.text("Weekly Accomplishment Report", margin, 22);

  // Dates covered
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...grey);
  doc.text(formatRange(rows[0].date, rows[rows.length - 1].date), margin, 29);

  // Intern details (blank fields are skipped)
  const details = [["Name", name], ["Company", company], ["Department", department]]
    .filter(([, value]) => value && value.trim());

  let y = 38;
  doc.setFontSize(10);
  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ink);
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value.trim(), margin + 26, y);
    y += 6;
  });

  const startY = details.length ? y + 3 : 36;

  const head = ["Duty Date", "Activities Completed"];
  if (includeDescriptions) head.push("Description");
  head.push("Category");

  const body = rows.map(row => {
    const line = [formatDutyDate(row.date), row.title];
    if (includeDescriptions) line.push(row.description || "-");
    line.push(row.category);
    return line;
  });

  const columnStyles = includeDescriptions
    ? { 0: { cellWidth: 33 }, 1: { cellWidth: 40 }, 3: { cellWidth: 28 } }
    : { 0: { cellWidth: 38 }, 2: { cellWidth: 36 } };

  const options = {
    startY,
    head: [head],
    body,
    margin: { left: margin, right: margin, top: 18, bottom: 18 },
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: "helvetica", fontSize: 9, cellPadding: 2.6, valign: "top",
      lineColor: [214, 220, 230], lineWidth: 0.2, textColor: ink, overflow: "linebreak"
    },
    headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
    columnStyles
  };

  if (autoTableFn) autoTableFn(doc, options);
  else doc.autoTable(options);

  // Footer on every page
  const pages = doc.getNumberOfPages();
  const now = new Date();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...grey);
    doc.text(`Generated ${shortDate(now)}, ${now.getFullYear()}`, margin, pageHeight - 8);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  return doc;
}

export const reportFileName = (from, to) =>
  `Weekly-Accomplishment-Report_${from}_to_${to}.pdf`;

// ---------- loading jsPDF on demand ----------

const LIBS = [
  ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
   "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
   "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"]
];

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = url;
    tag.onload = resolve;
    tag.onerror = () => { tag.remove(); reject(new Error(`Could not load ${url}`)); };
    document.head.append(tag);
  });
}

async function loadFirst(urls) {
  let lastError;
  for (const url of urls) {
    try { return await loadScript(url); } catch (err) { lastError = err; }
  }
  throw lastError;
}

let libsPromise = null;
function loadPdfLibs() {
  if (!libsPromise) {
    libsPromise = (async () => {
      if (!window.jspdf) await loadFirst(LIBS[0]);
      await loadFirst(LIBS[1]);                    // needs jsPDF loaded first
      return window.jspdf.jsPDF;
    })().catch(err => { libsPromise = null; throw err; });
  }
  return libsPromise;
}

// ---------- export modal on Task History ----------

export function setupExport({ getLogs, getProfile }) {
  const $ = id => document.getElementById(id);
  const el = {
    open: $("exportBtn"), modal: $("exportModal"), form: $("exportForm"),
    close: $("exportClose"), cancel: $("exportCancel"), submit: $("exportSubmit"),
    last: $("rangeLast"), custom: $("rangeCustom"), lastLabel: $("lastWeekLabel"),
    from: $("exportFrom"), to: $("exportTo"), desc: $("includeDesc"),
    message: $("exportMessage")
  };

  if (Object.values(el).some(node => !node)) {
    console.warn("Export PDF elements are missing.");
    return;
  }

  const openModal = () => {
    const week = lastWeekRange();
    el.lastLabel.textContent = formatRange(week.from, week.to);
    el.from.value = week.from;
    el.to.value = week.to;
    el.last.checked = true;
    el.desc.checked = false;
    el.message.textContent = "";
    el.modal.hidden = false;
    document.body.classList.add("modal-open");
    el.last.focus();
  };

  const closeModal = () => {
    el.modal.hidden = true;
    document.body.classList.remove("modal-open");
  };

  el.open.addEventListener("click", openModal);
  el.close.addEventListener("click", closeModal);
  el.cancel.addEventListener("click", closeModal);
  el.modal.addEventListener("click", event => { if (event.target === el.modal) closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !el.modal.hidden) closeModal();
  });

  // Touching a date picker selects "Custom range" automatically.
  [el.from, el.to].forEach(input =>
    input.addEventListener("focus", () => { el.custom.checked = true; }));

  el.form.addEventListener("submit", async event => {
    event.preventDefault();
    el.message.textContent = "";

    const range = el.custom.checked
      ? { from: el.from.value, to: el.to.value }
      : lastWeekRange();

    if (!range.from || !range.to) {
      el.message.textContent = "Pick both a start and an end date.";
      return;
    }
    if (range.from > range.to) {
      el.message.textContent = "The start date must be on or before the end date.";
      return;
    }

    const rows = collectActivities(getLogs(), range.from, range.to);
    if (!rows.length) {
      el.message.textContent =
        `No tasks found for ${formatRange(range.from, range.to)}.`;
      return;
    }

    el.submit.disabled = true;
    el.submit.textContent = "Preparing...";

    try {
      const [JsPDF, profile] = await Promise.all([loadPdfLibs(), getProfile()]);
      const doc = buildReportPdf(JsPDF, {
        rows, ...profile, includeDescriptions: el.desc.checked
      });
      doc.save(reportFileName(rows[0].date, rows[rows.length - 1].date));
      closeModal();
    } catch (err) {
      console.error("PDF export failed:", err);
      el.message.textContent =
        "Couldn't create the PDF. Check your internet connection and try again.";
    } finally {
      el.submit.disabled = false;
      el.submit.textContent = "Download PDF";
    }
  });
}
