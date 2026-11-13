import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Per-user settings in Firestore /profiles/{uid}: company, department, supervisor (name only,
// printed in the PDF export), requiredHours, colorTheme (id of the selected color theme,
// e.g. "lavender"; empty = Classic Blue), and signature / supervisorSignature (small PNGs kept
// as data URL strings, so no file storage is needed).
// Note: the whole document must stay under Firestore's 1 MB limit; each signature is capped
// at about 150 KB (see signature.js), so two of them fit comfortably.
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
      supervisor: data.supervisor || "",
      requiredHours: typeof data.requiredHours === "number" ? data.requiredHours : null,
      signature: typeof data.signature === "string" ? data.signature : "",
      supervisorSignature: typeof data.supervisorSignature === "string" ? data.supervisorSignature : "",
      colorTheme: typeof data.colorTheme === "string" ? data.colorTheme : "",
      loaded: true
    };
  } catch (err) {
    console.warn("Could not load profile:", err.code || err.message);
    return {
      company: "", department: "", supervisor: "", requiredHours: null,
      signature: "", supervisorSignature: "", colorTheme: "", loaded: false
    };
  }
}

export async function saveProfile(uid, { company, department, supervisor = "" }) {
  await setDoc(profileRef(uid), {
    userId: uid,
    company: company.trim(),
    department: department.trim(),
    supervisor: supervisor.trim(),
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

// Same format as saveSignature, for the supervisor's (optional) signature.
export async function saveSupervisorSignature(uid, dataUrl) {
  await setDoc(profileRef(uid), {
    userId: uid,
    supervisorSignature: dataUrl || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// id: a color theme id from theme.js ("classic", "lavender", ...)
export async function saveColorTheme(uid, id) {
  await setDoc(profileRef(uid), {
    userId: uid,
    colorTheme: id,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
