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
  awMembers.sort((a,b) => (a.memberId||0) - (b.memberId||0));
}

async function awLoadHistory() {
  const snap = await db.collection('assignmentHistory').get();
  awHistory = {};
  snap.docs.forEach(d => {
    const { memberName, code, date } = d.data();
    if (!memberName || !code) return;
    if (!awHistory[memberName]) awHistory[memberName] = {};
    if (!awHistory[memberName][code]) awHistory[memberName][code] = { lastDate: null, count: 0 };
    awHistory[memberName][code].count++;
    let dt = null;
    if (date) dt = date.toDate ? date.toDate() : new Date(date);
    if (dt && (!awHistory[memberName][code].lastDate || dt > awHistory[memberName][code].lastDate)) {
      awHistory[memberName][code].lastDate = dt;
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
    if (date && date.toDate) date = date.toDate().toISOString().substring(0,10);
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
      const topics = awLiveTopics[week.id] || {};
      if (Object.keys(slots).length === 0) continue;

      await db.collection('assignments').doc(week.id).set({
        weekId: week.id, status: 'confirmed',
        confirmedAt: firebase.firestore.Timestamp.now(),
        confirmedBy: currentUser?.email || '', slots, topics,
      }, { merge: true });

      const [ym, wn] = week.id.split('_');
      const year  = parseInt(ym.substring(0,4)), month = parseInt(ym.substring(4,6));
      const day   = (parseInt(wn) - 1) * 7 + 1;
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

      const batch = db.batch();
      Object.entries(slots).forEach(([code, name]) => {
        if (!name || name === '（該当者なし）') return;
        const member = awMembers.find(mb => mb.name === name);
        batch.set(db.collection('assignmentHistory').doc(), {
          memberId: member?.memberId ?? null, memberName: name,
          code: awGetBase(code), date: dateStr, weekId: week.id,
        });
      });
      await batch.commit();

      // バッジ更新
      const badge = document.querySelector(`.aw-inline-section[data-week-id="${week.id}"] .aw-status-badge`);
      if (badge) { badge.className = 'aw-status-badge aw-badge-confirmed'; badge.textContent = '確定'; }
      week.assignmentStatus = 'confirmed';
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
    records: records.filter(r => AW_ELDER_MS_CODES.has(r.code)),
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
      cell[date][code] = memberName;
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

  await Promise.all(awWeeks.map(async week => {
    const asnap = await db.collection('assignments').doc(week.id).get();
    if (asnap.exists) {
      week.assignmentStatus = asnap.data().status || 'draft';
      const raw = asnap.data().slots || {};
      week.slots = {};
      Object.entries(raw).forEach(([c, v]) => {
        week.slots[c] = typeof v === 'object' ? v.name : String(v);
      });
      week.topics = asnap.data().topics || {};
    } else {
      week.assignmentStatus = 'none';
      week.slots  = {};
      week.topics = {};
    }
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

function awBuildWeekSection(week, container) {
  const st       = week.assignmentStatus || 'none';
  const labelMap = { none:'未割当', draft:'下書き', confirmed:'確定' };
  const classMap = { none:'aw-badge-none', draft:'aw-badge-draft', confirmed:'aw-badge-confirmed' };
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
      <div class="aw-inline-title">${esc(week.dateRange || week.id)}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
    <span class="aw-status-badge ${classMap[st]}">${labelMap[st]}</span>
  `;
  section.appendChild(hdr);

  // ── アクションボタン ──
  const actions = document.createElement('div');
  actions.className = 'aw-week-actions';
  actions.innerHTML = `
    <button class="btn-secondary aw-btn-save">
      <span class="material-icons" style="font-size:18px;vertical-align:middle">save</span> 保存
    </button>
  `;
  section.appendChild(actions);

  // ── 予定表テーブル ──
  const table = document.createElement('div');
  table.className = 'aw-week-table';
  awBuildInlineTable(items, slots, topics, table);
  section.appendChild(table);

  container.appendChild(section);

  // ── ボタンイベント ──
  const badge = hdr.querySelector('.aw-status-badge');

  actions.querySelector('.aw-btn-save').addEventListener('click', async () => {
    try {
      await db.collection('assignments').doc(week.id).set({
        weekId: week.id, status: 'draft',
        updatedAt: firebase.firestore.Timestamp.now(),
        updatedBy: currentUser?.email || '', slots, topics,
      }, { merge: true });
      week.assignmentStatus = 'draft';
      week.slots  = Object.assign({}, slots);
      week.topics = Object.assign({}, topics);
      badge.className = `aw-status-badge ${classMap.draft}`;
      badge.textContent = labelMap.draft;
      alert('保存しました');
    } catch(e) { alert('保存エラー: ' + e.message); }
  });

}

function awBuildInlineTable(items, slots, topics, container) {
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
        const base     = awGetBase(code);
        const label    = awCodes[base] || base;
        const eligible = awMembers.filter(mb => (mb.eligibleCodes || []).includes(base));
        const cur      = slots[code] || '';
        const opts     = eligible.map(mb =>
          `<option value="${esc(mb.name)}" ${mb.name === cur ? 'selected' : ''}>${esc(mb.name)}</option>`
        ).join('');
        const topicHtml = base === 'T'
          ? `<input class="aw-topic-input" data-code="${esc(base)}" type="text"
               placeholder="主題を入力" value="${esc(topics[base] || '')}">`
          : '';
        return `<div class="aw-slot">
          <label class="aw-slot-label">${esc(label)}</label>
          <select class="aw-slot-select" data-code="${esc(code)}">
            <option value="">—</option>${opts}
          </select>${topicHtml}</div>`;
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
}

function awUpdateClosingNoteIn(container, slots) {
  const note = container.querySelector('.aw-closing-note');
  if (note) note.textContent = `司会者と同じ（${slots['A'] || '（未割当）'}）`;
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

    // セクション
    if (raw === '神の言葉の宝')             { currentSection = '神の言葉の宝'; continue; }
    if (raw === '野外奉仕に励む')            { currentSection = '野外奉仕に励む'; continue; }
    if (raw === 'クリスチャンとして生活する') { currentSection = 'クリスチャンとして生活する'; continue; }

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
      if (PARTNER_CODES.has(code)) return; // 相手コードは担当行でまとめて表示

      const section = sectionOf[code] || '';
      if (section && section !== prevSection) {
        const hdr = document.createElement('div');
        hdr.className = 'aw-section-header';
        hdr.style.background = AW_SECTION_COLORS[section] || '#333';
        hdr.textContent = section;
        container.appendChild(hdr);
        prevSection = section;
      }

      const partnerCode = PARTNER_OF[code];
      let label = awCodes[code] || code;
      let nameStr;
      if (partnerCode && byCode[partnerCode]) {
        // ペアの場合「担当 / 相手」ラベルと「担当名 / 相手名」
        const leadLabel    = awCodes[code]        || code;
        const partnerLabel = awCodes[partnerCode] || partnerCode;
        label   = leadLabel.replace(/ ?— ?(担当|相手)/, '').replace(/（(司会|朗読者)）/, '');
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

  // 既存の割当を読み込む
  const asnap = await db.collection('assignments').doc(weekId).get();
  if (asnap.exists) {
    const slots = asnap.data().slots || {};
    Object.entries(slots).forEach(([code, val]) => {
      awCurrentSlots[code] = typeof val === 'object' ? val.name : String(val);
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

function awRunGeneration(allCodes, members, history) {
  const eligibility = {};
  const genderMap   = {};
  const familyMap   = {};
  members.forEach(mb => {
    eligibility[mb.name] = new Set(mb.eligibleCodes || []);
    genderMap[mb.name]   = mb.gender || '';
    familyMap[mb.name]   = mb.familyGroup || '';
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

// ── 保存 ──────────────────────────────────────

async function awSaveAssignment() {
  if (!awCurrentWeekId) return;
  const slots = {};
  Object.entries(awCurrentSlots).forEach(([code, name]) => { if (name) slots[code] = name; });
  try {
    await db.collection('assignments').doc(awCurrentWeekId).set({
      weekId:    awCurrentWeekId,
      status:    'draft',
      updatedAt: firebase.firestore.Timestamp.now(),
      updatedBy: currentUser?.email || '',
      slots,
    }, { merge: true });
    // 週一覧のステータスを更新
    const wk = awWeeks.find(w => w.id === awCurrentWeekId);
    if (wk) wk.assignmentStatus = 'draft';
    alert('保存しました');
  } catch(e) {
    alert('保存エラー: ' + e.message);
  }
}

// ── 確定 ──────────────────────────────────────

async function awConfirmAssignment() {
  if (!awCurrentWeekId) return;
  if (!confirm('割当を確定しますか？\n確定するとassignmentHistoryに記録されます。')) return;

  const slots = {};
  Object.entries(awCurrentSlots).forEach(([code, name]) => { if (name) slots[code] = name; });

  try {
    await db.collection('assignments').doc(awCurrentWeekId).set({
      weekId:      awCurrentWeekId,
      status:      'confirmed',
      confirmedAt: firebase.firestore.Timestamp.now(),
      confirmedBy: currentUser?.email || '',
      slots,
    }, { merge: true });

    // weekIdから日付を推定 (例: "202507_01" → 2025年7月1日)
    const [ym, wn] = awCurrentWeekId.split('_');
    const year  = parseInt(ym.substring(0, 4));
    const month = parseInt(ym.substring(4, 6));
    const day   = (parseInt(wn) - 1) * 7 + 1;
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    // assignmentHistoryにバッチ書き込み
    const batch = db.batch();
    Object.entries(awCurrentSlots).forEach(([code, name]) => {
      if (!name || name === '（該当者なし）') return;
      const baseCode = awGetBase(code);
      const ref    = db.collection('assignmentHistory').doc();
      const member = awMembers.find(mb => mb.name === name);
      batch.set(ref, {
        memberId:   member?.memberId ?? null,
        memberName: name,
        code:       baseCode,
        date:       dateStr,
        weekId:     awCurrentWeekId,
      });
    });
    await batch.commit();

    // 履歴を再読み込み（次回の自動生成スコアに反映）
    await awLoadHistory();

    const wk = awWeeks.find(w => w.id === awCurrentWeekId);
    if (wk) wk.assignmentStatus = 'confirmed';
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
  awMembers.forEach(member => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div class="admin-list-info">
        <div class="admin-list-title">${esc(member.name)}</div>
        <div class="admin-list-date">${esc(member.position||'')} / ${esc(member.gender||'')}${member.familyGroup ? ' / ' + esc(member.familyGroup) : ''}</div>
      </div>
      <div class="admin-list-actions">
        <button class="icon-btn am-edit" data-id="${esc(member.docId)}" style="color:var(--primary)">
          <span class="material-icons">edit</span>
        </button>
        <button class="icon-btn am-toggle" data-id="${esc(member.docId)}" style="color:#d32f2f">
          <span class="material-icons">person_off</span>
        </button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.am-edit').forEach(btn =>
    btn.addEventListener('click', () => awOpenMemberModal(btn.dataset.id)));
  list.querySelectorAll('.am-toggle').forEach(btn =>
    btn.addEventListener('click', () => awDeactivateMember(btn.dataset.id)));
}

function awBuildCodesGrid(selectedCodes = []) {
  const grid = document.getElementById('mf-codes-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(awCodes).forEach(([code, label]) => {
    const lbl = document.createElement('label');
    lbl.className = 'aw-code-check';
    lbl.innerHTML = `<input type="checkbox" name="codes" value="${esc(code)}" ${selectedCodes.includes(code) ? 'checked' : ''}><span>${esc(code)}: ${esc(label)}</span>`;
    grid.appendChild(lbl);
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

// ── イベント登録（DOMContentLoaded） ──────────

document.addEventListener('DOMContentLoaded', () => {
  // 管理画面カード
  document.getElementById('admin-manage-assignment')
    ?.addEventListener('click', () => navigate('admin-assignment'));
  document.getElementById('admin-manage-members')
    ?.addEventListener('click', () => navigate('admin-members'));

  // 週詳細ボタン
  document.getElementById('aw-generate-btn')?.addEventListener('click', awGenerateAssignments);
  document.getElementById('aw-save-btn')    ?.addEventListener('click', awSaveAssignment);
  document.getElementById('aw-confirm-btn') ?.addEventListener('click', awConfirmAssignment);

  // メンバーモーダル
  document.getElementById('am-add-btn')         ?.addEventListener('click', () => awOpenMemberModal(null));
  document.getElementById('member-modal-close')  ?.addEventListener('click', awCloseMemberModal);
  document.getElementById('member-overlay')      ?.addEventListener('click', awCloseMemberModal);
  document.getElementById('mf-cancel')           ?.addEventListener('click', awCloseMemberModal);
  document.getElementById('member-form')         ?.addEventListener('submit', awSaveMember);

  // ZIPインポート
  awInitImport();
});
