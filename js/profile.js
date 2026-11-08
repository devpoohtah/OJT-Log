import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Per-user settings in Firestore /profiles/{uid}: company, department, requiredHours.
// The user's name itself lives in Firebase Auth (displayName).

const profileRef = uid => doc(db, "profiles", uid);

// `loaded` is false when the read failed (e.g. rules not published yet).
export async function loadProfile(uid) {
  try {
    const snap = await getDoc(profileRef(uid));
    const data = snap.exists() ? snap.data() : {};
    return {
      company: data.company || "",
      department: data.department || "",
      requiredHours: typeof data.requiredHours === "number" ? data.requiredHours : null,
      loaded: true
    };
  } catch (err) {
    console.warn("Could not load profile:", err.code || err.message);
    return { company: "", department: "", requiredHours: null, loaded: false };
  }
}

export async function saveProfile(uid, { company, department }) {
  await setDoc(profileRef(uid), {
    userId: uid,
    company: company.trim(),
    department: department.trim(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// hours: a number >= 0, or null to clear it
export async function saveRequiredHours(uid, hours) {
  await setDoc(profileRef(uid), {
    userId: uid,
    requiredHours: hours,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
