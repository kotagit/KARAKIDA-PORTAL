import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJ2EyLF-63hMs5PHLKCnGhO36bXv4zo7Q",
  authDomain: "karakida-app-7bbc0.firebaseapp.com",
  projectId: "karakida-app-7bbc0",
  storageBucket: "karakida-app-7bbc0.appspot.com",
  messagingSenderId: "784037102811",
  appId: "1:784037102811:web:8173578b319adc6596f8fe"
};

const app = initializeApp(firebaseConfig);
export const db       = getFirestore(app);
export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
