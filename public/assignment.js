// ═══════════════════════════════════════════════
// assignment.js — 生活と奉仕の集会 割当管理
// ═══════════════════════════════════════════════

// ── 定数 ──────────────────────────────────────
const AW_PAIR_CODES = [['H','I'],['J','K'],['L','M'],['N','O']];
const AW_PAIR_PARTNER = {};
AW_PAIR_CODES.forEach(([a,b]) => { AW_PAIR_PARTNER[a]=b; AW_PAIR_PARTNER[b]=a; });
const AW_PARTNER_CODES = new Set(AW_PAIR_CODES.map(([,b])=>b));

const AW_SECTION_COLORS = {
  '開会':                     '#4472C4',
  '神の言葉の宝':             '#606C38',
  '野外奉仕に励む':           '#BC6C25',
  'クリスチャンとして生活する': '#9B2226',
};

// ── 状態 ──────────────────────────────────────
let awWeeks         = [];
let awMembers       = [];
let awHistory       = {};
let awHistoryWeeks  = [];   // [{date, records:[{memberName,code}]}]
let awCodes         = {};
let awCurrentWeekId   = null;
let awCurrentItems    = [];
let awCurrentSlots    = {};
let awEditingMemberId = null;
let awIsHistoryView   = false;
let awEditorWeekId    = null;
let awEditorItems     = [];
function awGetMeetingDayNum() {
  const sel = document.getElementById('aw-meeting-day');
  return sel ? parseInt(sel.value) : 4;
}

// ── ユーティリティ ────────────────────────────
function awNorm(s) {
  return String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

function awGetBase(code) { return code.split('_')[0]; }

// ── データ読み込み ─────────────────────────────

async function awLoadCodes() {
  const snap = await db.collection('assignmentCodes').get();
  awCodes = {};
  snap.docs.forEach(d => { awCodes[d.data().code] = d.data().label; });
}

async function awLoadMembers() {
  const snap = await db.collection('mwbMembers').where('active','==',true).get();
  awMembers = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  awMembers.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ja'));
}

async function awLoadHistory() {
  const snap = await db.collection('assignmentHistory').get();
  awHistory = {};
  snap.docs.forEach(d => {
    const { memberName, code, date } = d.data();
    if (!memberName || !code) return;
    const base = awGetBase(code);
    if (!awHistory[memberName]) awHistory[memberName] = {};
    if (!awHistory[memberName][base]) awHistory[memberName][base] = { lastDate: null, count: 0 };
    awHistory[memberName][base].count++;
    let dt = null;
    if (date) dt = date.toDate ? date.toDate() : new Date(date);
    if (dt && (!awHistory[memberName][base].lastDate || dt > awHistory[memberName][base].lastDate)) {
      awHistory[memberName][base].lastDate = dt;
    }
  });
}

async function awLoadAll() {
  await Promise.all([awLoadCodes(), awLoadMembers(), awLoadHistory()]);
}

async function awLoadHistoryWeeks() {
  const snap = await db.collection('assignmentHistory').orderBy('date','desc').get();
  const byDate = {};
  snap.docs.forEach(d => {
    const data = d.data();
    const { memberName, code } = data;
    let date = data.date;
    if (!date || !memberName || !code) return;
    if (date && date.toDate) {
      const dt = date.toDate();
      date = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
    }
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ memberName, code });
  });
  awHistoryWeeks = Object.entries(byDate)
    .sort(([a],[b]) => b.localeCompare(a))
    .map(([date, records]) => ({ date, records }));
}

// ── 割当管理メインページ ──────────────────────

// weekId → 現在のスロット / トピック（確定ボタンから参照）
const awLiveSlots  = {};
const awLiveTopics = {};

async function initAssignmentPage() {
  const createList = document.getElementById('assignment-create-list');
  if (createList) createList.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await awLoadAll();
    await awLoadWeeks();
    // プログラム確定済みの週だけ表示
    const confirmedPrograms = awWeeks.filter(w => w.programStatus === 'confirmed');
    if (confirmedPrograms.length === 0) {
      createList.innerHTML = '<div class="empty-state">プログラム確定済みの週がありません<br><span style="font-size:13px;color:var(--text-light)">先にプログラム表作成で確定してください</span></div>';
      return;
    }
    awWeeks = confirmedPrograms;
    awRenderCreateList();
  } catch(e) {
    if (createList) createList.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }

  document.getElementById('aw-generate-all-btn')?.addEventListener('click', awGenerateAll);
  document.getElementById('aw-confirm-all-btn')?.addEventListener('click', awConfirmAll);
}

function awGenerateAll() {
  if (awMembers.length === 0) { alert('メンバーが登録されていません'); return; }
  awWeeks.forEach(week => {
    const slots = awLiveSlots[week.id];
    if (!slots) return;
    const items = week.items || [];
    const allCodes = [...new Set(items.flatMap(i => i.codes || []))];
    const result = awRunGeneration(allCodes, awMembers, awHistory);
    Object.entries(result).forEach(([code, name]) => {
      if (name && name !== '（該当者なし）') slots[code] = name;
    });
    const section = document.querySelector(`.aw-inline-section[data-week-id="${week.id}"]`);
    if (!section) return;
    section.querySelectorAll('.aw-slot-select').forEach(sel => {
      sel.value = slots[sel.dataset.code] || '';
    });
    awUpdateClosingNoteIn(section.querySelector('.aw-week-table'), slots);
  });
}

async function awConfirmAll() {
  if (!confirm('表示中の全週の割当を確定しますか？\nassignmentHistoryに記録されます。')) return;
  let confirmed = 0;
  try {
    for (const week of awWeeks) {
      const slots  = awLiveSlots[week.id]  || {};
      if (Object.keys(slots).length === 0) continue;

      const thuDate = awGetThursdayDate(week) || new Date();
      await awReplaceHistory(thuDate, slots);

      // バッジ更新
      const badge = document.querySelector(`.aw-inline-section[data-week-id="${week.id}"] .aw-status-badge`);
      if (badge) { badge.className = 'aw-status-badge aw-badge-confirmed'; badge.textContent = '確定済'; }
      week.hasAssignmentHistory = true;
      confirmed++;
    }
    await awLoadHistory();
    alert(`${confirmed}週分を確定しました`);
  } catch(e) { alert('確定エラー: ' + e.message); }
}

// 長老・援助奉仕者が担当するコード（生徒プレゼン H-O,P を除く）
const AW_ELDER_MS_CODES = new Set(['A','B','C','D','E','F','G','Q','R','S','T','U','V','W']);

async function initHistoryPage() {
  const elderList   = document.getElementById('assignment-elder-list');
  const historyList = document.getElementById('assignment-history-list');
  if (elderList)   elderList.innerHTML   = '<div class="loading">読み込み中...</div>';
  if (historyList) historyList.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awLoadCodes(), awLoadHistoryWeeks()]);
    awRenderElderList();
    awRenderHistoryList();
  } catch(e) {
    if (elderList) elderList.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function awRenderElderList() {
  const container = document.getElementById('assignment-elder-list');
  if (!container) return;

  // 長老・援助奉仕者コードのみ、日付ごとに集約
  const elderWeeks = awHistoryWeeks.map(({ date, records }) => ({
    date,
    records: records.filter(r => AW_ELDER_MS_CODES.has(awGetBase(r.code))),
  })).filter(w => w.records.length > 0);

  if (elderWeeks.length === 0) {
    container.innerHTML = '<div class="empty-state">データがありません</div>';
    return;
  }

  // 日付リスト（降順 = 新しい順）、最大26週
  const dates = elderWeeks.slice(0, 26).map(w => w.date);

  // date→code→name のマップ
  const cell = {};
  elderWeeks.forEach(({ date, records }) => {
    records.forEach(({ code, memberName }) => {
      if (!cell[date]) cell[date] = {};
      cell[date][awGetBase(code)] = memberName;
    });
  });

  // 使われているコードを順序どおり抽出（聖書朗読E・話Qは除外）
  const CODE_ORDER = ['A','B','C','D','F','G','R','S','T','U','V','W'];
  const usedCodes = CODE_ORDER.filter(c =>
    dates.some(d => cell[d] && cell[d][c])
  );

  // 全員に固有の塗り潰し色を割り当て
  const PALETTE = [
    '#FADADD','#FAD7A0','#A9DFBF','#AED6F1','#D2B4DE',
    '#FDEBD0','#D5F5E3','#D6EAF8','#FDEDEC','#E8DAEF',
    '#FCF3CF','#D1F2EB','#EBF5FB','#F9EBEA','#E9F7EF',
    '#FEF9E7','#EAFAF1','#EAF2FF','#FDF2F8','#F0F3FF',
    '#FFF3CD','#D4EFDF','#D6EEF8','#FADBD8','#E8D5F5',
    '#FFEAA7','#BADC58','#7ED6DF','#E056FD','#F9CA24',
  ];
  const nameColorMap = {};
  let colorIdx = 0;
  dates.forEach(d => {
    usedCodes.forEach(c => {
      const name = cell[d]?.[c];
      if (name && !nameColorMap[name]) {
        nameColorMap[name] = PALETTE[colorIdx++ % PALETTE.length];
      }
    });
  });

  // テーブル構築
  const wrap = document.createElement('div');
  wrap.className = 'aw-elder-table-wrap';

  const table = document.createElement('table');
  table.className = 'aw-elder-table';

  // ヘッダー行（日付）
  const thead = table.createTHead();
  const hRow = thead.insertRow();
  hRow.insertCell().textContent = 'プログラム';
  dates.forEach(d => {
    const th = document.createElement('th');
    const [, m, day] = d.split('-');
    th.textContent = `${parseInt(m)}/${parseInt(day)}`;
    hRow.appendChild(th);
  });

  // データ行（コード別）
  const tbody = table.createTBody();
  usedCodes.forEach(code => {
    const row = tbody.insertRow();
    const labelCell = row.insertCell();
    labelCell.className = 'aw-elder-label';
    labelCell.textContent = awCodes[code] || code;
    dates.forEach(d => {
      const td = row.insertCell();
      const name = cell[d]?.[code] || '';
      td.textContent = name;
      if (name) {
        td.style.background = nameColorMap[name] || '';
      } else {
        td.style.color = 'var(--border)';
      }
    });
  });

  wrap.appendChild(table);
  container.innerHTML = '';
  container.appendChild(wrap);
}

async function awLoadWeeks() {
  const snap = await db.collection('mwbWeeks').orderBy('importedAt','desc').get();
  awWeeks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  awWeeks.sort((a, b) => a.id.localeCompare(b.id));

  // programStatus と topics は mwbWeeks に直接保存されているのでそのまま使用
  // slots は assignmentHistory から該当日のレコードを取得して構築
  await Promise.all(awWeeks.map(async week => {
    // programStatus/topics は mwbWeeks 内に保持
    week.programStatus = week.programStatus || 'draft';
    week.topics = week.topics || {};

    // assignmentHistory から該当集会日のスロットを読み込む
    const meetDate = awGetMeetingDate(week);
    if (!meetDate) { week.slots = {}; week.hasAssignmentHistory = false; return; }

    const searchStart = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() - 1, 0, 0, 0));
    const searchEnd   = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() + 1, 0, 0, 0));
    const hSnap = await db.collection('assignmentHistory')
      .where('date', '>=', firebase.firestore.Timestamp.fromDate(searchStart))
      .where('date', '<', firebase.firestore.Timestamp.fromDate(searchEnd))
      .get();

    week.slots = {};
    hSnap.docs.forEach(d => {
      const { code, memberName } = d.data();
      if (code && memberName) week.slots[code] = memberName;
    });
    week.hasAssignmentHistory = hSnap.size > 0;
  }));
}

function awMakeWeekRow(innerHTML, onClick) {
  const item = document.createElement('div');
  item.className = 'admin-list-item aw-week-row';
  item.innerHTML = innerHTML;
  item.addEventListener('click', onClick);
  return item;
}

function awRenderCreateList() {
  const list = document.getElementById('assignment-create-list');
  if (!list) return;
  if (awWeeks.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">upload_file</span>ZIPファイルをインポートしてください</div>';
    return;
  }
  list.innerHTML = '';
  awWeeks.forEach(week => awBuildWeekSection(week, list));
}

// 週の集会日の Date を返す（awGetMeetingDayNum() に基づく）
function awGetMeetingDate(week) {
  if (!week.dateRange) return null;
  const m = week.dateRange.match(/^(\d+)月(\d+)/);
  if (!m) return null;
  const issueYear  = parseInt(week.id.substring(0, 4));
  const issueMonth = parseInt(week.id.substring(4, 6));
  const startMonth = parseInt(m[1]);
  const startDay   = parseInt(m[2]);
  const startYear  = (issueMonth === 12 && startMonth === 1) ? issueYear + 1 : issueYear;
  const startDate  = new Date(startYear, startMonth - 1, startDay);
  const daysTo     = (awGetMeetingDayNum() - startDate.getDay() + 7) % 7;
  const meetDate   = new Date(startDate);
  meetDate.setDate(startDate.getDate() + daysTo);
  return meetDate;
}
// 後方互換
function awGetThursdayDate(week) { return awGetMeetingDate(week); }

function awGetMeetingLabel(week) {
  const d = awGetMeetingDate(week);
  if (!d) return week.dateRange || week.id;
  const dayNames = ['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}月${d.getDate()}日（${dayNames[d.getDay()]}）`;
}
function awGetThursdayLabel(week) { return awGetMeetingLabel(week); }

function awBuildWeekSection(week, container) {
  const hasHistory = week.hasAssignmentHistory;
  const statusLabel = hasHistory ? '確定済' : '未策定';
  const statusClass = hasHistory ? 'aw-badge-confirmed' : 'aw-badge-none';
  const slots  = Object.assign({}, week.slots  || {});
  const topics = Object.assign({}, week.topics || {});
  const items  = week.items || [];

  const section = document.createElement('div');
  section.className = 'aw-inline-section';
  section.dataset.weekId = week.id;
  awLiveSlots[week.id]  = slots;
  awLiveTopics[week.id] = topics;

  // ── ヘッダー ──
  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  hdr.innerHTML = `
    <div>
      <div class="aw-inline-title">${esc(awGetThursdayLabel(week))}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="aw-status-badge ${statusClass}">${statusLabel}</span>
    </div>
  `;
  section.appendChild(hdr);

  // ── 担当者ドロップダウンテーブル（主題表示のみ、編集なし） ──
  const table = document.createElement('div');
  table.className = 'aw-week-table';
  awBuildAssignmentTable(items, slots, topics, table);
  section.appendChild(table);

  container.appendChild(section);
}

function awBuildInlineTable(items, slots, topics, container, weekId) {
  container.innerHTML = '';
  let prevSection = '';
  let minutesOffset = 0;

  items.forEach(item => {
    const section = item.section;
    if (section !== prevSection && section !== '開会') {
      if (section === 'クリスチャンとして生活する') minutesOffset = 47;
      const hdr = document.createElement('div');
      hdr.className = 'aw-section-header';
      hdr.style.background = AW_SECTION_COLORS[section] || '#333';
      hdr.textContent = section;
      container.appendChild(hdr);
      prevSection = section;
    }

    const h = 19 + Math.floor(minutesOffset / 60);
    const m = minutesOffset % 60;
    const timeStr = `${h}:${m.toString().padStart(2,'0')}`;

    let assigneeCells = '';
    let topicHtml = '';
    if (item.title === '閉会の言葉') {
      assigneeCells = `<span class="aw-closing-note">司会者と同じ（${esc(slots['A'] || '（未割当）')}）</span>`;
    } else if (item.codes && item.codes.length > 0) {
      const isTopicItem = item.codes.some(c => awGetBase(c) === 'T') || (item.title && item.title.includes('会衆で考えたいこと'));
      let topicKey = '';
      if (isTopicItem) {
        const tc = item.codes.find(c => awGetBase(c) === 'T');
        topicKey = tc ? 'T' : awGetBase(item.codes[0]);
      }
      assigneeCells = item.codes.map(code => {
        const base     = awGetBase(code);
        const label    = awCodes[base] || base;
        const eligible = awMembers.filter(mb => (mb.eligibleCodes || []).includes(base));
        const cur      = slots[code] || slots[base] || '';
        if (!slots[code] && slots[base]) slots[code] = slots[base];
        const opts     = eligible.map(mb =>
          `<option value="${esc(mb.name)}" ${mb.name === cur ? 'selected' : ''}>${esc(mb.name)}</option>`
        ).join('');
        const shortLabels = {A:'司会者',B:'祈り',W:'祈り',E:'朗読者',H:'担当',J:'担当',L:'担当',N:'担当',I:'相手',K:'相手',M:'相手',O:'相手',V:'朗読者'};
        const shortLabel = shortLabels[base] || '';
        return `<div class="aw-slot">
          ${shortLabel ? `<label class="aw-slot-label">${esc(shortLabel)}</label>` : ''}
          <select class="aw-slot-select" data-code="${esc(code)}">
            <option value="">—</option>${opts}
          </select></div>`;
      }).join('');
      if (isTopicItem && topicKey) {
        topicHtml = `<div class="aw-topic-row-full">
          <label class="aw-topic-label">主題</label>
          <input class="aw-topic-input" data-code="${esc(topicKey)}" type="text"
            placeholder="主題を入力" value="${esc(topics[topicKey] || '')}">
          <button class="aw-topic-save-btn icon-btn" title="主題を保存" data-week-id="${esc(weekId||'')}">
            <span class="material-icons" style="font-size:18px">save</span>
          </button>
        </div>`;
      }
    }

    const row = document.createElement('div');
    row.className = 'aw-row';
    row.innerHTML = `
      <div class="aw-row-time">${timeStr}</div>
      <div class="aw-row-info">
        ${item.number ? `<span class="aw-row-num">${esc(item.number)}.</span>` : ''}
        <span class="aw-row-title">${esc(item.title)}</span>
        ${item.minutes ? `<span class="aw-row-min">（${esc(item.minutes)}分）</span>` : ''}
      </div>
      <div class="aw-row-assignees">${assigneeCells}</div>
    `;
    container.appendChild(row);
    if (topicHtml) {
      const topicRow = document.createElement('div');
      topicRow.innerHTML = topicHtml;
      container.appendChild(topicRow.firstElementChild);
    }
    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes || '0') || 0);
  });

  container.querySelectorAll('.aw-slot-select').forEach(sel => {
    sel.addEventListener('change', () => {
      slots[sel.dataset.code] = sel.value;
      if (sel.dataset.code === 'A') awUpdateClosingNoteIn(container, slots);
    });
  });
  container.querySelectorAll('.aw-topic-input').forEach(inp => {
    inp.addEventListener('input', () => { topics[inp.dataset.code] = inp.value; });
  });
  container.querySelectorAll('.aw-topic-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await db.collection('mwbWeeks').doc(weekId).set(
          { topics }, { merge: true }
        );
        btn.querySelector('.material-icons').textContent = 'check';
        setTimeout(() => { btn.querySelector('.material-icons').textContent = 'save'; }, 1500);
      } catch(e) { alert('保存エラー: ' + e.message); }
    });
  });
}

function awUpdateClosingNoteIn(container, slots) {
  const note = container.querySelector('.aw-closing-note');
  if (note) note.textContent = `司会者と同じ（${slots['A'] || '（未割当）'}）`;
}

// 担当者策定用テーブル（ドロップダウンのみ、主題は読み取り表示）
function awBuildAssignmentTable(items, slots, topics, container) {
  container.innerHTML = '';
  let prevSection = '';
  let minutesOffset = 0;

  items.forEach(item => {
    const section = item.section;
    if (section !== prevSection && section !== '開会') {
      if (section === 'クリスチャンとして生活する') minutesOffset = 47;
      const hdr = document.createElement('div');
      hdr.className = 'aw-section-header';
      hdr.style.background = AW_SECTION_COLORS[section] || '#333';
      hdr.textContent = section;
      container.appendChild(hdr);
      prevSection = section;
    }

    const h = 19 + Math.floor(minutesOffset / 60);
    const m = minutesOffset % 60;
    const timeStr = `${h}:${m.toString().padStart(2,'0')}`;

    let assigneeCells = '';
    if (item.title === '閉会の言葉') {
      assigneeCells = `<span class="aw-closing-note">司会者と同じ（${esc(slots['A'] || '（未割当）')}）</span>`;
    } else if (item.codes && item.codes.length > 0) {
      assigneeCells = item.codes.map(code => {
        const base = awGetBase(code);
        const eligible = awMembers.filter(mb => (mb.eligibleCodes || []).includes(base));
        const cur = slots[code] || slots[base] || '';
        if (!slots[code] && slots[base]) slots[code] = slots[base];
        const opts = eligible.map(mb =>
          `<option value="${esc(mb.name)}" ${mb.name === cur ? 'selected' : ''}>${esc(mb.name)}</option>`
        ).join('');
        const shortLabels = {A:'司会者',B:'祈り',W:'祈り',E:'朗読者',H:'担当',J:'担当',L:'担当',N:'担当',I:'相手',K:'相手',M:'相手',O:'相手',V:'朗読者'};
        const shortLabel = shortLabels[base] || '';
        return `<div class="aw-slot">
          ${shortLabel ? `<label class="aw-slot-label">${esc(shortLabel)}</label>` : ''}
          <select class="aw-slot-select" data-code="${esc(code)}">
            <option value="">—</option>${opts}
          </select></div>`;
      }).join('');
    }

    const row = document.createElement('div');
    row.className = 'aw-row';
    row.innerHTML = `
      <div class="aw-row-time">${timeStr}</div>
      <div class="aw-row-info">
        ${item.number ? `<span class="aw-row-num">${esc(item.number)}.</span>` : ''}
        <span class="aw-row-title">${esc(item.title)}</span>
        ${item.minutes ? `<span class="aw-row-min">（${esc(item.minutes)}分）</span>` : ''}
      </div>
      <div class="aw-row-assignees">${assigneeCells}</div>
    `;
    container.appendChild(row);

    // 主題は読み取り表示のみ
    const itemCodes = item.codes || [];
    const isTopicItem = itemCodes.some(c => awGetBase(c) === 'T') || (item.title && item.title.includes('会衆で考えたいこと'));
    if (isTopicItem) {
      const tc = itemCodes.find(c => awGetBase(c) === 'T');
      const topicKey = tc ? 'T' : awGetBase(itemCodes[0] || 'T');
      const topicVal = topics[topicKey] || '';
      if (topicVal) {
        const topicRow = document.createElement('div');
        topicRow.className = 'aw-topic-row-full';
        topicRow.innerHTML = `<label class="aw-topic-label">主題</label><span style="font-size:13px">${esc(topicVal)}</span>`;
        container.appendChild(topicRow);
      }
    }

    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes || '0') || 0);
  });

  container.querySelectorAll('.aw-slot-select').forEach(sel => {
    sel.addEventListener('change', () => {
      slots[sel.dataset.code] = sel.value;
      if (sel.dataset.code === 'A' || awGetBase(sel.dataset.code) === 'A') awUpdateClosingNoteIn(container, slots);
    });
  });
}

function awRenderHistoryList() {
  const list = document.getElementById('assignment-history-list');
  if (!list) return;
  if (awHistoryWeeks.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">history</span>履歴がありません</div>';
    return;
  }
  list.innerHTML = '';
  awHistoryWeeks.forEach(({ date, records }) => {
    list.appendChild(awMakeWeekRow(`
      <div class="admin-list-info">
        <div class="admin-list-title">${esc(date)}</div>
        <div class="admin-list-date" style="color:var(--text-light)">${records.length}件の割当</div>
      </div>
      <span class="aw-status-badge aw-badge-confirmed">確定</span>
      <span class="material-icons" style="color:var(--text-light)">chevron_right</span>
    `, () => awOpenHistoryDetail(date, records)));
  });
}


// ── ZIPインポート ─────────────────────────────

function awInitImport() {
  const btn   = document.getElementById('aw-import-btn');
  const input = document.getElementById('aw-zip-input');
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'インポート中...';
    try {
      const count = await awHandleZipImport(file);
      alert(`${count}週分をインポートしました`);
      await awLoadWeeks();
      awRenderProgramList();
    } catch(err) {
      alert('インポートエラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      input.value = '';
    }
  });
}

async function awHandleZipImport(file) {
  if (!window.JSZip) throw new Error('JSZipが読み込まれていません');
  const zip = await JSZip.loadAsync(file);

  const entries = [];
  zip.forEach((path, entry) => {
    if (/mwb_J_\d+_\d{2}\.txt$/.test(path) && !entry.dir) entries.push({ path, entry });
  });
  entries.sort((a,b) => a.path.localeCompare(b.path));

  let count = 0;
  for (const { path, entry } of entries) {
    const text  = await entry.async('string');
    const lines = text.split(/\r?\n/);
    const week  = awParseWeekLines(lines);
    if (!week || !week.dateRange) continue;

    const m = path.match(/mwb_J_(\d+)_(\d{2})\.txt$/);
    if (!m) continue;
    const weekId = `${m[1]}_${m[2]}`;

    week.items = awMapItemsToCodes(week);
    await db.collection('mwbWeeks').doc(weekId).set({
      dateRange:    week.dateRange,
      bibleChapter: week.bibleChapter,
      items:        week.items,
      importedAt:   firebase.firestore.Timestamp.now(),
    });
    count++;
  }
  return count;
}

function awParseWeekLines(lines) {
  const week = { dateRange:'', bibleChapter:'', openingSong:'', middleSong:'', closingSong:'', rawItems:[] };

  let dateLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = awNorm(lines[i].trim());
    if (/\d+月\d+/.test(s) && s.includes('日') && s.length < 30) {
      week.dateRange = s;
      dateLineIdx = i;
      break;
    }
  }
  if (dateLineIdx === -1) return null;

  for (let j = dateLineIdx + 1; j < Math.min(dateLineIdx + 5, lines.length); j++) {
    const s = awNorm(lines[j].trim());
    if (s) { week.bibleChapter = s; break; }
  }

  const body = lines.slice(dateLineIdx);
  let currentSection = '';
  let inInserted = false;

  for (const line of body) {
    const raw = line.trim();
    const s   = awNorm(raw);

    // 挿入ブロックのスキップ
    const isBlockStart = raw.includes('挿入聖句') || raw.includes('読む聖句') || raw.includes('囲み');
    const isBlockEnd   = raw.includes('終わり');
    if (isBlockStart && !isBlockEnd) { inInserted = true; continue; }
    if (isBlockEnd) { inInserted = false; continue; }
    if (inInserted) continue;

    // セクション（部分一致・正規化済み文字列で判定）
    if (s.includes('神の言葉の宝'))             { currentSection = '神の言葉の宝'; continue; }
    if (s.includes('野外奉仕に励む') || s.includes('伝道を楽しもう')) { currentSection = '野外奉仕に励む'; continue; }
    if (s.includes('クリスチャンとして生活する')) { currentSection = 'クリスチャンとして生活する'; continue; }

    // 歌
    let m = s.match(/^(\d+)番の歌と祈り/);
    if (m) { if (!week.openingSong) week.openingSong = m[1]; else week.closingSong = m[1]; continue; }
    m = s.match(/^(\d+)番の歌$/);
    if (m) { week.middleSong = m[1]; continue; }

    // 番号付き項目
    m = s.match(/^(\d+)\.\s+(.+?)（(\d+)分）/);
    if (m) {
      week.rawItems.push({ section: currentSection || '開会', number: m[1], title: m[2].trim(), minutes: m[3] });
      continue;
    }

    if (s.includes('開会の言葉') && s.includes('（')) {
      const dm = s.match(/（(\d+)分）/);
      week.rawItems.push({ section:'開会', number:'', title:'開会の言葉', minutes: dm ? dm[1] : '1' });
      continue;
    }
    if (s.includes('会衆の聖書研究') && s.includes('（')) {
      const dm = s.match(/（(\d+)分）/);
      week.rawItems.push({ section:'クリスチャンとして生活する', number:'', title:'会衆の聖書研究', minutes: dm ? dm[1] : '30' });
      continue;
    }
    if (s.includes('閉会の言葉') && s.includes('（')) {
      const dm = s.match(/（(\d+)分）/);
      week.rawItems.push({ section:'クリスチャンとして生活する', number:'', title:'閉会の言葉', minutes: dm ? dm[1] : '3' });
      continue;
    }
    if (s.includes('会衆の必要')) {
      const dm = s.match(/（(\d+)分）/);
      const nm = s.match(/^(\d+)\./);
      week.rawItems.push({ section:'クリスチャンとして生活する', number: nm ? nm[1] : '', title:'会衆の必要', minutes: dm ? dm[1] : '' });
      continue;
    }
  }

  return week;
}

function awMapItemsToCodes(week) {
  const items = [];
  let discussionCount  = 0;
  let christianCount   = 0;
  const codeOcc = {};

  // 開会の歌
  if (week.openingSong) {
    items.push({ type:'song', songNumber: week.openingSong, title:`${week.openingSong}番の歌と祈り`, section:'開会', codes:['A','B'] });
  }

  for (const item of week.rawItems) {
    const { title, section, number, minutes } = item;
    if (title === '開会の言葉') continue; // 開会の歌行に統合

    let codes = [];

    if (section === '神の言葉の宝') {
      if (title.includes('聖書朗読'))        codes = ['E'];
      else if (title.includes('宝石を探し出す')) codes = ['D'];
      else                                     codes = ['C'];

    } else if (section === '野外奉仕に励む') {
      if (title.includes('討議')) {
        discussionCount++;
        codes = discussionCount === 1 ? ['F'] : ['G'];
      } else if (title === '話') {
        codes = ['Q'];
      } else {
        let lead, partner;
        if      (title.includes('信じていること'))                      { lead='N'; partner='O'; }
        else if (title.includes('再訪問') || title.includes('再び'))    { lead='J'; partner='K'; }
        else if (title.includes('聖書研究') && !title.includes('会衆')) { lead='L'; partner='M'; }
        else if (title.includes('教えて育てる'))                        { lead='L'; partner='M'; }
        else                                                            { lead='H'; partner='I'; }
        codeOcc[lead] = (codeOcc[lead] || 0) + 1;
        const occ = codeOcc[lead];
        codes = occ === 1 ? [lead, partner] : [`${lead}_${occ}`, `${partner}_${occ}`];
      }

    } else if (section === 'クリスチャンとして生活する') {
      if      (title.includes('会衆の聖書研究')) codes = ['U','V'];
      else if (title === '会衆の必要')           codes = ['T'];
      else if (title === '閉会の言葉')           codes = []; // 司会者(A)と同じなのでドロップダウンなし
      else { christianCount++; codes = christianCount === 1 ? ['R'] : ['S']; }
    }

    items.push({ type:'item', section, number: number||'', title, minutes: minutes||'', codes });
  }

  // 中間の歌をクリスチャンセクション先頭に挿入
  if (week.middleSong) {
    const idx = items.findIndex(i => i.section === 'クリスチャンとして生活する');
    const songItem = { type:'song', songNumber: week.middleSong, title:`${week.middleSong}番の歌`, section:'クリスチャンとして生活する', codes:[] };
    if (idx >= 0) items.splice(idx, 0, songItem);
    else items.push(songItem);
  }

  // 閉会の歌
  if (week.closingSong) {
    items.push({ type:'song', songNumber: week.closingSong, title:`${week.closingSong}番の歌と祈り`, section:'クリスチャンとして生活する', codes:['W'] });
  }

  return items;
}

// ── 週の割当詳細 ──────────────────────────────

function awSetActionButtonsVisible(visible) {
  const area = document.querySelector('.aw-week-actions');
  if (area) area.style.display = visible ? '' : 'none';
}

function awOpenHistoryDetail(date, records) {
  awIsHistoryView = true;
  awCurrentWeekId = null;

  const titleEl = document.getElementById('aw-week-title');
  if (titleEl) titleEl.textContent = date + '（履歴・読み取り専用）';

  const container = document.getElementById('aw-week-table');
  if (container) {
    container.innerHTML = '';
    // コード別に集約
    const byCode = {};
    records.forEach(({ memberName, code }) => {
      if (!byCode[code]) byCode[code] = [];
      byCode[code].push(memberName);
    });

    const sectionOf = {
      A:'開会', B:'開会',
      C:'神の言葉の宝', D:'神の言葉の宝', E:'神の言葉の宝',
      F:'野外奉仕に励む', G:'野外奉仕に励む',
      H:'野外奉仕に励む', I:'野外奉仕に励む',
      J:'野外奉仕に励む', K:'野外奉仕に励む',
      L:'野外奉仕に励む', M:'野外奉仕に励む',
      N:'野外奉仕に励む', O:'野外奉仕に励む',
      P:'野外奉仕に励む', Q:'野外奉仕に励む',
      R:'クリスチャンとして生活する', S:'クリスチャンとして生活する',
      T:'クリスチャンとして生活する', U:'クリスチャンとして生活する',
      V:'クリスチャンとして生活する', W:'クリスチャンとして生活する',
    };
    // 担当/相手ペアは1行にまとめる（相手コードはスキップ）
    const PARTNER_OF = { H:'I', J:'K', L:'M', N:'O', U:'V' };
    const PARTNER_CODES = new Set(Object.values(PARTNER_OF));

    const sortedCodes = Object.keys(byCode).sort();
    let prevSection = '';
    sortedCodes.forEach(code => {
      const base = awGetBase(code);
      if (PARTNER_CODES.has(base)) return; // 相手コードは担当行でまとめて表示

      const section = sectionOf[base] || '';
      if (section && section !== prevSection) {
        const hdr = document.createElement('div');
        hdr.className = 'aw-section-header';
        hdr.style.background = AW_SECTION_COLORS[section] || '#333';
        hdr.textContent = section;
        container.appendChild(hdr);
        prevSection = section;
      }

      const partnerBase = PARTNER_OF[base];
      const partnerCode = code.includes('_') ? code.replace(base, partnerBase) : partnerBase;
      let label = awCodes[base] || code;
      let nameStr;
      if (partnerBase && byCode[partnerCode]) {
        label   = (awCodes[base] || code).replace(/ ?— ?(担当|相手)/, '').replace(/（(司会|朗読者)）/, '');
        nameStr = `${esc(byCode[code][0])} / ${esc(byCode[partnerCode][0])}`;
      } else {
        nameStr = esc((byCode[code] || []).join(' / '));
      }

      const row = document.createElement('div');
      row.className = 'aw-row';
      row.innerHTML = `
        <div class="aw-row-time" style="font-size:0.85rem;font-weight:bold;color:var(--text-light)">${esc(code)}</div>
        <div class="aw-row-info"><span class="aw-row-title">${esc(label)}</span></div>
        <div class="aw-row-assignees" style="padding:8px 0;font-size:0.95rem">${nameStr}</div>
      `;
      container.appendChild(row);
    });
  }

  awSetActionButtonsVisible(false);
  navigate('admin-assignment-week');
}

async function awOpenWeekDetail(weekId) {
  awIsHistoryView = false;
  awCurrentWeekId = weekId;
  awCurrentSlots  = {};
  awSetActionButtonsVisible(true);

  const weekSnap = await db.collection('mwbWeeks').doc(weekId).get();
  if (!weekSnap.exists) return;
  const weekData = weekSnap.data();
  awCurrentItems = weekData.items || [];

  document.getElementById('aw-week-title').textContent = weekData.dateRange || weekId;

  // assignmentHistoryから該当日のスロットを読み込む
  const week = awWeeks.find(w => w.id === weekId) || weekData;
  const meetDate = awGetMeetingDate(week);
  if (meetDate) {
    const searchStart = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() - 1, 0, 0, 0));
    const searchEnd   = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() + 1, 0, 0, 0));
    const hSnap = await db.collection('assignmentHistory')
      .where('date', '>=', firebase.firestore.Timestamp.fromDate(searchStart))
      .where('date', '<', firebase.firestore.Timestamp.fromDate(searchEnd))
      .get();
    hSnap.docs.forEach(d => {
      const { code, memberName } = d.data();
      if (code && memberName) awCurrentSlots[code] = memberName;
    });
  }

  navigate('admin-assignment-week');
  awRenderWeekDetail();
}

function awRenderWeekDetail() {
  const container = document.getElementById('aw-week-table');
  if (!container) return;
  container.innerHTML = '';

  let prevSection    = '';
  let minutesOffset  = 0;

  for (const item of awCurrentItems) {
    const section = item.section;

    // セクションヘッダー（開会は省略）
    if (section !== prevSection && section !== '開会') {
      // クリスチャンとして生活するは19:47固定
      if (section === 'クリスチャンとして生活する') minutesOffset = 47;

      const hdr = document.createElement('div');
      hdr.className = 'aw-section-header';
      hdr.style.background = AW_SECTION_COLORS[section] || '#333';
      hdr.textContent = section;
      container.appendChild(hdr);
      prevSection = section;
    }

    const h = 19 + Math.floor(minutesOffset / 60);
    const m = minutesOffset % 60;
    const timeStr = `${h}:${m.toString().padStart(2,'0')}`;

    // 担当者セル
    let assigneeCells = '';

    if (item.title === '閉会の言葉') {
      // 司会者(A)と同じ人を表示するだけ
      const chairName = awCurrentSlots['A'] || '（未割当）';
      assigneeCells = `<span class="aw-closing-note">司会者と同じ（${esc(chairName)}）</span>`;

    } else if (item.codes && item.codes.length > 0) {
      assigneeCells = item.codes.map(code => {
        const base     = awGetBase(code);
        const label    = awCodes[base] || base;
        const eligible = awMembers.filter(mb => (mb.eligibleCodes || []).includes(base));
        const cur      = awCurrentSlots[code] || '';
        const opts     = eligible.map(mb =>
          `<option value="${esc(mb.name)}" ${mb.name === cur ? 'selected' : ''}>${esc(mb.name)}</option>`
        ).join('');
        return `
          <div class="aw-slot">
            <label class="aw-slot-label">${esc(label)}</label>
            <select class="aw-slot-select" data-code="${esc(code)}">
              <option value="">—</option>
              ${opts}
            </select>
          </div>`;
      }).join('');
    }

    const row = document.createElement('div');
    row.className = 'aw-row';
    row.innerHTML = `
      <div class="aw-row-time">${timeStr}</div>
      <div class="aw-row-info">
        ${item.number ? `<span class="aw-row-num">${esc(item.number)}.</span>` : ''}
        <span class="aw-row-title">${esc(item.title)}</span>
        ${item.minutes ? `<span class="aw-row-min">（${esc(item.minutes)}分）</span>` : ''}
      </div>
      <div class="aw-row-assignees">${assigneeCells}</div>
    `;
    container.appendChild(row);

    // 閉会の言葉行のselectが変わったとき司会者表示を更新するために監視
    if (item.title === '閉会の言葉') {
      // no-op — 表示のみ
    }

    // 時間加算
    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes || '0') || 0);
  }

  // select変更 → slot反映
  container.querySelectorAll('.aw-slot-select').forEach(sel => {
    sel.addEventListener('change', () => {
      awCurrentSlots[sel.dataset.code] = sel.value;
      // 司会者(A)が変わった場合、閉会の言葉行を再描画
      if (sel.dataset.code === 'A') awUpdateClosingNote();
    });
  });
}

function awUpdateClosingNote() {
  const note = document.querySelector('.aw-closing-note');
  if (note) note.textContent = `司会者と同じ（${awCurrentSlots['A'] || '（未割当）'}）`;
}

// ── 自動生成 ──────────────────────────────────

function awGenerateAssignments() {
  if (awMembers.length === 0) { alert('メンバーが登録されていません'); return; }

  // 全コードを収集（重複除去）
  const allCodes = [];
  const seen = new Set();
  awCurrentItems.forEach(item => {
    (item.codes || []).forEach(code => {
      if (!seen.has(code)) { seen.add(code); allCodes.push(code); }
    });
  });

  if (allCodes.length === 0) { alert('割当コードがありません'); return; }

  const result = awRunGeneration(allCodes, awMembers, awHistory);

  // 結果をslotとUIに反映
  awCurrentSlots = {};
  Object.entries(result).forEach(([code, name]) => {
    if (name && name !== '（該当者なし）') awCurrentSlots[code] = name;
  });

  document.querySelectorAll('.aw-slot-select').forEach(sel => {
    sel.value = awCurrentSlots[sel.dataset.code] || '';
  });
  awUpdateClosingNote();
}

const AW_FIELD_MINISTRY_CODES = new Set(['F','G','H','I','J','K','L','M','N','O','P','Q']);

function awRunGeneration(allCodes, members, history) {
  const eligibility = {};
  const genderMap   = {};
  const familyMap   = {};
  const positionMap = {};
  members.forEach(mb => {
    eligibility[mb.name] = new Set(mb.eligibleCodes || []);
    genderMap[mb.name]   = mb.gender || '';
    familyMap[mb.name]   = mb.familyGroup || '';
    positionMap[mb.name] = mb.position || '';
  });

  const assignedPersons = new Set();
  const result = {};
  const today  = new Date();

  function countEligible(code) {
    const base = awGetBase(code);
    return members.filter(mb => (mb.eligibleCodes || []).includes(base)).length;
  }

  const sortedCodes = [...allCodes].sort((a,b) => countEligible(a) - countEligible(b));

  for (const code of sortedCodes) {
    const base = awGetBase(code);
    const candidates = [];

    for (const [name, codes] of Object.entries(eligibility)) {
      if (!codes.has(base) || assignedPersons.has(name)) continue;

      if (AW_FIELD_MINISTRY_CODES.has(base) && positionMap[name] === '長老') continue;

      // ペア制約チェック（異性の場合は同家族のみ）
      if (AW_PARTNER_CODES.has(base)) {
        const leadBase = AW_PAIR_PARTNER[base];
        const suffix   = code.includes('_') ? code.split('_')[1] : '';
        const leadCode = suffix ? `${leadBase}_${suffix}` : leadBase;
        const leadName = result[leadCode];
        if (leadName) {
          const lg = genderMap[leadName] || '';
          const cg = genderMap[name] || '';
          if (lg && cg && lg !== cg) {
            const lf = familyMap[leadName] || '';
            const cf = familyMap[name] || '';
            if (!lf || !cf || lf !== cf) continue;
          }
        }
      }

      const h        = (history[name] || {})[base] || { lastDate: null, count: 0 };
      const daysSince = h.lastDate ? Math.floor((today - h.lastDate) / 86400000) : 9999;
      const score     = daysSince * 10 - (h.count || 0);
      candidates.push([score, name]);
    }

    if (candidates.length === 0) { result[code] = '（該当者なし）'; continue; }
    candidates.sort((a,b) => b[0] - a[0]);
    result[code] = candidates[0][1];
    assignedPersons.add(result[code]);
  }

  return result;
}

// ── 確定 ──────────────────────────────────────

// 日付からローカル日付文字列を取得
function awDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 日付からUTC正午のTimestampを作成（タイムゾーンずれ防止）
function awNoonUtcTimestamp(d) {
  const noon = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
  return firebase.firestore.Timestamp.fromDate(noon);
}

// 指定日付のassignmentHistoryを差分更新（変更分のみ保存）
async function awReplaceHistory(thuDate, slotsObj) {
  const searchStart = new Date(Date.UTC(thuDate.getFullYear(), thuDate.getMonth(), thuDate.getDate() - 1, 0, 0, 0));
  const searchEnd   = new Date(Date.UTC(thuDate.getFullYear(), thuDate.getMonth(), thuDate.getDate() + 1, 0, 0, 0));
  const existing = await db.collection('assignmentHistory')
    .where('date', '>=', firebase.firestore.Timestamp.fromDate(searchStart))
    .where('date', '<', firebase.firestore.Timestamp.fromDate(searchEnd))
    .get();

  // 既存データをマップ化: code → {docRef, memberName}
  const existingMap = {};
  existing.docs.forEach(d => {
    const data = d.data();
    existingMap[data.code] = { ref: d.ref, memberName: data.memberName };
  });

  // 新データを整理（空・該当者なしを除外）
  const newSlots = {};
  Object.entries(slotsObj).forEach(([code, name]) => {
    if (name && name !== '（該当者なし）') newSlots[code] = name;
  });

  const ts = awNoonUtcTimestamp(thuDate);
  const now = firebase.firestore.Timestamp.now();
  const batch = db.batch();
  let changes = 0;

  // 変更・追加: 新データにあって既存と異なるもの
  Object.entries(newSlots).forEach(([code, name]) => {
    const ex = existingMap[code];
    if (ex && ex.memberName === name) return; // 変更なし → スキップ
    if (ex) batch.delete(ex.ref); // 既存を削除
    batch.set(db.collection('assignmentHistory').doc(), {
      memberName: name, code: code, date: ts, confirmedAt: now,
    });
    changes++;
  });

  // 削除: 既存にあって新データにないもの
  Object.entries(existingMap).forEach(([code, ex]) => {
    if (!newSlots[code]) { batch.delete(ex.ref); changes++; }
  });

  if (changes > 0) await batch.commit();
}

async function awConfirmAssignment() {
  if (!awCurrentWeekId) return;
  if (!confirm('割当を確定しますか？\nassignmentHistoryに記録されます。')) return;

  try {
    const currentWeekObj = awWeeks.find(w => w.id === awCurrentWeekId);
    const thuDate = (currentWeekObj && awGetThursdayDate(currentWeekObj)) || new Date();

    // assignmentHistoryに直接書き込み（重複防止で既存削除→新規書き込み）
    await awReplaceHistory(thuDate, awCurrentSlots);

    await awLoadHistory();

    if (currentWeekObj) currentWeekObj.hasAssignmentHistory = true;
    alert('確定しました');
  } catch(e) {
    alert('確定エラー: ' + e.message);
  }
}

// ── メンバー管理 ──────────────────────────────

async function initMembersPage() {
  const list = document.getElementById('members-list');
  if (list) list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awLoadCodes(), awLoadMembers()]);
    awRenderMemberList();
  } catch(e) {
    if (list) list.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function awRenderMemberList() {
  const list = document.getElementById('members-list');
  if (!list) return;
  if (awMembers.length === 0) {
    list.innerHTML = '<div class="empty-state">メンバーが登録されていません</div>';
    return;
  }
  list.innerHTML = '';
  awMembers.forEach((member, idx) => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div class="am-num">${idx + 1}</div>
      <div class="admin-list-info">
        <div class="admin-list-title">${esc(member.name)}</div>
      </div>
      <div class="admin-list-actions">
        <button class="icon-btn am-edit" data-id="${esc(member.docId)}" style="color:var(--primary)" title="編集">
          <span class="material-icons">edit</span>
        </button>
        <button class="icon-btn am-toggle" data-id="${esc(member.docId)}" style="color:#e65100" title="無効化">
          <span class="material-icons">person_off</span>
        </button>
        <button class="icon-btn am-delete" data-id="${esc(member.docId)}" style="color:#d32f2f" title="削除">
          <span class="material-icons">delete</span>
        </button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.am-edit').forEach(btn =>
    btn.addEventListener('click', () => awOpenMemberModal(btn.dataset.id)));
  list.querySelectorAll('.am-toggle').forEach(btn =>
    btn.addEventListener('click', () => awDeactivateMember(btn.dataset.id)));
  list.querySelectorAll('.am-delete').forEach(btn =>
    btn.addEventListener('click', () => awDeleteMember(btn.dataset.id)));
}

function awBuildCodesGrid(selectedCodes = []) {
  const grid = document.getElementById('mf-codes-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const sections = [
    { label: '開会', codes: ['A','B','W'] },
    { label: '神の言葉の宝', codes: ['C','D','E'] },
    { label: '野外奉仕に励む', codes: ['F','G','H','I','J','K','L','M','N','O','Q'] },
    { label: 'クリスチャンとして生活する', codes: ['R','S','T','U','V'] },
  ];
  sections.forEach(sec => {
    const items = sec.codes.filter(c => awCodes[c]);
    if (items.length === 0) return;
    const group = document.createElement('div');
    group.className = 'aw-code-group';
    group.innerHTML = `<div class="aw-code-group-title">${esc(sec.label)}</div>`;
    const list = document.createElement('div');
    list.className = 'aw-code-group-list';
    items.forEach(code => {
      const lbl = document.createElement('label');
      lbl.className = 'aw-code-chip';
      const checked = selectedCodes.includes(code);
      lbl.innerHTML = `<input type="checkbox" name="codes" value="${esc(code)}" ${checked ? 'checked' : ''}>
        <span class="aw-chip-label${checked ? ' aw-chip-on' : ''}">${esc(awCodes[code])}</span>`;
      lbl.querySelector('input').addEventListener('change', (e) => {
        lbl.querySelector('.aw-chip-label').classList.toggle('aw-chip-on', e.target.checked);
      });
      list.appendChild(lbl);
    });
    group.appendChild(list);
    grid.appendChild(group);
  });
}

function awOpenMemberModal(id) {
  awEditingMemberId = id || null;
  document.getElementById('member-modal-title').textContent = id ? 'メンバーを編集' : 'メンバーを追加';

  const form = document.getElementById('member-form');
  form.reset();

  if (id) {
    const member = awMembers.find(mb => mb.docId === id);
    if (!member) return;
    document.getElementById('mf-name').value     = member.name || '';
    document.getElementById('mf-gender').value   = member.gender || '男';
    document.getElementById('mf-position').value = member.position || '生徒男';
    document.getElementById('mf-family').value   = member.familyGroup || '';
    awBuildCodesGrid(member.eligibleCodes || []);
  } else {
    awBuildCodesGrid([]);
  }

  document.getElementById('member-modal').classList.remove('hidden');
}

function awCloseMemberModal() {
  document.getElementById('member-modal').classList.add('hidden');
  awEditingMemberId = null;
}

async function awDeactivateMember(id) {
  if (!confirm('このメンバーを無効化しますか？')) return;
  try {
    await db.collection('mwbMembers').doc(id).update({ active: false });
    await awLoadMembers();
    awRenderMemberList();
  } catch(e) {
    alert('エラー: ' + e.message);
  }
}

async function awDeleteMember(id) {
  const member = awMembers.find(mb => mb.docId === id);
  const name = member ? member.name : id;
  if (!confirm(`「${name}」を完全に削除しますか？\nこの操作は取り消せません。`)) return;
  try {
    await db.collection('mwbMembers').doc(id).delete();
    await awLoadMembers();
    awRenderMemberList();
  } catch(e) {
    alert('削除エラー: ' + e.message);
  }
}

// ── メンバーフォーム送信 ──────────────────────

async function awSaveMember(e) {
  e.preventDefault();
  const name        = document.getElementById('mf-name').value.trim();
  const gender      = document.getElementById('mf-gender').value;
  const position    = document.getElementById('mf-position').value;
  const familyGroup = document.getElementById('mf-family').value.trim();
  const eligibleCodes = [...document.querySelectorAll('#mf-codes-grid input:checked')].map(cb => cb.value);

  if (!name) { alert('名前を入力してください'); return; }

  const data = { name, gender, position, familyGroup, eligibleCodes, active: true };

  try {
    if (awEditingMemberId) {
      await db.collection('mwbMembers').doc(awEditingMemberId).update(data);
    } else {
      const maxId = awMembers.reduce((max, mb) => Math.max(max, mb.memberId || 0), 0);
      data.memberId = maxId + 1;
      await db.collection('mwbMembers').add(data);
    }
    awCloseMemberModal();
    await awLoadMembers();
    awRenderMemberList();
  } catch(err) {
    alert('保存エラー: ' + err.message);
  }
}

// ══════════════════════════════════════════════
// スケジュール編集
// ══════════════════════════════════════════════

const AW_SECTIONS = ['開会','神の言葉の宝','野外奉仕に励む','クリスチャンとして生活する'];
const AW_ALL_CODES = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W'];

async function awOpenScheduleEditor(weekId) {
  awEditorWeekId = weekId;
  const snap = await db.collection('mwbWeeks').doc(weekId).get();
  if (!snap.exists) return;
  awEditorItems = JSON.parse(JSON.stringify(snap.data().items || []));

  const week = awWeeks.find(w => w.id === weekId);
  const titleEl = document.getElementById('aw-editor-title');
  if (titleEl) titleEl.textContent = week ? awGetThursdayLabel(week) : weekId;

  awRenderEditorList();

  document.getElementById('aw-editor-add-btn').onclick = () => {
    awEditorItems.push({ type:'item', section:'クリスチャンとして生活する', title:'', minutes:'5', number:'', codes:[] });
    awRenderEditorList();
  };
  document.getElementById('aw-editor-save-btn').onclick = awSaveEditorItems;

  navigate('admin-schedule-editor');
}

function awRenderEditorList() {
  const list = document.getElementById('aw-editor-list');
  if (!list) return;
  list.innerHTML = '';

  // 時間計算用
  let minutesOffset = 0;
  const timeOf = awEditorItems.map(item => {
    const h = 19 + Math.floor(minutesOffset / 60);
    const m = minutesOffset % 60;
    const t = `${h}:${m.toString().padStart(2,'0')}`;
    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes || '0') || 0);
    if (item.section === 'クリスチャンとして生活する' && minutesOffset < 47) minutesOffset = 47;
    return t;
  });

  awEditorItems.forEach((item, idx) => {
    // 行間の「＋ 挿入」ボタン
    const ins = document.createElement('button');
    ins.className = 'aw-editor-insert-btn';
    ins.innerHTML = '<span class="material-icons">add</span>';
    ins.onclick = () => {
      awEditorItems.splice(idx, 0, { type:'item', section: item.section, title:'', minutes:'5', number:'', codes:[] });
      awRenderEditorList();
    };
    list.appendChild(ins);

    const row = document.createElement('div');
    row.className = 'aw-editor-row';

    const sectionOpts = AW_SECTIONS.map(s =>
      `<option value="${s}" ${item.section===s?'selected':''}>${s}</option>`
    ).join('');
    const codeOpts = AW_ALL_CODES.map(c =>
      `<option value="${c}" ${(item.codes||[]).includes(c)?'selected':''}>${c}: ${awCodes[c]||c}</option>`
    ).join('');

    row.innerHTML = `
      <span class="aw-editor-time">${timeOf[idx]}</span>
      <select class="aw-editor-section">${sectionOpts}</select>
      <input class="aw-editor-title" type="text" placeholder="プログラム名" value="${esc(item.title||'')}">
      <input class="aw-editor-min" type="number" min="0" max="60" placeholder="分" value="${esc(item.minutes||'')}">
      <select class="aw-editor-code" title="割当コード">${codeOpts}</select>
      <div class="aw-editor-btns">
        <button class="icon-btn aw-up"   title="上へ" ${idx===0?'disabled':''}><span class="material-icons">arrow_upward</span></button>
        <button class="icon-btn aw-down" title="下へ" ${idx===awEditorItems.length-1?'disabled':''}><span class="material-icons">arrow_downward</span></button>
        <button class="icon-btn aw-del"  title="削除" style="color:#d32f2f"><span class="material-icons">delete</span></button>
      </div>
    `;

    row.querySelector('.aw-editor-section').onchange = e => { item.section = e.target.value; awRenderEditorList(); };
    row.querySelector('.aw-editor-title').oninput   = e => { item.title   = e.target.value; };
    row.querySelector('.aw-editor-min').oninput     = e => { item.minutes = e.target.value; awRenderEditorList(); };
    row.querySelector('.aw-editor-code').onchange   = e => {
      item.codes = e.target.value ? [e.target.value] : [];
    };
    row.querySelector('.aw-up').onclick = () => {
      if (idx > 0) { [awEditorItems[idx-1], awEditorItems[idx]] = [awEditorItems[idx], awEditorItems[idx-1]]; awRenderEditorList(); }
    };
    row.querySelector('.aw-down').onclick = () => {
      if (idx < awEditorItems.length-1) { [awEditorItems[idx], awEditorItems[idx+1]] = [awEditorItems[idx+1], awEditorItems[idx]]; awRenderEditorList(); }
    };
    row.querySelector('.aw-del').onclick = () => {
      if (confirm('この行を削除しますか？')) { awEditorItems.splice(idx, 1); awRenderEditorList(); }
    };

    list.appendChild(row);
  });

  // 末尾挿入ボタン
  const insEnd = document.createElement('button');
  insEnd.className = 'aw-editor-insert-btn';
  insEnd.innerHTML = '<span class="material-icons">add</span>';
  insEnd.onclick = () => {
    awEditorItems.push({ type:'item', section:'クリスチャンとして生活する', title:'', minutes:'5', number:'', codes:[] });
    awRenderEditorList();
  };
  list.appendChild(insEnd);
}

async function awSaveEditorItems() {
  if (!awEditorWeekId) return;
  try {
    await db.collection('mwbWeeks').doc(awEditorWeekId).update({ items: awEditorItems });
    // awWeeks のキャッシュも更新
    const week = awWeeks.find(w => w.id === awEditorWeekId);
    if (week) week.items = JSON.parse(JSON.stringify(awEditorItems));
    alert('保存しました');
    navigate('admin-program');
  } catch(e) { alert('保存エラー: ' + e.message); }
}

// ══════════════════════════════════════════════
// 集会ページ — カレンダー＋予定表表示
// ══════════════════════════════════════════════

let skSelectedMonth = null; // {year, month}
let skConfirmedWeeks = [];
let skPublicTalks = [];
let skAvailableMonths = []; // [{year,month}]

async function loadAssignmentWeekDisplay() {
  const monthEl = document.getElementById('shukai-month-selector');
  const container = document.getElementById('assignment-week-display');
  if (!monthEl || !container) return;
  monthEl.innerHTML = '<div class="loading">読み込み中...</div>';
  container.innerHTML = '';

  try {
    const weeksSnap = await db.collection('mwbWeeks').orderBy('importedAt','desc').limit(26).get();
    const weeks = weeksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    skConfirmedWeeks = [];
    for (const week of weeks) {
      const meetDate = awGetThursdayDate(week);
      if (!meetDate) continue;

      const searchStart = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() - 1, 0, 0, 0));
      const searchEnd   = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() + 1, 0, 0, 0));
      const hSnap = await db.collection('assignmentHistory')
        .where('date', '>=', firebase.firestore.Timestamp.fromDate(searchStart))
        .where('date', '<', firebase.firestore.Timestamp.fromDate(searchEnd))
        .get();

      if (hSnap.size === 0) continue;
      const slots = {};
      hSnap.docs.forEach(d => {
        const { code, memberName } = d.data();
        if (code && memberName) slots[code] = memberName;
      });
      const topics = week.topics || {};
      skConfirmedWeeks.push({ week, slots, topics, meetDate });
    }
    skConfirmedWeeks.sort((a,b) => a.meetDate - b.meetDate);

    // 公開講演データ取得
    try {
      const ptSnap = await db.collection('PUBLIC_TALKS').orderBy('date').get();
      skPublicTalks = ptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { skPublicTalks = []; }

    // 利用可能な月を抽出
    const monthSet = new Set();
    skConfirmedWeeks.forEach(cw => {
      monthSet.add(cw.meetDate.getFullYear() + '-' + cw.meetDate.getMonth());
    });
    skPublicTalks.forEach(pt => {
      const d = skParsePtDate(pt.date);
      if (d) monthSet.add(d.getFullYear() + '-' + d.getMonth());
    });
    skAvailableMonths = [...monthSet].sort().map(k => {
      const [y,m] = k.split('-');
      return { year: parseInt(y), month: parseInt(m) };
    });

    // 今月を自動選択（なければ最も近い月）
    const today = new Date();
    const curKey = today.getFullYear() + '-' + today.getMonth();
    if (monthSet.has(curKey)) {
      skSelectedMonth = { year: today.getFullYear(), month: today.getMonth() };
    } else if (skAvailableMonths.length > 0) {
      skSelectedMonth = skAvailableMonths[skAvailableMonths.length - 1];
    }

    skRenderMonthSelector();
    skShowMonthSchedule();

  } catch(e) {
    monthEl.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function skParsePtDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0,0,0,0);
  return d;
}

function skRenderMonthSelector() {
  const el = document.getElementById('shukai-month-selector');
  if (!el) return;
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  let html = '<div class="sk-month-tiles">';
  skAvailableMonths.forEach(({ year, month }) => {
    const isSelected = skSelectedMonth && skSelectedMonth.year === year && skSelectedMonth.month === month;
    html += `<button class="sk-month-tile${isSelected ? ' selected' : ''}" onclick="skSelectMonth(${year},${month})">${year}年${monthNames[month]}</button>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function skSelectMonth(y, m) {
  skSelectedMonth = { year: y, month: m };
  skRenderMonthSelector();
  skShowMonthSchedule();
}

function skShowMonthSchedule() {
  const container = document.getElementById('assignment-week-display');
  if (!container || !skSelectedMonth) { if (container) container.innerHTML = ''; return; }
  container.innerHTML = '';

  const { year, month } = skSelectedMonth;

  // 該当月の週中集会
  const monthWeeks = skConfirmedWeeks.filter(cw =>
    cw.meetDate.getFullYear() === year && cw.meetDate.getMonth() === month
  );

  // 該当月の公開講演
  const monthPts = skPublicTalks.filter(pt => {
    const d = skParsePtDate(pt.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });

  if (monthWeeks.length === 0 && monthPts.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:16px">この月の予定表はありません</div>';
    return;
  }

  // 日付順にまとめて表示
  const events = [];
  monthWeeks.forEach(cw => events.push({ type: 'midweek', date: cw.meetDate, data: cw }));
  monthPts.forEach(pt => { const d = skParsePtDate(pt.date); if (d) events.push({ type: 'weekend', date: d, data: pt }); });
  events.sort((a,b) => a.date - b.date);

  events.forEach(ev => {
    if (ev.type === 'midweek') skRenderMidweekCard(ev.data, container);
    else skRenderPublicTalkCard(ev.data, container);
  });
}

function skRenderMidweekCard({ week, slots, topics }, container) {
  const thuLabel = awGetThursdayLabel(week);
  const items = week.items || [];

  const section = document.createElement('div');
  section.className = 'aw-inline-section';

  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  const chairName = slots['A'] || '';
  hdr.innerHTML = `
    <div>
      <div class="aw-inline-title">${esc(thuLabel)}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
    <div style="text-align:right;color:white;font-size:13px">
      <div style="font-weight:700">司会者：${esc(chairName)}</div>
    </div>
  `;
  section.appendChild(hdr);

  const tableDiv = document.createElement('div');
  tableDiv.className = 'aw-week-table';

  const PAIR_OF = { H:'I', J:'K', L:'M', N:'O', U:'V' };
  const PAIR_PARTNER_SET = new Set(Object.values(PAIR_OF));
  let prevSec = '', minutesOffset = 0;

  items.forEach(item => {
    const sec = item.section;
    if (sec !== prevSec && sec !== '開会') {
      if (sec === 'クリスチャンとして生活する') minutesOffset = 47;
      const secHdr = document.createElement('div');
      secHdr.className = 'aw-section-header';
      secHdr.style.background = AW_SECTION_COLORS[sec] || '#333';
      secHdr.textContent = sec;
      tableDiv.appendChild(secHdr);
      prevSec = sec;
    }

    const h = 19 + Math.floor(minutesOffset / 60);
    const mi = minutesOffset % 60;
    const timeStr = `${h}:${mi.toString().padStart(2,'0')}`;

    let assigneeText = '';
    if (item.title === '閉会の言葉') {
      assigneeText = slots['A'] || '';
    } else if (item.codes && item.codes.length > 0) {
      const parts = [];
      const isSongWithPrayer = item.type === 'song' && item.codes.includes('B');
      if (isSongWithPrayer) {
        const prayerName = slots['B'] || '';
        if (prayerName) parts.push(prayerName);
      } else {
        item.codes.forEach(code => {
          const base = awGetBase(code);
          if (PAIR_PARTNER_SET.has(base)) return;
          const partnerBase = PAIR_OF[base];
          const partnerCode = code.includes('_') ? code.replace(base, partnerBase) : partnerBase;
          const name = slots[code] || slots[base] || '';
          const partnerName = slots[partnerCode] || slots[partnerBase] || '';
          if (partnerName) parts.push(`${name} / ${partnerName}`);
          else if (name) parts.push(name);
        });
      }
      assigneeText = parts.join('、');
    }

    const itemCodes = item.codes || [];
    let topicText = '';
    if (itemCodes.includes('T')) topicText = topics['T'] || '';
    else if (item.title && item.title.includes('会衆で考えたいこと')) {
      const tCode = itemCodes.find(c => topics[awGetBase(c)]);
      if (tCode) topicText = topics[awGetBase(tCode)] || '';
    }

    const row = document.createElement('div');
    row.className = 'aw-row';
    row.innerHTML = `
      <div class="aw-row-time">${timeStr}</div>
      <div class="aw-row-info">
        ${item.number ? `<span class="aw-row-num">${esc(item.number)}.</span>` : ''}
        <span class="aw-row-title">${esc(item.title)}</span>
        ${item.minutes ? `<span class="aw-row-min">（${esc(item.minutes)}分）</span>` : ''}
      </div>
      <div class="aw-row-assignees" style="font-size:0.9rem;color:var(--text)">${esc(assigneeText)}</div>
    `;
    tableDiv.appendChild(row);

    if (topicText) {
      const topicRow = document.createElement('div');
      topicRow.className = 'aw-topic-row-full';
      topicRow.innerHTML = `<label class="aw-topic-label">主題</label><span style="font-size:13px">${esc(topicText)}</span>`;
      tableDiv.appendChild(topicRow);
    }

    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes||'0')||0);
  });

  section.appendChild(tableDiv);
  container.appendChild(section);
}

function skRenderPublicTalkCard(pt, container) {
  const section = document.createElement('div');
  section.className = 'aw-inline-section';

  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  hdr.style.background = '#6a1b9a';

  const dateLabel = pt.date || '';
  const chairman = pt.chairman || '';
  hdr.innerHTML = `
    <div>
      <div class="aw-inline-title">週末集会</div>
      <div class="aw-inline-sub" style="color:#e1bee7">${esc(dateLabel)}</div>
    </div>
    <div style="text-align:right;color:white;font-size:13px">
      ${chairman ? `<div style="font-weight:700">司会者：${esc(chairman)}</div>` : ''}
    </div>
  `;
  section.appendChild(hdr);

  const tableDiv = document.createElement('div');
  tableDiv.className = 'aw-week-table';
  tableDiv.style.padding = '12px 16px';

  const rows = [];
  if (pt.speaker) rows.push({ label: '講演者', value: pt.speaker });
  if (pt.congregation) rows.push({ label: '会衆', value: pt.congregation });
  if (pt.talkNumber) rows.push({ label: '講演番号', value: pt.talkNumber });
  if (pt.talkTitle) rows.push({ label: '講演主題', value: pt.talkTitle });
  if (pt.wtStudy) rows.push({ label: 'ものみの塔研究', value: pt.wtStudy });
  if (pt.wtConductor) rows.push({ label: '司会者', value: pt.wtConductor });
  if (pt.wtReader) rows.push({ label: '読み手', value: pt.wtReader });
  if (pt.note) rows.push({ label: '備考', value: pt.note });

  if (rows.length === 0) {
    tableDiv.innerHTML = '<div style="color:var(--text-light);font-size:14px">詳細情報はまだ登録されていません</div>';
  } else {
    rows.forEach(r => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px';
      row.innerHTML = `<span style="color:var(--text-light);flex-shrink:0">${esc(r.label)}</span><span style="font-weight:500;text-align:right">${esc(r.value)}</span>`;
      tableDiv.appendChild(row);
    });
  }

  section.appendChild(tableDiv);
  container.appendChild(section);
}

// ══════════════════════════════════════════════
// プログラム表作成ページ
// ══════════════════════════════════════════════

async function initProgramPage() {
  const list = document.getElementById('program-list');
  if (list) list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awLoadCodes(), awLoadWeeks()]);
    awRenderProgramList();
  } catch(e) {
    if (list) list.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

// 各週の主題データを保持（一括確定で使用）
const awProgramTopics = {};

function awRenderProgramList() {
  const list = document.getElementById('program-list');
  if (!list) return;
  if (awWeeks.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">upload_file</span>ZIPファイルをインポートしてください</div>';
    return;
  }
  list.innerHTML = '';

  // 一括確定ボタン
  const btnArea = document.createElement('div');
  btnArea.style.cssText = 'padding:8px 0 16px;display:flex;gap:8px;justify-content:flex-end';
  const confirmAllBtn = document.createElement('button');
  confirmAllBtn.className = 'btn-primary';
  confirmAllBtn.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle">check_circle</span> 全週プログラム確定';
  confirmAllBtn.addEventListener('click', awConfirmAllPrograms);
  btnArea.appendChild(confirmAllBtn);
  list.appendChild(btnArea);

  awWeeks.forEach(week => awBuildProgramSection(week, list));
}

function awBuildProgramSection(week, container) {
  const ps = week.programStatus || 'draft';
  const labelMap = { draft:'未確定', confirmed:'確定済' };
  const classMap = { draft:'aw-badge-none', confirmed:'aw-badge-confirmed' };
  const topics = Object.assign({}, week.topics || {});
  awProgramTopics[week.id] = topics;
  const items = week.items || [];

  const section = document.createElement('div');
  section.className = 'aw-inline-section';
  section.dataset.weekId = week.id;

  // ヘッダー
  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  hdr.innerHTML = `
    <div>
      <div class="aw-inline-title">${esc(awGetThursdayLabel(week))}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="aw-edit-schedule-btn aw-header-sq-btn" title="スケジュール編集">
        <span class="material-icons">edit_calendar</span>
        <span>編集</span>
      </button>
      <span class="aw-status-badge ${classMap[ps]}">${labelMap[ps]}</span>
    </div>
  `;
  hdr.querySelector('.aw-edit-schedule-btn').addEventListener('click', () => awOpenScheduleEditor(week.id));
  section.appendChild(hdr);

  // プログラム内容（読み取り専用 + 主題入力）
  const tableDiv = document.createElement('div');
  tableDiv.className = 'aw-week-table';
  let prevSec = '', minutesOffset = 0;

  items.forEach(item => {
    const sec = item.section;
    if (sec !== prevSec && sec !== '開会') {
      if (sec === 'クリスチャンとして生活する') minutesOffset = 47;
      const secHdr = document.createElement('div');
      secHdr.className = 'aw-section-header';
      secHdr.style.background = AW_SECTION_COLORS[sec] || '#333';
      secHdr.textContent = sec;
      tableDiv.appendChild(secHdr);
      prevSec = sec;
    }

    const h = 19 + Math.floor(minutesOffset / 60);
    const mi = minutesOffset % 60;
    const timeStr = `${h}:${mi.toString().padStart(2,'0')}`;

    const row = document.createElement('div');
    row.className = 'aw-row';
    row.innerHTML = `
      <div class="aw-row-time">${timeStr}</div>
      <div class="aw-row-info">
        ${item.number ? `<span class="aw-row-num">${esc(item.number)}.</span>` : ''}
        <span class="aw-row-title">${esc(item.title)}</span>
        ${item.minutes ? `<span class="aw-row-min">（${esc(item.minutes)}分）</span>` : ''}
      </div>
    `;
    tableDiv.appendChild(row);

    // 主題入力行
    const itemCodes = item.codes || [];
    const isTopicItem = itemCodes.some(c => awGetBase(c) === 'T') || (item.title && item.title.includes('会衆で考えたいこと'));
    if (isTopicItem) {
      const tc = itemCodes.find(c => awGetBase(c) === 'T');
      const topicKey = tc ? 'T' : awGetBase(itemCodes[0] || 'T');
      const topicRow = document.createElement('div');
      topicRow.className = 'aw-topic-row-full';
      topicRow.innerHTML = `
        <label class="aw-topic-label">主題</label>
        <input class="aw-topic-input" data-code="${esc(topicKey)}" type="text"
          placeholder="主題を入力" value="${esc(topics[topicKey] || '')}">
      `;
      topicRow.querySelector('.aw-topic-input').addEventListener('input', (e) => {
        topics[topicKey] = e.target.value;
      });
      tableDiv.appendChild(topicRow);
    }

    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes||'0')||0);
  });

  section.appendChild(tableDiv);
  container.appendChild(section);
}

async function awConfirmAllPrograms() {
  if (!confirm('表示中の全週のプログラムを確定しますか？')) return;
  let count = 0;
  try {
    for (const week of awWeeks) {
      const topics = awProgramTopics[week.id] || {};
      await db.collection('mwbWeeks').doc(week.id).set({
        programStatus: 'confirmed',
        topics: topics,
      }, { merge: true });
      week.programStatus = 'confirmed';
      week.topics = Object.assign({}, topics);
      count++;
    }
    // バッジ更新
    document.querySelectorAll('.aw-inline-section').forEach(sec => {
      const badge = sec.querySelector('.aw-status-badge');
      if (badge) { badge.className = 'aw-status-badge aw-badge-confirmed'; badge.textContent = '確定済'; }
    });
    alert(`${count}週分のプログラムを確定しました`);
  } catch(e) { alert('確定エラー: ' + e.message); }
}

// ── イベント登録（DOMContentLoaded） ──────────

document.addEventListener('DOMContentLoaded', () => {
  // 管理画面カード
  document.getElementById('admin-manage-program')
    ?.addEventListener('click', () => navigate('admin-program'));
  document.getElementById('admin-manage-assignment')
    ?.addEventListener('click', () => navigate('admin-assignment'));
  document.getElementById('admin-manage-members')
    ?.addEventListener('click', () => navigate('admin-members'));

  // 週詳細ボタン
  document.getElementById('aw-generate-btn')?.addEventListener('click', awGenerateAssignments);
  document.getElementById('aw-confirm-btn') ?.addEventListener('click', awConfirmAssignment);

  // メンバーモーダル
  document.getElementById('am-add-btn')         ?.addEventListener('click', () => awOpenMemberModal(null));
  document.getElementById('member-modal-close')  ?.addEventListener('click', awCloseMemberModal);
  document.getElementById('member-overlay')      ?.addEventListener('click', awCloseMemberModal);
  document.getElementById('mf-cancel')           ?.addEventListener('click', awCloseMemberModal);
  document.getElementById('member-form')         ?.addEventListener('submit', awSaveMember);

  // 集会曜日プルダウン変更時に再描画
  document.getElementById('aw-meeting-day')?.addEventListener('change', () => {
    if (awWeeks.length > 0) awRenderProgramList();
  });

  // ZIPインポート
  awInitImport();
});
