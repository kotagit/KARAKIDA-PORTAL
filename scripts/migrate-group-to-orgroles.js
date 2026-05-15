#!/usr/bin/env node
/**
 * USER_LIST.group → orgRoles の野外宣教グループに反映
 *
 * 既に監督/補佐が設定済みの成員はスキップ。
 * group があるが orgRoles にグループ未登録の成員に { department, position:'成員' } を追加。
 *
 * 使い方:
 *   node migrate-group-to-orgroles.js --dry-run   # プレビュー
 *   node migrate-group-to-orgroles.js              # 実行
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const dryRun = process.argv.includes('--dry-run');

const GROUP_NAME_TO_ID = {
  'ポプラ': 'group_poplar',
  'バオバブ': 'group_baobab',
  'アーモンド': 'group_almond',
  'メタセコイア': 'group_metasequoia',
};

async function main() {
  const snap = await db.collection('USER_LIST').get();
  let updated = 0, skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const groupName = data.group;
    if (!groupName || !GROUP_NAME_TO_ID[groupName]) continue;

    const deptId = GROUP_NAME_TO_ID[groupName];
    const orgRoles = Array.isArray(data.orgRoles) ? data.orgRoles : [];

    const existing = orgRoles.find(r => r && r.department === deptId);
    if (existing) {
      skipped++;
      continue;
    }

    const newRoles = [...orgRoles, { department: deptId, position: '成員' }];
    console.log(`${dryRun ? '[DRY] ' : ''}${data.name}: ${groupName} → ${deptId}/成員`);

    if (!dryRun) {
      await doc.ref.update({ orgRoles: newRoles });
    }
    updated++;
  }

  console.log(`\n完了: ${updated}件更新, ${skipped}件スキップ（既存）`);
  if (dryRun) console.log('(--dry-run のため実際の更新はしていません)');
}

main().catch(e => { console.error(e); process.exit(1); });
