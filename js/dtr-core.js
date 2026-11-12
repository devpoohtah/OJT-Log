import { db } from "./firebase-config.js";
import { formatDate, formatDateWithWeekday } from "./format.js";
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Shared DTR helpers + Firestore access (used by dtr.js and dtr-records.js).

export const DEFAULT_BREAK = 60;               // minutes
const pad = n => String(n).padStart(2, "0");

// ---------- dates & times ----------

export const localDateString = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const localTimeString = (d = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const addDays = (str, n) => {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return localDateString(d);
};

export const formatShortDate = str =>
  parseDate(str).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const daysBetween = (from, to) =>
  Math.round((parseDate(to) - parseDate(from)) / 86400000);

// "Fri, Nov 13, 2026"
export const formatLongDate = str => formatDateWithWeekday(str);

export { formatDate };

export function format12h(time) {
  if (!time) return "--:--";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

export const toMinutes = time => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const toHours = minutes => minutes / 60;

// ---------- hours calculation (supports overnight shifts) ----------

// Time Out earlier than Time In means the shift ended the next day.
export const isNextDay = (timeIn, timeOut) =>
  Boolean(timeIn && timeOut) && toMinutes(timeOut) < toMinutes(timeIn);

// Date the shift ended. Old records only have `nextDay`, newer ones have `timeOutDate`.
export const timeOutDateOf = record =>
  record.timeOutDate || (record.nextDay ? addDays(record.date, 1) : record.date);

// "6:00 AM" for same-day, "6:00 AM (Nov 4)" when it ends on another date.
export function timeOutLabel(record) {
  if (!record.timeOut) return "--:--";
  const outDate = timeOutDateOf(record);
  return format12h(record.timeOut) +
    (outDate !== record.date ? ` (${formatShortDate(outDate)})` : "");
}

// Net worked minutes, or null when the result is zero/negative or input is missing.
// dayOffset = days between the Time In date and the Time Out date (0 = same day).
export function workedMinutes(timeIn, timeOut, breakMinutes = 0, dayOffset = 0) {
  if (!timeIn || !timeOut) return null;
  const net = toMinutes(timeOut) - toMinutes(timeIn)
    + (Number(dayOffset) || 0) * 1440 - (Number(breakMinutes) || 0);
  return net > 0 ? net : null;
}

// ---------- Firestore ----------

const recordRef = (uid, date) => doc(db, "dtrRecords", `${uid}_${date}`);

export async function fetchRecords(uid) {
  // Single-field query on userId, same as dailyLogs: no composite index needed.
  const snap = await getDocs(
    query(collection(db, "dtrRecords"), where("userId", "==", uid))
  );
  return snap.docs.map(d => d.data()).sort((a, b) => b.date.localeCompare(a.date));
}

// date = the day the shift STARTED. One record per user per date.
// timeOutDate = the day it ENDED (defaults to the start date).
export async function saveRecord(uid, { date, timeIn, timeOut, timeOutDate, breakMinutes }) {
  const outDate = timeOut ? (timeOutDate || date) : null;
  const offset = outDate ? daysBetween(date, outDate) : 0;

  await setDoc(recordRef(uid, date), {
    userId: uid,
    date,
    timeIn,
    timeOut: timeOut || null,
    timeOutDate: outDate,
    nextDay: offset > 0,                       // kept for older code/records
    breakMinutes: Number(breakMinutes) || 0,
    totalMinutes: timeOut ? workedMinutes(timeIn, timeOut, breakMinutes, offset) : null,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export const deleteRecord = (uid, date) => deleteDoc(recordRef(uid, date));
