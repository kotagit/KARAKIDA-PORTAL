import { auth, provider, db } from "./firebase.js";
import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js";

const loginBtn = document.getElementById("login-btn");

// ログインボタンの処理
loginBtn.addEventListener("click", () => {
  signInWithPopup(auth, provider).catch(err => alert("ログイン失敗: " + err.message));
});

// ログイン状態を監視する
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // 1. USER_LISTにこのユーザー（メールアドレス）が存在するか確認
    // ※USER_LISTコレクションのドキュメントIDがメールアドレスであると仮定
    const userRef = doc(db, "USER_LIST", user.email);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // 2. 許可されたユーザーならコンテンツを表示
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("app-content").style.display = "block";
      document.getElementById("user-info").innerText = `${user.displayName} さんとしてログイン中`;
    } else {
      // 3. 許可されていないユーザーの場合
      alert("アクセス権限がありません。管理者にお問い合わせください。");
      auth.signOut();
    }
  } else {
    // ログアウト状態ならログイン画面を表示
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("app-content").style.display = "none";
  }
});