
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyCfR-aL7dfmSzVTf-wwDD46RKgoATfSj9Q",
    authDomain: "ojt-log.firebaseapp.com",
    projectId: "ojt-log",
    storageBucket: "ojt-log.firebasestorage.app",
    messagingSenderId: "254362026838",
    appId: "1:254362026838:web:42685508e4660fb97e4cf7"
  };


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
