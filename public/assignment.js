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
let awIsHistoryView   = false;
let awEditorWeekId    = null;
let awEditorItems     = [];
function awGetMeetingDayNum() {
  return awMeetingDayCache;
}

// 会衆設定 (CONFIG/app.meetingDays) から midweek (平日) の曜日を取得してキャッシュ
let awMeetingDayCache = 4; // 木曜デフォルト
async function awInitMeetingDay() {
  if (typeof getAppConfig !== 'function') return;
  try {
    const cfg = await getAppConfig();
    const days = Array.isArray(cfg.meetingDays) && cfg.meetingDays.length > 0 ? cfg.meetingDays : [4];
    const midweek = days.find(d => d >= 1 && d <= 5);
    awMeetingDayCache = midweek != null ? midweek : 4;
  } catch(e) { /* デフォルト維持 */ }
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
  const userList = window.getUserListCached
    ? await window.getUserListCached()
    : (await db.collection('USER_LIST').get()).docs.map(d => ({ docId: d.id, ...d.data() }));
  awMembers = userList
    .map(data => {
      const arr = (window._parseStatus ? window._parseStatus(data.status) : (Array.isArray(data.status) ? data.status : []));
      let position = '';
      const isEl = (window.deriveIsElder ? window.deriveIsElder(data) : false) || arr.includes('EL');
      const isMs = (window.deriveIsMS ? window.deriveIsMS(data) : false) || arr.includes('MS');
      if (isEl) position = '長老';
      else if (isMs) position = '援助奉仕者';
      else if (data.gender === '男') position = '生徒男';
      else if (data.gender === '女') position = '生徒女';
      return { ...data, status: arr, position, _isInactive: arr.includes('inactive') };
    })
    .filter(m => !m._isInactive && m.name);
  awMembers.sort((a,b) => (a.furigana||a.name||'').localeCompare(b.furigana||b.name||'', 'ja'));
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
  // イベントリスナーを先に登録（returnで飛ばされないように）
  document.getElementById('aw-generate-all-btn')?.addEventListener('click', awGenerateAll);
  document.getElementById('aw-confirm-all-btn')?.addEventListener('click', awConfirmAll);
  document.getElementById('aw-assignment-edit-all-btn')?.addEventListener('click', awEditAllAssignments);

  const createList = document.getElementById('assignment-create-list');
  if (createList) createList.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await awInitMeetingDay();
    await awLoadAll();
    await awLoadWeeks();
    // プログラム確定済み or 公開済みの週だけ表示
    const confirmedPrograms = awWeeks.filter(w => w.programStatus === 'confirmed' || w.programStatus === 'published');
    if (confirmedPrograms.length === 0) {
      createList.innerHTML = '<div class="empty-state">プログラム確定済みの週がありません<br><span style="font-size:13px;color:var(--text-light)">先にプログラム表作成で確定してください</span></div>';
      return;
    }
    awWeeks = confirmedPrograms;
    awRenderCreateList();
  } catch(e) {
    if (createList) createList.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function awGenerateAll() {
  if (awMembers.length === 0) { alert('メンバーが登録されていません'); return; }
  const filtered = awFilterWeeksByMonth(awWeeks, awAssignSelectedMonth);
  if (filtered.length === 0) { alert('表示中の月に週がありません'); return; }

  // 履歴のコピーを作成（週ごとに仮の履歴を積み上げる）
  const tempHistory = JSON.parse(JSON.stringify(awHistory, (k, v) =>
    v instanceof Date ? v.toISOString() : v
  ));
  // Date文字列を復元
  for (const name of Object.keys(tempHistory)) {
    for (const code of Object.keys(tempHistory[name])) {
      const h = tempHistory[name][code];
      if (h.lastDate) h.lastDate = new Date(h.lastDate);
    }
  }

  let generated = 0;
  const skipped = []; // [{label, reason}]
  filtered.forEach(week => {
    const label = awGetMeetingLabel(week);
    if (week.conventionType) { skipped.push({ label, reason: `${week.conventionType}の週` }); return; }
    const slots = awLiveSlots[week.id];
    if (!slots) { skipped.push({ label, reason: '週が画面に描画されていません（一度別の月へ切替→戻すと解決します）' }); return; }
    const items = week.items || [];
    const allCodes = [...new Set(items.flatMap(i => i.codes || []))];
    if (allCodes.length === 0) { skipped.push({ label, reason: 'プログラム項目（items）が空です。プログラム表作成からインポートし直してください' }); return; }

    const meetDate = awGetMeetingDate(week) || new Date();
    const result = awRunGeneration(allCodes, awMembers, tempHistory, meetDate);

    // 生成結果を仮履歴に反映（次週で同じ人が選ばれにくくする）
    Object.entries(result).forEach(([code, name]) => {
      if (name && name !== '（該当者なし）') {
        slots[code] = name;
        const base = awGetBase(code);
        if (!tempHistory[name]) tempHistory[name] = {};
        if (!tempHistory[name][base]) tempHistory[name][base] = { lastDate: null, count: 0 };
        tempHistory[name][base].lastDate = meetDate;
        tempHistory[name][base].count++;
      }
    });

    // 同じ週ID の section が複数ページ（プログラム表作成・担当者策定・確認公開）に
    // 存在し得るため、担当者策定のリスト配下に限定する
    const section = document.querySelector(`#assignment-create-list .aw-inline-section[data-week-id="${week.id}"]`);
    if (!section) { skipped.push({ label, reason: 'DOMにセクションが見つかりません' }); return; }
    section.querySelectorAll('.aw-slot-select').forEach(sel => {
      sel.value = slots[sel.dataset.code] || '';
    });
    awUpdateClosingNoteIn(section.querySelector('.aw-week-table'), slots);
    generated++;
  });
  if (generated === 0) {
    const detail = skipped.length === 0
      ? '対象の週がありません'
      : skipped.map(s => `• ${s.label}: ${s.reason}`).join('\n');
    alert('自動生成できませんでした。\n\n' + detail);
  } else if (skipped.length > 0) {
    const detail = skipped.map(s => `• ${s.label}: ${s.reason}`).join('\n');
    alert(`${generated}週分を生成しました。\n\n以下の週はスキップしました:\n${detail}`);
  }
}

async function awConfirmAll() {
  if (!(await customConfirm('表示中の全週の割当を確定しますか？\nassignmentHistoryに記録されます。'))) return;
  let confirmed = 0;
  const targetWeeks = awFilterWeeksByMonth(awWeeks, awAssignSelectedMonth);
  try {
    for (const week of targetWeeks) {
      if (week.conventionType) continue;
      const slots  = awLiveSlots[week.id]  || {};
      if (Object.keys(slots).length === 0) continue;

      const thuDate = awGetThursdayDate(week) || new Date();
      await awReplaceHistory(thuDate, slots);

      week.hasAssignmentHistory = true;
      confirmed++;
    }
    await awLoadHistory();
    // 全体ステータスバッジを更新（編集モード切替も含む）
    awRefreshAssignToolbarState();
    alert(`${confirmed}週分を確定しました`);
  } catch(e) { alert('確定エラー: ' + e.message); }
}

function awRefreshAssignToolbarState() {
  const filtered = awFilterWeeksByMonth(awWeeks, awAssignSelectedMonth);
  const targets = filtered.filter(w => !w.conventionType);
  const allConfirmed = targets.length > 0 && targets.every(w => w.hasAssignmentHistory);
  const list = document.getElementById('assignment-create-list');
  if (list) list.classList.toggle('aw-program-list-locked', allConfirmed);
  const generateBtn = document.getElementById('aw-generate-all-btn');
  const confirmAllBtn = document.getElementById('aw-confirm-all-btn');
  const editAllBtn = document.getElementById('aw-assignment-edit-all-btn');
  if (generateBtn)   generateBtn.style.display   = allConfirmed ? 'none' : '';
  if (confirmAllBtn) confirmAllBtn.style.display = allConfirmed ? 'none' : '';
  if (editAllBtn)    editAllBtn.style.display    = allConfirmed ? '' : 'none';
  const badge = document.getElementById('aw-assign-state-badge');
  if (badge) {
    if (allConfirmed) {
      const allPublished = targets.every(w => w.programStatus === 'published');
      badge.style.display = '';
      if (allPublished) {
        badge.textContent = '確定（公開中）';
        badge.className = 'aw-program-state-badge aw-pstate-published';
      } else {
        badge.textContent = '確定（確認・公開待ち）';
        badge.className = 'aw-program-state-badge aw-pstate-await-publish';
      }
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
      badge.className = 'aw-program-state-badge';
    }
  }
}

// ══════════════════════════════════════════════
// 確認・公開ページ (ステップ③)
// ══════════════════════════════════════════════

async function initReviewPage() {
  const list = document.getElementById('review-list');
  if (list) list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awInitMeetingDay(), awLoadCodes(), awLoadWeeks()]);
    awRenderReviewPage();
  } catch(e) {
    if (list) list.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function awRenderReviewPage() {
  const list = document.getElementById('review-list');
  if (!list) return;
  awRenderStepBar('review-step-bar', 3);

  if (!awSharedMonth) {
    list.innerHTML = awBackToHubEmpty();
    return;
  }

  // 確定済（プログラム表 step① で確定）または公開済の週を表示
  // 担当者未策定でも一覧に出し、未割当を可視化する
  const targetWeeks = awWeeks.filter(w =>
    w.programStatus === 'confirmed' || w.programStatus === 'published'
  );

  const filtered = awFilterWeeksByMonth(targetWeeks, awSharedMonth);
  list.innerHTML = '';
  awUpdateReviewStateBadge(filtered);
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">drafts</span>この月の確認待ち / 公開済の週はありません<br><span style="font-size:13px;color:var(--text-light)">先に「担当者策定」で下書き保存してください</span></div>';
    return;
  }
  filtered.forEach(week => awBuildReviewSection(week, list));
}

function awUpdateReviewStateBadge(filteredWeeks) {
  const badge = document.getElementById('aw-review-state-badge');
  const pdfBtn = document.getElementById('review-print-pdf-btn');
  const publishBtn = document.getElementById('review-publish-all-btn');
  const targets = filteredWeeks.filter(w => !w.conventionType);

  if (targets.length === 0) {
    if (badge) badge.style.display = 'none';
    if (pdfBtn) pdfBtn.style.display = 'none';
    if (publishBtn) publishBtn.style.display = '';
    return;
  }
  const allPublished = targets.every(w => w.programStatus === 'published');
  const nonePublished = targets.every(w => w.programStatus !== 'published');

  // PDF ダウンロードは全週公開後のみ。公開ボタンは未公開がある間だけ表示。
  if (pdfBtn)     pdfBtn.style.display     = allPublished ? '' : 'none';
  if (publishBtn) publishBtn.style.display = allPublished ? 'none' : '';

  if (!badge) return;
  badge.style.display = '';
  if (allPublished) {
    badge.textContent = '確定（公開中）';
    badge.className = 'aw-program-state-badge aw-pstate-published';
  } else if (nonePublished) {
    badge.textContent = '確定（確認・公開待ち）';
    badge.className = 'aw-program-state-badge aw-pstate-await-publish';
  } else {
    badge.textContent = '一部公開済';
    badge.className = 'aw-program-state-badge aw-pstate-await-publish';
  }
}

function awBuildReviewSection(week, container) {
  const isPublished = week.programStatus === 'published';
  const slots = week.slots || {};
  const topics = week.topics || {};
  const chairName = slots['A'] || '';

  // 公開後と全く同じデザインのカードを共通関数で構築。
  // 各週の状態バッジは廃止し、ヘッダー右にはアクションボタン + 司会者だけ。
  const section = awBuildPublishedProgramSection({
    week, slots, topics,
    headerRightHtml: `
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div style="color:white;font-size:13px;font-weight:700">司会者：${esc(chairName)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${isPublished
            ? `<button class="aw-state-btn aw-state-btn-draft" data-act="unpublish"><span class="material-icons">undo</span>公開取消</button>`
            : `<button class="aw-state-btn aw-state-btn-publish" data-act="publish"><span class="material-icons">publish</span>承認・公開</button>
               <button class="aw-state-btn" data-act="back"><span class="material-icons">edit</span>差戻（担当者策定へ）</button>`
          }
        </div>
      </div>
    `,
  });

  const hdr = section.querySelector('.aw-inline-header');
  hdr?.querySelector('[data-act="publish"]')?.addEventListener('click', () => awReviewPublishWeek(week, section));
  hdr?.querySelector('[data-act="unpublish"]')?.addEventListener('click', () => awReviewUnpublishWeek(week, section));
  hdr?.querySelector('[data-act="back"]')?.addEventListener('click', () => navigate('admin-assignment'));

  container.appendChild(section);
}

async function awReviewPublishWeek(week, sectionEl) {
  if (!(await customConfirm(`${awGetThursdayLabel(week)} を公開しますか？\n成員の集会ページに表示されます。`))) return;
  try {
    await db.collection('mwbWeeks').doc(week.id).set({
      programStatus: 'published',
      publishedAt: firebase.firestore.Timestamp.now(),
    }, { merge: true });
    week.programStatus = 'published';
    awRenderReviewPage();
  } catch(e) { alert('公開エラー: ' + e.message); }
}

async function awReviewUnpublishWeek(week, sectionEl) {
  if (!(await customConfirm(`${awGetThursdayLabel(week)} の公開を取消しますか？\n再度確認・公開が必要になります。`))) return;
  try {
    await db.collection('mwbWeeks').doc(week.id).set({
      programStatus: 'confirmed',
    }, { merge: true });
    week.programStatus = 'confirmed';
    awRenderReviewPage();
  } catch(e) { alert('取消エラー: ' + e.message); }
}

async function awReviewPublishAll() {
  const draftWeeks = awFilterWeeksByMonth(awWeeks, awSharedMonth)
    .filter(w => w.programStatus === 'confirmed' && w.hasAssignmentHistory && !w.conventionType);
  if (draftWeeks.length === 0) {
    alert('公開対象の確認待ち週がありません');
    return;
  }
  if (!(await customConfirm(`表示中の確認待ち ${draftWeeks.length} 週を一括公開しますか？`))) return;
  try {
    const now = firebase.firestore.Timestamp.now();
    const batch = db.batch();
    draftWeeks.forEach(w => {
      batch.set(db.collection('mwbWeeks').doc(w.id), {
        programStatus: 'published', publishedAt: now,
      }, { merge: true });
    });
    await batch.commit();
    draftWeeks.forEach(w => { w.programStatus = 'published'; w.publishedAt = now; });
    awRenderReviewPage();
    alert(`${draftWeeks.length}週を公開しました`);
  } catch(e) { alert('一括公開エラー: ' + e.message); }
}

// 公開済の予定表を印刷用 HTML として新規ウィンドウで開き、印刷ダイアログ起動
function awReviewDownloadPdf() {
  if (!awSharedMonth) { alert('月が選択されていません'); return; }
  const targets = awFilterWeeksByMonth(awWeeks, awSharedMonth)
    .filter(w => w.programStatus === 'published');
  if (targets.length === 0) {
    alert('公開済みの週がありません。先に「全週承認・公開」を実行してください。');
    return;
  }

  const PAIR_OF = { H:'I', J:'K', L:'M', N:'O', U:'V' };
  const PAIR_PARTNER_SET = new Set(Object.values(PAIR_OF));

  function renderWeek(week) {
    const slots = week.slots || {};
    const topics = week.topics || {};
    const items = week.items || [];
    const convention = week.conventionType || '';
    const isCircuitVisit = !!week.circuitVisit;
    const chairName = slots['A'] || '';

    let body = '';
    if (convention) {
      body = `<div class="conv-box">${esc(convention)}</div>`;
    } else {
      let prevSec = '', minutesOffset = 0;
      items.forEach(item => {
        const sec = item.section;
        if (sec && sec !== prevSec && sec !== '開会') {
          if (sec === 'クリスチャンとして生活する') minutesOffset = 47;
          const color = AW_SECTION_COLORS[sec] || '#333';
          body += `<div class="sec-hdr" style="background:${esc(color)}">${esc(sec)}</div>`;
          prevSec = sec;
        }
        const h = 19 + Math.floor(minutesOffset / 60);
        const mi = ((minutesOffset % 60) + 60) % 60;
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

        body += `<div class="row">
          <div class="time">${esc(timeStr)}</div>
          <div class="info">${item.number ? `<span class="num">${esc(item.number)}.</span>` : ''}<span class="title">${esc(item.title || '')}</span>${item.minutes ? `<span class="min">（${esc(item.minutes)}分）</span>` : ''}</div>
          <div class="who">${esc(assigneeText)}</div>
        </div>`;
        if (topicText) {
          body += `<div class="topic"><b>主題</b> ${esc(topicText)}</div>`;
        }
        minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes||'0')||0);
      });
    }

    return `<section class="week">
      <header class="week-hdr">
        <div class="week-title">${esc(awGetThursdayLabel(week))}${isCircuitVisit ? '<span class="cv-tag">巡回訪問</span>' : ''}</div>
        <div class="week-sub">${esc(week.bibleChapter || '')}</div>
        <div class="week-chair">司会者：${esc(chairName)}</div>
      </header>
      ${body}
    </section>`;
  }

  const pages = targets.map(renderWeek).join('');
  const title = `集会予定表 ${awSharedMonth.year}年${awSharedMonth.month + 1}月`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Meiryo","Yu Gothic",sans-serif; color:#222; }
  @page { size: A4 portrait; margin: 10mm 8mm; }
  .week { page-break-after: always; padding: 4mm; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 6mm; }
  .week:last-child { page-break-after: auto; }
  .week-hdr { background: #047CBC; color:#fff; padding: 6px 10px; margin: -4mm -4mm 6px; border-radius: 4px 4px 0 0; display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; }
  .week-title { font-size: 14px; font-weight: 700; }
  .cv-tag { margin-left: 8px; font-size: 11px; background:#fff; color:#047CBC; padding: 1px 6px; border-radius: 8px; }
  .week-sub { font-size: 11px; opacity: 0.9; }
  .week-chair { font-size: 12px; font-weight: 700; }
  .sec-hdr { color:#fff; font-size: 11px; font-weight:700; padding: 3px 8px; margin: 6px 0 4px; border-radius: 3px; }
  .row { display: grid; grid-template-columns: 38px 1fr 1fr; gap: 6px; padding: 3px 4px; border-bottom: 1px dashed #ddd; font-size: 11px; align-items: baseline; }
  .time { color:#777; }
  .num { color:#999; margin-right: 4px; }
  .title { font-weight: 600; }
  .min { color:#999; margin-left: 4px; }
  .who { font-size: 11px; color:#222; }
  .topic { padding: 2px 8px 4px; font-size: 10px; color:#444; background: #f5f8fa; border-left: 3px solid #047CBC; margin: 0 0 4px; }
  .topic b { font-size: 10px; margin-right: 4px; color: #047CBC; }
  .conv-box { text-align:center; font-size:24px; font-weight:700; color:#888; padding: 40px 0; border: 2px dashed #aaa; border-radius: 6px; margin: 8px 0; }
  @media screen { body { background:#eee; padding:20px; } .week { background:#fff; width:210mm; margin: 0 auto 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); padding: 8mm; min-height: 280mm; } .week-hdr { margin: -8mm -8mm 8px; } }
</style></head><body>${pages}
<script>window.onafterprint=function(){};</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('ポップアップがブロックされました。ポップアップを許可してください。'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ── S-89 生成 ──────────────────────────────
const S89_LEAD_CODES = new Set(['E','H','J','L','N','Q']);
const S89_PARTNER_MAP = { H:'I', J:'K', L:'M', N:'O' };
let s89SelectedMonth = null;
let s89Weeks = [];

function awGetS89PartnerCode(leadCode) {
  const base = awGetBase(leadCode);
  const partnerBase = S89_PARTNER_MAP[base];
  if (!partnerBase) return null;
  const suffix = leadCode.includes('_') ? leadCode.split('_')[1] : '';
  return suffix ? `${partnerBase}_${suffix}` : partnerBase;
}

function s89CollectSlips(weeks, selectedMonth) {
  const monthWeeks = awFilterWeeksByMonth(weeks, selectedMonth);
  const slips = [];
  monthWeeks.forEach(week => {
    if (week.conventionType) return;
    const meetDate = awGetMeetingDate(week);
    if (!meetDate) return;
    const dateStr = `${meetDate.getFullYear()}年${meetDate.getMonth()+1}月${meetDate.getDate()}日`;
    const slots = awLiveSlots[week.id] || week.slots || {};
    const items = week.items || [];
    items.forEach(item => {
      const codes = item.codes || [];
      codes.forEach(code => {
        const base = awGetBase(code);
        if (!S89_LEAD_CODES.has(base)) return;
        const name = slots[code] || slots[base] || '';
        if (!name) return;
        const partnerCode = awGetS89PartnerCode(code);
        const partner = partnerCode ? (slots[partnerCode] || slots[awGetBase(partnerCode)] || '') : '';
        const partLabel = item.number ? `${item.number}. ${item.title}` : item.title;
        slips.push({ name, partner, date: dateStr, part: partLabel });
      });
    });
  });
  return slips;
}

// S-89 PDF — ブラウザ印刷機能でPDF保存（確実・シンプル）
function s89DownloadPdf(slips, selectedMonth) {
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function cardHtml(slip) {
    return `<div class="card">
      <div class="title">クリスチャンとしての生活と<br>奉仕の集会　生徒の方へ</div>
      <div class="field"><b>氏名：</b><span class="val">${esc(slip.name)}</span></div>
      <div class="field"><b>相手：</b><span class="val">${esc(slip.partner)}</span></div>
      <div class="field"><b>日付：</b><span class="val">${esc(slip.date)}</span></div>
      <div class="field"><b>担当部分：</b><span class="val">${esc(slip.part)}</span></div>
      <div class="venue"><b>会場：</b></div>
      <div class="venue-list">☑ 本会場<br>☐ 第2会場<br>☐ 第3会場</div>
      <div class="footer">
        <div class="note">注記：資料と学習ポイントが「生活と奉仕　集会ワークブック」に載っています。「クリスチャンとしての生活と奉仕の集会　ガイドライン」（S-38）にある担当部分の内容を読んで確認してください。</div>
        <div class="formid">S-89-J　11/23</div>
      </div>
    </div>`;
  }

  let pages = '';
  for (let i = 0; i < slips.length; i += 4) {
    const batch = slips.slice(i, i + 4);
    pages += `<div class="page">${batch.map(s => cardHtml(s)).join('')}</div>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>S-89_${selectedMonth.year}年${selectedMonth.month+1}月</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: "Hiragino Sans","Hiragino Kaku Gothic ProN","Meiryo","Yu Gothic",sans-serif; }
  @page { size: A4 portrait; margin: 8mm; }
  .page { width:100%; height:100vh; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:4mm; page-break-after:always; }
  .page:last-child { page-break-after:auto; }
  .card { border:1px solid #aaa; border-radius:3px; padding:14px 18px; display:flex; flex-direction:column; overflow:hidden; }
  .title { text-align:center; font-size:12px; font-weight:bold; line-height:1.6; margin-bottom:12px; }
  .field { margin-bottom:8px; font-size:11px; }
  .field b { font-size:11px; }
  .val { color:#1565c0; border-bottom:1px dotted #1565c0; padding-bottom:0; }
  .venue { margin-top:8px; font-size:11px; }
  .venue b { font-size:11px; }
  .venue-list { padding-left:14px; font-size:10px; line-height:1.8; margin-top:4px; }
  .footer { margin-top:auto; padding-top:8px; border-top:1px solid #ddd; }
  .note { font-size:7.5px; color:#555; line-height:1.5; }
  .formid { font-size:7.5px; color:#999; margin-top:3px; }
  @media screen {
    body { background:#eee; display:flex; flex-direction:column; align-items:center; gap:20px; padding:20px; }
    .page { width:210mm; height:297mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.2); padding:8mm; }
  }
</style></head><body>${pages}
<script>window.onafterprint=function(){window.close();};</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('ポップアップがブロックされました。ポップアップを許可してください。'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// 担当者策定ページからS-89プレビューへ遷移
function awGenerateS89() {
  navigate('admin-s89');
}

// S-89専用ページ
async function initS89Page() {
  const preview = document.getElementById('s89-preview-list');
  if (preview) preview.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awInitMeetingDay(), awLoadCodes(), awLoadWeeks()]);
    // 公開済み かつ 割当確定済みの週のみ
    s89Weeks = awWeeks.filter(w => w.programStatus === 'published' && w.hasAssignmentHistory);
    awRenderStepBar('s89-step-bar', 4);

    if (!awSharedMonth) {
      if (preview) preview.innerHTML = awBackToHubEmpty();
      return;
    }
    if (s89Weeks.length === 0) {
      if (preview) preview.innerHTML = '<div class="empty-state">公開済みの割当データがありません<br><span style="font-size:13px;color:var(--text-light)">「確認・公開」で公開してください</span></div>';
      return;
    }
    s89RenderPreview();
  } catch(e) {
    if (preview) preview.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
  document.getElementById('s89-download-btn')?.addEventListener('click', s89DownloadFromPage);
}

function s89RenderPreview() {
  const preview = document.getElementById('s89-preview-list');
  if (!preview) return;
  const slips = s89CollectSlips(s89Weeks, s89SelectedMonth);
  if (slips.length === 0) {
    preview.innerHTML = '<div class="empty-state">この月のS-89対象の割当がありません</div>';
    return;
  }
  preview.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 's89-card-grid';
  slips.forEach(slip => {
    grid.appendChild(s89BuildVisualCard(slip));
  });
  preview.appendChild(grid);
}

function s89BuildVisualCard(slip) {
  const card = document.createElement('div');
  card.className = 's89-card';
  card.innerHTML = `
    <div class="s89-card-title">クリスチャンとしての生活と<br>奉仕の集会　生徒の方へ</div>
    <div class="s89-field"><span class="s89-label">氏名：</span><span class="s89-value">${esc(slip.name)}</span></div>
    <div class="s89-field"><span class="s89-label">相手：</span><span class="s89-value">${esc(slip.partner)}</span></div>
    <div class="s89-field"><span class="s89-label">日付：</span><span class="s89-value">${esc(slip.date)}</span></div>
    <div class="s89-field"><span class="s89-label">担当部分：</span><span class="s89-value">${esc(slip.part)}</span></div>
    <div class="s89-venue-section">
      <div class="s89-label">会場：</div>
      <div class="s89-venue-list">
        <div>☑ 本会場</div>
        <div>☐ 第2会場</div>
        <div>☐ 第3会場</div>
      </div>
    </div>
    <div class="s89-footer">
      <div class="s89-note"><b>注記：</b>資料と学習ポイントが「生活と奉仕　集会ワークブック」に載っています。「クリスチャンとしての生活と奉仕の集会　ガイドライン」（S-38）にある担当部分の内容を読んで確認してください。</div>
      <div class="s89-form-id">S-89-J　11/23</div>
    </div>
  `;
  return card;
}

async function s89DownloadFromPage() {
  const btn = document.getElementById('s89-download-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle">hourglass_top</span> 生成中...'; }
  try {
    const slips = s89CollectSlips(s89Weeks, s89SelectedMonth);
    if (slips.length === 0) { alert('S-89対象の割当がありません'); return; }
    await s89DownloadPdf(slips, s89SelectedMonth);
  } catch(e) { console.error(e); alert('S-89生成に失敗しました: ' + (e.message || e)); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle">picture_as_pdf</span> PDFダウンロード'; } }
}

// 長老・援助奉仕者が担当するコード（生徒プレゼン H-O,P を除く）
const AW_ELDER_MS_CODES = new Set(['A','B','C','D','E','F','G','Q','R','S','T','U','V','W']);

async function initHistoryPage() {
  const elderList   = document.getElementById('assignment-elder-list');
  const historyList = document.getElementById('assignment-history-list');
  if (elderList)   elderList.innerHTML   = '<div class="loading">読み込み中...</div>';
  if (historyList) historyList.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awInitMeetingDay(), awLoadCodes(), awLoadHistoryWeeks()]);
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
  awRenderStepBar('assign-step-bar', 2);

  if (awWeeks.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">upload_file</span>ZIPファイルをインポートしてください</div>';
    return;
  }
  if (!awSharedMonth) {
    list.innerHTML = awBackToHubEmpty();
    return;
  }

  const filtered = awFilterWeeksByMonth(awWeeks, awAssignSelectedMonth);
  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state">この月の確定済みプログラムはありません</div>';
    list.classList.remove('aw-program-list-locked');
    return;
  }
  filtered.forEach(week => awBuildWeekSection(week, list));

  // 月内の非大会週の確定状態に応じてツールバーボタンとステータスバッジを更新
  awRefreshAssignToolbarState();
}

// 週の集会日の Date を返す（customMeetDate優先、なければ曜日計算）
function awGetMeetingDate(week) {
  // カスタム日付が設定されていればそちらを使用
  if (week.customMeetDate) {
    const d = new Date(week.customMeetDate + 'T00:00:00');
    if (!isNaN(d.getTime())) return d;
  }
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

// 週の月曜日（dateRangeの開始日）を返す — 月分類用
function awGetWeekMonday(week) {
  if (!week.dateRange) return null;
  const m = week.dateRange.match(/^(\d+)月(\d+)/);
  if (!m) return null;
  const issueYear  = parseInt(week.id.substring(0, 4));
  const issueMonth = parseInt(week.id.substring(4, 6));
  const startMonth = parseInt(m[1]);
  const startDay   = parseInt(m[2]);
  const startYear  = (issueMonth === 12 && startMonth === 1) ? issueYear + 1 : issueYear;
  return new Date(startYear, startMonth - 1, startDay);
}

function awGetMeetingLabel(week) {
  const d = awGetMeetingDate(week);
  if (!d) return week.dateRange || week.id;
  const dayNames = ['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}月${d.getDate()}日（${dayNames[d.getDay()]}）`;
}
function awGetThursdayLabel(week) { return awGetMeetingLabel(week); }

function awBuildWeekSection(week, container) {
  const slots  = Object.assign({}, week.slots  || {});
  const topics = Object.assign({}, week.topics || {});
  const items  = week.items || [];
  const convention = week.conventionType || '';
  const isCircuitVisit = !!week.circuitVisit;

  const section = document.createElement('div');
  section.className = 'aw-inline-section';
  section.dataset.weekId = week.id;
  awLiveSlots[week.id]  = slots;
  awLiveTopics[week.id] = topics;

  // ── ヘッダー ──
  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  hdr.innerHTML = `
    <div class="aw-header-left">
      <div class="aw-inline-title">${esc(awGetThursdayLabel(week))}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
  `;
  section.appendChild(hdr);

  // ── 大会の場合：グレーアウト＋ラベル、割当テーブルなし ──
  if (convention) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'aw-program-body';
    bodyWrap.style.minHeight = '120px';
    section.appendChild(bodyWrap);
    awApplyConventionState(section, convention);
  } else {
    const table = document.createElement('div');
    table.className = 'aw-week-table';
    awBuildAssignmentTable(items, slots, topics, table);
    section.appendChild(table);
  }
  if (isCircuitVisit) awApplyCircuitVisit(section, true);

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

  const curWeek = awWeeks.find(w => w.id === awCurrentWeekId);
  const curMeetDate = curWeek ? awGetMeetingDate(curWeek) : new Date();
  const result = awRunGeneration(allCodes, awMembers, awHistory, curMeetDate);

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

function awRunGeneration(allCodes, members, history, meetDate) {
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
  const refDate = meetDate || new Date();

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

      // 野外奉仕コードは全FM横断で最新割当日を見る（同じ人が連続週に出ないように）
      let h;
      if (AW_FIELD_MINISTRY_CODES.has(base)) {
        const ph = history[name] || {};
        let latestDate = null, totalCount = 0;
        for (const fmBase of AW_FIELD_MINISTRY_CODES) {
          const fh = ph[fmBase];
          if (fh) {
            if (fh.lastDate && (!latestDate || fh.lastDate > latestDate)) latestDate = fh.lastDate;
            totalCount += (fh.count || 0);
          }
        }
        h = { lastDate: latestDate, count: totalCount };
      } else {
        h = (history[name] || {})[base] || { lastDate: null, count: 0 };
      }
      const daysSince = h.lastDate ? Math.floor((refDate - h.lastDate) / 86400000) : 9999;
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
  if (!(await customConfirm('割当を確定しますか？\nassignmentHistoryに記録されます。'))) return;

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

// ══════════════════════════════════════════════
// スケジュール編集
// ══════════════════════════════════════════════

const AW_SECTIONS = ['開会','神の言葉の宝','野外奉仕に励む','クリスチャンとして生活する'];
const AW_ALL_CODES = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W'];

async function awOpenScheduleEditor(weekId) {
  awEditorWeekId = weekId;
  const snap = await db.collection('mwbWeeks').doc(weekId).get();
  if (!snap.exists) return;
  const data = snap.data();
  awEditorItems = JSON.parse(JSON.stringify(data.items || []));

  const week = awWeeks.find(w => w.id === weekId);
  const titleEl = document.getElementById('aw-editor-title');
  if (titleEl) titleEl.textContent = week ? awGetThursdayLabel(week) : weekId;

  // 区分（大会種別） / 巡回訪問 / 集会日 の初期値を反映
  const conv = data.conventionType || '';
  document.querySelectorAll('input[name="aw-editor-conv"]').forEach(r => {
    r.checked = (r.value === conv);
  });
  const cvVisitEl = document.getElementById('aw-editor-cvvisit');
  if (cvVisitEl) cvVisitEl.checked = !!data.circuitVisit;
  const meetDateEl = document.getElementById('aw-editor-meetdate');
  const meetDateRow = document.getElementById('aw-editor-meetdate-row');
  if (meetDateEl) meetDateEl.value = data.customMeetDate || '';
  if (meetDateRow) meetDateRow.style.display = (!!data.circuitVisit) ? '' : 'none';

  if (cvVisitEl) cvVisitEl.onchange = () => {
    if (meetDateRow) meetDateRow.style.display = cvVisitEl.checked ? '' : 'none';
  };
  document.getElementById('aw-editor-meetdate-clear')?.addEventListener('click', () => {
    if (meetDateEl) meetDateEl.value = '';
  });

  awRenderEditorList();

  document.getElementById('aw-editor-save-btn').onclick = awSaveEditorItems;

  navigate('admin-schedule-editor');
}

function awRenderEditorList() {
  const list = document.getElementById('aw-editor-list');
  if (!list) return;
  list.innerHTML = '';

  // 時間計算（item.time が明示的に設定されていればそこから再計算）
  let minutesOffset = 0;
  const timeOf = awEditorItems.map(item => {
    if (item.time && /^\d{1,2}:\d{2}$/.test(item.time)) {
      const [h, m] = item.time.split(':').map(Number);
      minutesOffset = (h - 19) * 60 + m;
    }
    const h = 19 + Math.floor(minutesOffset / 60);
    const m = ((minutesOffset % 60) + 60) % 60;
    const t = `${h}:${m.toString().padStart(2,'0')}`;
    minutesOffset += item.type === 'song' ? 5 : (parseInt(item.minutes || '0') || 0);
    if (item.section === 'クリスチャンとして生活する' && minutesOffset < 47) minutesOffset = 47;
    return t;
  });

  let prevSection = '';
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

    // セクションヘッダー（背景色付き、元の予定表と同じデザイン）
    const sec = item.section;
    if (sec && sec !== prevSection && sec !== '開会') {
      const hdr = document.createElement('div');
      hdr.className = 'aw-section-header';
      hdr.style.background = AW_SECTION_COLORS[sec] || '#333';
      hdr.textContent = sec;
      list.appendChild(hdr);
      prevSection = sec;
    }

    const row = document.createElement('div');
    row.className = 'aw-editor-row';

    const firstCode = (item.codes || [])[0] || '';
    const codeOpts = '<option value="">— 未指定 —</option>' +
      AW_ALL_CODES.map(c =>
        `<option value="${c}" ${firstCode === c ? 'selected' : ''}>${c}: ${awCodes[c]||c}</option>`
      ).join('');

    row.innerHTML = `
      <input class="aw-editor-time" type="time" value="${timeOf[idx]}">
      <input class="aw-editor-title" type="text" placeholder="プログラム名" value="${esc(item.title||'')}">
      <input class="aw-editor-min" type="number" min="0" max="60" placeholder="分" value="${esc(item.minutes||'')}">
      <select class="aw-editor-code" title="割当コード">${codeOpts}</select>
      <div class="aw-editor-btns">
        <button class="icon-btn aw-up"   title="上へ" ${idx===0?'disabled':''}><span class="material-icons">arrow_upward</span></button>
        <button class="icon-btn aw-down" title="下へ" ${idx===awEditorItems.length-1?'disabled':''}><span class="material-icons">arrow_downward</span></button>
        <button class="icon-btn aw-del"  title="削除" style="color:#d32f2f"><span class="material-icons">delete</span></button>
      </div>
    `;

    row.querySelector('.aw-editor-time').onchange  = e => {
      const v = (e.target.value || '').trim();
      if (v) item.time = v; else delete item.time;
      awRenderEditorList();
    };
    row.querySelector('.aw-editor-title').oninput  = e => { item.title   = e.target.value; };
    row.querySelector('.aw-editor-min').oninput    = e => { item.minutes = e.target.value; awRenderEditorList(); };
    row.querySelector('.aw-editor-code').onchange  = e => {
      item.codes = e.target.value ? [e.target.value] : [];
    };
    row.querySelector('.aw-up').onclick = () => {
      if (idx > 0) { [awEditorItems[idx-1], awEditorItems[idx]] = [awEditorItems[idx], awEditorItems[idx-1]]; awRenderEditorList(); }
    };
    row.querySelector('.aw-down').onclick = () => {
      if (idx < awEditorItems.length-1) { [awEditorItems[idx], awEditorItems[idx+1]] = [awEditorItems[idx+1], awEditorItems[idx]]; awRenderEditorList(); }
    };
    row.querySelector('.aw-del').onclick = async () => {
      if (await customConfirm('この行を削除しますか？')) { awEditorItems.splice(idx, 1); awRenderEditorList(); }
    };

    list.appendChild(row);
  });

  // 末尾挿入ボタン
  const insEnd = document.createElement('button');
  insEnd.className = 'aw-editor-insert-btn';
  insEnd.innerHTML = '<span class="material-icons">add</span>';
  insEnd.onclick = () => {
    const lastSec = awEditorItems.length > 0 ? awEditorItems[awEditorItems.length - 1].section : 'クリスチャンとして生活する';
    awEditorItems.push({ type:'item', section: lastSec, title:'', minutes:'5', number:'', codes:[] });
    awRenderEditorList();
  };
  list.appendChild(insEnd);
}

async function awSaveEditorItems() {
  if (!awEditorWeekId) return;
  try {
    // メタ情報（区分 / 巡回訪問 / 集会日）も合わせて保存
    const convSel = document.querySelector('input[name="aw-editor-conv"]:checked');
    const conv = convSel ? convSel.value : '';
    const cvVisit = !!document.getElementById('aw-editor-cvvisit')?.checked;
    const meetDate = (document.getElementById('aw-editor-meetdate')?.value || '').trim();

    const update = { items: awEditorItems };
    const FV = firebase.firestore.FieldValue;
    update.conventionType = conv ? conv : FV.delete();
    update.circuitVisit   = cvVisit ? true : FV.delete();
    update.customMeetDate = (cvVisit && meetDate) ? meetDate : FV.delete();

    await db.collection('mwbWeeks').doc(awEditorWeekId).update(update);
    // awWeeks のキャッシュも更新
    const week = awWeeks.find(w => w.id === awEditorWeekId);
    if (week) {
      week.items = JSON.parse(JSON.stringify(awEditorItems));
      if (conv) week.conventionType = conv; else delete week.conventionType;
      if (cvVisit) week.circuitVisit = true; else delete week.circuitVisit;
      if (cvVisit && meetDate) week.customMeetDate = meetDate; else delete week.customMeetDate;
    }
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
    const allWeeks = weeksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // 成員には公開済み (programStatus === 'published') のみ見せる
    const weeks = allWeeks.filter(w => w.programStatus === 'published');
    // 確定済（未公開）の週数を管理者向けヒントのために覚えておく
    const confirmedNotPublishedCount = allWeeks.filter(w => w.programStatus === 'confirmed').length;

    // 全週の履歴クエリを並列実行（直列だと26回×往復で遅い）
    const weekQueries = weeks.map(week => {
      const meetDate = awGetThursdayDate(week);
      if (!meetDate) return null;
      const searchStart = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() - 1, 0, 0, 0));
      const searchEnd   = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() + 1, 0, 0, 0));
      return db.collection('assignmentHistory')
        .where('date', '>=', firebase.firestore.Timestamp.fromDate(searchStart))
        .where('date', '<', firebase.firestore.Timestamp.fromDate(searchEnd))
        .get()
        .then(hSnap => ({ week, meetDate, hSnap }));
    }).filter(Boolean);

    const results = await Promise.all(weekQueries);

    skConfirmedWeeks = [];
    results.forEach(({ week, meetDate, hSnap }) => {
      if (hSnap.size === 0) return;
      const slots = {};
      hSnap.docs.forEach(d => {
        const { code, memberName } = d.data();
        if (code && memberName) slots[code] = memberName;
      });
      const topics = week.topics || {};
      skConfirmedWeeks.push({ week, slots, topics, meetDate });
    });
    skConfirmedWeeks.sort((a,b) => a.meetDate - b.meetDate);

    // 公開講演データ取得
    try {
      const ptSnap = await db.collection('PUBLIC_TALKS').orderBy('date').get();
      skPublicTalks = ptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { skPublicTalks = []; }

    // 利用可能な月を抽出（月曜日基準）
    const monthSet = new Set();
    skConfirmedWeeks.forEach(cw => {
      const mon = awGetWeekMonday(cw.week) || cw.meetDate;
      monthSet.add(mon.getFullYear() + '-' + mon.getMonth());
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

    // 管理者で「未公開（確定済）の週がある」場合は誘導バナーを表示
    if (skAvailableMonths.length === 0 && confirmedNotPublishedCount > 0 && typeof isAdmin !== 'undefined' && isAdmin) {
      container.innerHTML = `<div class="empty-state" style="padding:16px;line-height:1.7">
        公開済みのプログラムがありません。<br>
        <span style="font-size:13px;color:var(--text-light)">確定済の週が ${confirmedNotPublishedCount} 週あります。<br>
        「担当者策定」で下書き保存後、「確認・公開」から公開すると成員に表示されます。</span>
      </div>`;
    }

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

  // 該当月の週中集会（月曜日基準）
  const monthWeeks = skConfirmedWeeks.filter(cw => {
    const mon = awGetWeekMonday(cw.week) || cw.meetDate;
    return mon.getFullYear() === year && mon.getMonth() === month;
  });

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

// 集会ページのカードを丸ごと描画
function skRenderMidweekCard({ week, slots, topics }, container) {
  const chairName = slots['A'] || '';
  const section = awBuildPublishedProgramSection({
    week, slots, topics,
    headerRightHtml: `
      <div style="text-align:right;color:white;font-size:13px">
        <div style="font-weight:700">司会者：${esc(chairName)}</div>
      </div>`,
  });
  container.appendChild(section);
}

// 公開状態と同じデザインで 1 週間のセクションを構築して返す共通関数。
// headerRightHtml: ヘッダー右側のカスタム HTML（司会者バッジ / 状態バッジ + アクションボタンなど）
function awBuildPublishedProgramSection({ week, slots, topics, headerRightHtml = '' }) {
  const items = week.items || [];
  const convention = week.conventionType || '';
  const isCircuitVisit = !!week.circuitVisit;

  const section = document.createElement('div');
  section.className = 'aw-inline-section';
  section.dataset.weekId = week.id;

  // ── ヘッダー ──
  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  hdr.innerHTML = `
    <div class="aw-header-left">
      <div class="aw-inline-title">${esc(awGetThursdayLabel(week))}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
    ${headerRightHtml}
  `;
  section.appendChild(hdr);

  // 大会の場合はグレーアウト + ラベル、プログラム本体は非表示
  if (convention) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'aw-program-body aw-conv-greyed';
    const overlay = document.createElement('div');
    overlay.className = 'aw-conv-overlay';
    overlay.textContent = convention;
    bodyWrap.style.minHeight = '120px';
    bodyWrap.appendChild(overlay);
    section.appendChild(bodyWrap);
    return section;
  }

  if (isCircuitVisit) awApplyCircuitVisit(section, true);

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
  return section;
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
    await Promise.all([awInitMeetingDay(), awLoadCodes(), awLoadWeeks()]);
    awRenderProgramList();
  } catch(e) {
    if (list) list.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

// 各週の主題データを保持（一括確定で使用）
const awProgramTopics = {};

// 4ステップ間で共有する選択中の月（year, month）
// awProgramSelectedMonth / awAssignSelectedMonth / s89SelectedMonth はこれの参照に揃える
let awSharedMonth = null;
function awSetSharedMonth(year, month) {
  if (year == null || month == null) return;
  awSharedMonth = { year, month };
  awProgramSelectedMonth = awSharedMonth;
  awAssignSelectedMonth  = awSharedMonth;
  s89SelectedMonth       = awSharedMonth;
}
// ── ステップバー描画 ─────────────────────────
function awComputeStepProgress() {
  if (!awSharedMonth || !Array.isArray(awWeeks)) {
    return { total: 0, confirmed: 0, withHistory: 0, published: 0 };
  }
  const monthWeeks = awFilterWeeksByMonth(awWeeks, awSharedMonth)
    .filter(w => !w.conventionType);
  let confirmed = 0, withHistory = 0, published = 0;
  monthWeeks.forEach(w => {
    if (w.programStatus === 'confirmed' || w.programStatus === 'published') confirmed++;
    if (w.hasAssignmentHistory) withHistory++;
    if (w.programStatus === 'published') published++;
  });
  return { total: monthWeeks.length, confirmed, withHistory, published };
}

function awRenderStepBar(containerId, currentStep) {
  const el = document.getElementById(containerId);
  if (!el) return;
  // ページタイトル横の年月ラベルを更新
  const monthLabel = awSharedMonth
    ? ` — ${awSharedMonth.year}年${awSharedMonth.month + 1}月`
    : '';
  ['aw-program-month-label','aw-assign-month-label','aw-review-month-label','aw-s89-month-label']
    .forEach(id => { const e = document.getElementById(id); if (e) e.textContent = monthLabel; });
  const p = awComputeStepProgress();
  const reviewWaiting = p.withHistory - p.published;
  // 各ステップは前段が「全週完了」してから次が解放される
  const step1Done = p.total > 0 && p.confirmed === p.total;
  const step2Done = p.total > 0 && p.withHistory === p.total;
  const step3Done = p.total > 0 && p.published === p.total;
  const steps = [
    { n: 1, label: 'プログラム表', page: 'admin-program',    count: `${p.confirmed}/${p.total} 確定済`,    enabled: true },
    { n: 2, label: '担当者策定',   page: 'admin-assignment', count: `${p.withHistory}/${p.total} 策定済`, enabled: step1Done },
    { n: 3, label: '確認・公開',   page: 'admin-assignment-review', count: `${reviewWaiting}/${p.total} 確認待ち`, enabled: step2Done },
    { n: 4, label: 'S-89',         page: 'admin-s89',         count: `${p.published}/${p.total} 公開済`,    enabled: step3Done },
  ];
  let html = '<div class="aw-stepbar">';
  steps.forEach((s, i) => {
    const cls = [
      'aw-stepbar-item',
      s.n === currentStep ? 'aw-stepbar-current' : '',
      !s.enabled ? 'aw-stepbar-disabled' : '',
    ].filter(Boolean).join(' ');
    const onclick = (s.enabled && s.n !== currentStep && s.page) ? `onclick="navigate('${s.page}')"` : '';
    html += `<div class="${cls}" ${onclick}>
      <div class="aw-stepbar-num">${s.n}</div>
      <div class="aw-stepbar-body">
        <div class="aw-stepbar-label">${esc(s.label)}</div>
        <div class="aw-stepbar-count">${esc(s.count)}</div>
      </div>
    </div>`;
    if (i < steps.length - 1) html += '<div class="aw-stepbar-arrow">→</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

let awProgramSelectedMonth = null;
let awAssignSelectedMonth = null;

function awExtractMonths(weeks) {
  const monthSet = new Set();
  weeks.forEach(w => {
    const d = awGetWeekMonday(w) || awGetMeetingDate(w);
    if (d) monthSet.add(d.getFullYear() + '-' + d.getMonth());
  });
  return [...monthSet].sort().map(k => {
    const [y, m] = k.split('-');
    return { year: parseInt(y), month: parseInt(m) };
  });
}

function awFilterWeeksByMonth(weeks, selected) {
  if (!selected) return weeks;
  return weeks.filter(w => {
    const d = awGetWeekMonday(w) || awGetMeetingDate(w);
    return d && d.getFullYear() === selected.year && d.getMonth() === selected.month;
  });
}

function awRenderProgramList() {
  const list = document.getElementById('program-list');
  if (!list) return;
  awRenderStepBar('program-step-bar', 1);

  if (awWeeks.length === 0) {
    awUpdateProgramToolbarState([]);
    list.innerHTML = '<div class="empty-state"><span class="material-icons">upload_file</span>新規作成する場合は、インポートからZIPファイルをインポートしてください</div>';
    return;
  }
  if (!awSharedMonth) {
    awUpdateProgramToolbarState([]);
    list.innerHTML = awBackToHubEmpty();
    return;
  }

  const filtered = awFilterWeeksByMonth(awWeeks, awSharedMonth);
  list.innerHTML = '';

  // ツールバーの状態表示（インポート / 確定 / 編集 / バッジ / dim）を更新
  awUpdateProgramToolbarState(filtered);

  if (filtered.length === 0) {
    list.innerHTML += '<div class="empty-state">この月のプログラムはありません。インポートから ZIP を取り込んでください。</div>';
    return;
  }
  filtered.forEach(week => awBuildProgramSection(week, list));
}

function awBuildProgramSection(week, container) {
  const topics = Object.assign({}, week.topics || {});
  awProgramTopics[week.id] = topics;
  const items = week.items || [];
  const convention = week.conventionType || '';
  const isCircuitVisit = !!week.circuitVisit;

  const section = document.createElement('div');
  section.className = 'aw-inline-section';
  section.dataset.weekId = week.id;

  // ヘッダー
  const hdr = document.createElement('div');
  hdr.className = 'aw-inline-header';
  hdr.innerHTML = `
    <div class="aw-header-left">
      <div class="aw-inline-title">${esc(awGetThursdayLabel(week))}</div>
      <div class="aw-inline-sub">${esc(week.bibleChapter || '')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <label class="aw-conv-check"><input type="checkbox" name="conv" value="巡回大会" ${convention === '巡回大会' ? 'checked' : ''}> 巡回大会</label>
      <label class="aw-conv-check"><input type="checkbox" name="conv" value="地区大会" ${convention === '地区大会' ? 'checked' : ''}> 地区大会</label>
      <label class="aw-conv-check"><input type="checkbox" name="conv" value="記念式" ${convention === '記念式' ? 'checked' : ''}> 記念式</label>
      <label class="aw-conv-check"><input type="checkbox" name="cvvisit" ${isCircuitVisit ? 'checked' : ''}> 巡回訪問</label>
    </div>
  `;

  // 大会チェックボックスのイベント
  const convChecks = hdr.querySelectorAll('input[name="conv"]');
  const cvVisitCheck = hdr.querySelector('input[name="cvvisit"]');
  convChecks.forEach(cb => {
    cb.addEventListener('change', async () => {
      convChecks.forEach(other => { if (other !== cb) other.checked = false; });
      const val = cb.checked ? cb.value : '';
      week.conventionType = val;
      try {
        if (val) {
          await db.collection('mwbWeeks').doc(week.id).set({ conventionType: val }, { merge: true });
        } else {
          await db.collection('mwbWeeks').doc(week.id).update({ conventionType: firebase.firestore.FieldValue.delete() });
        }
      } catch(err) { alert('保存エラー: ' + err.message); }
      awApplyConventionState(section, val);
    });
  });

  // 巡回訪問チェックボックスのイベント
  cvVisitCheck.addEventListener('change', async () => {
    const on = cvVisitCheck.checked;
    week.circuitVisit = on;
    try {
      if (on) {
        await db.collection('mwbWeeks').doc(week.id).set({ circuitVisit: true }, { merge: true });
      } else {
        await db.collection('mwbWeeks').doc(week.id).update({ circuitVisit: firebase.firestore.FieldValue.delete() });
      }
    } catch(err) { alert('保存エラー: ' + err.message); }
    awApplyCircuitVisit(section, on);
    dateRow.style.display = on ? '' : 'none';
  });
  section.appendChild(hdr);

  // 日付編集行（巡回訪問時のみ表示 — 通常週は会衆設定の曜日から算出される）
  const meetDate = awGetMeetingDate(week);
  const dateVal = meetDate ? awDateStr(meetDate) : '';
  const dateRow = document.createElement('div');
  dateRow.className = 'aw-date-edit-row';
  dateRow.style.display = isCircuitVisit ? '' : 'none';
  dateRow.innerHTML = `
    <label class="aw-date-label"><span class="material-icons" style="font-size:16px;vertical-align:middle">event</span> 集会日</label>
    <input type="date" class="aw-date-input" value="${dateVal}">
  `;
  dateRow.querySelector('.aw-date-input').addEventListener('change', async (e) => {
    const newDate = e.target.value;
    try {
      if (newDate) {
        week.customMeetDate = newDate;
        await db.collection('mwbWeeks').doc(week.id).set({ customMeetDate: newDate }, { merge: true });
      } else {
        delete week.customMeetDate;
        await db.collection('mwbWeeks').doc(week.id).update({ customMeetDate: firebase.firestore.FieldValue.delete() });
      }
      const titleEl = section.querySelector('.aw-inline-title');
      if (titleEl) titleEl.textContent = awGetThursdayLabel(week);
    } catch(err) { alert('日付保存エラー: ' + err.message); }
  });
  section.appendChild(dateRow);

  // プログラム本体ラッパー（大会時にグレーアウト＋ラベル重ねる用）
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'aw-program-body';

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

  bodyWrap.appendChild(tableDiv);
  section.appendChild(bodyWrap);

  // 初期状態適用
  if (convention) awApplyConventionState(section, convention);
  if (isCircuitVisit) awApplyCircuitVisit(section, true);

  container.appendChild(section);
}

function awApplyConventionState(section, convType) {
  const body = section.querySelector('.aw-program-body');
  if (!body) return;
  const old = body.querySelector('.aw-conv-overlay');
  if (old) old.remove();

  if (convType) {
    body.classList.add('aw-conv-greyed');
    const overlay = document.createElement('div');
    overlay.className = 'aw-conv-overlay';
    overlay.textContent = convType;
    body.appendChild(overlay);
  } else {
    body.classList.remove('aw-conv-greyed');
  }
}

function awApplyCircuitVisit(section, on) {
  const hdr = section.querySelector('.aw-inline-header');
  if (!hdr) return;
  const hdrLeft = section.querySelector('.aw-header-left') || hdr.querySelector('div');
  const oldLabel = hdrLeft ? hdrLeft.querySelector('.aw-cv-label') : null;
  if (oldLabel) oldLabel.remove();

  if (on) {
    hdr.classList.add('aw-cv-highlight');
    if (hdrLeft) {
      const lbl = document.createElement('div');
      lbl.className = 'aw-cv-label';
      lbl.textContent = '巡回訪問';
      hdrLeft.appendChild(lbl);
    }
  } else {
    hdr.classList.remove('aw-cv-highlight');
  }
}

// 月内の非大会週からプログラム状態を判定
// 戻り値: 'editing' | 'awaitingAssignment' | 'awaitingPublish' | 'published'
function awComputeProgramOverallState(filteredWeeks) {
  const targets = filteredWeeks.filter(w => !w.conventionType);
  if (targets.length === 0) return 'editing';
  const hasDraft = targets.some(w => !w.programStatus || w.programStatus === 'draft');
  if (hasDraft) return 'editing';
  const allPublished = targets.every(w => w.programStatus === 'published');
  if (allPublished) return 'published';
  const allHaveAssignments = targets.every(w => w.hasAssignmentHistory);
  if (allHaveAssignments) return 'awaitingPublish';
  return 'awaitingAssignment';
}

function awUpdateProgramToolbarState(filteredWeeks) {
  const state = awComputeProgramOverallState(filteredWeeks);
  const importBtn  = document.getElementById('aw-import-btn');
  const confirmBtn = document.getElementById('aw-program-confirm-all-btn');
  const editBtn    = document.getElementById('aw-program-edit-all-btn');
  const badge      = document.getElementById('aw-program-state-badge');
  const list       = document.getElementById('program-list');

  const isEmpty  = filteredWeeks.length === 0;
  const isLocked = state !== 'editing';

  // データなし: インポートだけ。データあり: インポートを隠し、状態に応じて確定 or 編集を出す
  if (importBtn)  importBtn.style.display  = isEmpty ? '' : 'none';
  if (confirmBtn) confirmBtn.style.display = (isEmpty || isLocked) ? 'none' : '';
  if (editBtn)    editBtn.style.display    = (isEmpty || !isLocked) ? 'none' : '';

  if (badge) {
    const map = {
      awaitingAssignment: { text: '確定（担当者策定待ち）', cls: 'aw-pstate-await-assign' },
      awaitingPublish:    { text: '確定（確認・公開待ち）', cls: 'aw-pstate-await-publish' },
      published:          { text: '確定（公開中）',         cls: 'aw-pstate-published' },
    };
    const info = map[state];
    if (info) {
      badge.style.display = '';
      badge.textContent = info.text;
      badge.className = 'aw-program-state-badge ' + info.cls;
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
      badge.className = 'aw-program-state-badge';
    }
  }

  if (list) list.classList.toggle('aw-program-list-locked', isLocked);
}

// 「編集」押下時: その月の週一覧モーダルを開く → 週を選ぶと既存の
// スケジュールエディタへ遷移し、項目名/時間/主題の編集 + 行の追加/削除が可能。
// 共通: 月内の週一覧モーダルを開き、選ばれた週で callback を呼ぶ
function awOpenWeekPickerModal({ title, weeks, onPick, extraActions = [] }) {
  if (!weeks || weeks.length === 0) {
    alert('編集できる週がありません');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'aw-week-picker-overlay';
  const buttons = weeks.map(w =>
    `<button class="aw-week-picker-btn" data-week-id="${esc(w.id)}">
       <span class="aw-week-picker-date">${esc(awGetThursdayLabel(w))}</span>
       <span class="aw-week-picker-sub">${esc(w.bibleChapter || '')}</span>
     </button>`
  ).join('');
  const extraBtnHtml = extraActions.map((a, i) =>
    `<button class="aw-week-picker-extra ${esc(a.className || '')}" data-extra-idx="${i}">${esc(a.label)}</button>`
  ).join('');
  overlay.innerHTML = `
    <div class="aw-week-picker-modal">
      <div class="aw-week-picker-title">${esc(title)}</div>
      <div class="aw-week-picker-list">${buttons}</div>
      <div class="aw-week-picker-actions">
        ${extraBtnHtml}
        <button class="aw-week-picker-cancel">キャンセル</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('.aw-week-picker-cancel').addEventListener('click', close);
  overlay.querySelectorAll('.aw-week-picker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wid = btn.dataset.weekId;
      close();
      onPick(wid);
    });
  });
  overlay.querySelectorAll('.aw-week-picker-extra').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.extraIdx);
      const action = extraActions[idx];
      if (!action) return;
      const proceedAfter = await action.onClick();
      if (proceedAfter !== false) close();
    });
  });
}

function awEditAllPrograms() {
  if (!awSharedMonth) return;
  const weeks = awFilterWeeksByMonth(awWeeks, awSharedMonth).filter(w => !w.conventionType);
  awOpenWeekPickerModal({
    title: '編集する週を選んでください',
    weeks,
    onPick: awOpenScheduleEditor,
    extraActions: [
      { label: '全削除', className: 'aw-week-picker-danger', onClick: awDeleteAllProgramsInMonth },
    ],
  });
}

async function awDeleteAllProgramsInMonth() {
  if (!awSharedMonth) return false;
  const targets = awFilterWeeksByMonth(awWeeks, awSharedMonth);
  if (targets.length === 0) { alert('削除する週がありません'); return false; }
  const monthLabel = `${awSharedMonth.year}年${awSharedMonth.month + 1}月`;
  if (!(await customConfirm(
    `⚠️ ${monthLabel} の全 ${targets.length} 週分を削除しますか？\n\n` +
    `・プログラム本体（mwbWeeks）\n` +
    `・各週の担当者割当履歴（assignmentHistory）\n` +
    `すべて消えます。元に戻すには ZIP の再インポートが必要です。`
  ))) return false;
  let count = 0;
  let assignmentDeleted = 0;
  try {
    for (const week of targets) {
      // 担当者割当履歴（assignmentHistory）を集会日の前後で検索して削除
      const meetDate = awGetMeetingDate(week);
      if (meetDate) {
        const searchStart = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() - 1, 0, 0, 0));
        const searchEnd   = new Date(Date.UTC(meetDate.getFullYear(), meetDate.getMonth(), meetDate.getDate() + 1, 0, 0, 0));
        const hSnap = await db.collection('assignmentHistory')
          .where('date', '>=', firebase.firestore.Timestamp.fromDate(searchStart))
          .where('date', '<',  firebase.firestore.Timestamp.fromDate(searchEnd))
          .get();
        for (const doc of hSnap.docs) {
          await doc.ref.delete();
          assignmentDeleted++;
        }
      }
      // プログラム本体を削除
      await db.collection('mwbWeeks').doc(week.id).delete();
      count++;
    }
    // ローカルキャッシュからも削除
    const targetIds = new Set(targets.map(w => w.id));
    awWeeks = awWeeks.filter(w => !targetIds.has(w.id));
    awRenderProgramList();
    alert(`${count}週分のプログラムと ${assignmentDeleted}件の担当者割当を削除しました`);
    return true;
  } catch(e) { alert('削除エラー: ' + e.message); return false; }
}

function awEditAllAssignments() {
  if (!awSharedMonth) return;
  const weeks = awFilterWeeksByMonth(awWeeks, awSharedMonth)
    .filter(w => !w.conventionType && (w.programStatus === 'confirmed' || w.programStatus === 'published'));
  awOpenWeekPickerModal({
    title: '担当者を変更する週を選んでください',
    weeks,
    onPick: awOpenWeekDetail,
  });
}

async function awConfirmAllPrograms() {
  if (!(await customConfirm('表示中の全週のプログラムを確定しますか？\n（公開済みの週は据え置きます）'))) return;
  let count = 0;
  const targetWeeks = awFilterWeeksByMonth(awWeeks, awProgramSelectedMonth);
  try {
    for (const week of targetWeeks) {
      if (week.programStatus === 'published') continue;
      const topics = awProgramTopics[week.id] || {};
      await db.collection('mwbWeeks').doc(week.id).set({
        programStatus: 'confirmed',
        topics: topics,
      }, { merge: true });
      week.programStatus = 'confirmed';
      week.topics = Object.assign({}, topics);
      count++;
    }
    awRenderProgramList();
    alert(`${count}週分のプログラムを確定しました`);
  } catch(e) { alert('確定エラー: ' + e.message); }
}

// プログラム編集の前に警告（公開済 / 確定済の場合）
// OK なら draft に戻して true を返す。キャンセルなら false。
async function awConfirmEditProgram(week) {
  if (week.programStatus === 'draft' || !week.programStatus) return true;

  let msg;
  if (week.programStatus === 'published') {
    msg = '⚠️ この週は公開済です\n\n' +
      'プログラムを編集すると：\n' +
      '・担当者データ（誰が何を担当するか）は保持されます\n' +
      '・公開状態は取消され、③確認・公開からやり直しになります\n' +
      '・items 構造が変わるとコード不一致の担当者は手動で再割当が必要です\n\n' +
      '編集して未確定に戻しますか？';
  } else {
    // confirmed
    const hasAssign = !!week.hasAssignmentHistory;
    msg = '⚠️ この週は確定済です\n\n' +
      'プログラムを編集すると：\n' +
      (hasAssign ? '・担当者データは保持されます\n' : '') +
      '・確定が取消され、未確定に戻ります\n' +
      (hasAssign ? '・items 構造が変わるとコード不一致の担当者は要再割当\n' : '・担当者策定からやり直しになります\n') +
      '\n編集して未確定に戻しますか？';
  }

  if (!(await customConfirm(msg))) return false;
  try {
    await db.collection('mwbWeeks').doc(week.id).set({ programStatus: 'draft' }, { merge: true });
    week.programStatus = 'draft';
    // ヘッダーのバッジを即時更新（再描画は呼び出し側で）
    const sec = document.querySelector(`.aw-inline-section[data-week-id="${week.id}"]`);
    if (sec) {
      const badge = sec.querySelector('.aw-status-badge');
      if (badge) { badge.className = 'aw-status-badge aw-badge-none'; badge.textContent = '未確定'; }
    }
    return true;
  } catch(e) {
    alert('状態変更エラー: ' + e.message);
    return false;
  }
}

// 月未選択時のフォールバック（ハブへ戻るボタン）
function awBackToHubEmpty() {
  return '<div class="empty-state" style="padding:32px"><span class="material-icons">event_busy</span>月が選択されていません<br><button class="btn-primary" style="margin-top:16px" onclick="navigate(\'admin-mwb-hub\')">集会予定表策定に戻って月を選択</button></div>';
}

// ── 生活と奉仕の集会 集会予定表策定ハブ ────────────
async function initMwbHubPage() {
  // ハブに戻るたびに月選択をリセット（毎回プルダウンから選ぶ運用）
  awSharedMonth = null;
  awProgramSelectedMonth = null;
  awAssignSelectedMonth = null;
  if (typeof s89SelectedMonth !== 'undefined') s89SelectedMonth = null;

  const selEl = document.getElementById('mwb-hub-month-selector');
  if (selEl) selEl.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    await Promise.all([awInitMeetingDay(), awLoadCodes(), awLoadWeeks()]);
    awRenderMwbHub();
  } catch(e) {
    if (selEl) selEl.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function awRenderMwbHub() {
  // 「今日以降の月」を 12 ヶ月分生成し、既存月とマージして重複排除する。
  // データがまだ無い月もドロップダウンに出るので、そこを選んで step ① で
  // ZIP をインポートすればすぐ作成できる。
  const today = new Date();
  const generated = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    generated.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  const existing = awExtractMonths(awWeeks).filter(m =>
    m.year > today.getFullYear() ||
    (m.year === today.getFullYear() && m.month >= today.getMonth())
  );
  const seen = new Set();
  const months = [];
  [...existing, ...generated].forEach(m => {
    const key = `${m.year}-${m.month}`;
    if (seen.has(key)) return;
    seen.add(key);
    months.push(m);
  });
  months.sort((a, b) => (a.year - b.year) || (a.month - b.month));
  awRenderMwbHubMonthDropdown(months);
}

function awRenderMwbHubMonthDropdown(months) {
  const el = document.getElementById('mwb-hub-month-selector');
  if (!el) return;
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  if (months.length === 0) {
    el.innerHTML = '<div class="mwb-hub-month-picker"><div class="mwb-hub-month-label">作成/編集したい月を選択して下さい</div><div class="empty-state" style="margin-top:8px">対象の月のデータがありません。<br><span style="font-size:13px;color:var(--text-light)">先にプログラム表作成からインポートしてください。</span></div></div>';
    return;
  }
  // インポート済みの月 (awWeeks にデータが存在する月) を集計
  const importedKeys = new Set(awExtractMonths(awWeeks).map(m => `${m.year}-${m.month}`));
  let html = '<div class="mwb-hub-month-picker">';
  html += '<label class="mwb-hub-month-label" for="mwb-hub-month-select">作成/編集したい月を選択して下さい</label>';
  html += '<select class="mwb-hub-month-select" id="mwb-hub-month-select">';
  html += '<option value="">— 選択してください —</option>';
  months.forEach(({ year, month }) => {
    const v = year + '-' + month;
    const sel = awSharedMonth && awSharedMonth.year === year && awSharedMonth.month === month ? 'selected' : '';
    const status = importedKeys.has(`${year}-${month}`) ? '【データインポート：済】' : '【データインポート：未】';
    html += `<option value="${v}" ${sel}>${year}年${monthNames[month]} ${status}</option>`;
  });
  html += '</select></div>';
  el.innerHTML = html;
  el.querySelector('#mwb-hub-month-select').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) { awSharedMonth = null; return; }
    const [y, m] = v.split('-').map(Number);
    awSetSharedMonth(y, m);
    navigate('admin-program');
  });
}

// ── イベント登録（DOMContentLoaded） ──────────

document.addEventListener('DOMContentLoaded', () => {
  // 管理画面カード（集会予定表策定ハブへの単一エントリー）
  document.getElementById('admin-manage-mwb-hub')
    ?.addEventListener('click', () => navigate('admin-mwb-hub'));
  document.getElementById('review-publish-all-btn')
    ?.addEventListener('click', awReviewPublishAll);
  document.getElementById('review-print-pdf-btn')
    ?.addEventListener('click', awReviewDownloadPdf);
  document.getElementById('aw-program-confirm-all-btn')
    ?.addEventListener('click', awConfirmAllPrograms);
  document.getElementById('aw-program-edit-all-btn')
    ?.addEventListener('click', awEditAllPrograms);

  // 週詳細ボタン
  document.getElementById('aw-confirm-btn')?.addEventListener('click', awConfirmAssignment);

  // ZIPインポート
  awInitImport();
});
