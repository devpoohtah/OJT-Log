
import { db } from "./firebase-config.js";
import { requireAuth, setupLogout } from "./auth.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setupLogout();

const form = document.getElementById("taskForm");
const message = document.getElementById("formMessage");

document.getElementById("date").value =
  new Date().toLocaleDateString("en-CA");

let currentUser = null;

requireAuth(user => {
  currentUser = user;
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const button = form.querySelector("button[type=submit]");
  button.disabled = true;

  message.textContent = "Saving task...";

  try {
    await addDoc(collection(db, "tasks"), {
      userId: currentUser.uid,
      date: document.getElementById("date").value,
      title: document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      category: document.getElementById("category").value,
      hours: Number(document.getElementById("hours").value),
      createdAt: serverTimestamp()
    });

    window.location.href = "dashboard.html";

  } catch (error) {
    message.textContent = "Unable to save task.";
    button.disabled = false;
  }
});
