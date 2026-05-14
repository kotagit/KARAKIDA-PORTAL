#!/usr/bin/env node
/**
 * USER_LIST.status を orgRoles + appointment に変換するマイグレーション
 *
 * 変換ルール:
 *   EL → appointment='elder'
 *   MS → appointment='ministerial'
 *   RP → orgRoles に {dept:'pioneer_regular', pos:'本人'} 追加
 *   AP → orgRoles に {dept:'pioneer_aux',     pos:'本人'} 追加
 *   GO + group → orgRoles に {dept:'group_<...>', pos:'監督'}
 *   GA + group → orgRoles に {dept:'group_<...>', pos:'補佐'}
 *   AT → orgRoles に {dept:'annai',       pos:'奉仕者'} 追加
 *   AM → orgRoles に {dept:'territory',   pos:'奉仕者'} 追加
 *   PA → orgRoles に {dept:'public_area', pos:'奉仕者'} 追加
 *   WEB/ADMIN/inactive → status に残す
 *
 * 使い方:
 *   node migrate-status-to-orgroles.js --dry-run   # 変換内容をプレビュー
 *   node migrate-status-to-orgroles.js             # 実行（バックアップを取ってから上書き）
 *   node migrate-status-to-orgroles.js --backup-only  # status_legacy フィールドのみ追加
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./serviceAccount.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const dryRun = process.argv.includes('--dry-run');
const backupOnly = process.argv.includes('--backup-only');

const GROUP_NAME_TO_ID = {
  'ポプラ':'group_poplar', 'バオバブ':'group_baobab',
  'アーモンド':'group_almond', 'メタセコイア':'group_metasequoia',
};

function parseStatus(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; }
    catch(e) { return v.split(/[,;]/); }
  }
  return [];
}

function migrate(user) {
  const statusOld = parseStatus(user.status).map(s => String(s||'').trim());
  const group = String(user.group||'').trim();
  const orgRoles = Array.isArray(user.orgRoles) ? user.orgRoles.slice() : [];
  let appointment = user.appointment || '';
  const statusNew = [];

  function hasOrgRole(deptId, pos) {
    return orgRoles.some(r => r && r.department === deptId && r.position === pos);
  }
  function addOrgRole(deptId, pos) {
    if (!hasOrgRole(deptId, pos)) orgRoles.push({ department: deptId, position: pos });
  }

  statusOld.forEach(code => {
    const c = String(code).toUpperCase();
    if (c === 'EL') { if (!appointment) appointment = 'elder'; }
    else if (c === 'MS') { if (!appointment) appointment = 'ministerial'; }
    else if (c === 'RP') addOrgRole('pioneer_regular', '本人');
    else if (c === 'AP') addOrgRole('pioneer_aux',     '本人');
    else if (c === 'AT') addOrgRole('annai',           '奉仕者');
    else if (c === 'AM') addOrgRole('territory',       '奉仕者');
    else if (c === 'PA') addOrgRole('public_area',     '奉仕者');
    else if (c === 'GO') {
      const gid = GROUP_NAME_TO_ID[group];
      if (gid) addOrgRole(gid, '監督');
    } else if (c === 'GA') {
      const gid = GROUP_NAME_TO_ID[group];
      if (gid) addOrgRole(gid, '補佐');
    } else if (c === 'WEB' || c === 'ADMIN') {
      statusNew.push(c);
    } else if (c === 'INACTIVE' || c === 'inactive') {
      statusNew.push('inactive');
    } else {
      // 未知のステータスは残す
      statusNew.push(code);
    }
  });

  return {
    status: statusNew,
    appointment,
    orgRoles,
    status_legacy: statusOld, // 元データのバックアップ
  };
}

async function main() {
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : backupOnly ? 'BACKUP-ONLY' : 'EXECUTE'}`);
  const snap = await db.collection('USER_LIST').get();
  console.log(`Total: ${snap.size} users`);

  let changed = 0;
  const previews = [];
  const batch = db.batch();
  let inBatch = 0;
  let batchCount = 0;

  for (const doc of snap.docs) {
    const user = doc.data();
    const oldStatus = parseStatus(user.status);
    if (oldStatus.length === 0 && !user.appointment && !Array.isArray(user.orgRoles)) {
      continue;
    }

    const result = migrate(user);

    // 変更があるかチェック
    const statusChanged = JSON.stringify(oldStatus.sort()) !== JSON.stringify(result.status.slice().sort());
    const apChanged = (user.appointment || '') !== result.appointment;
    const orgRolesChanged = JSON.stringify(user.orgRoles || []) !== JSON.stringify(result.orgRoles);

    if (!statusChanged && !apChanged && !orgRolesChanged && !backupOnly) continue;

    changed++;
    previews.push({
      name: user.name || doc.id,
      group: user.group || '',
      old_status: oldStatus,
      new_status: result.status,
      appointment: result.appointment,
      orgRoles_added: result.orgRoles.filter(r => !(user.orgRoles||[]).some(o => o.department===r.department && o.position===r.position)),
    });

    if (!dryRun) {
      const patch = backupOnly
        ? { status_legacy: oldStatus }
        : {
            status: result.status,
            appointment: result.appointment,
            orgRoles: result.orgRoles,
            status_legacy: oldStatus,
          };
      batch.update(doc.ref, patch);
      inBatch++;
      if (inBatch >= 400) {
        await batch.commit();
        batchCount++;
        console.log(`Batch ${batchCount} committed (${inBatch} updates)`);
        inBatch = 0;
      }
    }
  }

  if (!dryRun && inBatch > 0) {
    await batch.commit();
    batchCount++;
    console.log(`Batch ${batchCount} committed (${inBatch} updates)`);
  }

  // プレビュー表示（最初の20件）
  console.log('\n=== Preview (first 20) ===');
  previews.slice(0, 20).forEach(p => {
    console.log(`\n[${p.name}] (${p.group})`);
    console.log(`  status: ${JSON.stringify(p.old_status)} → ${JSON.stringify(p.new_status)}`);
    console.log(`  appointment: '${p.appointment}'`);
    if (p.orgRoles_added.length > 0) {
      console.log(`  orgRoles ++: ${p.orgRoles_added.map(r => `${r.department}/${r.position}`).join(', ')}`);
    }
  });

  console.log(`\nTotal changed: ${changed} / ${snap.size}`);
  if (dryRun) console.log('(DRY-RUN: no writes performed)');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
