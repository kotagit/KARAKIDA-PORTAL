// ── 部門別取決め表（案内/AVS/駐車場/清掃） ──────────────────────────────
// Firestore: DEPT_DUTY
//   dept       : 'annai' | 'avs' | 'parking' | 'cleaning'
//   position   : 部門内ポジションID
//   date       : 'YYYY-MM-DD'
//   meetingType: 'midweek' | 'weekend'
//   assignee   : 個人名 / グループ名（清掃）
//   updatedAt  : Timestamp

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
};
window.DEPT_CONFIG = DEPT_CONFIG;

// 月単位の状態
let _dutyCurDept  = null;      // 'annai'|'avs'|'parking'|'cleaning'
let _dutyCurMonth = null;      // Date(月の1日)
let _dutyDocs     = {};        // key=`${dept}_${position}_${date}` → docId

// ── 集会日の自動列挙 ──────────────────────────
// 既定: 木曜=週中, 日曜=週末。設定がFirestoreにあれば上書き
async function getMeetingConfig() {
  try {
    const snap = await db.collection('CONFIG').doc('meeting_days').get();
    if (snap.exists) {
      const d = snap.data();
      return {
        midweekDow: typeof d.midweekDow === 'number' ? d.midweekDow : 4, // 木
        weekendDow: typeof d.weekendDow === 'number' ? d.weekendDow : 0, // 日
      };
    }
  } catch (e) { /* fallback */ }
  return { midweekDow: 4, weekendDow: 0 };
}

function listMeetingDatesInMonth(year, monthIdx, cfg) {
  // monthIdx: 0-11
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
  const start = fmtYmd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
  const end   = fmtYmd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
  const snap = await db.collection('DEPT_DUTY')
    .where('dept', '==', dept)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();
  const map = {};
  snap.forEach(doc => {
    const d = doc.data();
    map[`${d.dept}_${d.position}_${d.date}`] = { id: doc.id, ...d };
  });
  return map;
}

// ── 管理画面：部門ページ描画 ──────────────────────────
async function openDeptAdmin(dept) {
  _dutyCurDept = dept;
  if (!_dutyCurMonth) _dutyCurMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  navigate(`admin-dept-${dept}`);
  await renderDeptAdmin();
}
window.openDeptAdmin = openDeptAdmin;

async function renderDeptAdmin() {
  const dept = _dutyCurDept;
  const cfg = DEPT_CONFIG[dept];
  const container = document.getElementById(`dept-${dept}-body`);
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  const monthDate = _dutyCurMonth;
  const monthLabel = fmtMonthLabel(monthDate);
  const meetCfg = await getMeetingConfig();
  const dates = listMeetingDatesInMonth(monthDate.getFullYear(), monthDate.getMonth(), meetCfg);
  _dutyDocs = await loadDeptDuties(dept, monthDate);

  // 月切替UI + テーブル
  let html = `
    <div class="duty-month-nav">
      <button class="icon-btn" onclick="changeDutyMonth(-1)" title="前月"><span class="material-icons">chevron_left</span></button>
      <span class="duty-month-label">${esc(monthLabel)}</span>
      <button class="icon-btn" onclick="changeDutyMonth(1)" title="次月"><span class="material-icons">chevron_right</span></button>
      <button class="icon-btn" onclick="changeDutyMonth(0)" title="今月"><span class="material-icons">today</span></button>
    </div>
  `;

  if (dates.length === 0) {
    html += '<div class="empty-state">この月の集会日はありません</div>';
    container.innerHTML = html;
    return;
  }

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
      const cur = _dutyDocs[key]?.assignee || '';
      html += `<td><input type="text" class="duty-input"
        data-key="${key}" data-dept="${dept}" data-pos="${p.id}" data-date="${ymd}" data-type="${type}"
        value="${esc(cur)}" placeholder="${cfg.mode==='group'?'グループ名':'氏名'}" /></td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  html += `<div class="duty-actions">
    <button class="btn-primary" onclick="saveDeptDuties()">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">save</span> 保存
    </button>
    <button class="btn-secondary" onclick="openDutyMemberPicker()" id="duty-pick-btn">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">person_search</span> 成員から選択
    </button>
  </div>`;

  container.innerHTML = html;

  // 入力フィールドフォーカス時にピッカーを開けるよう、最後にフォーカスされた要素を記憶
  container.querySelectorAll('.duty-input').forEach(inp => {
    inp.addEventListener('focus', () => { container._lastDutyInput = inp; });
    inp.addEventListener('dblclick', () => { container._lastDutyInput = inp; openDutyMemberPicker(); });
  });
}
window.renderDeptAdmin = renderDeptAdmin;

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

// ── 保存（一括） ──────────────────────────
async function saveDeptDuties() {
  const dept = _dutyCurDept;
  const inputs = document.querySelectorAll(`#dept-${dept}-body .duty-input`);
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
        batch.delete(db.collection('DEPT_DUTY').doc(existing.id));
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
    alert(`${writes}件保存しました`);
    await renderDeptAdmin();
  } catch (e) {
    alert('保存エラー: ' + e.message);
  }
}
window.saveDeptDuties = saveDeptDuties;

// ── 成員ピッカー ──────────────────────────
async function openDutyMemberPicker() {
  const dept = _dutyCurDept;
  const container = document.getElementById(`dept-${dept}-body`);
  const target = container?._lastDutyInput;
  if (!target) {
    alert('先に入力欄をクリックしてから「成員から選択」を押してください');
    return;
  }
  const modal = document.getElementById('duty-picker-modal');
  const list = document.getElementById('duty-picker-list');
  const isGroupMode = DEPT_CONFIG[dept].mode === 'group';
  document.getElementById('duty-picker-title').textContent =
    isGroupMode ? 'グループを選択' : '成員を選択';

  list.innerHTML = '<div class="loading">読み込み中...</div>';
  modal.classList.remove('hidden');

  try {
    if (isGroupMode) {
      // グループ一覧
      const all = await getUserListCached();
      const groups = [...new Set(all.map(m => m.group).filter(Boolean))].sort();
      list.innerHTML = groups.map(g =>
        `<div class="duty-picker-item" onclick="selectDutyValue('${esc(g).replace(/'/g,"\\'")}')">${esc(g)}</div>`
      ).join('');
    } else {
      const all = await getUserListCached();
      const members = all
        .filter(m => m.name)
        .sort((a, b) => (a.group || 'zzz').localeCompare(b.group || 'zzz', 'ja')
          || a.name.localeCompare(b.name, 'ja'));
      list.innerHTML = members.map(m =>
        `<div class="duty-picker-item" onclick="selectDutyValue('${esc(m.name).replace(/'/g,"\\'")}')">
          <span class="duty-picker-name">${esc(m.name)}</span>
          <span class="duty-picker-group">${esc(m.group || '')}</span>
        </div>`
      ).join('');
    }
  } catch (e) {
    list.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}
window.openDutyMemberPicker = openDutyMemberPicker;

function selectDutyValue(val) {
  const dept = _dutyCurDept;
  const container = document.getElementById(`dept-${dept}-body`);
  const target = container?._lastDutyInput;
  if (target) target.value = val;
  closeDutyPicker();
}
window.selectDutyValue = selectDutyValue;

function closeDutyPicker() {
  document.getElementById('duty-picker-modal')?.classList.add('hidden');
}
window.closeDutyPicker = closeDutyPicker;

// ── 管理ホームのリンク ──────────────────────────
document.getElementById('admin-manage-dept-annai')?.addEventListener('click', () => openDeptAdmin('annai'));
document.getElementById('admin-manage-dept-avs')?.addEventListener('click', () => openDeptAdmin('avs'));
document.getElementById('admin-manage-dept-parking')?.addEventListener('click', () => openDeptAdmin('parking'));
document.getElementById('admin-manage-dept-cleaning')?.addEventListener('click', () => openDeptAdmin('cleaning'));

// ── ユーザー側表示（集会ページ） ──────────────────────────
// 今日以降の最も近い集会日について、全部門の係を一覧表示
async function loadUserDuties(targetElId = 'shukai-duties') {
  const el = document.getElementById(targetElId);
  if (!el) return;
  el.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const cfg = await getMeetingConfig();
    // 今日から30日先までの集会日を列挙
    const upcoming = [];
    for (let i = 0; i < 30; i++) {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const dow = dt.getDay();
      if (dow === cfg.midweekDow) upcoming.push({ date: dt, type: 'midweek' });
      if (dow === cfg.weekendDow) upcoming.push({ date: dt, type: 'weekend' });
      if (upcoming.length >= 4) break;
    }
    if (upcoming.length === 0) { el.innerHTML = '<div class="empty-state">集会日がありません</div>'; return; }

    // 期間内の全DEPT_DUTYを取得
    const startYmd = fmtYmd(upcoming[0].date);
    const endYmd   = fmtYmd(upcoming[upcoming.length - 1].date);
    const snap = await db.collection('DEPT_DUTY')
      .where('date', '>=', startYmd)
      .where('date', '<=', endYmd)
      .get();
    const map = {};
    snap.forEach(doc => {
      const d = doc.data();
      (map[d.date] ||= {})[`${d.dept}_${d.position}`] = d.assignee;
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
      for (const [deptId, deptCfg] of Object.entries(DEPT_CONFIG)) {
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

// 集会ページ表示時に呼び出されるよう、navigateの後にフック
(function hookShukaiPage() {
  const _orig = window.navigate;
  if (typeof _orig !== 'function') {
    document.addEventListener('DOMContentLoaded', hookShukaiPage);
    return;
  }
  window.navigate = function(page) {
    const r = _orig.apply(this, arguments);
    if (page === 'bumon')   loadUserDuties('bumon-duties');
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
