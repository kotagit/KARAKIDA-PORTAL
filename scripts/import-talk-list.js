// PUBLIC_TALK_LIST に S-99 の講演マスタ(194件)をインポート
// 使い方: node scripts/import-talk-list.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// サービスアカウント鍵の場所
const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('serviceAccountKey.json が見つかりません:', keyPath);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});
const db = admin.firestore();

async function main() {
  const talks = JSON.parse(fs.readFileSync(path.join(__dirname, 'talk-list.json'), 'utf8'));
  console.log(`${talks.length}件の講演を読み込みました`);

  const batch = db.batch();
  for (const t of talks) {
    const docRef = db.collection('PUBLIC_TALK_LIST').doc(String(t.number));
    batch.set(docRef, {
      number: t.number,
      title: t.title,
    });
  }

  await batch.commit();
  console.log('PUBLIC_TALK_LIST にインポート完了');
}

main().catch(e => { console.error(e); process.exit(1); });
