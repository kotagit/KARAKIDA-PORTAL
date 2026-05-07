// バージョンは 10.13.2 に合わせています
import { auth, provider, db } from "./firebase.js";
import { signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const loginBtn = document.getElementById("login-btn");

// ログインボタンの処理（リダイレクト方式に変更）
loginBtn.addEventListener("click", () => {
  console.log("ログインを開始します（画面を切り替えます）");
  signInWithRedirect(auth, provider);
});

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("ログイン中:", user.email);
    // USER_LISTのチェック
    const userRef = doc(db, "USER_LIST", user.email);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("app-content").style.display = "block";
      document.getElementById("user-info").innerText = `${user.displayName} さんとしてログイン中`;
    } else {
      alert("アクセス権限がありません。USER_LISTを確認してください。");
      auth.signOut();
    }
  } else {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("app-content").style.display = "none";
  }
});