
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

// =====================================
// ELEMENTS
// =====================================

const tableBody = document.getElementById("historyTableBody");
const search = document.getElementById("search");
const historyCount = document.getElementById("historyCount");

if (!tableBody || !search || !historyCount) {
  throw new Error("Task History HTML elements are missing.");
}

let logs = [];

// =====================================
// HELPERS
// =====================================

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value || "-";

  if (className) {
    cell.className = className;
  }

  return cell;
}

function renderHistory() {
  tableBody.replaceChildren();

  const term = search.value.toLowerCase().trim();

  const rows = [];

  logs.forEach(log => {
    (log.activities || []).forEach((activity, index) => {
      const searchable = [
        log.date,
        activity.title,
        activity.description,
        activity.category
      ].join(" ").toLowerCase();

      if (searchable.includes(term)) {
        rows.push({ log, activity, index });
      }
    });
  });

  rows.sort((a, b) =>
    (b.log.date || "").localeCompare(a.log.date || "")
  );

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.className = "empty-state";
    cell.textContent = logs.length
      ? "No matching activities found."
      : "No activities recorded yet.";

    row.appendChild(cell);
    tableBody.appendChild(row);

    historyCount.textContent = "0 activities found";
    return;
  }

  rows.forEach(({ log, activity, index }) => {
    const row = document.createElement("tr");

    // Date
    row.appendChild(createCell(log.date));

    // Activity title
    row.appendChild(
      createCell(activity.title || "Untitled activity", "activity-title")
    );

    // Description
    row.appendChild(
      createCell(activity.description, "description-cell")
    );

    // Category
    const categoryCell = document.createElement("td");

    const badge = document.createElement("span");
    badge.className = "category-badge";
    badge.textContent = activity.category || "No category";

    categoryCell.appendChild(badge);
    row.appendChild(categoryCell);

    // Actions
    const actionsCell = document.createElement("td");
    actionsCell.className = "table-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "small-btn";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", async () => {
      const newTitle = prompt("Activity title:", activity.title || "");

      if (newTitle === null) return;

      const newDescription = prompt(
        "Description:",
        activity.description || ""
      );

      if (newDescription === null) return;

      const newCategory = prompt(
        "Category:",
        activity.category || ""
      );

      if (newCategory === null) return;

      if (!newTitle.trim() || !newDescription.trim()) {
        alert("Title and description are required.");
        return;
      }

      const updatedActivities = [...log.activities];

      updatedActivities[index] = {
        ...activity,
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory.trim()
      };

      try {
        editButton.disabled = true;

        await updateDoc(doc(db, "dailyLogs", log.id), {
          activities: updatedActivities,
          updatedAt: serverTimestamp()
        });

        log.activities = updatedActivities;
        renderHistory();

      } catch (error) {
        console.error("Edit error:", error);
        alert("Unable to update activity: " + error.message);
        editButton.disabled = false;
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-btn delete-btn";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {
      if (!confirm(
        `Delete "${activity.title || "this activity"}"?`
      )) return;

      const updatedActivities = log.activities.filter(
        (_, i) => i !== index
      );

      try {
        deleteButton.disabled = true;

        if (updatedActivities.length === 0) {
          await deleteDoc(doc(db, "dailyLogs", log.id));

          logs = logs.filter(item => item.id !== log.id);

        } else {
          await updateDoc(doc(db, "dailyLogs", log.id), {
            activities: updatedActivities,
            updatedAt: serverTimestamp()
          });

          log.activities = updatedActivities;
        }

        renderHistory();

      } catch (error) {
        console.error("Delete error:", error);
        alert("Unable to delete activity: " + error.message);
        deleteButton.disabled = false;
      }
    });

    actionsCell.append(editButton, deleteButton);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });

  historyCount.textContent =
    `${rows.length} ${rows.length === 1 ? "activity" : "activities"} found`;
}

// =====================================
// SEARCH
// =====================================

search.addEventListener("input", renderHistory);

// =====================================
// LOAD FIRESTORE
// =====================================

requireAuth(async user => {
  tableBody.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state">
        Loading task history...
      </td>
    </tr>
  `;

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

    renderHistory();

  } catch (error) {
    console.error("History loading error:", error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          Unable to load task history:
          ${error.code || error.message}
        </td>
      </tr>
    `;
  }
});
