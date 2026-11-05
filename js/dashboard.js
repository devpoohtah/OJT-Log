
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

requireAuth(async user => {
  const list = document.getElementById("taskList");

  list.textContent = "Loading activities...";

  try {
    const q = query(
      collection(db, "dailyLogs"),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    const logs = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    // Sort dates locally instead of using Firestore orderBy.
    logs.sort((a, b) => b.date.localeCompare(a.date));

    document.getElementById("totalLogs").textContent = logs.length;

    const totalActivities = logs.reduce(
      (sum, log) => sum + (Array.isArray(log.activities)
        ? log.activities.length : 0),
      0
    );

    document.getElementById("totalActivities").textContent =
      totalActivities;

    list.replaceChildren();

    if (!logs.length) {
      list.textContent = "No activities recorded yet.";
      return;
    }

    logs.slice(0, 5).forEach(log => {
      const group = document.createElement("div");
      group.className = "task";

      const heading = document.createElement("h3");
      heading.textContent = log.date || "Undated log";

      const count = document.createElement("p");
      count.textContent =
        `${log.activities?.length || 0} activities recorded`;

      group.append(heading, count);

      (log.activities || []).forEach(activity => {
        const item = document.createElement("div");
        item.style.padding = "10px 0";

        const title = document.createElement("strong");
        title.textContent = activity.title || "Untitled task";

        const desc = document.createElement("p");
        desc.textContent = activity.description || "";

        const category = document.createElement("small");
        category.className = "task-meta";
        category.textContent =
          activity.category || "No category";

        item.append(title, desc, category);
        group.appendChild(item);
      });

      list.appendChild(group);
    });

  } catch (error) {
    console.error("Dashboard loading error:", error);
    list.textContent =
      `Unable to load activities: ${error.code || error.message}`;
  }
});
