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

// Knowledge/skills text per date (stored on the daily log). A day can have several
// logs, so combine the distinct non-empty texts. Returns Map<"YYYY-MM-DD", text>.
export function collectKnowledge(logs, from, to) {
  const byDate = new Map();

  logs
    .filter(log => log.date && log.date >= from && log.date <= to)
    .forEach(log => {
      const text = (log.knowledge || "").trim();
      if (!text) return;
      const list = byDate.get(log.date) || [];
      if (!list.includes(text)) list.push(text);
      byDate.set(log.date, list);
    });

  return new Map([...byDate].map(([date, list]) => [date, list.join("\n")]));
}

// Hours worked in [from, to] from DTR records (net of break). Records are dated by
// the day the shift started. Returns 0 when there is nothing to add up.
export function sumHours(records, from, to) {
  const minutes = (records || [])
    .filter(r => r.date >= from && r.date <= to && Number(r.totalMinutes) > 0)
    .reduce((sum, r) => sum + Number(r.totalMinutes), 0);

  return minutes / 60;
}

// ---------- PDF ----------

// Space the signature block needs under the table (mm).
const SIGNATURE_BLOCK = 30;

// Smaller and smaller layouts to try until the report fits on a single page.
const FIT_SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75];

// data: { from, to, rows, name, company, department, supervisor, knowledge, hours,
//         signature, supervisorSignature }
// A4 landscape, laid out like the school's Weekly Accomplishment Report form.
export function buildReportPdf(JsPDF, data, autoTableFn) {
  const make = () => new JsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  // Try the normal layout first, then shrink step by step until everything
  // (table + signatures) fits on one page. If even the smallest doesn't fit, use it
  // anyway: the table then stops early on every page so the signatures always sit
  // under the last rows instead of alone on their own page.
  let chosen = FIT_SCALES[FIT_SCALES.length - 1];
  for (const scale of FIT_SCALES) {
    const trial = make();
    drawReport(trial, data, scale, autoTableFn);
    if (trial.getNumberOfPages() === 1) { chosen = scale; break; }
  }

  const doc = make();
  drawReport(doc, data, chosen, autoTableFn);
  return doc;
}

function drawReport(doc, data, scale, autoTableFn) {
  const {
    from, to, rows, name, company, department, supervisor, knowledge, hours,
    signature, supervisorSignature
  } = data;
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;
  const table = options => (autoTableFn ? autoTableFn(doc, options) : doc.autoTable(options));

  // The heading shrinks a little less than the table text so it stays readable.
  const hs = Math.max(scale, 0.85);
  const hy = y => 10 + (y - 10) * hs;

  // --- heading ---
  doc.setTextColor(0);
  doc.setFont("times", "normal");
  doc.setFontSize(20 * hs);
  doc.text(REPORT_HEADER.school, centerX, hy(17), { align: "center" });
  doc.setFontSize(12 * hs);
  doc.text(REPORT_HEADER.network, centerX, hy(23), { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(10 * hs);
  doc.text(REPORT_HEADER.college, centerX, hy(29), { align: "center" });
  doc.setFont("times", "normal");
  doc.text(REPORT_HEADER.program, centerX, hy(36), { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(15 * hs);
  doc.text(REPORT_HEADER.title, centerX, hy(43), { align: "center" });

  // --- info box: name / dates / company / accumulated hours ---
  const org = [company, department].map(v => (v || "").trim()).filter(Boolean).join(" / ");
  const leftWidth = Math.round(contentWidth * 0.64);
  const hoursText = hours > 0 ? `${hours.toFixed(2)} hrs` : "";

  const lineStyles = { lineColor: 0, lineWidth: 0.25, font: "times", fontSize: 9.5 * scale,
                       textColor: 0, cellPadding: 1.8 * scale };

  table({
    startY: hy(47),
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: lineStyles,
    columnStyles: { 0: { cellWidth: leftWidth }, 1: { cellWidth: contentWidth - leftWidth } },
    body: [
      [`NAME OF STUDENT-TRAINEE: ${(name || "").trim()}`,
       `INCLUSIVE DATES:  ${formatInclusive(from, to)}`],
      [`COMPANY/DEPARTMENT: ${org}`, `ACCUMULATED HOURS: ${hoursText}`]
    ]
  });

  // --- main table: one row per day ---
  const days = buildDays(from, to, rows);
  const notes = knowledge || new Map();
  const body = days.map(day => [
    `${formatDutyDate(day.date).split(", ").slice(1).join(", ")}\n${LONG_WEEKDAYS[parse(day.date).getDay()]}`,
    day.tasks.map(task => `\u2022 ${task}`).join("\n"),
    notes.get(day.date) || ""
  ]);

  table({
    startY: doc.lastAutoTable.finalY,
    // The bottom margin keeps the signature block's space free on every page.
    margin: { left: margin, right: margin, bottom: SIGNATURE_BLOCK + 8 },
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { ...lineStyles, fontSize: 10 * scale, cellPadding: 2.6 * scale, valign: "top",
              minCellHeight: 16 * scale, overflow: "linebreak" },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: "bold", fontSize: 11 * scale,
                  halign: "center", valign: "middle", minCellHeight: 10 * scale },
    columnStyles: {
      0: { cellWidth: 36, halign: "center" },
      1: { cellWidth: Math.round(contentWidth * 0.46) },
      2: { cellWidth: "auto" }
    },
    head: [["DATE", "TASKS/ACTIVITIES PERFORMED", "KNOWLEDGE/SKILLS ACQUIRED"]],
    body
  });

  // --- signature block (always on the same page as the last table rows) ---
  const y = doc.lastAutoTable.finalY + 8;
  const colRight = margin + contentWidth * 0.62;
  const lineLength = 85;
  const lineY = y + 22;

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("PREPARED BY:", margin + 2, y);
  doc.text("CERTIFIED CORRECT:", colRight, y);

  doc.setLineWidth(0.25);
  doc.setDrawColor(0);
  doc.line(margin + 2, lineY, margin + 2 + lineLength, lineY);
  doc.line(colRight, lineY, colRight + lineLength, lineY);

  // Signature image sits over the printed name; the name is centered on the line and
  // shrinks a little if it is too long to fit.
  const drawSignatory = (x, image, printedName) => {
    if (image) {
      try {
        const props = doc.getImageProperties(image);
        const ratio = Math.min(55 / props.width, 16 / props.height);
        const w = props.width * ratio;
        const h = props.height * ratio;
        doc.addImage(image, "PNG", x + (lineLength - w) / 2, lineY - 4.5 - h, w, h);
      } catch (err) {
        console.warn("Could not place the signature image:", err);
      }
    }

    const text = (printedName || "").trim();
    if (!text) return;

    let size = 10;
    doc.setFont("times", "bold");
    doc.setFontSize(size);
    while (size > 7 && doc.getTextWidth(text) > lineLength) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.text(text, x + lineLength / 2, lineY - 1.5, { align: "center" });
  };

  drawSignatory(margin + 2, signature, name);
  drawSignatory(colRight, supervisorSignature, supervisor);

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

export function setupExport({ getLogs, getProfile, getRecords, saveKnowledge }) {
  const $ = id => document.getElementById(id);
  const el = {
    open: $("exportBtn"), modal: $("exportModal"), form: $("exportForm"),
    close: $("exportClose"), cancel: $("exportCancel"), submit: $("exportSubmit"),
    back: $("exportBack"), skip: $("exportSkip"), subtitle: $("exportSubtitle"),
    last: $("rangeLast"), custom: $("rangeCustom"), lastLabel: $("lastWeekLabel"),
    from: $("exportFrom"), to: $("exportTo"),
    message: $("exportMessage"),
    sigRow: $("signatureRow"), sig: $("includeSignature"),
    supRow: $("supervisorSignatureRow"), supSig: $("includeSupervisorSignature"),
    stepRange: $("exportStepRange"), stepKnowledge: $("exportStepKnowledge"),
    knowledgeSummary: $("knowledgeSummary"), knowledgeList: $("knowledgeList")
  };

  if (Object.values(el).some(node => !node)) {
    console.warn("Export PDF elements are missing.");
    return;
  }

  const SUBTITLES = {
    range: "Download your accomplishments as a PDF.",
    knowledge: "Check what you learned each day before downloading."
  };

  let profilePromise = null;
  const loadProfileOnce = () => (profilePromise ||= Promise.resolve(getProfile()));

  let step = "range";      // "range" -> "knowledge"
  let busy = false;
  let range = null;        // the range chosen in step 1

  // Buttons and texts for the current step.
  const renderStep = () => {
    const onKnowledge = step === "knowledge";
    el.stepRange.hidden = onKnowledge;
    el.stepKnowledge.hidden = !onKnowledge;
    el.back.hidden = !onKnowledge;
    el.skip.hidden = !onKnowledge;
    el.subtitle.textContent = SUBTITLES[step];
    el.submit.textContent = busy ? "Preparing..." : (onKnowledge ? "Download PDF" : "Next");
    [el.submit, el.back, el.skip, el.cancel].forEach(btn => { btn.disabled = busy; });
  };

  const setStep = next => {
    step = next;
    el.message.textContent = "";
    renderStep();
  };

  const setBusy = value => {
    busy = value;
    renderStep();
  };

  const openModal = () => {
    profilePromise = null;
    const week = lastWeekRange();
    el.lastLabel.textContent = formatRange(week.from, week.to);
    el.from.value = week.from;
    el.to.value = week.to;
    el.last.checked = true;
    el.sigRow.hidden = true;
    el.sig.checked = true;
    el.supRow.hidden = true;
    el.supSig.checked = true;
    busy = false;
    range = null;
    setStep("range");
    loadProfileOnce()
      .then(profile => {
        el.sigRow.hidden = !profile.signature;
        el.supRow.hidden = !profile.supervisorSignature;
      })
      .catch(() => {});
    el.modal.hidden = false;
    document.body.classList.add("modal-open");
    el.last.focus();
  };

  const closeModal = () => {
    el.modal.hidden = true;
    document.body.classList.remove("modal-open");
  };

  const guardedClose = () => { if (!busy) closeModal(); };

  el.open.addEventListener("click", openModal);
  el.close.addEventListener("click", guardedClose);
  el.cancel.addEventListener("click", guardedClose);
  el.modal.addEventListener("click", event => { if (event.target === el.modal) guardedClose(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !el.modal.hidden) guardedClose();
  });

  // Touching a date picker selects "Custom range" automatically.
  [el.from, el.to].forEach(input =>
    input.addEventListener("focus", () => { el.custom.checked = true; }));

  // Step 1 -> the chosen range, or null (with a message) when it is not usable.
  const readRange = () => {
    const chosen = el.custom.checked
      ? { from: el.from.value, to: el.to.value }
      : lastWeekRange();

    if (!chosen.from || !chosen.to) {
      el.message.textContent = "Pick both a start and an end date.";
      return null;
    }
    if (chosen.from > chosen.to) {
      el.message.textContent = "The start date must be on or before the end date.";
      return null;
    }
    if (!collectActivities(getLogs(), chosen.from, chosen.to).length) {
      el.message.textContent = `No tasks found for ${formatRange(chosen.from, chosen.to)}.`;
      return null;
    }
    return chosen;
  };

  // Step 2: one box per day that has a daily log in the range, pre-filled with the saved text.
  const buildKnowledgeList = chosen => {
    const logs = getLogs();
    const saved = collectKnowledge(logs, chosen.from, chosen.to);
    const dates = [...new Set(
      logs.filter(log => log.date && log.date >= chosen.from && log.date <= chosen.to)
          .map(log => log.date)
    )].sort();

    el.knowledgeList.replaceChildren();
    let empty = 0;

    dates.forEach(date => {
      const text = saved.get(date) || "";
      if (!text) empty++;

      const wrap = document.createElement("div");
      wrap.className = "knowledge-day";

      const label = document.createElement("label");
      label.htmlFor = `knowledge-${date}`;
      label.textContent = formatDutyDate(date);

      const box = document.createElement("textarea");
      box.id = `knowledge-${date}`;
      box.rows = 3;
      box.value = text;
      box.placeholder = "What did you learn on this day?";
      box.dataset.date = date;
      box.dataset.initial = text;

      wrap.append(label, box);
      el.knowledgeList.append(wrap);
    });

    const days = `${dates.length} day${dates.length === 1 ? "" : "s"}`;
    el.knowledgeSummary.textContent = empty
      ? `${formatRange(chosen.from, chosen.to)} \u00B7 ${days}, ${empty} without Knowledge/Skills yet.`
      : `${formatRange(chosen.from, chosen.to)} \u00B7 ${days}, all filled in.`;

    return el.knowledgeList.querySelector("textarea");
  };

  // Save the boxes that changed, then build and download the PDF.
  // saveEdits = false is the Skip button: use whatever is already saved.
  const finish = async saveEdits => {
    el.message.textContent = "";
    setBusy(true);

    try {
      if (saveEdits) {
        const changed = [...el.knowledgeList.querySelectorAll("textarea")]
          .filter(box => box.value.trim() !== box.dataset.initial.trim());
        try {
          for (const box of changed) {
            await saveKnowledge(box.dataset.date, box.value.trim());
            box.dataset.initial = box.value.trim();     // saved: don't write it twice on retry
          }
        } catch (err) {
          console.error("Saving Knowledge/Skills failed:", err);
          el.message.textContent =
            "Couldn't save the Knowledge/Skills. Check your connection and try again.";
          return;
        }
      }

      const rows = collectActivities(getLogs(), range.from, range.to);

      const [JsPDF, profile, records] = await Promise.all([
        loadPdfLibs(),
        loadProfileOnce(),
        // Accumulated hours are optional: if the DTR can't be read, leave the field blank.
        Promise.resolve(getRecords ? getRecords() : []).catch(() => [])
      ]);

      const doc = buildReportPdf(JsPDF, {
        ...range,
        rows,
        ...profile,
        signature: el.sig.checked ? profile.signature : "",
        supervisorSignature: el.supSig.checked ? profile.supervisorSignature : "",
        knowledge: collectKnowledge(getLogs(), range.from, range.to),
        hours: sumHours(records, range.from, range.to)
      });
      doc.save(reportFileName(range.from, range.to));
      busy = false;
      closeModal();
    } catch (err) {
      console.error("PDF export failed:", err);
      el.message.textContent =
        "Couldn't create the PDF. Check your internet connection and try again.";
    } finally {
      setBusy(false);
    }
  };

  el.form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;

    if (step === "range") {
      const chosen = readRange();
      if (!chosen) return;
      range = chosen;
      const firstBox = buildKnowledgeList(chosen);
      setStep("knowledge");
      firstBox?.focus();
      return;
    }

    await finish(true);
  });

  el.back.addEventListener("click", () => { if (!busy) setStep("range"); });
  el.skip.addEventListener("click", () => { if (!busy) finish(false); });
}
