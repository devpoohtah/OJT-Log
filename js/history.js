
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

let tasks = [];

function render() {
  list.replaceChildren();

  const term = search.value.toLowerCase();

  const filtered = tasks.filter(task =>
    `${task.title} ${task.description} ${task.category}`
      .toLowerCase()
      .includes(term)
  );

  if (!filtered.length) {
    list.textContent = "No matching activities found.";
    return;
  }

  filtered.forEach(task => {
    const item = document.createElement("div");
    item.className = "task";

    const title = document.createElement("h3");
    title.textContent = task.title;

    const desc = document.createElement("p");
    desc.textContent = task.description;

    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.textContent =
      `${task.date} · ${task.category} · ${task.hours} hours`;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const edit = document.createElement("button");
    edit.className = "small-btn";
    edit.textContent = "Edit";

    edit.addEventListener("click", async () => {
      const newTitle = prompt("Task title:", task.title);
      if (newTitle === null) return;

      const newDescription = prompt("Description:", task.description);
      if (newDescription === null) return;

      const newHours = prompt("Hours:", task.hours);
      if (newHours === null) return;

      const hours = Number(newHours);

      if (!newTitle.trim() || !newDescription.trim() ||
          !Number.isFinite(hours) || hours <= 0 || hours > 24) {
        alert("Please enter valid task details.");
        return;
      }

      try {
        await updateDoc(doc(db, "tasks", task.id), {
          title: newTitle.trim(),
          description: newDescription.trim(),
          hours
        });

        task.title = newTitle.trim();
        task.description = newDescription.trim();
        task.hours = hours;

        render();

      } catch (error) {
        alert("Unable to update task.");
      }
    });

    const del = document.createElement("button");
    del.className = "small-btn delete-btn";
    del.textContent = "Delete";

    del.addEventListener("click", async () => {
      if (!confirm("Delete this task permanently?")) return;

      try {
        await deleteDoc(doc(db, "tasks", task.id));

        tasks = tasks.filter(t => t.id !== task.id);
        render();

      } catch (error) {
        alert("Unable to delete task.");
      }
    });

    actions.append(edit, del);
    item.append(title, desc, meta, actions);
    list.append(item);
  });
}

search.addEventListener("input", render);

requireAuth(async user => {
  try {
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", user.uid),
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);

    tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    render();

  } catch (error) {
    list.textContent = "Unable to load task history.";
  }
});
