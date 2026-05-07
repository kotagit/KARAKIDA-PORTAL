import { auth, provider, db } from "./firebase.js";
import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const loginBtn = document.getElementById("login-btn");

// ボタンクリック時の処理
loginBtn.addEventListener("click", () => {
  console.log("ログインボタンが押されました"); // 動作確認用
  signInWithPopup(auth, provider).catch(err => {
    console.error("ログインエラー:", err);
    alert("ログイン失敗: " + err.message);
  });
});

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userRef = doc(db, "USER_LIST", user.email);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("app-content").style.display = "block";
      document.getElementById("user-info").innerText = `${user.displayName} さんとしてログイン中`;
    } else {
      alert("USER_LISTに登録されていません。");
      auth.signOut();
    }
  } else {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("app-content").style.display = "none";
  }
});