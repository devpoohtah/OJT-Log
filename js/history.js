
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

const calendarDays = document.getElementById("calendarDays");
const calendarMonth = document.getElementById("calendarMonth");

const selectedDateTitle = document.getElementById("selectedDateTitle");
const selectedDateSubtitle = document.getElementById("selectedDateSubtitle");
const selectedActivities = document.getElementById("selectedActivities");

let logs = [];
let selectedDate = getLocalDateString(new Date());

let displayedYear = new Date().getFullYear();
let displayedMonth = new Date().getMonth();

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric"
    }
  );
}

function getActivitiesForDate(dateString) {
  const log = logs.find(item => item.date === dateString);
  return log ? log.activities || [] : [];
}

// =====================================
// CALENDAR RENDERING
// =====================================

function renderCalendar() {

  calendarDays.replaceChildren();

  const firstDay = new Date(displayedYear, displayedMonth, 1);
  const lastDay = new Date(displayedYear, displayedMonth + 1, 0);

  const startingDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  calendarMonth.textContent = firstDay.toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric"
    }
  );

  const today = getLocalDateString(new Date());

  // Empty cells before the first day
  for (let i = 0; i < startingDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-empty";
    calendarDays.appendChild(empty);
  }

  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {

    const dateString = getLocalDateString(
      new Date(displayedYear, displayedMonth, day)
    );

    const activities = getActivitiesForDate(dateString);
    const hasActivities = activities.length > 0;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "calendar-day";

    if (hasActivities) {
      button.classList.add("has-activities");
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

      count.textContent = `${activities.length} ${
        activities.length === 1 ? "task" : "tasks"
      }`;

      button.appendChild(count);
    }

    button.addEventListener("click", () => {
      selectedDate = dateString;
      renderCalendar();
      renderSelectedActivities();
    });

    calendarDays.appendChild(button);
  }
}

// =====================================
// SELECTED DATE ACTIVITIES
// =====================================

function renderSelectedActivities() {

  selectedActivities.replaceChildren();

  const activities = getActivitiesForDate(selectedDate);

  selectedDateTitle.textContent = formatDate(selectedDate);

  if (!activities.length) {

    selectedDateSubtitle.textContent =
      "No activities recorded for this date.";

    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent =
      "No internship activities found. You can add a daily log for this date.";

    const addLink = document.createElement("a");
    addLink.href = "add-task.html";
    addLink.className = "btn primary";
    addLink.textContent = "+ Add Daily Log";

    selectedActivities.append(empty, addLink);

    return;
  }

  selectedDateSubtitle.textContent =
    `${activities.length} ${
      activities.length === 1 ? "activity" : "activities"
    } recorded`;

  activities.forEach(activity => {

    const card = document.createElement("div");
    card.className = "calendar-activity";

    const title = document.createElement("strong");
    title.textContent = activity.title || "Untitled activity";

    const description = document.createElement("p");
    description.textContent = activity.description || "";

    const category = document.createElement("span");
    category.className = "category-badge";
    category.textContent =
      activity.category || "No category";

    card.append(title, description, category);

    selectedActivities.appendChild(card);
  });
}

// =====================================
// CATEGORY BREAKDOWN
// =====================================

function renderCategoryBreakdown() {

  const container = document.getElementById("categoryBreakdown");
  container.replaceChildren();

  const categories = {};

  logs.forEach(log => {
    (log.activities || []).forEach(activity => {

      const category =
        activity.category?.trim() || "No category";

      categories[category] = (categories[category] || 0) + 1;
    });
  });

  const entries = Object.entries(categories)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No activities recorded yet.";
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
      `${count} ${count === 1 ? "activity" : "activities"}`;

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

document.getElementById("prevMonth").addEventListener("click", () => {

  displayedMonth--;

  if (displayedMonth < 0) {
    displayedMonth = 11;
    displayedYear--;
  }

  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {

  displayedMonth++;

  if (displayedMonth > 11) {
    displayedMonth = 0;
    displayedYear++;
  }

  renderCalendar();
});

// =====================================
// LOAD FIRESTORE DATA
// =====================================

requireAuth(async user => {

  calendarDays.textContent = "Loading calendar...";

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

    logs.sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    );

    const totalActivities = logs.reduce(
      (sum, log) =>
        sum + (Array.isArray(log.activities)
          ? log.activities.length
          : 0),
      0
    );

    document.getElementById("totalLogs").textContent = logs.length;

    document.getElementById("totalActivities").textContent =
      totalActivities;

    // If there are no logs today, select the latest logged date.
    if (!logs.some(log => log.date === selectedDate) && logs.length) {
      selectedDate = logs[0].date;
      const [year, month] = selectedDate.split("-").map(Number);
      displayedYear = year;
      displayedMonth = month - 1;
    }

    renderCalendar();
    renderSelectedActivities();
    renderCategoryBreakdown();

  } catch (error) {

    console.error("Dashboard loading error:", error);

    calendarDays.textContent =
      `Unable to load calendar: ${error.code || error.message}`;

    selectedActivities.textContent =
      "Unable to load activities.";

    document.getElementById("categoryBreakdown").textContent =
      "Unable to load categories.";
  }
});
