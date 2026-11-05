
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

const form = document.getElementById("taskForm");
const container = document.getElementById("taskContainer");
const addButton = document.getElementById("addTaskBtn");
const message = document.getElementById("formMessage");
const saveButton = document.getElementById("saveButton");

let currentUser = null;

document.getElementById("date").value =
  new Date().toLocaleDateString("en-CA");

requireAuth(user => {
  currentUser = user;
});

function updateTaskNumbers() {
  const entries = container.querySelectorAll(".task-entry");

  entries.forEach((entry, index) => {
    entry.querySelector(".task-number").textContent =
      `Task ${index + 1}`;

    let removeButton = entry.querySelector(".remove-task");

    if (index === 0) {
      if (removeButton) removeButton.remove();
    } else if (!removeButton) {
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

addButton.addEventListener("click", () => {
  const firstEntry = container.querySelector(".task-entry");
  const newEntry = firstEntry.cloneNode(true);

  newEntry.querySelectorAll("input, textarea").forEach(field => {
    field.value = "";
  });

  newEntry.querySelector("select").value = "";

  container.appendChild(newEntry);
  updateTaskNumbers();
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    message.textContent = "Please wait for authentication.";
    return;
  }

  const entries = container.querySelectorAll(".task-entry");

  const activities = Array.from(entries).map(entry => ({
    title: entry.querySelector('[name="title"]').value.trim(),
    description: entry.querySelector('[name="description"]').value.trim(),
    category: entry.querySelector('[name="category"]').value
  }));

  if (activities.some(task => !task.title || !task.description)) {
    message.textContent = "Please complete all task titles and descriptions.";
    return;
  }

  saveButton.disabled = true;
  message.textContent = "Saving daily log...";

  try {
    await addDoc(collection(db, "dailyLogs"), {
      userId: currentUser.uid,
      date: document.getElementById("date").value,
      activities,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    window.location.href = "dashboard.html";

  } catch (error) {
    console.error(error);
    message.textContent = "Unable to save daily log. Please try again.";
    saveButton.disabled = false;
  }
});

updateTaskNumbers();
