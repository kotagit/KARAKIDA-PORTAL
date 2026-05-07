import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// アプリ側（認証 + USER_LIST）
const appConfig = {
  apiKey: "AIzaSyCJ2EyLF-63hMs5PHLKCnGhO36bXv4zo7Q",
  authDomain: "karakida-app-7bbc0.firebaseapp.com",
  projectId: "karakida-app-7bbc0",
  storageBucket: "karakida-app-7bbc0.appspot.com",
  messagingSenderId: "784037102811",
  appId: "1:784037102811:web:8173578b319adc6596f8fe"
};

// ポータル側（SCHEDULE など情報系データ）
const portalConfig = {
  apiKey: "AIzaSyBdGcOzwARKZdgVFv7nO9M5GNa-LCf0c5Y",
  authDomain: "karakida-portal.firebaseapp.com",
  projectId: "karakida-portal",
  storageBucket: "karakida-portal.firebasestorage.app",
  messagingSenderId: "615411139147",
  appId: "1:615411139147:web:422e05da8b7dfce21ec3ce"
};

const appFirebase    = initializeApp(appConfig,    "app");
const portalFirebase = initializeApp(portalConfig, "portal");

export const auth       = getAuth(appFirebase);       // 認証 & USER_LIST用
export const portalAuth = getAuth(portalFirebase);    // ポータルFirestore用
export const db         = getFirestore(appFirebase);  // USER_LIST
export const portalDb   = getFirestore(portalFirebase); // SCHEDULE等
export const provider   = new GoogleAuthProvider();
