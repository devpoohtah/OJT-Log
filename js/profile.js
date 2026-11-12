import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Per-user settings in Firestore /profiles/{uid}: company, department, requiredHours,
// and signature (a small PNG kept as a data URL string, so no file storage is needed).
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
      signature: typeof data.signature === "string" ? data.signature : "",
      loaded: true
    };
  } catch (err) {
    console.warn("Could not load profile:", err.code || err.message);
    return { company: "", department: "", requiredHours: null, signature: "", loaded: false };
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

// dataUrl: "data:image/png;base64,..." (see signature.js), or "" to remove it
export async function saveSignature(uid, dataUrl) {
  await setDoc(profileRef(uid), {
    userId: uid,
    signature: dataUrl || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
}
