import { db } from "./firebase-config.js";
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

export const formatLongDate = str =>
  parseDate(str).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });

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

// Net worked minutes, or null when the result is zero/negative or input is missing.
export function workedMinutes(timeIn, timeOut, breakMinutes = 0, nextDay = false) {
  if (!timeIn || !timeOut) return null;
  const net = toMinutes(timeOut) - toMinutes(timeIn)
    + (nextDay ? 1440 : 0) - (Number(breakMinutes) || 0);
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
export async function saveRecord(uid, { date, timeIn, timeOut, breakMinutes, nextDay }) {
  const isNext = timeOut ? Boolean(nextDay) : false;

  await setDoc(recordRef(uid, date), {
    userId: uid,
    date,
    timeIn,
    timeOut: timeOut || null,
    nextDay: isNext,
    breakMinutes: Number(breakMinutes) || 0,
    totalMinutes: timeOut ? workedMinutes(timeIn, timeOut, breakMinutes, isNext) : null,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export const deleteRecord = (uid, date) => deleteDoc(recordRef(uid, date));
