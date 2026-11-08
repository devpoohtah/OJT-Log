
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";
import { loadProfile } from "./profile.js";
import { setupExport } from "./report.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

// =====================================
// ELEMENTS
// =====================================

const tableBody = document.getElementById("historyTableBody");
const search = document.getElementById("search");
const historyCount = document.getElementById("historyCount");

const prevPage = document.getElementById("prevPage");
const nextPage = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editDate = document.getElementById("editDate");
const editTitle = document.getElementById("editTitle");
const editDescription = document.getElementById("editDescription");
const editCategory = document.getElementById("editCategory");
const editMessage = document.getElementById("editMessage");
const saveEdit = document.getElementById("saveEdit");

const closeModal = document.getElementById("closeModal");
const cancelEdit = document.getElementById("cancelEdit");

const requiredElements = [
  tableBody, search, historyCount, prevPage, nextPage,
  pageInfo, editModal, editForm, editDate, editTitle,
  editDescription, editCategory, editMessage, saveEdit,
  closeModal, cancelEdit
];

if (requiredElements.some(element => !element)) {
  throw new Error("Some Task History HTML elements are missing.");
}

// =====================================
// STATE
// =====================================

const PAGE_SIZE = 10;

let logs = [];
let currentPage = 1;
let currentUser = null;
let editingActivity = null;

// =====================================
// HELPERS
// =====================================

function getAllActivities() {
  const rows = [];

  logs.forEach(log => {
    (log.activities || []).forEach((activity, index) => {
      rows.push({
        log,
        activity,
        index
      });
    });
  });

  return rows;
}

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value || "-";

  if (className) {
    cell.className = className;
  }

  return cell;
}

function getFilteredActivities() {
  const term = search.value.toLowerCase().trim();

  return getAllActivities()
    .filter(({ log, activity }) => {
      const searchable = [
        log.date,
        activity.title,
        activity.description,
        activity.category
      ].join(" ").toLowerCase();

      return searchable.includes(term);
    })
    .sort((a, b) => {
      const dateComparison =
        (b.log.date || "").localeCompare(a.log.date || "");

      if (dateComparison !== 0) return dateComparison;

      return (a.activity.title || "").localeCompare(
        b.activity.title || ""
      );
    });
}

// =====================================
// RENDER TABLE
// =====================================

function renderHistory() {
  tableBody.replaceChildren();

  const rows = getFilteredActivities();

  const totalPages = Math.max(
    1,
    Math.ceil(rows.length / PAGE_SIZE)
  );

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  if (!pageRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.className = "empty-state";
    cell.textContent = rows.length
      ? "No activities on this page."
      : "No matching activities found.";

    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  pageRows.forEach(({ log, activity, index }) => {
    const row = document.createElement("tr");

    row.appendChild(createCell(log.date));

    row.appendChild(
      createCell(
        activity.title || "Untitled activity",
        "activity-title"
      )
    );

    row.appendChild(
      createCell(activity.description, "description-cell")
    );

    const categoryCell = document.createElement("td");
    const badge = document.createElement("span");

    badge.className = "category-badge";
    badge.textContent = activity.category || "No category";

    categoryCell.appendChild(badge);
    row.appendChild(categoryCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "table-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "small-btn";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
      openEditModal(log, activity, index);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-btn delete-btn";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => {
      deleteActivity(log, index, deleteButton);
    });

    actionsCell.append(editButton, deleteButton);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });

  historyCount.textContent =
    `${rows.length} ${rows.length === 1 ? "activity" : "activities"} found`;

  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;
}

// =====================================
// PAGINATION
// =====================================

prevPage.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderHistory();
  }
});

nextPage.addEventListener("click", () => {
  const totalPages = Math.max(
    1,
    Math.ceil(getFilteredActivities().length / PAGE_SIZE)
  );

  if (currentPage < totalPages) {
    currentPage++;
    renderHistory();
  }
});

search.addEventListener("input", () => {
  currentPage = 1;
  renderHistory();
});

// =====================================
// EDIT MODAL
// =====================================

function openEditModal(log, activity, index) {
  editingActivity = {
    logId: log.id,
    index,
    originalDate: log.date
  };

  // Remove an old-category option left over from a previous edit.
  editCategory.querySelectorAll("option[data-extra]").forEach(o => o.remove());

  // Keep an old category selectable if it is not one of the 7 standard options.
  const existing = (activity.category || "").trim();
  if (existing && ![...editCategory.options].some(o => o.value === existing)) {
    const extra = document.createElement("option");
    extra.value = existing;
    extra.textContent = existing;
    extra.dataset.extra = "true";
    editCategory.append(extra);
  }

  editDate.value = log.date || "";
  editTitle.value = activity.title || "";
  editDescription.value = activity.description || "";
  editCategory.value = existing;

  editMessage.textContent = "";
  editModal.hidden = false;

  document.body.classList.add("modal-open");
  editTitle.focus();
}

function closeEditModal() {
  editModal.hidden = true;
  document.body.classList.remove("modal-open");
  editingActivity = null;
  editForm.reset();
  editCategory.querySelectorAll("option[data-extra]").forEach(o => o.remove());
  editMessage.textContent = "";
}

closeModal.addEventListener("click", closeEditModal);
cancelEdit.addEventListener("click", closeEditModal);

editModal.addEventListener("click", event => {
  if (event.target === editModal) {
    closeEditModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !editModal.hidden) {
    closeEditModal();
  }
});

// =====================================
// SAVE EDIT
// =====================================

editForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!editingActivity) return;

  const title = editTitle.value.trim();
  const description = editDescription.value.trim();
  const category = editCategory.value.trim();
  const newDate = editDate.value;

  if (!title || !description || !newDate) {
    editMessage.textContent =
      "Please complete the date, title, and description.";
    return;
  }

  const log = logs.find(item =>
    item.id === editingActivity.logId
  );

  if (!log || !log.activities[editingActivity.index]) {
    editMessage.textContent =
      "Activity not found. Please refresh the page.";
    return;
  }

  const oldIndex = editingActivity.index;

  const updatedActivity = {
    ...log.activities[oldIndex],
    title,
    description,
    category
  };

  saveEdit.disabled = true;
  saveEdit.textContent = "Saving...";

  try {
    if (newDate === log.date) {
      // Only update the selected activity.
      const updatedActivities = [...log.activities];

      updatedActivities[oldIndex] = updatedActivity;

      await updateDoc(doc(db, "dailyLogs", log.id), {
        activities: updatedActivities,
        updatedAt: serverTimestamp()
      });

      log.activities = updatedActivities;

    } else {
      // Move just this activity to another daily log.
      // Other activities in the original log stay on their date.

      const updatedActivities = log.activities.filter(
        (_, index) => index !== oldIndex
      );

      const batch = writeBatch(db);

      const newLogRef = doc(collection(db, "dailyLogs"));

      batch.set(newLogRef, {
        userId: currentUser.uid,
        date: newDate,
        activities: [updatedActivity],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (updatedActivities.length === 0) {
        batch.delete(doc(db, "dailyLogs", log.id));
      } else {
        batch.update(doc(db, "dailyLogs", log.id), {
          activities: updatedActivities,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

      log.activities = updatedActivities;

      if (!updatedActivities.length) {
        logs = logs.filter(item => item.id !== log.id);
      }

      logs.push({
        id: newLogRef.id,
        userId: currentUser.uid,
        date: newDate,
        activities: [updatedActivity]
      });
    }

    closeEditModal();
    renderHistory();

  } catch (error) {
    console.error("Edit error:", error);

    editMessage.textContent =
      `Unable to save: ${error.code || error.message}`;

  } finally {
    saveEdit.disabled = false;
    saveEdit.textContent = "Save Changes";
  }
});

// =====================================
// DELETE ACTIVITY
// =====================================

async function deleteActivity(log, index, button) {
  const activity = log.activities[index];

  if (!confirm(
    `Are you sure you want to delete "${activity.title || "this activity"}"?`
  )) {
    return;
  }

  button.disabled = true;

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
    console.error("Delete error:", error);

    alert(
      `Unable to delete activity: ${error.code || error.message}`
    );

    button.disabled = false;
  }
}

// =====================================
// LOAD FIRESTORE
// =====================================

setupExport({
  getLogs: () => logs,
  getProfile: async () => {
    const profile = await loadProfile(currentUser.uid);
    return {
      name: currentUser.displayName || "",
      company: profile.company,
      department: profile.department
    };
  }
});

requireAuth(async user => {
  currentUser = user;

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

    currentPage = 1;
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

    historyCount.textContent = "Unable to load activities.";
  }
});
