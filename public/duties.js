// ── 部門別取決め表（案内/AVS/駐車場/清掃） ──────────────────────────────
// Firestore: DEPT_DUTY
//   dept              : 'annai' | 'avs' | 'parking' | 'cleaning'
//   position          : 部門内ポジションID
//   date              : 'YYYY-MM-DD'
//   meetingType        : 'midweek' | 'weekend'
//   assignee           : 下書き割当者（管理者のみ参照）
//   publishedAssignee  : 公開版割当者（一般成員に表示）
//   publishedAt        : 最終公開日時
//   updatedAt          : Timestamp

const DEPT_CONFIG = {
  annai:    { label: '案内部門', icon: 'door_front', positions: [
    { id: 'hall',     label: '会場案内係' },
    { id: 'entrance', label: '入り口案内係' },
    { id: 'zoom',     label: 'Zoom案内係' },
  ]},
  avs:      { label: 'AVS部門', icon: 'videocam', positions: [
    { id: 'stage', label: 'ステージ' },
    { id: 'audio', label: '音響' },
    { id: 'video', label: 'ビデオ' },
  ]},
  parking:  { label: '駐車場部門', icon: 'local_parking', positions: [
    { id: 'before', label: '集会前' },
    { id: 'after',  label: '集会後' },
  ]},
  cleaning: { label: '清掃部門', icon: 'cleaning_services', mode: 'group', positions: [
    { id: 'group', label: '担当グループ' },
  ]},
  literature: { label: '文書部門', icon: 'menu_book', positions: [
    { id: 'before', label: '集会前' },
    { id: 'after',  label: '集会後' },
  ]},
};
window.DEPT_CONFIG = DEPT_CONFIG;

// 月単位の状態
let _dutyCurDept  = null;
let _dutyCurMonth = null;
let _dutyDocs     = {};        // key → {id, assignee, publishedAssignee, ...}
let _dutyConflicts = {};
let _dutyProgramConflicts = {};
let _dutyCandidatesByPos = {};
let _dutyAllCandidates = [];
let _dutyViewMode = 'draft';   // 'draft' | 'published'

// ── 集会日の自動列挙 ──────────────────────────
async function getMeetingConfig() {
  try {
    if (typeof getAppConfig === 'function') {
      const cfg = await getAppConfig();
      const days = Array.isArray(cfg.meetingDays) && cfg.meetingDays.length > 0
        ? cfg.meetingDays : [4, 0];
      return { midweekDow: days[0], weekendDow: days[1] };
    }
    const snap = await db.collection('CONFIG').doc('meeting_days').get();
    if (snap.exists) {
      const d = snap.data();
      return {
        midweekDow: typeof d.midweekDow === 'number' ? d.midweekDow : 4,
        weekendDow: typeof d.weekendDow === 'number' ? d.weekendDow : 0,
      };
    }
  } catch (e) { /* fallback */ }
  return { midweekDow: 4, weekendDow: 0 };
}

function listMeetingDatesInMonth(year, monthIdx, cfg) {
  const result = [];
  const last = new Date(year, monthIdx + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(year, monthIdx, d);
    const dow = dt.getDay();
    if (dow === cfg.midweekDow) result.push({ date: dt, type: 'midweek' });
    if (dow === cfg.weekendDow) result.push({ date: dt, type: 'weekend' });
  }
  result.sort((a, b) => a.date - b.date);
  return result;
}

function fmtYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtMonthLabel(dt) {
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月`;
}

const DUTY_DOW_JP = ['日','月','火','水','木','金','土'];

// ── データロード ──────────────────────────
async function loadDeptDuties(dept, monthDate) {
  try {
    const start = fmtYmd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
    const end   = fmtYmd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
    const snap = await db.collection('DEPT_DUTY')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();
    const map = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (d.dept !== dept) return;
      map[`${d.dept}_${d.position}_${d.date}`] = { id: doc.id, ...d };
    });
    return map;
  } catch (e) {
    console.warn('loadDeptDuties error:', e);
    return {};
  }
}

// ── 衝突チェック：他部門 ──────────────────────────
async function loadOtherDeptConflicts(currentDept, monthDate) {
  const conflicts = {};
  try {
    const start = fmtYmd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
    const end   = fmtYmd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
    const snap = await db.collection('DEPT_DUTY')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.assignee || d.dept === currentDept) return;
      const key = `${d.assignee}_${d.date}`;
      if (!conflicts[key]) conflicts[key] = [];
      const posDef = DEPT_CONFIG[d.dept]?.positions.find(p => p.id === d.position);
      conflicts[key].push({
        dept: d.dept,
        deptLabel: DEPT_CONFIG[d.dept]?.label || d.dept,
        position: d.position,
        posLabel: posDef?.label || d.position,
      });
    });
  } catch (e) {
    console.warn('loadOtherDeptConflicts error:', e);
  }
  return conflicts;
}

// ── 衝突チェック：プログラム（assignmentHistory） ──────────────────────────
let _dutyCodeLabels = null; // assignmentCodes のキャッシュ

async function loadAssignmentCodeLabels() {
  if (_dutyCodeLabels) return _dutyCodeLabels;
  try {
    const snap = await db.collection('assignmentCodes').get();
    _dutyCodeLabels = {};
    snap.docs.forEach(d => { _dutyCodeLabels[d.data().code] = d.data().label; });
  } catch (e) {
    console.warn('assignmentCodes読込エラー:', e);
    _dutyCodeLabels = {};
  }
  return _dutyCodeLabels;
}

async function loadProgramConflicts(monthDate) {
  const conflicts = {}; // key=`${name}_${date}` → [{code, label}]
  try {
    const codeLabels = await loadAssignmentCodeLabels();
    const startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
    const snap = await db.collection('assignmentHistory')
      .where('date', '>=', firebase.firestore.Timestamp.fromDate(startDate))
      .where('date', '<', firebase.firestore.Timestamp.fromDate(endDate))
      .get();
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.memberName) return;
      const dt = d.date.toDate();
      const ymd = fmtYmd(dt);
      const key = `${d.memberName}_${ymd}`;
      if (!conflicts[key]) conflicts[key] = [];
      const code = d.code || '';
      const label = codeLabels[code] || code || '担当あり';
      conflicts[key].push({ code, label });
    });
  } catch (e) {
    console.warn('プログラム衝突チェックエラー:', e);
  }
  return conflicts;
}

// ── 候補者ロード ──────────────────────────
async function loadDutyCandidates(dept) {
  const cfg = DEPT_CONFIG[dept];
  if (!cfg) return;
  const allUsers = await getUserListCached();
  _dutyCandidatesByPos = {};
  for (const pos of cfg.positions) {
    _dutyCandidatesByPos[pos.id] = [];
  }

  if (cfg.mode === 'group') {
    const groups = [...new Set(allUsers.map(u => u.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    for (const pos of cfg.positions) { _dutyCandidatesByPos[pos.id] = groups; }
    _dutyAllCandidates = groups;
    return;
  }

  allUsers.forEach(u => {
    if (!u.name) return;
    const dp = (u.deptPositions && typeof u.deptPositions === 'object') ? u.deptPositions : {};
    const posArr = Array.isArray(dp[dept]) ? dp[dept] : [];
    if (posArr.length > 0) {
      for (const posId of posArr) {
        if (_dutyCandidatesByPos[posId]) _dutyCandidatesByPos[posId].push(u.name);
      }
    } else if (dp[dept] !== undefined || (Array.isArray(u.departments) && u.departments.includes(dept))) {
      for (const pos of cfg.positions) { _dutyCandidatesByPos[pos.id].push(u.name); }
    }
  });

  _dutyAllCandidates = allUsers.filter(u => u.name).map(u => u.name)
    .sort((a, b) => a.localeCompare(b, 'ja'));
  for (const pos of cfg.positions) {
    if (_dutyCandidatesByPos[pos.id].length === 0) {
      _dutyCandidatesByPos[pos.id] = [..._dutyAllCandidates];
    } else {
      _dutyCandidatesByPos[pos.id].sort((a, b) => a.localeCompare(b, 'ja'));
    }
  }
}

// ── 衝突情報 ──────────────────────────
function getConflictInfo(name, ymd, currentDept) {
  const warnings = [];
  const deptKey = `${name}_${ymd}`;
  if (_dutyConflicts[deptKey]) {
    for (const c of _dutyConflicts[deptKey]) {
      warnings.push({ type: 'dept', text: `${c.deptLabel}（${c.posLabel}）と重複` });
    }
  }
  if (_dutyProgramConflicts[deptKey]) {
    const progs = _dutyProgramConflicts[deptKey];
    const labels = progs.map(p => p.label).join('、');
    warnings.push({ type: 'program', text: labels });
  }
  return warnings;
}

// ── 自動生成アルゴリズム（負荷均等） ──────────────────────────
async function autoGenerateDeptSchedule(dept, dates) {
  const cfg = DEPT_CONFIG[dept];
  if (!cfg) return {};
  const allUsers = await getUserListCached();

  if (cfg.mode === 'group') {
    const groups = [...new Set(allUsers.map(u => u.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    if (groups.length === 0) return {};
    const result = {};
    let gi = 0;
    for (const { date } of dates) {
      const ymd = fmtYmd(date);
      for (const pos of cfg.positions) {
        result[`${dept}_${pos.id}_${ymd}`] = { dept, position: pos.id, date: ymd, assignee: groups[gi % groups.length] };
      }
      gi++;
    }
    return result;
  }

  const candidatesByPos = {};
  for (const pos of cfg.positions) { candidatesByPos[pos.id] = []; }
  allUsers.forEach(u => {
    if (!u.name) return;
    const dp = (u.deptPositions && typeof u.deptPositions === 'object') ? u.deptPositions : {};
    const posArr = Array.isArray(dp[dept]) ? dp[dept] : [];
    if (posArr.length > 0) {
      for (const posId of posArr) { if (candidatesByPos[posId]) candidatesByPos[posId].push(u.name); }
    } else if (dp[dept] !== undefined || (Array.isArray(u.departments) && u.departments.includes(dept))) {
      for (const pos of cfg.positions) { candidatesByPos[pos.id].push(u.name); }
    }
  });

  const loadCount = {};
  const allNames = new Set();
  Object.values(candidatesByPos).forEach(arr => arr.forEach(n => allNames.add(n)));
  allNames.forEach(n => { loadCount[n] = 0; });

  const result = {};
  for (const { date } of dates) {
    const ymd = fmtYmd(date);
    const usedThisDay = new Set();
    const sortedPositions = [...cfg.positions].sort((a, b) =>
      (candidatesByPos[a.id]?.length || 0) - (candidatesByPos[b.id]?.length || 0)
    );
    for (const pos of sortedPositions) {
      const candidates = candidatesByPos[pos.id];
      if (candidates.length === 0) continue;
      const available = candidates.filter(n => !usedThisDay.has(n))
        .sort((a, b) => (loadCount[a] || 0) - (loadCount[b] || 0));
      const pick = available.length > 0 ? available[0] : candidates[0];
      result[`${dept}_${pos.id}_${ymd}`] = { dept, position: pos.id, date: ymd, assignee: pick };
      usedThisDay.add(pick);
      loadCount[pick] = (loadCount[pick] || 0) + 1;
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// ── 管理画面：部門ページ描画 ──────────────────────────
// ══════════════════════════════════════════════════════════════

async function openDeptAdmin(dept) {
  _dutyCurDept = dept;
  _dutyViewMode = 'draft';
  if (!_dutyCurMonth) _dutyCurMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  navigate(`admin-dept-${dept}`);
  await renderDeptAdmin();
}
window.openDeptAdmin = openDeptAdmin;

function switchDutyView(mode) {
  _dutyViewMode = mode;
  renderDeptAdmin();
}
window.switchDutyView = switchDutyView;

async function renderDeptAdmin() {
  const dept = _dutyCurDept;
  const cfg = DEPT_CONFIG[dept];
  const container = document.getElementById(`dept-${dept}-body`);
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const monthDate = _dutyCurMonth;
    const monthLabel = fmtMonthLabel(monthDate);
    const meetCfg = await getMeetingConfig();
    const dates = listMeetingDatesInMonth(monthDate.getFullYear(), monthDate.getMonth(), meetCfg);

    let dutyDocs = {}, otherConflicts = {}, progConflicts = {};
    try {
      [dutyDocs, otherConflicts, progConflicts] = await Promise.all([
        loadDeptDuties(dept, monthDate),
        loadOtherDeptConflicts(dept, monthDate),
        loadProgramConflicts(monthDate),
      ]);
    } catch (e) {
      console.warn('データロードエラー:', e);
      try { dutyDocs = await loadDeptDuties(dept, monthDate); } catch (e2) {}
    }
    _dutyDocs = dutyDocs;
    _dutyConflicts = otherConflicts;
    _dutyProgramConflicts = progConflicts;
    await loadDutyCandidates(dept);

    // 未公開の変更があるか判定
    let hasUnpublished = false;
    Object.values(_dutyDocs).forEach(d => {
      const draft = d.assignee || '';
      const pub   = d.publishedAssignee || '';
      if (draft !== pub) hasUnpublished = true;
    });
    // 下書きにあって公開されてないものもチェック（新規ドキュメント）
    Object.values(_dutyDocs).forEach(d => {
      if (d.assignee && !d.publishedAssignee) hasUnpublished = true;
    });

    const isDraft = _dutyViewMode === 'draft';

    // 月切替UI
    let html = `
      <div class="duty-month-nav">
        <button class="icon-btn" onclick="changeDutyMonth(-1)" title="前月"><span class="material-icons">chevron_left</span></button>
        <span class="duty-month-label">${esc(monthLabel)}</span>
        <button class="icon-btn" onclick="changeDutyMonth(1)" title="次月"><span class="material-icons">chevron_right</span></button>
        <button class="icon-btn" onclick="changeDutyMonth(0)" title="今月"><span class="material-icons">today</span></button>
      </div>
    `;

    // タブ切替
    html += `<div class="duty-tabs">
      <button class="duty-tab ${isDraft ? 'duty-tab-active' : ''}" onclick="switchDutyView('draft')">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">edit</span> 下書き
        ${hasUnpublished ? '<span class="duty-unpub-badge">未公開の変更あり</span>' : ''}
      </button>
      <button class="duty-tab ${!isDraft ? 'duty-tab-active' : ''}" onclick="switchDutyView('published')">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">visibility</span> 公開中
      </button>
      ${isDraft && hasUnpublished ? `<button class="btn-primary duty-publish-btn" onclick="publishDeptDuties()">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">publish</span> 公開する
      </button>` : ''}
    </div>`;

    if (dates.length === 0) {
      html += '<div class="empty-state">この月の集会日はありません</div>';
      container.innerHTML = html;
      return;
    }

    if (isDraft) {
      html += renderDraftTable(dept, cfg, dates);
    } else {
      html += renderPublishedTable(dept, cfg, dates);
    }

    container.innerHTML = html;

    // 下書きモードのイベント設定は不要（onchangeはinline）
  } catch (e) {
    console.error('renderDeptAdmin error:', e);
    container.innerHTML = `<div class="loading">エラーが発生しました: ${esc(e.message)}</div>`;
  }
}
window.renderDeptAdmin = renderDeptAdmin;

// ── 下書きテーブル（編集可能） ──────────────────────────
function renderDraftTable(dept, cfg, dates) {
  let html = '';

  // 自動生成・クリアボタン
  html += `<div class="duty-gen-bar">
    <button class="btn-secondary duty-gen-btn" onclick="autoGenDuty()">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">auto_fix_high</span> 自動生成
    </button>
    <button class="btn-secondary duty-clear-btn" onclick="clearDutyAll()">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">clear_all</span> 全クリア
    </button>
    <div class="duty-legend">
      <span class="duty-legend-item"><span class="duty-warn-dot duty-warn-dept"></span>他部門重複</span>
      <span class="duty-legend-item"><span class="duty-warn-dot duty-warn-prog"></span>プログラム担当</span>
    </div>
  </div>`;

  // テーブル
  html += '<div class="duty-table-wrap"><table class="duty-table"><thead><tr>';
  html += '<th class="duty-date-col">日付</th>';
  cfg.positions.forEach(p => { html += `<th>${esc(p.label)}</th>`; });
  html += '</tr></thead><tbody>';

  for (const { date, type } of dates) {
    const ymd = fmtYmd(date);
    const dowJp = DUTY_DOW_JP[date.getDay()];
    const typeLabel = type === 'midweek' ? '週中' : '週末';
    const typeClass = type === 'midweek' ? 'duty-midweek' : 'duty-weekend';
    html += `<tr><td class="duty-date-cell ${typeClass}">
      <div class="duty-date-main">${date.getMonth()+1}/${date.getDate()}（${dowJp}）</div>
      <div class="duty-date-sub">${typeLabel}</div>
    </td>`;

    const usedThisDay = new Set();
    cfg.positions.forEach(p => {
      const key = `${dept}_${p.id}_${ymd}`;
      const cur = _dutyDocs[key]?.assignee || '';
      if (cur) usedThisDay.add(cur);
    });

    cfg.positions.forEach(p => {
      const key = `${dept}_${p.id}_${ymd}`;
      const cur = _dutyDocs[key]?.assignee || '';
      const pub = _dutyDocs[key]?.publishedAssignee || '';
      const changed = cur !== pub;
      const warnings = cur ? getConflictInfo(cur, ymd, dept) : [];
      const warnClass = warnings.some(w => w.type === 'program') ? 'duty-cell-warn-prog'
        : warnings.some(w => w.type === 'dept') ? 'duty-cell-warn-dept' : '';
      const warnTitle = warnings.map(w => w.text).join('\n');

      const candidates = _dutyCandidatesByPos[p.id] || [];
      const othersUsed = new Set(usedThisDay);
      othersUsed.delete(cur);
      let optHtml = '<option value="">— 未割当 —</option>';
      candidates.forEach(name => {
        if (othersUsed.has(name)) return;
        const selected = name === cur ? ' selected' : '';
        const cWarns = getConflictInfo(name, ymd, dept);
        const mark = cWarns.some(w => w.type === 'program') ? ' ⚠'
          : cWarns.some(w => w.type === 'dept') ? ' ○' : '';
        optHtml += `<option value="${esc(name)}"${selected}>${esc(name)}${mark}</option>`;
      });
      if (cur && !candidates.includes(cur)) {
        optHtml += `<option value="${esc(cur)}" selected>${esc(cur)}</option>`;
      }

      const changedMark = changed ? '<span class="duty-changed-dot" title="未公開の変更"></span>' : '';

      html += `<td class="${warnClass}" ${warnTitle ? `title="${esc(warnTitle)}"` : ''}>
        <div class="duty-cell-inner">
          ${changedMark}
          <select class="duty-select ${warnClass ? 'duty-input-warn' : ''}"
            data-key="${key}" data-dept="${dept}" data-pos="${p.id}" data-date="${ymd}" data-type="${type}"
            onchange="onDutySelectChange(this)">
            ${optHtml}
          </select>
        </div>
        ${warnings.length > 0 ? `<div class="duty-warn-badges">${warnings.map(w =>
          `<span class="duty-warn-badge ${w.type === 'program' ? 'duty-warn-prog-badge' : 'duty-warn-dept-badge'}">${esc(w.text)}</span>`
        ).join('')}</div>` : ''}
      </td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  html += `<div class="duty-actions">
    <button class="btn-primary" onclick="saveDeptDuties()">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">save</span> 保存（下書き）
    </button>
  </div>`;

  return html;
}

// ── 公開中テーブル（読み取り専用） ──────────────────────────
function renderPublishedTable(dept, cfg, dates) {
  let html = '';
  let hasAnyPublished = false;

  html += '<div class="duty-table-wrap"><table class="duty-table"><thead><tr>';
  html += '<th class="duty-date-col">日付</th>';
  cfg.positions.forEach(p => { html += `<th>${esc(p.label)}</th>`; });
  html += '</tr></thead><tbody>';

  for (const { date, type } of dates) {
    const ymd = fmtYmd(date);
    const dowJp = DUTY_DOW_JP[date.getDay()];
    const typeLabel = type === 'midweek' ? '週中' : '週末';
    const typeClass = type === 'midweek' ? 'duty-midweek' : 'duty-weekend';
    html += `<tr><td class="duty-date-cell ${typeClass}">
      <div class="duty-date-main">${date.getMonth()+1}/${date.getDate()}（${dowJp}）</div>
      <div class="duty-date-sub">${typeLabel}</div>
    </td>`;
    cfg.positions.forEach(p => {
      const key = `${dept}_${p.id}_${ymd}`;
      const pub = _dutyDocs[key]?.publishedAssignee || '';
      if (pub) hasAnyPublished = true;
      html += `<td class="duty-pub-cell">${pub ? esc(pub) : '<span class="duty-pub-empty">—</span>'}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  if (!hasAnyPublished) {
    html = '<div class="duty-pub-notice"><span class="material-icons">info</span> まだ公開されていません。下書きタブで編集し「公開する」を押してください。</div>' + html;
  }

  return html;
}

// ── select変更時 ──────────────────────────
function onDutySelectChange(sel) {
  const name = sel.value;
  const ymd = sel.dataset.date;
  const td = sel.closest('td');

  const oldBadges = td.querySelector('.duty-warn-badges');
  if (oldBadges) oldBadges.remove();
  td.className = '';
  sel.classList.remove('duty-input-warn');

  if (name) {
    const warnings = getConflictInfo(name, ymd, _dutyCurDept);
    if (warnings.length > 0) {
      const warnClass = warnings.some(w => w.type === 'program') ? 'duty-cell-warn-prog' : 'duty-cell-warn-dept';
      td.className = warnClass;
      sel.classList.add('duty-input-warn');
      td.title = warnings.map(w => w.text).join('\n');
      const badgeHtml = warnings.map(w =>
        `<span class="duty-warn-badge ${w.type === 'program' ? 'duty-warn-prog-badge' : 'duty-warn-dept-badge'}">${esc(w.text)}</span>`
      ).join('');
      td.insertAdjacentHTML('beforeend', `<div class="duty-warn-badges">${badgeHtml}</div>`);
    } else {
      td.title = '';
    }
  }

  // 同一日の全selectを再構築
  const dept = _dutyCurDept;
  const container = document.getElementById(`dept-${dept}-body`);
  if (!container) return;

  const sameDateSels = container.querySelectorAll(`.duty-select[data-date="${ymd}"]`);
  const usedMap = {};
  sameDateSels.forEach(s => { if (s.value) usedMap[s.dataset.pos] = s.value; });

  sameDateSels.forEach(s => {
    if (s === sel) return;
    const posId = s.dataset.pos;
    const currentVal = s.value;
    const candidates = _dutyCandidatesByPos[posId] || [];
    const othersUsed = new Set();
    Object.entries(usedMap).forEach(([p, n]) => { if (p !== posId) othersUsed.add(n); });

    let optHtml = '<option value="">— 未割当 —</option>';
    candidates.forEach(n => {
      if (othersUsed.has(n)) return;
      const selected = n === currentVal ? ' selected' : '';
      const cWarns = getConflictInfo(n, ymd, dept);
      const mark = cWarns.some(w => w.type === 'program') ? ' ⚠'
        : cWarns.some(w => w.type === 'dept') ? ' ○' : '';
      optHtml += `<option value="${esc(n)}"${selected}>${esc(n)}${mark}</option>`;
    });
    if (currentVal && !candidates.includes(currentVal)) {
      optHtml += `<option value="${esc(currentVal)}" selected>${esc(currentVal)}</option>`;
    }
    s.innerHTML = optHtml;

    const sTd = s.closest('td');
    const sBadges = sTd.querySelector('.duty-warn-badges');
    if (sBadges) sBadges.remove();
    sTd.className = '';
    s.classList.remove('duty-input-warn');
    if (currentVal) {
      const sWarns = getConflictInfo(currentVal, ymd, dept);
      if (sWarns.length > 0) {
        const wc = sWarns.some(w => w.type === 'program') ? 'duty-cell-warn-prog' : 'duty-cell-warn-dept';
        sTd.className = wc;
        s.classList.add('duty-input-warn');
        sTd.title = sWarns.map(w => w.text).join('\n');
        sTd.insertAdjacentHTML('beforeend', `<div class="duty-warn-badges">${sWarns.map(w =>
          `<span class="duty-warn-badge ${w.type === 'program' ? 'duty-warn-prog-badge' : 'duty-warn-dept-badge'}">${esc(w.text)}</span>`
        ).join('')}</div>`);
      } else {
        sTd.title = '';
      }
    }
  });
}
window.onDutySelectChange = onDutySelectChange;

// ── 自動生成実行 ──────────────────────────
async function autoGenDuty() {
  const dept = _dutyCurDept;
  const container = document.getElementById(`dept-${dept}-body`);
  if (!container) return;

  const existingSelects = container.querySelectorAll('.duty-select');
  const hasData = [...existingSelects].some(sel => sel.value !== '');
  if (hasData) {
    if (!(await customConfirm('既存の割当がクリアされ、自動生成で上書きされます。よろしいですか？'))) return;
  }

  const meetCfg = await getMeetingConfig();
  const dates = listMeetingDatesInMonth(_dutyCurMonth.getFullYear(), _dutyCurMonth.getMonth(), meetCfg);
  const generated = await autoGenerateDeptSchedule(dept, dates);

  const dateGroups = {};
  existingSelects.forEach(sel => {
    const ymd = sel.dataset.date;
    if (!dateGroups[ymd]) dateGroups[ymd] = [];
    dateGroups[ymd].push(sel);
  });

  Object.entries(dateGroups).forEach(([ymd, sels]) => {
    sels.forEach(sel => {
      const key = sel.dataset.key;
      const entry = generated[key];
      sel.value = entry ? entry.assignee : '';
    });
    if (sels.length > 0) onDutySelectChange(sels[sels.length - 1]);
  });
}
window.autoGenDuty = autoGenDuty;

// ── 全クリア ──────────────────────────
async function clearDutyAll() {
  if (!(await customConfirm('全ての割当をクリアしますか？（保存するまでFirestoreには反映されません）'))) return;
  const dept = _dutyCurDept;
  const container = document.getElementById(`dept-${dept}-body`);
  if (!container) return;
  container.querySelectorAll('.duty-select').forEach(sel => {
    sel.value = '';
    onDutySelectChange(sel);
  });
}
window.clearDutyAll = clearDutyAll;

function changeDutyMonth(delta) {
  if (delta === 0) {
    const now = new Date();
    _dutyCurMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    _dutyCurMonth = new Date(_dutyCurMonth.getFullYear(), _dutyCurMonth.getMonth() + delta, 1);
  }
  renderDeptAdmin();
}
window.changeDutyMonth = changeDutyMonth;

// ── 保存（下書き） ──────────────────────────
async function saveDeptDuties() {
  const dept = _dutyCurDept;
  const inputs = document.querySelectorAll(`#dept-${dept}-body .duty-select`);
  const batch = db.batch();
  let writes = 0;
  for (const inp of inputs) {
    const key  = inp.dataset.key;
    const pos  = inp.dataset.pos;
    const date = inp.dataset.date;
    const type = inp.dataset.type;
    const val  = inp.value.trim();
    const existing = _dutyDocs[key];
    if (existing) {
      if ((existing.assignee || '') === val) continue;
      if (val === '') {
        // 公開版もなければ削除、あれば assignee だけクリア
        if (!existing.publishedAssignee) {
          batch.delete(db.collection('DEPT_DUTY').doc(existing.id));
        } else {
          batch.update(db.collection('DEPT_DUTY').doc(existing.id), {
            assignee: '',
            updatedAt: firebase.firestore.Timestamp.now(),
          });
        }
        writes++;
      } else {
        batch.update(db.collection('DEPT_DUTY').doc(existing.id), {
          assignee: val,
          updatedAt: firebase.firestore.Timestamp.now(),
        });
        writes++;
      }
    } else if (val !== '') {
      const ref = db.collection('DEPT_DUTY').doc();
      batch.set(ref, {
        dept, position: pos, date, meetingType: type,
        assignee: val,
        publishedAssignee: '',
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      writes++;
    }
  }
  if (writes === 0) {
    alert('変更がありません');
    return;
  }
  try {
    await batch.commit();
    alert(`${writes}件保存しました（下書き）`);
    await renderDeptAdmin();
  } catch (e) {
    alert('保存エラー: ' + e.message);
  }
}
window.saveDeptDuties = saveDeptDuties;

// ── 公開（下書き → 公開版に反映） ──────────────────────────
async function publishDeptDuties() {
  if (!(await customConfirm('下書きの内容で公開しますか？\n一般成員に表示されます。'))) return;

  const dept = _dutyCurDept;
  const monthDate = _dutyCurMonth;

  // まず下書きを保存（未保存の変更がある場合に備えて）
  const container = document.getElementById(`dept-${dept}-body`);
  const selects = container?.querySelectorAll('.duty-select');
  if (selects && selects.length > 0) {
    const saveBatch = db.batch();
    let saveWrites = 0;
    for (const inp of selects) {
      const key  = inp.dataset.key;
      const pos  = inp.dataset.pos;
      const date = inp.dataset.date;
      const type = inp.dataset.type;
      const val  = inp.value.trim();
      const existing = _dutyDocs[key];
      if (existing) {
        if ((existing.assignee || '') !== val) {
          if (val === '' && !existing.publishedAssignee) {
            saveBatch.delete(db.collection('DEPT_DUTY').doc(existing.id));
          } else {
            saveBatch.update(db.collection('DEPT_DUTY').doc(existing.id), {
              assignee: val,
              updatedAt: firebase.firestore.Timestamp.now(),
            });
          }
          saveWrites++;
        }
      } else if (val !== '') {
        const ref = db.collection('DEPT_DUTY').doc();
        saveBatch.set(ref, {
          dept, position: pos, date, meetingType: type,
          assignee: val,
          publishedAssignee: '',
          updatedAt: firebase.firestore.Timestamp.now(),
        });
        saveWrites++;
      }
    }
    if (saveWrites > 0) await saveBatch.commit();
  }

  // 最新データを再読込
  const dutyDocs = await loadDeptDuties(dept, monthDate);

  // publishedAssignee を assignee で上書き
  const pubBatch = db.batch();
  let pubWrites = 0;
  const now = firebase.firestore.Timestamp.now();

  Object.values(dutyDocs).forEach(d => {
    const draft = d.assignee || '';
    const pub   = d.publishedAssignee || '';
    if (draft !== pub) {
      pubBatch.update(db.collection('DEPT_DUTY').doc(d.id), {
        publishedAssignee: draft,
        publishedAt: now,
      });
      pubWrites++;
    }
  });

  if (pubWrites === 0) {
    alert('公開する変更はありません');
    return;
  }

  try {
    await pubBatch.commit();
    alert(`${pubWrites}件を公開しました`);
    _dutyViewMode = 'published';
    await renderDeptAdmin();
  } catch (e) {
    alert('公開エラー: ' + e.message);
  }
}
window.publishDeptDuties = publishDeptDuties;

// ── 管理ホームのリンク ──────────────────────────
document.getElementById('admin-manage-dept-annai')?.addEventListener('click', () => openDeptAdmin('annai'));
document.getElementById('admin-manage-dept-avs')?.addEventListener('click', () => openDeptAdmin('avs'));
document.getElementById('admin-manage-dept-parking')?.addEventListener('click', () => openDeptAdmin('parking'));
document.getElementById('admin-manage-dept-cleaning')?.addEventListener('click', () => openDeptAdmin('cleaning'));
document.getElementById('admin-manage-dept-literature')?.addEventListener('click', () => openDeptAdmin('literature'));

// ══════════════════════════════════════════════════════════════
// ── ユーザー側表示（publishedAssignee のみ表示） ─────────────
// ══════════════════════════════════════════════════════════════

async function loadUserDuties(targetElId = 'shukai-duties', deptFilter = null) {
  const el = document.getElementById(targetElId);
  if (!el) return;
  el.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const cfg = await getMeetingConfig();
    const upcoming = [];
    for (let i = 0; i < 30; i++) {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const dow = dt.getDay();
      if (dow === cfg.midweekDow) upcoming.push({ date: dt, type: 'midweek' });
      if (dow === cfg.weekendDow) upcoming.push({ date: dt, type: 'weekend' });
      if (upcoming.length >= 4) break;
    }
    if (upcoming.length === 0) { el.innerHTML = '<div class="empty-state">集会日がありません</div>'; return; }

    const startYmd = fmtYmd(upcoming[0].date);
    const endYmd   = fmtYmd(upcoming[upcoming.length - 1].date);
    const snap = await db.collection('DEPT_DUTY')
      .where('date', '>=', startYmd)
      .where('date', '<=', endYmd)
      .get();
    const map = {};
    snap.forEach(doc => {
      const d = doc.data();
      // ユーザー側は公開版のみ表示
      const name = d.publishedAssignee || '';
      if (!name) return;
      (map[d.date] ||= {})[`${d.dept}_${d.position}`] = name;
    });

    let html = '';
    for (const { date, type } of upcoming) {
      const ymd = fmtYmd(date);
      const dowJp = DUTY_DOW_JP[date.getDay()];
      const typeLabel = type === 'midweek' ? '週中の集会' : '週末の集会';
      const typeClass = type === 'midweek' ? 'duty-midweek' : 'duty-weekend';
      let dayHtml = `<div class="duty-day-card">
        <div class="duty-day-header ${typeClass}">
          <span class="duty-day-date">${date.getMonth()+1}/${date.getDate()}（${dowJp}）</span>
          <span class="duty-day-type">${typeLabel}</span>
        </div>
        <div class="duty-day-body">`;
      let hasAny = false;
      const entries = deptFilter
        ? Object.entries(DEPT_CONFIG).filter(([id]) => id === deptFilter)
        : Object.entries(DEPT_CONFIG);
      for (const [deptId, deptCfg] of entries) {
        const rows = deptCfg.positions.map(p => {
          const val = map[ymd]?.[`${deptId}_${p.id}`] || '';
          if (!val) return '';
          return `<div class="duty-row"><span class="duty-pos">${esc(p.label)}</span><span class="duty-assignee">${esc(val)}</span></div>`;
        }).filter(Boolean).join('');
        if (rows) {
          hasAny = true;
          dayHtml += `<div class="duty-dept-section">
            <div class="duty-dept-label"><span class="material-icons" style="font-size:14px;vertical-align:middle">${deptCfg.icon}</span> ${esc(deptCfg.label)}</div>
            ${rows}
          </div>`;
        }
      }
      if (!hasAny) {
        dayHtml += '<div class="duty-empty-day">— 未定 —</div>';
      }
      dayHtml += '</div></div>';
      html += dayHtml;
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}
window.loadUserDuties = loadUserDuties;

// navigateフック
(function hookShukaiPage() {
  const _orig = window.navigate;
  if (typeof _orig !== 'function') {
    document.addEventListener('DOMContentLoaded', hookShukaiPage);
    return;
  }
  window.navigate = function(page) {
    const r = _orig.apply(this, arguments);
    if (page === 'bumon')   loadUserDuties('bumon-duties');
    if (page && page.startsWith('user-dept-')) {
      const dept = page.replace('user-dept-', '');
      if (DEPT_CONFIG[dept]) loadUserDuties(`user-dept-${dept}-body`, dept);
    }
    if (page && page.startsWith('admin-dept-')) {
      const dept = page.replace('admin-dept-', '');
      if (DEPT_CONFIG[dept]) {
        _dutyCurDept = dept;
        if (!_dutyCurMonth) _dutyCurMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        renderDeptAdmin();
      }
    }
    return r;
  };
})();
