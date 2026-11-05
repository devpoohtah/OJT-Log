
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

const tableBody = document.getElementById("historyTableBody");
const search = document.getElementById("search");
const historyCount = document.getElementById("historyCount");

let logs = [];

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
        activity.category || ""
      ].join(" ").toLowerCase();

      if (!searchable.includes(term)) return;

      rows.push({
        log,
        activity,
        index
      });
    });
  });

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 5;
    td.className = "empty-state";
    td.textContent = "No matching activities found.";

    tr.appendChild(td);
    tableBody.appendChild(tr);

    historyCount.textContent = "0 activities found";
    return;
  }

  rows.forEach(({ log, activity, index }) => {

    const tr = document.createElement("tr");

    // Duty Date
    const dateCell = document.createElement("td");
    dateCell.textContent = log.date || "-";

    // Activity Title
    const titleCell = document.createElement("td");
    titleCell.className = "activity-title";
    titleCell.textContent = activity.title || "Untitled";

    // Description
    const descriptionCell = document.createElement("td");
    descriptionCell.className = "description-cell";
    descriptionCell.textContent =
      activity.description || "-";

    // Category
    const categoryCell = document.createElement("td");

    const category = document.createElement("span");
    category.className = "category-badge";
    category.textContent =
      activity.category || "No category";

    categoryCell.appendChild(category);

    // Actions
    const actionsCell = document.createElement("td");
    actionsCell.className = "table-actions";

    const editButton = document.createElement("button");
    editButton.className = "small-btn";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", async () => {

      const newTitle = prompt(
        "Activity title:",
        activity.title
      );

      if (newTitle === null) return;

      const newDescription = prompt(
        "Description:",
        activity.description
      );

      if (newDescription === null) return;

      const newCategory = prompt(
        "Category (leave blank for none):",
        activity.category || ""
      );

      if (newCategory === null) return;

      if (!newTitle.trim() || !newDescription.trim()) {
        alert("Title and description are required.");
        return;
      }

      const updatedActivities = [...log.activities];

      updatedActivities[index] = {
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory.trim()
      };

      try {
        await updateDoc(doc(db, "dailyLogs", log.id), {
          activities: updatedActivities,
          updatedAt: serverTimestamp()
        });

        log.activities = updatedActivities;
        renderHistory();

      } catch (error) {
        console.error(error);
        alert("Unable to update activity: " + error.message);
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "small-btn delete-btn";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {

      if (!confirm("Are you sure you want to delete this activity?")) {
        return;
      }

      const updatedActivities = log.activities.filter(
        (_, i) => i !== index
      );

      try {
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
        console.error(error);
        alert("Unable to delete activity: " + error.message);
      }
    });

    actionsCell.append(editButton, deleteButton);

    tr.append(
      dateCell,
      titleCell,
      descriptionCell,
      categoryCell,
      actionsCell
    );

    tableBody.appendChild(tr);
  });

  historyCount.textContent =
    `${rows.length} activities found`;
}

search.addEventListener("input", renderHistory);

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
          Unable to load task history.
        </td>
      </tr>
    `;
  }
});
