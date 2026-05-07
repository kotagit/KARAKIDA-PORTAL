import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdGcOzwARKZdgVFv7nO9M5GNa-LCf0c5Y",
  authDomain: "karakida-portal.firebaseapp.com",
  projectId: "karakida-portal",
  storageBucket: "karakida-portal.firebasestorage.app",
  messagingSenderId: "615411139147",
  appId: "1:615411139147:web:422e05da8b7dfce21ec3ce",
  measurementId: "G-42LS3TLCN4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();