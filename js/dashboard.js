
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

requireAuth(async user => {
  const list = document.getElementById("taskList");

  try {
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", user.uid),
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);

    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    document.getElementById("totalTasks").textContent = tasks.length;

    document.getElementById("totalHours").textContent =
      tasks.reduce((sum, task) => sum + Number(task.hours || 0), 0);

    list.replaceChildren();

    if (!tasks.length) {
      list.textContent = "No activities yet. Add your first task!";
      return;
    }

    tasks.slice(0, 5).forEach(task => {
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

      item.append(title, desc, meta);
      list.append(item);
    });

  } catch (error) {
    list.textContent = "Unable to load activities.";
  }
});
