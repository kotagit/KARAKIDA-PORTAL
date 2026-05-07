import { initializeApp } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js";
// 👇 1. getAuthとGoogleAuthProviderを追加
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js";

const firebaseConfig = {
  // あなたのAPIキーなど（以前設定したものをそのまま使用）
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// 👇 2. Authとプロバイダをエクスポート
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();