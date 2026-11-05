
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

// =====================================
// ELEMENTS
// =====================================

const form = document.getElementById("taskForm");
const container = document.getElementById("taskContainer");
const addButton = document.getElementById("addTaskBtn");
const message = document.getElementById("formMessage");
const saveButton = document.getElementById("saveButton");
const dateInput = document.getElementById("date");

if (!form || !container || !addButton ||
    !message || !saveButton || !dateInput) {
  throw new Error("Add Task HTML elements are missing.");
}

// =====================================
// STATE
// =====================================

let currentUser = null;
let authReady = false;

// =====================================
// LOCAL DATE
// =====================================

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

dateInput.value = getLocalDateString(new Date());

// =====================================
// AUTHENTICATION
// =====================================

requireAuth(user => {
  currentUser = user;
  authReady = true;
});

// =====================================
// TASK NUMBERING
// =====================================

function updateTaskNumbers() {
  const entries = container.querySelectorAll(".task-entry");

  entries.forEach((entry, index) => {
    const number = entry.querySelector(".task-number");

    if (number) {
      number.textContent = `Task ${index + 1}`;
    }

    let removeButton = entry.querySelector(".remove-task");

    if (index === 0) {
      if (removeButton) removeButton.remove();
      return;
    }

    if (!removeButton) {
      removeButton = document.createElement("button");

      removeButton.type = "button";
      removeButton.className = "remove-task";
      removeButton.textContent = "Remove";

      removeButton.addEventListener("click", () => {
        entry.remove();
        updateTaskNumbers();
      });

      entry.querySelector(".task-entry-header")
        .appendChild(removeButton);
    }
  });
}

// =====================================
// ADD ANOTHER TASK
// =====================================

addButton.addEventListener("click", () => {
  const firstEntry = container.querySelector(".task-entry");

  if (!firstEntry) return;

  const newEntry = firstEntry.cloneNode(true);

  newEntry.querySelectorAll("input, textarea").forEach(field => {
    field.value = "";
  });

  const select = newEntry.querySelector("select");

  if (select) {
    select.value = "";
  }

  container.appendChild(newEntry);

  updateTaskNumbers();

  newEntry.querySelector('[name="title"]').focus();
});

// =====================================
// SAVE DAILY LOG
// =====================================

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!authReady || !currentUser) {
    message.textContent = "Please wait for authentication.";
    return;
  }

  const date = dateInput.value;

  if (!date) {
    message.textContent = "Please select a duty date.";
    return;
  }

  const entries = container.querySelectorAll(".task-entry");

  const activities = Array.from(entries).map(entry => ({
    title: entry.querySelector('[name="title"]').value.trim(),

    description: entry.querySelector('[name="description"]')
      .value.trim(),

    category: entry.querySelector('[name="category"]').value.trim()
  }));

  if (!activities.length) {
    message.textContent = "Please add at least one activity.";
    return;
  }

  if (activities.some(activity =>
    !activity.title || !activity.description
  )) {
    message.textContent =
      "Please complete all task titles and descriptions.";
    return;
  }

  saveButton.disabled = true;
  addButton.disabled = true;

  message.textContent = "Saving daily log...";

  try {
    await addDoc(collection(db, "dailyLogs"), {
      userId: currentUser.uid,
      date,
      activities,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    message.textContent = "Daily log saved successfully!";

    window.location.href = "dashboard.html";

  } catch (error) {
    console.error("Save error:", error);

    message.textContent =
      `Unable to save daily log: ${error.code || error.message}`;

    saveButton.disabled = false;
    addButton.disabled = false;
  }
});

// =====================================
// INITIALIZE
// =====================================

updateTaskNumbers();
