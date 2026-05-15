// ── 公開講演予定表策定 ──────────────────────────────
// Firestore:
//   PUBLIC_TALK_LIST/{number}  : { number, title }  講演マスタ(194件)
//     ※ 番号がキー。主題は番号に紐づき、Wordインポートで上書き更新。
//   PUBLIC_TALK_SCHEDULE/{id}  : 週末ごとの予定レコード
//     date, talkNumber, speaker, speakerCong,
//     chairman, reader,
//     publishedXxx..., updatedAt, publishedAt
//     ※ talkTitle は保存しない。表示時に PUBLIC_TALK_LIST から取得。
//   TALK_PREFS/{oderId}  : 講演者の希望講演番号
//     uid, name, talks: [number,...], updatedAt

// ── 講演マスタ（S-99） ──────────────────────────
let _ptTalkList = null;  // [{number, title}]
let _ptTalkMap  = {};    // number → title

async function loadTalkList() {
  if (_ptTalkList) return _ptTalkList;
  try {
    const snap = await db.collection('PUBLIC_TALK_LIST').orderBy('number').get();
    if (snap.empty) {
      // まだインポートされていない
      _ptTalkList = [];
      _ptTalkMap = {};
      return _ptTalkList;
    }
    _ptTalkList = snap.docs.map(d => d.data());
    _ptTalkMap = {};
    _ptTalkList.forEach(t => { _ptTalkMap[t.number] = t.title; });
    return _ptTalkList;
  } catch (e) {
    console.warn('PUBLIC_TALK_LIST読込エラー:', e);
    _ptTalkList = [];
    _ptTalkMap = {};
    return _ptTalkList;
  }
}

// ── 状態 ──────────────────────────
let _ptCurMonth = null;   // Date(月の1日)
let _ptDocs = {};         // date → doc data
let _ptViewMode = 'draft';
let _ptElderList = [];    // 長老・奉仕の僕リスト
let _ptSpeakerPrefs = {}; // name → [talkNumbers]

// ── データロード ──────────────────────────
async function loadPTSchedule(startDate, months) {
  try {
    const mo = months || 1;
    const start = fmtPtYmd(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
    const end   = fmtPtYmd(new Date(startDate.getFullYear(), startDate.getMonth() + mo, 0));
    const snap = await db.collection('PUBLIC_TALK_SCHEDULE')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();
    const map = {};
    snap.forEach(doc => {
      const d = doc.data();
      map[d.date] = { id: doc.id, ...d };
    });
    return map;
  } catch (e) {
    console.warn('PUBLIC_TALK_SCHEDULE読込エラー:', e);
    return {};
  }
}

async function loadElderList() {
  try {
    const all = await getUserListCached();
    // 長老 or 奉仕の僕
    _ptElderList = all.filter(u =>
      u.name && (u.appointment === 'elder' || u.appointment === 'ms')
    ).sort((a, b) => (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja'));
  } catch (e) {
    _ptElderList = [];
  }
}

// ── 講演者の希望番号ロード ──────────────────────────
async function loadSpeakerPrefs() {
  try {
    const snap = await db.collection('TALK_PREFS').get();
    _ptSpeakerPrefs = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (d.name && Array.isArray(d.talks) && d.talks.length > 0) {
        _ptSpeakerPrefs[d.name] = d.talks;
      }
    });
  } catch (e) {
    console.warn('TALK_PREFS読込エラー:', e);
    _ptSpeakerPrefs = {};
  }
}

// ── ユーティリティ ──────────────────────────
function fmtPtYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fmtPtMonthLabel(dt) {
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月`;
}
const PT_DOW_JP = ['日','月','火','水','木','金','土'];

function listWeekendDatesInMonth(year, monthIdx) {
  // CONFIG/app.meetingDaysの2番目(weekendDow)を使う
  const result = [];
  const last = new Date(year, monthIdx + 1, 0).getDate();
  // デフォルト日曜=0、設定があればそれを使う
  let weekendDow = 0;
  if (typeof getAppConfig === 'function') {
    // 同期的に取れない場合はデフォルト
  }
  for (let d = 1; d <= last; d++) {
    const dt = new Date(year, monthIdx, d);
    if (dt.getDay() === weekendDow) result.push(dt);
  }
  return result;
}

async function getWeekendDow() {
  try {
    if (typeof getAppConfig === 'function') {
      const cfg = await getAppConfig();
      const days = Array.isArray(cfg.meetingDays) && cfg.meetingDays.length > 1
        ? cfg.meetingDays : [4, 0];
      return days[1];
    }
  } catch (e) {}
  return 0;
}

function listWeekendDatesForRange(startYear, startMonth, months, weekendDow) {
  const result = [];
  for (let m = 0; m < months; m++) {
    const y = startYear + Math.floor((startMonth + m) / 12);
    const mi = (startMonth + m) % 12;
    const last = new Date(y, mi + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dt = new Date(y, mi, d);
      if (dt.getDay() === weekendDow) result.push(dt);
    }
  }
  return result;
}

// ── 描画 ──────────────────────────
async function renderPublicTalkAdmin() {
  const container = document.getElementById('public-talk-body');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    if (!_ptCurMonth) _ptCurMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthDate = _ptCurMonth;
    const PT_MONTHS = 12;
    const endMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + PT_MONTHS - 1, 1);
    const rangeLabel = `${fmtPtMonthLabel(monthDate)} 〜 ${fmtPtMonthLabel(endMonth)}`;

    const [talkList, docs] = await Promise.all([
      loadTalkList(),
      loadPTSchedule(monthDate, PT_MONTHS),
      loadElderList(),
      loadSpeakerPrefs(),
    ]);
    _ptDocs = docs;

    const weekendDow = await getWeekendDow();
    const dates = listWeekendDatesForRange(monthDate.getFullYear(), monthDate.getMonth(), PT_MONTHS, weekendDow);

    // 講演マスタ未インポートチェック
    if (talkList.length === 0) {
      container.innerHTML = `
        <div class="duty-pub-notice">
          <span class="material-icons">warning</span>
          講演マスタ（S-99）がまだインポートされていません。
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <button class="btn-primary" onclick="importTalkListToFirestore()">
            <span class="material-icons" style="font-size:16px;vertical-align:middle">upload</span> 初期データをインポート（194件）
          </button>
          <label class="btn-primary" style="cursor:pointer">
            <span class="material-icons" style="font-size:16px;vertical-align:middle">description</span> S-99 Wordからインポート
            <input type="file" accept=".docx" style="display:none" onchange="importTalkListFromDocx(this.files[0])">
          </label>
        </div>
      `;
      return;
    }

    // 未公開チェック
    let hasUnpublished = false;
    Object.values(_ptDocs).forEach(d => {
      if ((d.speaker || '') !== (d.publishedSpeaker || '')) hasUnpublished = true;
      if ((d.chairman || '') !== (d.publishedChairman || '')) hasUnpublished = true;
      if ((d.reader || '') !== (d.publishedReader || '')) hasUnpublished = true;
      if ((d.talkNumber || 0) !== (d.publishedTalkNumber || 0)) hasUnpublished = true;
      if ((d.speakerCong || '') !== (d.publishedSpeakerCong || '')) hasUnpublished = true;
    });

    const isDraft = _ptViewMode === 'draft';

    // 期間切替（12ヶ月単位）
    let html = `
      <div class="duty-month-nav">
        <button class="icon-btn" onclick="changePTMonth(-12)" title="前年"><span class="material-icons">keyboard_double_arrow_left</span></button>
        <button class="icon-btn" onclick="changePTMonth(-1)" title="1ヶ月前へ"><span class="material-icons">chevron_left</span></button>
        <span class="duty-month-label">${esc(rangeLabel)}</span>
        <button class="icon-btn" onclick="changePTMonth(1)" title="1ヶ月先へ"><span class="material-icons">chevron_right</span></button>
        <button class="icon-btn" onclick="changePTMonth(12)" title="翌年"><span class="material-icons">keyboard_double_arrow_right</span></button>
        <button class="icon-btn" onclick="changePTMonth(0)" title="今月から"><span class="material-icons">today</span></button>
      </div>
    `;

    // タブ
    html += `<div class="duty-tabs">
      <button class="duty-tab ${isDraft ? 'duty-tab-active' : ''}" onclick="switchPTView('draft')">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">edit</span> 下書き
        ${hasUnpublished ? '<span class="duty-unpub-badge">未公開の変更あり</span>' : ''}
      </button>
      <button class="duty-tab ${!isDraft ? 'duty-tab-active' : ''}" onclick="switchPTView('published')">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">visibility</span> 公開中
      </button>
      ${isDraft && hasUnpublished ? `<button class="btn-primary duty-publish-btn" onclick="publishPTSchedule()">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">publish</span> 公開する
      </button>` : ''}
      ${isDraft ? `<label class="btn-outline pt-import-btn" style="cursor:pointer;margin-left:auto">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">description</span> S-99更新
        <input type="file" accept=".docx" style="display:none" onchange="importTalkListFromDocx(this.files[0])">
      </label>` : ''}
    </div>`;

    if (isDraft) {
      html += renderPTDraftTable(dates);
    } else {
      html += renderPTPublishedTable(dates);
    }

    container.innerHTML = html;

    if (isDraft) {
      // 主題select変更時に番号を自動表示
      container.querySelectorAll('.pt-talk-select').forEach(sel => {
        sel.addEventListener('change', function() {
          const ymd = this.dataset.date;
          const numEl = container.querySelector(`.pt-num-cell[data-date="${ymd}"]`);
          if (numEl) {
            const num = parseInt(this.value, 10);
            numEl.textContent = num || '—';
          }
        });
      });

      // 巡/地/記チェックで行のグレーアウト切替（ページ再描画）
      container.querySelectorAll('.pt-sp-off').forEach(chk => {
        chk.addEventListener('change', function() {
          // 地/記がチェックされたら即保存してから再描画
          // →まず_ptDocsに反映してから再描画
          const ymd = this.dataset.date;
          const field = this.dataset.field;
          if (!_ptDocs[ymd]) _ptDocs[ymd] = { date: ymd };
          _ptDocs[ymd][field] = this.checked;
          // 地と記は排他
          if (this.checked) {
            const other = field === 'isConvention' ? 'isMemorial' : 'isConvention';
            _ptDocs[ymd][other] = false;
          }
          renderPublicTalkAdmin();
        });
      });
      // 巡チェックは_ptDocsに即反映のみ（グレーアウトなし）
      container.querySelectorAll('.pt-sp-chk:not(.pt-sp-off)').forEach(chk => {
        chk.addEventListener('change', function() {
          const ymd = this.dataset.date;
          if (!_ptDocs[ymd]) _ptDocs[ymd] = { date: ymd };
          _ptDocs[ymd][this.dataset.field] = this.checked;
        });
      });

      // 訪問講演チェックで講演者入力モード切替
      container.querySelectorAll('.pt-visit-chk').forEach(chk => {
        chk.addEventListener('change', function() {
          const ymd = this.dataset.date;
          const cell = container.querySelector(`.pt-speaker-cell[data-date="${ymd}"]`);
          if (!cell) return;
          const localDiv = cell.querySelector('.pt-speaker-local');
          const visitDiv = cell.querySelector('.pt-speaker-visit');
          if (this.checked) {
            // 通常→訪問: select値をテキストに引き継がない（別の人なので）
            localDiv.style.display = 'none';
            visitDiv.style.display = 'block';
          } else {
            // 訪問→通常: テキスト値をクリア
            visitDiv.querySelectorAll('input').forEach(inp => inp.value = '');
            visitDiv.style.display = 'none';
            localDiv.style.display = 'block';
          }
        });
      });

      // 講演者select変更時に希望番号を反映
      container.querySelectorAll('.pt-speaker-select').forEach(sel => {
        sel.addEventListener('change', function() {
          const ymd = this.dataset.date;
          const name = this.value.trim();
          const prefs = _ptSpeakerPrefs[name] || [];
          // 希望チップを更新
          const localDiv = this.closest('.pt-speaker-local');
          const chipsEl = localDiv?.querySelector(`.pt-pref-chips`);
          if (chipsEl) {
            if (prefs.length > 0) {
              chipsEl.innerHTML = prefs.map(n =>
                `<span class="pt-pref-chip" data-num="${n}" title="${esc(_ptTalkMap[n] || '')}">${n}</span>`
              ).join('');
              attachPrefChipHandlers(container, ymd);
            } else {
              chipsEl.innerHTML = '';
            }
          } else if (prefs.length > 0 && localDiv) {
            const div = document.createElement('div');
            div.className = 'pt-pref-chips';
            div.dataset.date = ymd;
            div.innerHTML = prefs.map(n =>
              `<span class="pt-pref-chip" data-num="${n}" title="${esc(_ptTalkMap[n] || '')}">${n}</span>`
            ).join('');
            localDiv.appendChild(div);
            attachPrefChipHandlers(container, ymd);
          }
          // 番号selectのoptgroupを更新
          const talkSel = container.querySelector(`.pt-talk-select[data-date="${ymd}"]`);
          if (talkSel) {
            const curVal = parseInt(talkSel.value, 10) || 0;
            talkSel.innerHTML = '<option value="">—</option>' + buildTalkOpts(curVal, prefs);
          }
        });
      });

      // 希望チップクリック → 番号selectにセット
      function attachPrefChipHandlers(cont, ymd) {
        cont.querySelectorAll(`.pt-pref-chips[data-date="${ymd}"] .pt-pref-chip`).forEach(chip => {
          chip.addEventListener('click', function() {
            const num = parseInt(this.dataset.num, 10);
            const talkSel = cont.querySelector(`.pt-talk-select[data-date="${ymd}"]`);
            if (talkSel) {
              talkSel.value = String(num);
              talkSel.dispatchEvent(new Event('change'));
            }
          });
        });
      }
      dates.forEach(date => {
        const ymd = fmtPtYmd(date);
        attachPrefChipHandlers(container, ymd);
      });
    }
  } catch (e) {
    console.error('renderPublicTalkAdmin error:', e);
    container.innerHTML = `<div class="loading">エラー: ${esc(e.message)}</div>`;
  }
}
window.renderPublicTalkAdmin = renderPublicTalkAdmin;

// ── 下書きテーブル ──────────────────────────
function buildElderOpts(selected) {
  return _ptElderList.map(u => {
    const sel = u.name === selected ? ' selected' : '';
    return `<option value="${esc(u.name)}"${sel}>${esc(u.name)}</option>`;
  }).join('');
}

function buildTalkOpts(selectedNum, prefNums) {
  const prefSet = new Set(prefNums || []);
  let html = '';
  if (prefSet.size > 0) {
    html += '<optgroup label="★ 希望講演">';
    (_ptTalkList || []).filter(t => prefSet.has(t.number)).forEach(t => {
      const sel = t.number === selectedNum ? ' selected' : '';
      html += `<option value="${t.number}"${sel}>★${t.number}. ${esc(t.title)}</option>`;
    });
    html += '</optgroup><optgroup label="全講演">';
  }
  (_ptTalkList || []).forEach(t => {
    const sel = t.number === selectedNum ? ' selected' : '';
    html += `<option value="${t.number}"${sel}>${t.number}. ${esc(t.title)}</option>`;
  });
  if (prefSet.size > 0) html += '</optgroup>';
  return html;
}

function renderPTDraftTable(dates) {
  let html = '<div class="pt-table-wrap"><table class="duty-table pt-table"><thead><tr>';
  html += '<th>日付</th><th class="pt-special-th">巡/地/記</th><th>番号</th><th>主題</th><th>訪問</th><th>講演者</th><th>司会者</th><th>朗読者</th>';
  html += '</tr></thead><tbody>';

  let prevMonth = -1;
  for (const date of dates) {
    const ymd = fmtPtYmd(date);
    const dowJp = PT_DOW_JP[date.getDay()];
    const d = _ptDocs[ymd] || {};
    const speakerName = d.speaker || '';
    const prefNums = _ptSpeakerPrefs[speakerName] || [];
    const isVisit = !!(d.speakerCong);
    const isCircuit = !!(d.isCircuit);
    const isConvention = !!(d.isConvention);
    const isMemorial = !!(d.isMemorial);
    const isOff = isConvention || isMemorial; // 大会・記念式はグレーアウト

    // 月区切りヘッダー
    const curMonth = date.getFullYear() * 100 + date.getMonth();
    if (curMonth !== prevMonth) {
      html += `<tr class="pt-month-sep"><td colspan="8">${date.getFullYear()}年${date.getMonth()+1}月</td></tr>`;
      prevMonth = curMonth;
    }

    html += `<tr class="${isOff ? 'pt-row-off' : ''}">`;
    // 日付
    html += `<td class="duty-date-cell duty-weekend">
      <div class="duty-date-main">${date.getMonth()+1}/${date.getDate()}（${dowJp}）</div>
    </td>`;

    // 巡/地/記 チェックボックス
    html += `<td class="pt-special-cell">
      <label class="pt-sp-label" title="巡回訪問"><input type="checkbox" class="pt-sp-chk" data-date="${ymd}" data-field="isCircuit"${isCircuit ? ' checked' : ''}><span>巡</span></label>
      <label class="pt-sp-label" title="大会"><input type="checkbox" class="pt-sp-chk pt-sp-off" data-date="${ymd}" data-field="isConvention"${isConvention ? ' checked' : ''}><span>地</span></label>
      <label class="pt-sp-label" title="記念式"><input type="checkbox" class="pt-sp-chk pt-sp-off" data-date="${ymd}" data-field="isMemorial"${isMemorial ? ' checked' : ''}><span>記</span></label>
    </td>`;

    // 番号（主題選択から自動表示）
    html += `<td class="pt-num-cell pt-offable" data-date="${ymd}">${isOff ? '' : (d.talkNumber || '—')}</td>`;

    // 主題（プルダウン選択）
    html += `<td class="pt-offable">${isOff
      ? `<span class="pt-off-label">${isConvention ? '大会' : '記念式'}</span>`
      : `<select class="duty-select pt-talk-select" data-date="${ymd}" data-field="talkNumber">
          <option value="">—</option>${buildTalkOpts(d.talkNumber || 0, prefNums)}
        </select>`
    }</td>`;

    // 訪問講演チェック
    html += `<td class="pt-visit-chk-cell pt-offable">${isOff ? '' :
      `<input type="checkbox" class="pt-visit-chk" data-date="${ymd}"${isVisit ? ' checked' : ''}>`
    }</td>`;

    // 講演者
    html += `<td class="pt-speaker-cell pt-offable" data-date="${ymd}">${isOff ? '' : `
      <div class="pt-speaker-local" style="display:${isVisit ? 'none' : 'block'}">
        <select class="duty-select pt-field pt-speaker-select" data-date="${ymd}" data-field="speaker">
          <option value="">—</option>${buildElderOpts(isVisit ? '' : speakerName)}
        </select>
        ${prefNums.length > 0 ? `<div class="pt-pref-chips" data-date="${ymd}">${prefNums.map(n =>
          `<span class="pt-pref-chip" data-num="${n}" title="${esc(_ptTalkMap[n] || '')}">${n}</span>`
        ).join('')}</div>` : ''}
      </div>
      <div class="pt-speaker-visit" style="display:${isVisit ? 'block' : 'none'}">
        <input type="text" class="duty-input pt-field pt-speaker-input" data-date="${ymd}" data-field="speaker" value="${esc(isVisit ? speakerName : '')}" placeholder="講演者名">
        <input type="text" class="duty-input pt-field pt-cong-input" data-date="${ymd}" data-field="speakerCong" value="${esc(d.speakerCong || '')}" placeholder="会衆名">
      </div>`}
    </td>`;

    // 司会者
    html += `<td class="pt-offable">${isOff ? '' :
      `<select class="duty-select pt-field" data-date="${ymd}" data-field="chairman">
        <option value="">—</option>${buildElderOpts(d.chairman || '')}
      </select>`
    }</td>`;

    // 朗読者
    html += `<td class="pt-offable">${isOff ? '' :
      `<select class="duty-select pt-field" data-date="${ymd}" data-field="reader">
        <option value="">—</option>${buildElderOpts(d.reader || '')}
      </select>`
    }</td>`;

    html += '</tr>';
  }
  html += '</tbody></table></div>';

  html += `<div class="duty-actions" style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn-primary" onclick="autoGeneratePTSchedule()">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">auto_fix_high</span> 自動生成
    </button>
    <button class="btn-primary" onclick="savePTSchedule()">
      <span class="material-icons" style="font-size:16px;vertical-align:middle">save</span> 保存（下書き）
    </button>
  </div>`;

  return html;
}

// ── 自動生成（講演者・主題・司会者・朗読者） ──────────────────────────
async function autoGeneratePTSchedule() {
  if (_ptElderList.length < 3) {
    alert('候補者が3人以上必要です');
    return;
  }

  const container = document.getElementById('public-talk-body');
  if (!container) return;

  // 現在のフォーム値を収集（非表示の要素はスキップ）
  const dateRows = {};
  container.querySelectorAll('.pt-field, .pt-talk-select').forEach(el => {
    const parent = el.closest('.pt-speaker-local, .pt-speaker-visit');
    if (parent && parent.style.display === 'none') return;
    const ymd = el.dataset.date;
    const field = el.dataset.field;
    if (!dateRows[ymd]) dateRows[ymd] = {};
    dateRows[ymd][field] = el.value.trim();
  });

  const allDates = Object.keys(dateRows).sort();
  if (allDates.length === 0) return;

  const hasExisting = allDates.some(ymd =>
    dateRows[ymd].speaker || dateRows[ymd].talkNumber || dateRows[ymd].chairman || dateRows[ymd].reader
  );
  let overwrite = false;
  if (hasExisting) {
    if (!(await customConfirm('既に入力されている日があります。\n全て上書きしますか？'))) return;
    overwrite = true;
  }

  const elderNames = _ptElderList.map(u => u.name);

  // ── 負荷カウント初期化 ──
  const speakerLoad = {};
  const chairLoad = {};
  const readerLoad = {};
  elderNames.forEach(n => { speakerLoad[n] = 0; chairLoad[n] = 0; readerLoad[n] = 0; });

  if (!overwrite) {
    allDates.forEach(ymd => {
      const r = dateRows[ymd];
      if (r.speaker && speakerLoad[r.speaker] !== undefined) speakerLoad[r.speaker]++;
      if (r.chairman && chairLoad[r.chairman] !== undefined) chairLoad[r.chairman]++;
      if (r.reader && readerLoad[r.reader] !== undefined) readerLoad[r.reader]++;
    });
  }

  // ── 講演番号の使用済み追跡 ──
  const usedTalkNums = new Set();
  if (!overwrite) {
    allDates.forEach(ymd => {
      const n = parseInt(dateRows[ymd].talkNumber, 10);
      if (n) usedTalkNums.add(n);
    });
  }
  // 使用可能な講演番号リスト（「使用しないでください」を除外）
  const availableTalks = (_ptTalkList || []).filter(t =>
    !t.title.includes('使用しないでください')
  ).map(t => t.number);

  // ── 希望番号マップ: 講演者名 → 未使用の希望番号配列 ──
  function getUnusedPrefs(name) {
    const prefs = _ptSpeakerPrefs[name] || [];
    return prefs.filter(n => !usedTalkNums.has(n) && availableTalks.includes(n));
  }

  // ── 日付ごとに割当 ──
  for (const ymd of allDates) {
    const row = dateRows[ymd];
    // 大会・記念式はスキップ
    const docCache = _ptDocs[ymd] || {};
    if (docCache.isConvention || docCache.isMemorial) continue;
    if (!overwrite && row.speaker && row.talkNumber && row.chairman && row.reader) continue;

    const usedThisDay = new Set();

    // 1) 講演者割当
    if (overwrite || !row.speaker) {
      // 希望番号がまだ残っている人を優先
      const withPrefs = elderNames.filter(n => !usedThisDay.has(n) && getUnusedPrefs(n).length > 0);
      let candidates;
      if (withPrefs.length > 0) {
        candidates = withPrefs.sort((a, b) => (speakerLoad[a] || 0) - (speakerLoad[b] || 0));
      } else {
        candidates = elderNames.filter(n => !usedThisDay.has(n))
          .sort((a, b) => (speakerLoad[a] || 0) - (speakerLoad[b] || 0));
      }
      if (candidates.length > 0) {
        const pick = candidates[0];
        row.speaker = pick;
        row.speakerCong = '';
        speakerLoad[pick] = (speakerLoad[pick] || 0) + 1;
        usedThisDay.add(pick);
      }
    } else {
      if (row.speaker && elderNames.includes(row.speaker)) usedThisDay.add(row.speaker);
    }

    // 2) 講演番号割当
    if (overwrite || !row.talkNumber) {
      const speaker = row.speaker || '';
      const prefs = getUnusedPrefs(speaker);
      let pickNum = 0;
      if (prefs.length > 0) {
        // 希望番号からランダム（偏り防止）
        pickNum = prefs[Math.floor(Math.random() * prefs.length)];
      } else {
        // 未使用番号から順番に
        const unused = availableTalks.filter(n => !usedTalkNums.has(n));
        if (unused.length > 0) {
          pickNum = unused[Math.floor(Math.random() * unused.length)];
        }
      }
      if (pickNum) {
        row.talkNumber = String(pickNum);
        usedTalkNums.add(pickNum);
      }
    } else {
      const n = parseInt(row.talkNumber, 10);
      if (n) usedTalkNums.add(n);
    }

    // 3) 司会者割当
    if (overwrite || !row.chairman) {
      const available = elderNames.filter(n => !usedThisDay.has(n))
        .sort((a, b) => (chairLoad[a] || 0) - (chairLoad[b] || 0));
      if (available.length > 0) {
        const pick = available[0];
        row.chairman = pick;
        chairLoad[pick] = (chairLoad[pick] || 0) + 1;
        usedThisDay.add(pick);
      }
    } else {
      usedThisDay.add(row.chairman);
    }

    // 4) 朗読者割当
    if (overwrite || !row.reader) {
      const available = elderNames.filter(n => !usedThisDay.has(n))
        .sort((a, b) => (readerLoad[a] || 0) - (readerLoad[b] || 0));
      if (available.length > 0) {
        const pick = available[0];
        row.reader = pick;
        readerLoad[pick] = (readerLoad[pick] || 0) + 1;
      }
    }
  }

  // ── UIに反映 ──
  allDates.forEach(ymd => {
    const r = dateRows[ymd];
    // 自動生成は内部講演者 → 通常モードに切替
    const visitChk = container.querySelector(`.pt-visit-chk[data-date="${ymd}"]`);
    if (visitChk && visitChk.checked) {
      visitChk.checked = false;
      visitChk.dispatchEvent(new Event('change'));
    }
    const spkSel = container.querySelector(`.pt-speaker-select[data-date="${ymd}"]`);
    const tkSel = container.querySelector(`.pt-talk-select[data-date="${ymd}"]`);
    const chSel = container.querySelector(`.pt-field[data-date="${ymd}"][data-field="chairman"]`);
    const rdSel = container.querySelector(`.pt-field[data-date="${ymd}"][data-field="reader"]`);
    if (spkSel) spkSel.value = r.speaker || '';
    if (tkSel) {
      tkSel.value = r.talkNumber || '';
      tkSel.dispatchEvent(new Event('change'));
    }
    if (chSel) chSel.value = r.chairman || '';
    if (rdSel) rdSel.value = r.reader || '';
  });

  alert('講演者・主題・司会者・朗読者を自動生成しました。\n内容を確認して「保存」してください。');
}
window.autoGeneratePTSchedule = autoGeneratePTSchedule;

// ── 公開中テーブル ──────────────────────────
function renderPTPublishedTable(dates) {
  let html = '';
  let hasAny = false;

  html += '<div class="pt-table-wrap"><table class="duty-table pt-table"><thead><tr>';
  html += '<th>日付</th><th class="pt-special-th">区分</th><th>番号</th><th>主題</th><th>訪問</th><th>講演者</th><th>司会者</th><th>朗読者</th>';
  html += '</tr></thead><tbody>';

  let prevMonth2 = -1;
  for (const date of dates) {
    const ymd = fmtPtYmd(date);
    const dowJp = PT_DOW_JP[date.getDay()];
    const d = _ptDocs[ymd] || {};
    const isOff = !!(d.isConvention || d.isMemorial);
    const num = isOff ? '' : (d.publishedTalkNumber || '');
    const title = num ? (_ptTalkMap[num] || '') : '';
    const speaker = isOff ? '' : (d.publishedSpeaker || '');
    const cong = d.publishedSpeakerCong || '';
    const chairman = isOff ? '' : (d.publishedChairman || '');
    const reader = isOff ? '' : (d.publishedReader || '');
    const isVisit = !!(cong && cong !== '唐木田');
    if (speaker || chairman || reader) hasAny = true;
    // 区分ラベル
    let spLabel = '';
    if (d.isConvention) spLabel = '大会';
    else if (d.isMemorial) spLabel = '記念式';
    else if (d.isCircuit) spLabel = '巡回';

    const curMonth2 = date.getFullYear() * 100 + date.getMonth();
    if (curMonth2 !== prevMonth2) {
      html += `<tr class="pt-month-sep"><td colspan="8">${date.getFullYear()}年${date.getMonth()+1}月</td></tr>`;
      prevMonth2 = curMonth2;
    }

    html += `<tr class="${isOff ? 'pt-row-off' : ''}">
      <td class="duty-date-cell duty-weekend"><div class="duty-date-main">${date.getMonth()+1}/${date.getDate()}（${dowJp}）</div></td>
      <td class="duty-pub-cell" style="text-align:center;font-size:11px">${spLabel ? `<span class="pt-sp-badge">${spLabel}</span>` : ''}</td>
      <td class="duty-pub-cell pt-num-cell">${num || (isOff ? '' : '—')}</td>
      <td class="duty-pub-cell" style="text-align:left;font-size:12px">${isOff ? `<span class="pt-off-label">${d.isConvention ? '大会' : '記念式'}</span>` : (esc(title) || '—')}</td>
      <td class="duty-pub-cell" style="text-align:center">${isVisit && !isOff ? '<span class="material-icons" style="font-size:16px;color:#1565c0">check</span>' : ''}</td>
      <td class="duty-pub-cell">${speaker ? esc(speaker) + (isVisit ? `<br><span style="font-size:10px;color:#888">${esc(cong)}</span>` : '') : (isOff ? '' : '—')}</td>
      <td class="duty-pub-cell">${isOff ? '' : (esc(chairman) || '—')}</td>
      <td class="duty-pub-cell">${isOff ? '' : (esc(reader) || '—')}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  if (!hasAny) {
    html = '<div class="duty-pub-notice"><span class="material-icons">info</span> まだ公開されていません。</div>' + html;
  }

  return html;
}

// ── 保存（下書き） ──────────────────────────
async function savePTSchedule() {
  const container = document.getElementById('public-talk-body');
  if (!container) return;

  const batch = db.batch();
  let writes = 0;

  // 日付ごとにフィールドを収集（非表示の要素はスキップ）
  const dateData = {};
  container.querySelectorAll('.pt-field, .pt-talk-select').forEach(el => {
    // 非表示の親divに属する要素はスキップ
    const parent = el.closest('.pt-speaker-local, .pt-speaker-visit');
    if (parent && parent.style.display === 'none') return;
    const ymd = el.dataset.date;
    const field = el.dataset.field;
    if (!dateData[ymd]) dateData[ymd] = {};
    dateData[ymd][field] = el.value.trim();
  });

  // _ptDocsに保持された特殊フラグも含めて全日付を対象にする
  const allYmds = new Set([...Object.keys(dateData), ...Object.keys(_ptDocs).filter(k => _ptDocs[k].isCircuit || _ptDocs[k].isConvention || _ptDocs[k].isMemorial)]);

  for (const ymd of allYmds) {
    const fields = dateData[ymd] || {};
    const docCache = _ptDocs[ymd] || {};
    const talkNumber = parseInt(fields.talkNumber, 10) || 0;
    const data = {
      date: ymd,
      talkNumber,
      speaker: fields.speaker || '',
      speakerCong: fields.speakerCong || '',
      chairman: fields.chairman || '',
      reader: fields.reader || '',
      isCircuit: !!(docCache.isCircuit),
      isConvention: !!(docCache.isConvention),
      isMemorial: !!(docCache.isMemorial),
      updatedAt: firebase.firestore.Timestamp.now(),
    };

    const existing = _ptDocs[ymd];
    if (existing && existing.id) {
      // 変更があれば更新
      let changed = false;
      ['talkNumber','speaker','speakerCong','chairman','reader'].forEach(f => {
        if ((existing[f] || '') !== (data[f] || '')) changed = true;
      });
      if (existing.talkNumber !== data.talkNumber) changed = true;
      ['isCircuit','isConvention','isMemorial'].forEach(f => {
        if (!!(existing[f]) !== !!(data[f])) changed = true;
      });
      if (!changed) continue;
      batch.update(db.collection('PUBLIC_TALK_SCHEDULE').doc(existing.id), data);
      writes++;
    } else {
      // 何か入力されていれば新規作成
      const hasContent = data.talkNumber || data.speaker || data.chairman || data.reader || data.isCircuit || data.isConvention || data.isMemorial;
      if (hasContent) {
        data.publishedSpeaker = '';
        data.publishedSpeakerCong = '';
        data.publishedChairman = '';
        data.publishedReader = '';
        data.publishedTalkNumber = 0;
        const ref = db.collection('PUBLIC_TALK_SCHEDULE').doc();
        batch.set(ref, data);
        writes++;
      }
    }
  }

  if (writes === 0) {
    alert('変更がありません');
    return;
  }

  try {
    await batch.commit();
    alert(`${writes}件保存しました（下書き）`);
    await renderPublicTalkAdmin();
  } catch (e) {
    alert('保存エラー: ' + e.message);
  }
}
window.savePTSchedule = savePTSchedule;

// ── 公開 ──────────────────────────
async function publishPTSchedule() {
  if (!(await customConfirm('下書きの内容で公開しますか？\n一般成員に表示されます。'))) return;

  // まず保存
  await savePTSchedule();
  // 再読込（12ヶ月分）
  const docs = await loadPTSchedule(_ptCurMonth, 12);
  _ptDocs = docs;

  const batch = db.batch();
  let writes = 0;
  const now = firebase.firestore.Timestamp.now();

  Object.values(_ptDocs).forEach(d => {
    let changed = false;
    if ((d.speaker || '') !== (d.publishedSpeaker || '')) changed = true;
    if ((d.speakerCong || '') !== (d.publishedSpeakerCong || '')) changed = true;
    if ((d.chairman || '') !== (d.publishedChairman || '')) changed = true;
    if ((d.reader || '') !== (d.publishedReader || '')) changed = true;
    if ((d.talkNumber || 0) !== (d.publishedTalkNumber || 0)) changed = true;

    if (changed) {
      batch.update(db.collection('PUBLIC_TALK_SCHEDULE').doc(d.id), {
        publishedSpeaker: d.speaker || '',
        publishedSpeakerCong: d.speakerCong || '',
        publishedChairman: d.chairman || '',
        publishedReader: d.reader || '',
        publishedTalkNumber: d.talkNumber || 0,
        publishedAt: now,
      });
      writes++;
    }
  });

  if (writes === 0) {
    alert('公開する変更はありません');
    return;
  }

  try {
    await batch.commit();
    alert(`${writes}件を公開しました`);
    _ptViewMode = 'published';
    await renderPublicTalkAdmin();
  } catch (e) {
    alert('公開エラー: ' + e.message);
  }
}
window.publishPTSchedule = publishPTSchedule;

// ── 月切替 ──────────────────────────
function changePTMonth(delta) {
  if (delta === 0) {
    const now = new Date();
    _ptCurMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    _ptCurMonth = new Date(_ptCurMonth.getFullYear(), _ptCurMonth.getMonth() + delta, 1);
  }
  renderPublicTalkAdmin();
}
window.changePTMonth = changePTMonth;

function switchPTView(mode) {
  _ptViewMode = mode;
  renderPublicTalkAdmin();
}
window.switchPTView = switchPTView;

// ── 講演マスタ インポート ──────────────────────────
async function importTalkListToFirestore() {
  if (!(await customConfirm('S-99の講演マスタ（194件）をFirestoreにインポートしますか？'))) return;

  const TALK_DATA = [
    {n:1,t:"神を信じる どういうこと?"},{n:2,t:"世界の終わりは近い"},{n:3,t:"エホバの組織と歩調を合わせる"},
    {n:4,t:"神はいる? 周りにあるものから分かること"},{n:5,t:"温かい家庭を築くために"},{n:6,t:"ノアの大洪水から学べること"},
    {n:7,t:"「温かな憐れみ」の模範"},{n:8,t:"自分のためだけに生きるのではなく，神に喜んでもらえるように生きる"},
    {n:9,t:"聞いて学んだことを実行しましょう"},{n:10,t:"いつも正直でいる"},
    {n:11,t:"「世の人々」のようではなかったキリストに倣いましょう"},{n:12,t:"神から役目を任されている人たちに敬意を払う"},
    {n:13,t:"性と結婚について聖書が教えていること"},{n:14,t:"神に倣って清い生活をする"},
    {n:15,t:"全ての人に善いことを行う"},{n:16,t:"神との絆を深めるために"},
    {n:17,t:"神を褒めたたえる生き方をする"},{n:18,t:"エホバに頼り，守ってもらう"},
    {n:19,t:"どうすれば将来を知ることができますか"},{n:20,t:"神が世界を治める時は来る？"},
    {n:21,t:"神の王国の国民として幸せに暮らすために"},{n:22,t:"神からの教えをしっかり学ぶには"},
    {n:23,t:"生きることには大きな意味がある"},{n:24,t:"「高価な真珠」を見つけましたか"},
    {n:25,t:"「世の精神」の影響から身を守る"},{n:26,t:"あなたは神にとって大切な存在"},
    {n:27,t:"新婚生活の第一歩"},{n:28,t:"敬意と愛を示し合う夫婦になる"},
    {n:29,t:"親としての責任と喜び"},{n:30,t:"家族のコミュニケーション どうすれば良くなりますか"},
    {n:31,t:"人間には神の導きが必要 なぜそういえるか"},{n:32,t:"心配事があるときにどうしたらよいか"},
    {n:33,t:"世界に公正が行き渡る日は来るか"},{n:34,t:"生き残るための印 どうしたら付けてもらえますか"},
    {n:35,t:"人間が永遠に生きる それは可能か"},{n:36,t:"今の命が全てなのか"},
    {n:37,t:"神の教え通りに生きると良い結果になる"},{n:38,t:"どうすれば 世界の終わりを生き残れますか"},
    {n:39,t:"イエス･キリストは世を征服する いつ，どのように？"},{n:40,t:"聖書のどんな預言が間もなく実現するか"},
    {n:41,t:"「じっととどまって，……エホバの救いを見なさい」"},{n:42,t:"愛は憎しみに勝てるか"},
    {n:43,t:"神のアドバイスはためになる"},{n:44,t:"イエスの教えから学ぶ"},
    {n:45,t:"聖書の格言 今も役立つ"},{n:46,t:"信仰を強くして，エホバの約束が果たされるのを見る"},
    {n:47,t:"「良い知らせ」に信仰を持てるのはどうしてですか"},{n:48,t:"神に喜ばれる揺るぎない愛"},
    {n:49,t:"美しい地球 取り戻せるか"},{n:50,t:"良い結果につながる決定をする"},
    {n:51,t:"聖書の教えには人を変える力がある"},{n:52,t:"どの宗教を選ぶかは重要?"},
    {n:53,t:"神の考え方に倣う"},{n:54,t:"神の存在と神の約束を信じる"},
    {n:55,t:"神からどう見られるかは大切なこと"},{n:56,t:"リーダーとして信頼できるのは誰ですか"},
    {n:57,t:"迫害のもとで耐え忍ぶ"},{n:58,t:"イエスの教えに従う本物のクリスチャンを見分ける"},
    {n:59,t:"（使用しないでください。）"},{n:60,t:"何のために生きますか"},
    {n:61,t:"誰の言うことを信じますか"},{n:62,t:"将来は明るい なぜそう言えるか"},
    {n:63,t:"真理を見つけることはできる？"},{n:64,t:"遊んで楽しむことが本当の幸せ?"},
    {n:65,t:"理不尽な目に遭ったら，どうすればよいか"},{n:66,t:"良い知らせを伝える 今しかできないこと"},
    {n:67,t:"エホバの言葉とエホバが造ったものについてじっくり考える"},{n:68,t:"「引き続き……寛大に許し合いましょう」"},
    {n:69,t:"与える生き方は素晴らしい"},{n:70,t:"神を信頼できるのはどうしてか"},
    {n:71,t:"「目を覚まして」いる なぜ? どのように?"},{n:72,t:"愛はクリスチャンである証拠"},
    {n:73,t:"「心に知恵」を得るには"},{n:74,t:"エホバは見てくれている"},
    {n:75,t:"エホバを神と認めて生活する"},{n:76,t:"聖書の原則―今日の問題に対処するのに役立ちますか"},
    {n:77,t:"「人をもてなすことに努めましょう」"},{n:78,t:"エホバに仕えて心からの喜びを味わう"},
    {n:79,t:"誰の友達になるかは大切"},{n:80,t:"未来を託せるのは科学？ それとも聖書？"},
    {n:81,t:"聖書を教える あなたにもできますか"},{n:82,t:"（使用しないでください。）"},
    {n:83,t:"クリスチャンは十戒を守る必要がある？"},{n:84,t:"あなたはこの世界がたどる運命から逃れますか"},
    {n:85,t:"暴力的な世界における良いたより"},{n:86,t:"神に聞かれる祈り"},
    {n:87,t:"あなたと神との関係はどのようなものですか"},{n:88,t:"聖書の基準は私たちのためになる なぜそう言えるか"},
    {n:89,t:"真理を探している皆さん，来てください！"},{n:90,t:"新しい世界で生きることを目指しましょう"},
    {n:91,t:"メシアの臨在とその支配"},{n:92,t:"世界の出来事における宗教の役割"},
    {n:93,t:"自然災害 いつかなくなる？"},{n:94,t:"真の宗教は人間社会の必要を満たす"},
    {n:95,t:"心霊術に用心してください"},{n:96,t:"宗教は将来どうなるか"},
    {n:97,t:"曲がった世代にあって，とがめのない状態を保つ"},{n:98,t:"「今の世のありさまは変わっていく」"},
    {n:99,t:"聖書を信頼できる理由"},{n:100,t:"ずっと続く固い友情を築くには"},
    {n:101,t:"エホバは「偉大な創造者」"},{n:102,t:"「預言の言葉」に注意を払う"},
    {n:103,t:"本当の喜び どうしたら味わえる？"},{n:104,t:"親の皆さん，火に耐える材料で建てましょう"},
    {n:105,t:"わたしたちが遭遇するすべての患難において慰めを得る"},{n:106,t:"地を破滅させることは神からの報復を招く"},
    {n:107,t:"良心を正しい基準に合わせる 大切なのはなぜ？"},{n:108,t:"将来のことを心配する必要はないと言えるのはなぜ？"},
    {n:109,t:"神の王国は近い"},{n:110,t:"家族生活を成功させるために神を第一にする"},
    {n:111,t:"人類は完全に癒やされる どういうことか"},{n:112,t:"自己中心的な世の中で愛を表すには"},
    {n:113,t:"若い時をどう生きるか 後悔しない人生を送るために"},{n:114,t:"神の創造の驚異に認識と感謝を示す"},
    {n:115,t:"サタンの策略にはまらないために"},{n:116,t:"友を賢明に選んでください"},
    {n:117,t:"善をもって悪を征服するにはどうすればよいか"},{n:118,t:"エホバの見地から若い人を見る"},
    {n:119,t:"クリスチャンとして世から離れている―なぜ益になりますか"},{n:120,t:"今，神の支配権に服すべきなのはなぜですか"},
    {n:121,t:"信仰で結ばれた人たちは守られる"},{n:122,t:"（使用しないでください。）"},
    {n:123,t:"（使用しないでください。）"},{n:124,t:"聖書が神の著作であることを確信できる根拠"},
    {n:125,t:"人類に贖いが必要なのはなぜか"},{n:126,t:"救われるのはだれですか"},
    {n:127,t:"人は死ぬとどうなりますか"},{n:128,t:"地獄は本当に火の燃える責め苦の場所ですか"},
    {n:129,t:"三位一体は聖書の教えか"},{n:130,t:"地球は永久に存続する"},
    {n:131,t:"悪魔にしっかり立ち向かう"},{n:132,t:"復活 死に対する勝利"},
    {n:133,t:"人間の起源―何を信じるかは重大なことですか"},{n:134,t:"クリスチャンは安息日を守る必要がある？"},
    {n:135,t:"命と血は神聖なもの"},{n:136,t:"神は像を用いた崇拝を是認されますか"},
    {n:137,t:"聖書の奇跡は本当に起きましたか"},{n:138,t:"堕落した世にあって健全な思いをもって生活しなさい"},
    {n:139,t:"科学が進んだ世界における敬虔な知恵"},{n:140,t:"イエス･キリストについて知っておきたい本当のこと"},
    {n:141,t:"創造物としての人間のうめき―いつ終わりますか"},{n:142,t:"エホバのもとに避難すべきなのはなぜですか"},
    {n:143,t:"すべての慰めの神に依り頼みなさい"},{n:144,t:"キリストの指導のもとにある忠節な会衆"},
    {n:145,t:"だれがわたしたちの神エホバのようであろうか"},{n:146,t:"教育の益を，エホバを賛美するために用いなさい"},
    {n:147,t:"エホバには私たちを救う力がある"},{n:148,t:"あなたは命に関して神と同じ見方をしていますか"},
    {n:149,t:"あなたは神と共に歩んでいますか"},{n:150,t:"世界は滅んでしまうのか"},
    {n:151,t:"エホバはご自分の民のための「堅固な高台」"},{n:152,t:"真のハルマゲドン―なぜ？また，いつ？"},
    {n:153,t:"「畏怖の念を抱かせる」日をしっかりと思いに留める"},{n:154,t:"人間による支配―はかりに掛けられた"},
    {n:155,t:"バビロンの裁きの時は到来しましたか"},{n:156,t:"裁きの日―恐れの時か，希望の時か"},
    {n:157,t:"真のクリスチャンはどのように神の教えを飾るか"},{n:158,t:"勇気を出し，エホバに依り頼みなさい"},
    {n:159,t:"危険な世界で安全を見いだす"},{n:160,t:"クリスチャンとしての立場を守ってください"},
    {n:161,t:"イエスが苦しみのもとで死なれたのはなぜですか"},{n:162,t:"闇の世からの救出"},
    {n:163,t:"まことの神を恐れるのはなぜですか"},{n:164,t:"現代でも神は支配しておられますか"},
    {n:165,t:"あなたはどんな価値基準を大切にしますか"},{n:166,t:"信仰とは何か 信仰があると生き方はどう変わるか"},
    {n:167,t:"無分別な世にあって賢く行動する"},{n:168,t:"問題の多いこの世界にあっても安心感を抱けます"},
    {n:169,t:"聖書を導きとするのはなぜですか"},{n:170,t:"人類のための支配者としてふさわしいのはだれですか"},
    {n:171,t:"平和な生活―今，また永久に!"},{n:172,t:"あなたは神のみ前でどのような立場を得ていますか"},
    {n:173,t:"神から見て正しい宗教がありますか"},{n:174,t:"神の新しい世―どんな人が入れますか"},
    {n:175,t:"聖書は信頼できる―なぜそう言えますか"},{n:176,t:"真の平和と安全―実現はいつか"},
    {n:177,t:"苦難の時にどこから助けが得られますか"},{n:178,t:"忠誠の道を歩む"},
    {n:179,t:"世の幻想を退け，王国に関する現実の事柄を追い求めなさい"},{n:180,t:"復活―現実的希望と言えるのはなぜか"},
    {n:181,t:"あなたが考える以上に終わりは近づいていますか"},{n:182,t:"神の王国は今わたしたちのために何を行なっていますか"},
    {n:183,t:"無価値なものから目を背けなさい"},{n:184,t:"死によってすべてが終わりますか"},
    {n:185,t:"真理はあなたの生活にどのように影響しますか"},{n:186,t:"神の幸福な民と一つに結ばれる"},
    {n:187,t:"愛の神が悪を許しておられるのはなぜですか"},{n:188,t:"神エホバを信頼するという生き方"},
    {n:189,t:"神と共に歩むのは幸せなこと"},{n:190,t:"最高に幸せな家族になるために今できること"},
    {n:191,t:"愛と信仰があれば強くなれる"},{n:192,t:"生きることを永遠に楽しむために"},
    {n:193,t:"近づく「苦難の時」に救われるために"},{n:194,t:"神だけが教えてくれる最高のアドバイス"},
  ];

  try {
    // Firestoreのバッチは500件まで。194件なので1回でOK
    const batch = db.batch();
    TALK_DATA.forEach(t => {
      const ref = db.collection('PUBLIC_TALK_LIST').doc(String(t.n));
      batch.set(ref, { number: t.n, title: t.t });
    });
    await batch.commit();
    alert(`${TALK_DATA.length}件の講演マスタをインポートしました`);
    _ptTalkList = null; // キャッシュクリア
    _ptTalkMap = {};
    await renderPublicTalkAdmin();
  } catch (e) {
    alert('インポートエラー: ' + e.message);
  }
}
window.importTalkListToFirestore = importTalkListToFirestore;

// ── Wordファイル(.docx)からインポート ──────────────────────────
async function importTalkListFromDocx(file) {
  if (!file) return;
  if (!file.name.endsWith('.docx')) {
    alert('.docx ファイルを選択してください');
    return;
  }

  try {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) { alert('Word文書の解析に失敗しました'); return; }
    const xmlStr = await xmlFile.async('string');

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p');

    // 段落ごとにテキスト結合
    const lines = [];
    for (const p of paragraphs) {
      const texts = p.getElementsByTagNameNS(ns, 't');
      let line = '';
      for (const t of texts) line += t.textContent;
      line = line.trim();
      if (line) lines.push(line);
    }

    // "番号. 主題" パターンを抽出
    const talks = [];
    for (const line of lines) {
      const m = line.match(/^(\d{1,3})\.\s*(.+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num >= 1 && num <= 300) {
          talks.push({ number: num, title: m[2].trim() });
        }
      }
    }

    if (talks.length === 0) {
      alert('講演データを検出できませんでした。\n「番号. 主題」の形式で記載されたWordファイルを指定してください。');
      return;
    }

    if (!(await customConfirm(`${talks.length}件の講演データを検出しました。\nインポート（上書き更新）しますか？`))) return;

    const batch = db.batch();
    talks.forEach(t => {
      const ref = db.collection('PUBLIC_TALK_LIST').doc(String(t.number));
      batch.set(ref, { number: t.number, title: t.title });
    });
    await batch.commit();
    alert(`${talks.length}件の講演マスタを更新しました`);
    _ptTalkList = null;
    _ptTalkMap = {};
    await renderPublicTalkAdmin();
  } catch (e) {
    alert('Wordインポートエラー: ' + e.message);
    console.error('importTalkListFromDocx error:', e);
  }
}
window.importTalkListFromDocx = importTalkListFromDocx;

// ── 講演希望番号フォーム（講演者用） ──────────────────────────
async function renderTalkPrefForm() {
  const container = document.getElementById('talk-pref-body');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const talkList = await loadTalkList();
    if (talkList.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">info</span>講演マスタが未登録です</div>';
      return;
    }

    // 現在のユーザーの希望を読み込み
    let myPrefs = [];
    let myDocId = null;
    if (currentUser) {
      const email = currentUser.email.trim();
      const snap = await db.collection('TALK_PREFS').where('uid', '==', currentUser.uid).limit(1).get();
      if (!snap.empty) {
        myDocId = snap.docs[0].id;
        myPrefs = snap.docs[0].data().talks || [];
      }
    }
    const prefSet = new Set(myPrefs);

    let html = '<div class="tp-form">';
    html += '<p class="tp-desc">希望する講演番号を選択してください。調整者が予定表を作成する際に参考にします。</p>';
    html += '<div class="tp-search"><input type="text" class="duty-input" id="tp-search-input" placeholder="番号 or キーワードで検索"></div>';
    html += '<div class="tp-list" id="tp-list">';
    talkList.forEach(t => {
      const checked = prefSet.has(t.number) ? ' checked' : '';
      html += `<label class="tp-item" data-num="${t.number}" data-title="${esc(t.title)}">
        <input type="checkbox" value="${t.number}"${checked}>
        <span class="tp-num">${t.number}</span>
        <span class="tp-title">${esc(t.title)}</span>
      </label>`;
    });
    html += '</div>';
    html += `<div class="tp-selected" id="tp-selected-count">選択中: ${prefSet.size}件</div>`;
    html += `<div class="duty-actions">
      <button class="btn-primary" id="tp-save-btn">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">save</span> 保存
      </button>
    </div>`;
    html += '</div>';
    container.innerHTML = html;

    // 検索フィルタ
    const searchInput = document.getElementById('tp-search-input');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      container.querySelectorAll('.tp-item').forEach(el => {
        const num = el.dataset.num;
        const title = el.dataset.title.toLowerCase();
        el.style.display = (!q || num.includes(q) || title.includes(q)) ? '' : 'none';
      });
    });

    // 選択数カウント
    const countEl = document.getElementById('tp-selected-count');
    container.querySelectorAll('.tp-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const cnt = container.querySelectorAll('.tp-item input[type="checkbox"]:checked').length;
        countEl.textContent = `選択中: ${cnt}件`;
      });
    });

    // 保存
    document.getElementById('tp-save-btn').addEventListener('click', async () => {
      const selected = [];
      container.querySelectorAll('.tp-item input[type="checkbox"]:checked').forEach(cb => {
        selected.push(parseInt(cb.value, 10));
      });
      selected.sort((a,b) => a - b);

      try {
        const data = {
          uid: currentUser.uid,
          name: memberUserName || currentUser.displayName || '',
          talks: selected,
          updatedAt: firebase.firestore.Timestamp.now(),
        };
        if (myDocId) {
          await db.collection('TALK_PREFS').doc(myDocId).set(data);
        } else {
          await db.collection('TALK_PREFS').add(data);
        }
        alert(`${selected.length}件の希望講演を保存しました`);
      } catch (e) {
        alert('保存エラー: ' + e.message);
      }
    });

  } catch (e) {
    container.innerHTML = '<div class="empty-state">読み込みエラー: ' + e.message + '</div>';
    console.error('renderTalkPrefForm error:', e);
  }
}
window.renderTalkPrefForm = renderTalkPrefForm;

// ── S-99 講演一覧 ──────────────────────────
async function renderS99List() {
  const container = document.getElementById('s99-list-body');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const talkList = await loadTalkList();

    if (talkList.length === 0) {
      container.innerHTML = `
        <div class="duty-pub-notice">
          <span class="material-icons">warning</span>
          講演マスタがまだインポートされていません。
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <button class="btn-primary" onclick="importTalkListToFirestore()">
            <span class="material-icons" style="font-size:16px;vertical-align:middle">upload</span> 初期データをインポート
          </button>
          <label class="btn-primary" style="cursor:pointer">
            <span class="material-icons" style="font-size:16px;vertical-align:middle">description</span> S-99 Wordからインポート
            <input type="file" accept=".docx" style="display:none" onchange="importTalkListFromDocx(this.files[0])">
          </label>
        </div>`;
      return;
    }

    let html = '';
    // 検索バー
    html += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <input type="text" class="duty-input" id="s99-search" placeholder="番号 or キーワードで検索" style="max-width:300px">
      <span class="s99-count" id="s99-count">${talkList.length}件</span>
      <label class="btn-outline pt-import-btn" style="cursor:pointer;margin-left:auto">
        <span class="material-icons" style="font-size:16px;vertical-align:middle">description</span> S-99更新
        <input type="file" accept=".docx" style="display:none" onchange="importTalkListFromDocx(this.files[0])">
      </label>
    </div>`;

    // テーブル
    html += '<div class="pt-table-wrap"><table class="duty-table s99-table"><thead><tr>';
    html += '<th style="width:60px">番号</th><th>主題</th>';
    html += '</tr></thead><tbody id="s99-tbody">';

    talkList.forEach(t => {
      const unused = t.title.includes('使用しないでください');
      html += `<tr class="s99-row${unused ? ' s99-unused' : ''}" data-num="${t.number}" data-title="${esc(t.title.toLowerCase())}">
        <td class="s99-num">${t.number}</td>
        <td${unused ? ' style="color:#999;font-style:italic"' : ''}>${esc(t.title)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    // 検索フィルタ
    const searchInput = document.getElementById('s99-search');
    const countEl = document.getElementById('s99-count');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      let visible = 0;
      container.querySelectorAll('.s99-row').forEach(row => {
        const num = row.dataset.num;
        const title = row.dataset.title;
        const show = !q || num.includes(q) || title.includes(q);
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      countEl.textContent = `${visible}件`;
    });

  } catch (e) {
    container.innerHTML = '<div class="empty-state">読み込みエラー: ' + e.message + '</div>';
    console.error('renderS99List error:', e);
  }
}
window.renderS99List = renderS99List;

// ── 管理画面ボタン ──────────────────────────
document.getElementById('admin-manage-public-talk')?.addEventListener('click', () => {
  _ptViewMode = 'draft';
  navigate('admin-public-talk');
  renderPublicTalkAdmin();
});

document.getElementById('admin-manage-s99')?.addEventListener('click', () => {
  navigate('admin-s99');
  renderS99List();
});
