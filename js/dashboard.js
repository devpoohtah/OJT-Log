
import { db } from "./firebase-config.js";
import { friendlyError } from "./ui.js";
import { requireAuth, setupLogout } from "./auth.js";
import { formatDate, formatMonthYear } from "./format.js";
import { fetchRecords, toHours, format12h, timeOutLabel } from "./dtr-core.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

// =====================================
// HTML ELEMENTS
// =====================================

const elements = {
  totalLogs: document.getElementById("totalLogs"),
  totalActivities: document.getElementById("totalActivities"),
  calendarDays: document.getElementById("calendarDays"),
  calendarMonth: document.getElementById("calendarMonth"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  selectedDateTitle: document.getElementById("selectedDateTitle"),
  selectedDateSubtitle: document.getElementById("selectedDateSubtitle"),
  selectedActivities: document.getElementById("selectedActivities"),
  selectedDtr: document.getElementById("selectedDtr"),
  categoryBreakdown: document.getElementById("categoryBreakdown")
};

const missing = Object.entries(elements)
  .filter(([, element]) => !element)
  .map(([id]) => id);

if (missing.length) {
  console.error("Missing dashboard HTML elements:", missing);
  throw new Error("Dashboard HTML elements are missing.");
}

// =====================================
// STATE
// =====================================

let logs = [];
let dailyActivities = {};
let dtrByDate = {};          // "YYYY-MM-DD" (shift start date) -> DTR record

let selectedDate = getLocalDateString(new Date());

let displayedYear = new Date().getFullYear();
let displayedMonth = new Date().getMonth();

// =====================================
// DATE HELPERS
// =====================================

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// =====================================
// GROUP LOGS BY DATE
// =====================================

function groupActivities() {
  dailyActivities = {};

  logs.forEach(log => {
    if (!log.date) return;

    if (!dailyActivities[log.date]) {
      dailyActivities[log.date] = [];
    }

    if (Array.isArray(log.activities)) {
      dailyActivities[log.date].push(
        ...log.activities.map(activity => ({
          ...activity,
          logId: log.id
        }))
      );
    }
  });
}

function getActivitiesForDate(date) {
  return dailyActivities[date] || [];
}

// =====================================
// SUMMARY CARDS
// =====================================

function renderStatistics() {
  const dates = Object.keys(dailyActivities);

  const totalActivities = Object.values(dailyActivities)
    .reduce((sum, activities) => sum + activities.length, 0);

  elements.totalLogs.textContent = dates.length;
  elements.totalActivities.textContent = totalActivities;
}

// =====================================
// CALENDAR
// =====================================

// Two spans: the long text normally, a shorter one on narrow phones (CSS swaps them).
function shortLong(long, short) {
  const wrap = document.createDocumentFragment();
  const a = document.createElement("span");
  a.className = "txt-long";
  a.textContent = long;
  const b = document.createElement("span");
  b.className = "txt-short";
  b.textContent = short;
  wrap.append(a, b);
  return wrap;
}

function renderCalendar() {
  elements.calendarDays.replaceChildren();

  const firstDay = new Date(displayedYear, displayedMonth, 1);
  const lastDay = new Date(displayedYear, displayedMonth + 1, 0);

  const startingDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  elements.calendarMonth.textContent =
    formatMonthYear(`${displayedYear}-${displayedMonth + 1}`);

  const today = getLocalDateString(new Date());

  // Blank spaces before the first day
  for (let i = 0; i < startingDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-empty";
    elements.calendarDays.appendChild(empty);
  }

  // Calendar dates
  for (let day = 1; day <= daysInMonth; day++) {
    const dateString = getLocalDateString(
      new Date(displayedYear, displayedMonth, day)
    );

    const activities = getActivitiesForDate(dateString);
    const hasActivities = activities.length > 0;
    const dtr = dtrByDate[dateString];

    const button = document.createElement("button");

    button.type = "button";
    button.className = "calendar-day";

    if (hasActivities) {
      button.classList.add("has-activities");
    }

    if (dtr) {
      button.classList.add("has-dtr");
    }

    if (dateString === selectedDate) {
      button.classList.add("selected");
    }

    if (dateString === today) {
      button.classList.add("today");
    }

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = day;

    button.appendChild(number);

    if (hasActivities) {
      const count = document.createElement("span");
      count.className = "calendar-day-count";

      count.append(
        shortLong(`${activities.length} ${activities.length === 1 ? "task" : "tasks"}`,
                  `${activities.length}T`)
      );

      button.appendChild(count);
    }

    if (dtr) {
      const hours = document.createElement("span");
      hours.className = "calendar-day-hours";
      hours.append(
        dtr.totalMinutes
          ? shortLong(`${toHours(dtr.totalMinutes).toFixed(1)}h`, `${toHours(dtr.totalMinutes).toFixed(0)}h`)
          : shortLong("In progress", "In")
      );
      button.appendChild(hours);
    }

    button.addEventListener("click", () => {
      selectedDate = dateString;
      renderCalendar();
      renderSelectedActivities();
    });

    elements.calendarDays.appendChild(button);
  }
}

// =====================================
// SELECTED DATE
// =====================================

function renderSelectedDtr() {
  const box = elements.selectedDtr;
  box.replaceChildren();

  const heading = document.createElement("h3");
  heading.className = "selected-dtr-title";
  heading.textContent = "Daily Time Record";
  box.append(heading);

  const record = dtrByDate[selectedDate];

  if (!record) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No DTR record for this date.";
    box.append(empty);
    return;
  }

  const rows = [
    ["Time In", format12h(record.timeIn)],
    ["Time Out", timeOutLabel(record)],
    ["Break", `${record.breakMinutes || 0} min`],
    ["Total Hours", record.totalMinutes ? `${toHours(record.totalMinutes).toFixed(2)} hrs` : "In progress"]
  ];

  const grid = document.createElement("div");
  grid.className = "selected-dtr-grid";

  rows.forEach(([label, value]) => {
    const item = document.createElement("div");
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(small, strong);
    grid.append(item);
  });

  box.append(grid);
}

function renderSelectedActivities() {
  elements.selectedActivities.replaceChildren();
  renderSelectedDtr();

  elements.selectedDateTitle.textContent =
    formatDate(selectedDate);

  const activities = getActivitiesForDate(selectedDate);

  if (!activities.length) {
    elements.selectedDateSubtitle.textContent =
      "No tasks recorded for this date.";

    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No tasks found for this date.";

    const link = document.createElement("a");
    link.href = "add-task.html";
    link.className = "btn primary";
    link.textContent = "+ Add Daily Log";

    elements.selectedActivities.append(empty, link);
    return;
  }

  elements.selectedDateSubtitle.textContent =
    `${activities.length} ${activities.length === 1 ? "task" : "tasks"} recorded`;

  activities.forEach(activity => {
    const card = document.createElement("div");
    card.className = "calendar-activity";

    const title = document.createElement("strong");
    title.textContent = activity.title || "Untitled activity";

    const description = document.createElement("p");
    description.textContent = activity.description || "";

    const category = document.createElement("span");
    category.className = "category-badge";
    category.textContent = activity.category || "No category";

    card.append(title, description, category);
    elements.selectedActivities.appendChild(card);
  });
}

// =====================================
// CATEGORY BREAKDOWN
// =====================================

function renderCategoryBreakdown() {
  const container = elements.categoryBreakdown;
  container.replaceChildren();

  const categories = {};

  Object.values(dailyActivities).forEach(activities => {
    activities.forEach(activity => {
      const category = activity.category?.trim() || "No category";

      categories[category] = (categories[category] || 0) + 1;
    });
  });

  const entries = Object.entries(categories)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No tasks recorded yet.";
    container.appendChild(empty);
    return;
  }

  const total = entries.reduce((sum, entry) => sum + entry[1], 0);

  entries.forEach(([category, count]) => {
    const item = document.createElement("div");
    item.className = "category-item";

    const info = document.createElement("div");
    info.className = "category-info";

    const name = document.createElement("strong");
    name.textContent = category;

    const amount = document.createElement("span");
    amount.textContent =
      `${count} ${count === 1 ? "task" : "tasks"}`;

    info.append(name, amount);

    const track = document.createElement("div");
    track.className = "category-track";

    const fill = document.createElement("div");
    fill.className = "category-fill";

    fill.style.width = `${(count / total) * 100}%`;

    track.appendChild(fill);
    item.append(info, track);

    container.appendChild(item);
  });
}

// =====================================
// MONTH NAVIGATION
// =====================================

elements.prevMonth.addEventListener("click", () => {
  displayedMonth--;

  if (displayedMonth < 0) {
    displayedMonth = 11;
    displayedYear--;
  }

  renderCalendar();
});

elements.nextMonth.addEventListener("click", () => {
  displayedMonth++;

  if (displayedMonth > 11) {
    displayedMonth = 0;
    displayedYear++;
  }

  renderCalendar();
});

// =====================================
// LOAD FIRESTORE
// =====================================

requireAuth(async user => {
  elements.calendarDays.textContent = "Loading calendar...";

  try {
    const q = query(
      collection(db, "dailyLogs"),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    logs = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    groupActivities();
    renderStatistics();

    // DTR records for the calendar. If this fails the task calendar still works.
    try {
      const records = await fetchRecords(user.uid);
      dtrByDate = Object.fromEntries(records.map(r => [r.date, r]));
    } catch (dtrError) {
      console.warn("DTR records not loaded for the calendar:", dtrError.code || dtrError.message);
      dtrByDate = {};
    }

    // Select latest recorded date if today has no activities.
    const dates = Object.keys(dailyActivities).sort().reverse();

    if (dates.length && !dailyActivities[selectedDate]?.length) {
      selectedDate = dates[0];

      const [year, month] = selectedDate.split("-").map(Number);

      displayedYear = year;
      displayedMonth = month - 1;
    }

    renderCalendar();
    renderSelectedActivities();
    renderCategoryBreakdown();

  } catch (error) {
    console.error("Dashboard loading error:", error);

    elements.calendarDays.textContent =
      friendlyError(error, "Couldn't load your calendar. Please try again.");

    elements.selectedActivities.textContent =
      "Unable to load tasks.";

    elements.categoryBreakdown.textContent =
      "Unable to load categories.";
  }
});
