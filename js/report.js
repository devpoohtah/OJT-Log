// Weekly Accomplishment Report (school template): date helpers, PDF builder and the export modal
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

// ---------- template header (edit these if the school ever changes) ----------

export const REPORT_HEADER = {
  school: "UNIVERSITY OF ILOILO",
  network: "PHINMA EDUCATION NETWORK",
  college: "COLLEGE OF INFORMATION TECHNOLOGY AND EDUCATION",
  program: "ON-THE-JOB-TRAINING PROGRAM",
  title: "WEEKLY ACCOMPLISHMENT REPORT"
};

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                     "August", "September", "October", "November", "December"];
const LONG_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
                       "Friday", "Saturday"];

const longDate = d => `${LONG_MONTHS[d.getMonth()]} ${d.getDate()}`;

// "November 2 \u2013 November 6, 2026" (full range, like the template)
export function formatInclusive(from, to) {
  const a = parse(from);
  const b = parse(to);
  if (from === to) return `${longDate(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) {
    return `${longDate(a)} \u2013 ${longDate(b)}, ${b.getFullYear()}`;
  }
  return `${longDate(a)}, ${a.getFullYear()} \u2013 ${longDate(b)}, ${b.getFullYear()}`;
}

// One entry per day in [from, to]: every Mon-Fri (even with no logs, so the
// sheet has a blank row to write on) plus any weekend day that has tasks.
export function buildDays(from, to, rows) {
  const byDate = new Map();
  rows.forEach(row => {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row.title);
  });

  const days = [];
  const cursor = parse(from);
  const last = parse(to);

  while (cursor <= last) {
    const key = ymd(cursor);
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const tasks = byDate.get(key) || [];
    if (!weekend || tasks.length) days.push({ date: key, tasks });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

// ---------- PDF ----------

// data: { from, to, rows, name, company, department }
// A4 landscape, laid out like the school's Weekly Accomplishment Report form.
export function buildReportPdf(JsPDF, data, autoTableFn) {
  const { from, to, rows, name, company, department } = data;
  const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;
  const table = options => (autoTableFn ? autoTableFn(doc, options) : doc.autoTable(options));

  // --- heading ---
  doc.setTextColor(0);
  doc.setFont("times", "normal");
  doc.setFontSize(20);
  doc.text(REPORT_HEADER.school, centerX, 17, { align: "center" });
  doc.setFontSize(12);
  doc.text(REPORT_HEADER.network, centerX, 23, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text(REPORT_HEADER.college, centerX, 29, { align: "center" });
  doc.setFont("times", "normal");
  doc.text(REPORT_HEADER.program, centerX, 36, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text(REPORT_HEADER.title, centerX, 43, { align: "center" });

  // --- info box: name / dates / company / accumulated hours ---
  const org = [company, department].map(v => (v || "").trim()).filter(Boolean).join(" / ");
  const leftWidth = Math.round(contentWidth * 0.64);

  const lineStyles = { lineColor: 0, lineWidth: 0.25, font: "times", fontSize: 9.5,
                       textColor: 0, cellPadding: 1.8 };

  table({
    startY: 47,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: lineStyles,
    columnStyles: { 0: { cellWidth: leftWidth }, 1: { cellWidth: contentWidth - leftWidth } },
    body: [
      [`NAME OF STUDENT-TRAINEE: ${(name || "").trim()}`,
       `INCLUSIVE DATES:  ${formatInclusive(from, to)}`],
      [`COMPANY/DEPARTMENT: ${org}`, "ACCUMULATED HOURS:"]
    ]
  });

  // --- main table: one row per day ---
  const days = buildDays(from, to, rows);
  const body = days.map(day => [
    `${formatDutyDate(day.date).split(", ").slice(1).join(", ")}\n${LONG_WEEKDAYS[parse(day.date).getDay()]}`,
    day.tasks.map(task => `\u2022 ${task}`).join("\n"),
    ""
  ]);

  table({
    startY: doc.lastAutoTable.finalY,
    margin: { left: margin, right: margin, bottom: 12 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { ...lineStyles, fontSize: 10, cellPadding: 2.6, valign: "top",
              minCellHeight: 16, overflow: "linebreak" },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: "bold", fontSize: 11,
                  halign: "center", valign: "middle", minCellHeight: 10 },
    columnStyles: {
      0: { cellWidth: 36, halign: "center" },
      1: { cellWidth: Math.round(contentWidth * 0.46) },
      2: { cellWidth: "auto" }
    },
    head: [["DATE", "TASKS/ACTIVITIES PERFORMED", "KNOWLEDGE/SKILLS ACQUIRED"]],
    body
  });

  // --- signature block (kept together, moves to a new page if needed) ---
  const blockHeight = 32;
  let y = doc.lastAutoTable.finalY + 12;
  if (y + blockHeight > pageHeight - 10) {
    doc.addPage();
    y = 22;
  }

  const colRight = margin + contentWidth * 0.62;
  const lineLength = 85;

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("PREPARED BY:", margin + 2, y);
  doc.text("CERTIFIED CORRECT:", colRight, y);

  const lineY = y + 17;
  doc.setLineWidth(0.25);
  doc.setDrawColor(0);
  doc.line(margin + 2, lineY, margin + 2 + lineLength, lineY);
  doc.line(colRight, lineY, colRight + lineLength, lineY);

  const printedName = (name || "").trim();
  if (printedName) {
    doc.setFont("times", "bold");
    doc.text(printedName, margin + 2 + lineLength / 2, lineY - 1.5, { align: "center" });
  }

  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.text("Signature Over Printed Name of the Student-Trainee", margin + 2, lineY + 5);
  doc.text("Signature Over Printed Name of the Immediate Supervisor", colRight, lineY + 5);

  // --- page numbers only when the report runs past one page ---
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("times", "normal");
      doc.setFontSize(8);
      doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    }
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
    from: $("exportFrom"), to: $("exportTo"),
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
      const doc = buildReportPdf(JsPDF, { ...range, rows, ...profile });
      doc.save(reportFileName(range.from, range.to));
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
