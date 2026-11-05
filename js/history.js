
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

const list = document.getElementById("historyList");
const search = document.getElementById("search");

let logs = [];
let currentUser = null;

function render() {
  list.replaceChildren();

  const term = search.value.toLowerCase().trim();

  const filtered = logs.filter(log =>
    log.date.includes(term) ||
    (log.activities || []).some(activity =>
      `${activity.title} ${activity.description} ${activity.category}`
        .toLowerCase().includes(term)
    )
  );

  if (!filtered.length) {
    list.textContent = "No matching activities found.";
    return;
  }

  filtered.forEach(log => {

    const group = document.createElement("div");
    group.className = "task";

    const heading = document.createElement("h3");
    heading.textContent = log.date;

    group.appendChild(heading);

    (log.activities || []).forEach((activity, index) => {

      const item = document.createElement("div");
      item.style.padding = "15px 0";
      item.style.borderBottom = "1px solid #edf0f5";

      const title = document.createElement("strong");
      title.textContent = activity.title;

      const description = document.createElement("p");
      description.textContent = activity.description;

      const category = document.createElement("small");
      category.className = "task-meta";
      category.textContent =
        activity.category || "No category";

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const editButton = document.createElement("button");
      editButton.className = "small-btn";
      editButton.textContent = "Edit";

      editButton.addEventListener("click", async () => {

        const newTitle = prompt("Task title:", activity.title);
        if (newTitle === null) return;

        const newDescription = prompt(
          "Description:", activity.description
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
            activities: updatedActivities
          });

          log.activities = updatedActivities;
          render();

        } catch (error) {
          console.error(error);
          alert("Unable to update activity.");
        }
      });

      const deleteButton = document.createElement("button");
      deleteButton.className = "small-btn delete-btn";
      deleteButton.textContent = "Delete";

      deleteButton.addEventListener("click", async () => {

        if (!confirm("Delete this activity permanently?")) return;

        const updatedActivities = log.activities.filter(
          (_, i) => i !== index
        );

        try {
          if (updatedActivities.length === 0) {
            await deleteDoc(doc(db, "dailyLogs", log.id));
            logs = logs.filter(item => item.id !== log.id);
          } else {
            await updateDoc(doc(db, "dailyLogs", log.id), {
              activities: updatedActivities
            });

            log.activities = updatedActivities;
          }

          render();

        } catch (error) {
          console.error(error);
          alert("Unable to delete activity.");
        }
      });

      actions.append(editButton, deleteButton);
      item.append(title, description, category, actions);
      group.appendChild(item);
    });

    list.appendChild(group);
  });
}

search.addEventListener("input", render);

requireAuth(async user => {
  currentUser = user;

  try {
    const q = query(
      collection(db, "dailyLogs"),
      where("userId", "==", currentUser.uid),
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);

    logs = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    render();

  } catch (error) {
    console.error(error);
    list.textContent = "Unable to load task history.";
  }
});
