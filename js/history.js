
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";
import { loadProfile } from "./profile.js";
import { setupExport } from "./report.js";
import { formatDate } from "./format.js";
import { fetchRecords } from "./dtr-core.js";
import {
  setLoading, confirmDialog, confirmDiscard, formSnapshot, toast, friendlyError
} from "./ui.js";

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
const editKnowledge = document.getElementById("editKnowledge");
const editMessage = document.getElementById("editMessage");
const saveEdit = document.getElementById("saveEdit");

const closeModal = document.getElementById("closeModal");
const cancelEdit = document.getElementById("cancelEdit");

const requiredElements = [
  tableBody, search, historyCount, prevPage, nextPage,
  pageInfo, editModal, editForm, editDate, editTitle,
  editDescription, editCategory, editKnowledge, editMessage, saveEdit,
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

// Long text stays on one line and is cut with "..."; the full text shows on hover
// (title tooltip) and expands in place when tapped or clicked.
function createClipCell(value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;

  const clip = document.createElement("div");
  clip.className = "cell-clip";
  clip.textContent = value || "-";
  clip.title = value || "";
  clip.addEventListener("click", () => clip.classList.toggle("expanded"));

  cell.appendChild(clip);
  return cell;
}

// Knowledge/skills belong to the whole day (they live on the daily log record).
// A day can have more than one log, so combine the distinct non-empty texts.
function knowledgeForDate(date) {
  const texts = logs
    .filter(log => log.date === date)
    .map(log => (log.knowledge || "").trim())
    .filter(Boolean);

  return [...new Set(texts)].join("\n");
}

// Save one knowledge text for the whole day: set it on the target log and clear it
// on the day's other logs, so there is a single source of truth.
async function applyKnowledge(target, text) {
  const writes = [];

  logs.filter(log => log.date === target.date).forEach(log => {
    const wanted = log.id === target.id ? text : "";
    if ((log.knowledge || "") !== wanted) writes.push([log, wanted]);
  });

  if (!writes.length) return;

  const batch = writeBatch(db);
  writes.forEach(([log, value]) => {
    batch.update(doc(db, "dailyLogs", log.id), {
      knowledge: value,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();

  writes.forEach(([log, value]) => { log.knowledge = value; });
}

// Used by the export popup: save the Knowledge/Skills text for one date. If the day has
// several logs the text goes on the one that already holds it (else the first).
async function saveDayKnowledge(date, text) {
  const dayLogs = logs.filter(log => log.date === date);
  if (!dayLogs.length) return;

  const target = dayLogs.find(log => (log.knowledge || "").trim()) || dayLogs[0];
  await applyKnowledge(target, text);
}

function getFilteredActivities() {
  const term = search.value.toLowerCase().trim();

  return getAllActivities()
    .filter(({ log, activity }) => {
      const searchable = [
        log.date,
        formatDate(log.date),
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
      ? "No tasks on this page."
      : "No matching tasks found.";

    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  pageRows.forEach(({ log, activity, index }) => {
    const row = document.createElement("tr");

    row.appendChild(createCell(formatDate(log.date), "date-cell"));

    row.appendChild(
      createClipCell(
        activity.title || "Untitled task",
        "activity-title"
      )
    );

    row.appendChild(
      createClipCell(activity.description, "description-cell")
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
      deleteActivity(log, index);
    });

    actionsCell.append(editButton, deleteButton);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });

  historyCount.textContent =
    `${rows.length} ${rows.length === 1 ? "task" : "tasks"} found`;

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
  const knowledge = knowledgeForDate(log.date);

  editingActivity = {
    logId: log.id,
    index,
    originalDate: log.date,
    initialKnowledge: knowledge
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
  editKnowledge.value = knowledge;

  editMessage.textContent = "";
  editModal.hidden = false;
  editSnapshot = formSnapshot(editForm);

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

// Closing with typed changes asks first; an untouched form just closes.
let editSnapshot = "";
let editBusy = false;

async function requestCloseEdit() {
  if (editBusy || editModal.hidden) return;
  if (formSnapshot(editForm) !== editSnapshot && !(await confirmDiscard())) return;
  closeEditModal();
}

closeModal.addEventListener("click", requestCloseEdit);
cancelEdit.addEventListener("click", requestCloseEdit);

editModal.addEventListener("click", event => {
  if (event.target === editModal) {
    requestCloseEdit();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !editModal.hidden) {
    requestCloseEdit();
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
  const knowledge = editKnowledge.value.trim();
  const knowledgeChanged = knowledge !== editingActivity.initialKnowledge;

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

  editBusy = true;
  editMessage.textContent = "";
  setLoading(saveEdit, true, "Saving...");

  let targetLog = log;          // the log that ends up holding this activity

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

      targetLog = {
        id: newLogRef.id,
        userId: currentUser.uid,
        date: newDate,
        activities: [updatedActivity]
      };

      logs.push(targetLog);
    }

    if (knowledgeChanged) {
      await applyKnowledge(targetLog, knowledge);
    }

    closeEditModal();
    renderHistory();
    toast("Changes saved.");

  } catch (error) {
    console.error("Edit error:", error);

    editMessage.textContent =
      friendlyError(error, "Couldn't save your changes. Please try again.");

  } finally {
    editBusy = false;
    setLoading(saveEdit, false);
  }
});

// =====================================
// DELETE ACTIVITY
// =====================================

async function deleteActivity(log, index) {
  const activity = log.activities[index];

  const updatedActivities = log.activities.filter(
    (_, i) => i !== index
  );

  // The last task of a daily log removes the whole log, including its Knowledge/Skills text.
  const losesKnowledge = updatedActivities.length === 0 && (log.knowledge || "").trim();

  const deleted = await confirmDialog({
    title: "Delete this task?",
    message:
      `"${activity.title || "Untitled task"}" on ${formatDate(log.date)} will be deleted. ` +
      "This can't be undone." +
      (losesKnowledge
        ? "\n\nIt is the only task on that day, so the Knowledge/Skills text saved " +
          "for the day is deleted too."
        : ""),
    confirmText: "Delete",
    loadingText: "Deleting...",
    errorText: "Couldn't delete the task. Please try again.",
    danger: true,
    action: async () => {
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
    }
  });

  if (deleted) {
    renderHistory();
    toast("Task deleted.");
  }
}

// =====================================
// LOAD FIRESTORE
// =====================================

setupExport({
  getLogs: () => logs,
  getRecords: () => fetchRecords(currentUser.uid),
  saveKnowledge: saveDayKnowledge,
  getProfile: async () => {
    const profile = await loadProfile(currentUser.uid);
    return {
      name: currentUser.displayName || "",
      company: profile.company,
      department: profile.department,
      supervisor: profile.supervisor,
      signature: profile.signature,
      supervisorSignature: profile.supervisorSignature
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
          ${friendlyError(error, "Couldn't load your task history. Please try again.")}
        </td>
      </tr>
    `;

    historyCount.textContent = "Unable to load tasks.";
  }
});
