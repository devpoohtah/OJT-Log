
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
      collection(db, "dailyLogs"),
      where("userId", "==", user.uid),
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);

    const logs = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    document.getElementById("totalLogs").textContent = logs.length;

    const totalActivities = logs.reduce(
      (sum, log) => sum + (log.activities?.length || 0),
      0
    );

    document.getElementById("totalActivities").textContent =
      totalActivities;

    list.replaceChildren();

    if (!logs.length) {
      list.textContent = "No activities recorded yet. Add your first daily log!";
      return;
    }

    logs.slice(0, 5).forEach(log => {

      const group = document.createElement("div");
      group.className = "task";

      const heading = document.createElement("h3");
      heading.textContent = log.date;

      const count = document.createElement("p");
      count.textContent =
        `${log.activities?.length || 0} activities recorded`;

      group.append(heading, count);

      (log.activities || []).forEach(activity => {

        const item = document.createElement("div");
        item.style.padding = "10px 0";

        const title = document.createElement("strong");
        title.textContent = activity.title;

        const desc = document.createElement("p");
        desc.textContent = activity.description;

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
    console.error(error);
    list.textContent = "Unable to load daily logs.";
  }
});
