// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBdGcOzwARKZdgVFv7nO9M5GNa-LCf0c5Y",
  authDomain: "karakida-portal.firebaseapp.com",
  projectId: "karakida-portal",
  storageBucket: "karakida-portal.firebasestorage.app",
  messagingSenderId: "615411139147",
  appId: "1:615411139147:web:422e05da8b7dfce21ec3ce",
  measurementId: "G-42LS3TLCN4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);