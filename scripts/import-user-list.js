#!/usr/bin/env node
/**
 * USER_LIST CSV → Firestore インポートスクリプト
 *
 * 使い方:
 *   1. Firebase Console > プロジェクト設定 > サービスアカウント > 新しい秘密鍵を生成
 *   2. JSONファイルをこのスクリプトと同じディレクトリに「serviceAccount.json」として保存
 *   3. npm install firebase-admin
 *   4. node import-user-list.js [csvPath]
 *
 * 動作:
 *   - 引数のCSVファイル(デフォルト: ../USER_LIST_20260513.csv)を読み込む
 *   - USER_LIST コレクションの全ドキュメントを削除 (--purge オプション時のみ)
 *   - 各行を name をドキュメントIDとして書き込む (上書き)
 *   - eligibleCodes は ";" 区切り → 配列
 *   - emergencyContacts は JSON文字列 → オブジェクト配列
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./serviceAccount.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const inputPath = process.argv[2] || path.join(__dirname, '..', 'USER_LIST_20260513.json');
const purge = process.argv.includes('--purge');

function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadRecordsFromCsv(text) {
  const rows = parseCsv(text).filter(r => r.length > 1);
  const header = rows.shift();
  return rows.map(row => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = row[idx] !== undefined ? row[idx] : ''; });
    if (typeof obj.eligibleCodes === 'string') {
      obj.eligibleCodes = obj.eligibleCodes ? obj.eligibleCodes.split(';').map(s => s.trim()).filter(Boolean) : [];
    }
    if (typeof obj.emergencyContacts === 'string' && obj.emergencyContacts) {
      try { obj.emergencyContacts = JSON.parse(obj.emergencyContacts); }
      catch(e) { obj.emergencyContacts = []; }
    } else {
      obj.emergencyContacts = [];
    }
    if (obj.dev === 'TRUE') obj.dev = true;
    else if (obj.dev === 'FALSE') obj.dev = false;
    else obj.dev = !!obj.dev;
    return obj;
  });
}

async function main() {
  console.log(`Reading: ${inputPath}`);
  const text = fs.readFileSync(inputPath, 'utf8').replace(/^﻿/, '');
  let records;
  if (inputPath.toLowerCase().endsWith('.json')) {
    records = JSON.parse(text);
    if (!Array.isArray(records)) throw new Error('JSON must be an array of objects');
  } else {
    records = loadRecordsFromCsv(text);
  }
  console.log(`Records: ${records.length}`);

  if (purge) {
    console.log('Purging existing USER_LIST...');
    const snap = await db.collection('USER_LIST').get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`Deleted ${snap.size} docs`);
  }

  let written = 0;
  const batch = db.batch();
  for (const obj of records) {
    if (!obj.name) continue;
    if (!Array.isArray(obj.eligibleCodes)) obj.eligibleCodes = [];
    if (!Array.isArray(obj.emergencyContacts)) obj.emergencyContacts = [];
    const ref = db.collection('USER_LIST').doc(obj.name);
    batch.set(ref, obj);
    written++;
  }

  console.log(`Committing ${written} docs...`);
  await batch.commit();
  console.log('Done.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
