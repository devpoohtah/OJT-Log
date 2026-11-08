import { requireAuth } from "./auth.js";
import { loadProfile } from "./profile.js";
import { localDateString, toHours, fetchRecords } from "./dtr-core.js";

// Fills the three DTR cards on the dashboard. Kept separate from dashboard.js so a
// DTR/Firestore problem can never break the task calendar.

const $ = id => document.getElementById(id);
const el = {
  totalHours: $("dtrTotalHours"), totalDays: $("dtrTotalDays"),
  monthHours: $("dtrMonthHours"), monthDays: $("dtrMonthDays"),
  remaining: $("dtrRemaining"), remainingNote: $("dtrRemainingNote")
};

const plural = n => `${n} day${n === 1 ? "" : "s"}`;
const sumHours = list => list.reduce((sum, r) => sum + toHours(r.totalMinutes), 0);

function showError() {
  el.totalHours.textContent = el.monthHours.textContent = el.remaining.textContent = "--";
  el.totalDays.textContent = el.monthDays.textContent = "Unavailable";
  el.remainingNote.textContent = "Could not load DTR";
}

if (Object.values(el).every(Boolean)) {
  requireAuth(async user => {
    try {
      const [records, profile] = await Promise.all([
        fetchRecords(user.uid),
        loadProfile(user.uid)
      ]);

      const done = records.filter(r => r.totalMinutes);
      const total = sumHours(done);
      const thisMonth = done.filter(r => r.date.startsWith(localDateString().slice(0, 7)));

      el.totalHours.textContent = total.toFixed(2);
      el.totalDays.textContent = plural(done.length);
      el.monthHours.textContent = sumHours(thisMonth).toFixed(2);
      el.monthDays.textContent = plural(thisMonth.length);

      if (profile.requiredHours > 0) {
        el.remaining.textContent = Math.max(profile.requiredHours - total, 0).toFixed(2);
        el.remainingNote.textContent = `of ${profile.requiredHours} required hrs`;
      } else {
        el.remaining.textContent = "--";
        el.remainingNote.replaceChildren();
        const link = document.createElement("a");
        link.href = "dtr.html#settings";
        link.textContent = "Set required hours →";
        el.remainingNote.append(link);
      }
    } catch (err) {
      console.error("DTR cards failed:", err);
      showError();
    }
  });
}
