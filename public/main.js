// firebase.jsからdb（データベース本体）を読み込む
import { db } from "./firebase.js";
import { collection, addDoc, getDocs } from "firebase/firestore";

// HTMLのボタンとリストを取得する
const addBtn = document.getElementById("add-btn");
const getBtn = document.getElementById("get-btn");
const dataList = document.getElementById("data-list");

// --- データの書き込み（保存） ---
addBtn.addEventListener("click", async () => {
  try {
    // 'testData'というコレクション（フォルダのようなもの）にデータを追加
    const docRef = await addDoc(collection(db, "testData"), {
      name: "KARAKIDA APP",
      message: "ブラウザからのテスト送信です！",
      timestamp: new Date()
    });
    alert("データの保存に成功しました！ ID: " + docRef.id);
  } catch (e) {
    console.error("保存エラー: ", e);
    alert("エラーが発生しました。コンソールを確認してください。");
  }
});

// --- データの呼び出し（表示） ---
getBtn.addEventListener("click", async () => {
  dataList.innerHTML = "読み込み中..."; // 取得前に一度リセット
  
  try {
    const querySnapshot = await getDocs(collection(db, "testData"));
    dataList.innerHTML = ""; // リセット
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // リストの項目（<li>）を作成してHTMLに追加する
      const li = document.createElement("li");
      li.textContent = `名前: ${data.name} | メッセージ: ${data.message}`;
      dataList.appendChild(li);
    });
  } catch (e) {
    console.error("読み込みエラー: ", e);
  }
});