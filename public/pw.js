// ── 公共エリア伝道策定 ──────────────────────────────────────────

// ── 取決表（スケジュール）編集 ──
let pwsEditingId = null;

document.getElementById('admin-manage-pw-schedule')?.addEventListener('click', () => {
  navigate('admin-pw-schedule');
  loadPWSchedule();
});

async function loadPWSchedule() {
  const list = document.getElementById('pw-schedule-list');
  list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('PUBLIC_WITNESSING_OPTIONS').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const oa = typeof a.order === 'number' ? a.order : 9999;
      const ob = typeof b.order === 'number' ? b.order : 9999;
      if (oa !== ob) return oa - ob;
      return String(a.day || '').localeCompare(String(b.day || ''));
    });
    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">スロットがありません</div>';
      return;
    }
    let html = '';
    let lastDate = '';
    items.forEach(item => {
      const dateLabel = `${item.day || ''}(${item.dayofweek || ''})`;
      if (dateLabel !== lastDate) {
        if (lastDate) html += '</div>';
        html += `<div class="pw-date-group"><div class="pw-date-tag">${esc(dateLabel)}</div>`;
        lastDate = dateLabel;
      }
      const placeColor = (item.place || '').includes('唐木田') ? 'pw-place-karakida'
                       : (item.place || '').includes('堀之内') ? 'pw-place-horinouchi' : 'pw-place-other';
      html += `<div class="pw-slot-card" style="position:relative">
        <span class="material-icons pw-slot-icon">access_time</span>
        <span class="pw-slot-time">${esc(item.starttime || '')}〜${esc(item.endtime || '')}</span>
        <span class="pw-place-badge ${placeColor}">${esc(item.place || '')}</span>
        <span class="pw-slot-order" style="font-size:11px;color:#999">順: ${item.order ?? '-'}</span>
        <button class="icon-btn" onclick="event.stopPropagation();openPWSlotModal('${item.id}')" title="編集">
          <span class="material-icons" style="font-size:18px;color:var(--primary)">edit</span>
        </button>
        <button class="icon-btn" onclick="event.stopPropagation();deletePWSlot('${item.id}')" title="削除">
          <span class="material-icons" style="font-size:18px;color:#d32f2f">delete</span>
        </button>
      </div>`;
    });
    if (lastDate) html += '</div>';
    list.innerHTML = html;
    list._pwScheduleItems = items;
  } catch (e) {
    list.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}

function openPWSlotModal(id) {
  pwsEditingId = id || null;
  const modal = document.getElementById('pw-slot-modal');
  const form = document.getElementById('pw-slot-form');
  form.reset();
  pwsStartCustom.classList.add('hidden');
  pwsStartCustom.value = '';
  document.getElementById('pw-slot-modal-title').textContent = id ? 'スロットを編集' : 'スロットを追加';
  if (id) {
    const list = document.getElementById('pw-schedule-list');
    const items = list._pwScheduleItems || [];
    const item = items.find(i => i.id === id);
    if (item) {
      // "5/15" → "2026-05-15" 形式に変換
      const rawDay = item.day || '';
      if (rawDay) {
        const parts = rawDay.split('/');
        if (parts.length === 2) {
          const m = parts[0].padStart(2, '0');
          const d = parts[1].padStart(2, '0');
          const yr = new Date().getFullYear();
          document.getElementById('pws-day').value = `${yr}-${m}-${d}`;
        }
      }
      document.getElementById('pws-dow').value = item.dayofweek || '月';
      pwsSetStartValue(item.starttime || '');
      document.getElementById('pws-end').value = item.endtime || '';
      document.getElementById('pws-place').value = item.place || '';
      document.getElementById('pws-order').value = item.order ?? '';
    }
  }
  modal.classList.remove('hidden');
}

function closePWSlotModal() {
  document.getElementById('pw-slot-modal').classList.add('hidden');
  pwsEditingId = null;
}

// 開始時刻プルダウン制御
const pwsStartSel = document.getElementById('pws-start-sel');
const pwsStartCustom = document.getElementById('pws-start-custom');
const pwsEnd = document.getElementById('pws-end');
const pwsPresetTimes = ['7:00','9:00','10:00','11:00','11:30','12:00','15:00','18:00'];

function pwsCalcEndTime(startStr) {
  const m = startStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  let h = parseInt(m[1]), min = parseInt(m[2]);
  min += 90;
  h += Math.floor(min / 60);
  min = min % 60;
  return `${h}:${String(min).padStart(2,'0')}`;
}

function pwsSetStartValue(val) {
  if (pwsPresetTimes.includes(val)) {
    pwsStartSel.value = val;
    pwsStartCustom.classList.add('hidden');
    pwsStartCustom.value = '';
  } else {
    pwsStartSel.value = 'other';
    pwsStartCustom.classList.remove('hidden');
    pwsStartCustom.value = val;
  }
}

function pwsGetStartValue() {
  return pwsStartSel.value === 'other' ? pwsStartCustom.value.trim() : pwsStartSel.value;
}

pwsStartSel?.addEventListener('change', function() {
  if (this.value === 'other') {
    pwsStartCustom.classList.remove('hidden');
    pwsStartCustom.focus();
    pwsEnd.value = '';
  } else {
    pwsStartCustom.classList.add('hidden');
    pwsStartCustom.value = '';
    pwsEnd.value = pwsCalcEndTime(this.value);
  }
});

pwsStartCustom?.addEventListener('input', function() {
  const v = this.value.trim();
  if (/^\d{1,2}:\d{2}$/.test(v)) pwsEnd.value = pwsCalcEndTime(v);
});

document.getElementById('pws-day')?.addEventListener('change', function() {
  if (this.value) {
    const dow = ['日','月','火','水','木','金','土'][new Date(this.value + 'T00:00:00').getDay()];
    document.getElementById('pws-dow').value = dow;
  }
});
document.getElementById('pw-schedule-add-btn')?.addEventListener('click', () => openPWSlotModal(null));
document.getElementById('pw-slot-modal-close')?.addEventListener('click', closePWSlotModal);
document.getElementById('pw-slot-overlay')?.addEventListener('click', closePWSlotModal);
document.getElementById('pws-cancel')?.addEventListener('click', closePWSlotModal);

document.getElementById('pw-slot-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  // "2026-05-15" → "5/15" 形式に変換
  const rawDate = document.getElementById('pws-day').value;
  const dtParts = rawDate.split('-');
  const dayStr = dtParts.length === 3 ? `${parseInt(dtParts[1])}/${parseInt(dtParts[2])}` : rawDate;
  const startVal = pwsGetStartValue();
  const data = {
    day: dayStr,
    dayofweek: document.getElementById('pws-dow').value,
    starttime: startVal,
    endtime: document.getElementById('pws-end').value.trim(),
    place: document.getElementById('pws-place').value.trim(),
    order: parseInt(document.getElementById('pws-order').value) || 0,
  };
  if (!data.day || !startVal || !data.endtime || !data.place) {
    alert('必須項目を入力してください');
    return;
  }
  try {
    if (pwsEditingId) {
      await db.collection('PUBLIC_WITNESSING_OPTIONS').doc(pwsEditingId).set(data, { merge: true });
    } else {
      await db.collection('PUBLIC_WITNESSING_OPTIONS').add(data);
    }
    closePWSlotModal();
    loadPWSchedule();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
});

async function deletePWSlot(id) {
  if (!(await customConfirm('このスロットを削除しますか？'))) return;
  try {
    await db.collection('PUBLIC_WITNESSING_OPTIONS').doc(id).delete();
    loadPWSchedule();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

// 現在策定中のスロットデータ
let pwCurrentSlot = null;
// slotKey -> { subLocation -> { '司会者': name|null, '参加者': [name|null, ...] } }
let pwAssignmentsMap = {};

// ── ページタイトル登録（main.js の PAGE_TITLES に追記）
PAGE_TITLES['admin-pw-schedule']   = '公共エリア伝道取決表策定';
PAGE_TITLES['admin-pw']            = '公共エリア伝道参加者策定';
PAGE_TITLES['admin-pw-assignment'] = '策定';

// ── ナビゲーション
document.getElementById('admin-manage-pw')?.addEventListener('click', () => {
  navigate('admin-pw');
  loadPWSlots();
});

document.getElementById('pw-refresh-btn')?.addEventListener('click', () => {
  loadPWSlots();
});

document.getElementById('pw-assignment-back-btn')?.addEventListener('click', () => {
  navigate('admin-pw');
});

document.getElementById('pw-save-btn')?.addEventListener('click', () => {
  savePWAssignments();
});

// ── サブロケーション名を取得（Flutterと同じロジック）
function pwGetFullPlaceNames(weekday, time, place) {
  if (place.includes('唐木田')) return ['唐木田構内'];
  if (place.includes('堀之内')) {
    const base = '堀之内';
    if (weekday === '水' && time === '18:00') {
      return [`${base}三和前`, `${base}FM前`];
    }
    return [`${base}三和前`, `${base}FM前`, `${base}信号前`];
  }
  return [place];
}

// ── スロット一覧の読み込み
async function loadPWSlots() {
  const list = document.getElementById('pw-slot-list');
  list.innerHTML = '<div class="loading">読み込み中...</div>';
  pwAssignmentsMap = {};

  try {
    // 1. 募集スロット
    const optSnap  = await db.collection('PUBLIC_WITNESSING_OPTIONS').get();
    // 2. 全申込み
    const appSnap  = await db.collection('PUBLIC_WITNESSING').get();
    // 3. 既存割当て
    const assSnap  = await db.collection('PUBLIC_WITNESSING_ASSIGNMENTS').get();

    const existingDocs = {};
    assSnap.docs.forEach(d => { existingDocs[d.id] = d.data(); });

    // スロットを order → date → time でソート
    const opts = optSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    opts.sort((a, b) => {
      const oa = typeof a.order === 'number' ? a.order : 9999;
      const ob = typeof b.order === 'number' ? b.order : 9999;
      if (oa !== ob) return oa - ob;
      return String(a.day || '').localeCompare(String(b.day || ''));
    });

    if (opts.length === 0) {
      list.innerHTML = '<div class="empty-state">募集項目がありません</div>';
      return;
    }

    const slots = [];
    opts.forEach(opt => {
      const dateStr  = String(opt.day       || '');
      const weekday  = String(opt.dayofweek || '');
      const time     = String(opt.starttime || '');
      const place    = String(opt.place     || '');
      const dateLabel = `${dateStr}(${weekday})`;
      const slotKey  = `${dateStr}_${time}_${place}`;

      // 申込者を抽出
      // - 同じ date/weekday/time のもの
      // - preferredLocation に slot の place を含む人を表示
      //   "A" 単独 → A の場所のプルダウンのみ
      //   "A＞B"   → A と B 両方のプルダウンに表示
      // - 旧データ（preferredLocation 未設定）は従来通り d.place === place で判定
      const applicantsForSlot = appSnap.docs
        .map(d => d.data())
        .filter(d => {
          if (d.day !== dateStr) return false;
          if (d.dayofweek !== weekday) return false;
          if (d.starttime !== time) return false;
          const pref = String(d.preferredLocation || '').trim();
          if (pref) return pref.includes(place);
          return d.place === place;
        });

      // 申込者の希望場所マップ (name → preferredLocation)
      const applicantLocMap = {};
      applicantsForSlot.forEach(d => {
        const n = String(d.name || '');
        if (n) applicantLocMap[n] = String(d.preferredLocation || '');
      });

      const conductorApplicants = [...new Set(
        applicantsForSlot
          .filter(d => String(d.role || '').includes('司会者'))
          .map(d => String(d.name || ''))
          .filter(Boolean)
      )].sort();

      const allApplicants = [...new Set(
        applicantsForSlot
          .map(d => String(d.name || ''))
          .filter(Boolean)
      )].sort();

      const fullPlaces = pwGetFullPlaceNames(weekday, time, place);

      // 既存割当てを初期化
      const subMap = {};
      fullPlaces.forEach(fp => {
        const docId = `${dateStr}_${time}_${fp}`;
        if (existingDocs[docId]) {
          const ass = existingDocs[docId].assignments || {};
          const parts = Array.isArray(ass['参加者']) ? ass['参加者'] : [];
          while (parts.length < 5) parts.push(null);
          subMap[fp] = { '司会者': ass['司会者'] || null, '参加者': parts.slice(0, 5) };
        } else {
          subMap[fp] = { '司会者': null, '参加者': [null, null, null, null, null] };
        }
      });
      pwAssignmentsMap[slotKey] = subMap;

      slots.push({ dateStr, weekday, dateLabel, time, place, slotKey, fullPlaces, conductorApplicants, allApplicants, applicantLocMap });
    });

    // 日付ごとにグループ化して描画
    let html = '';
    let lastDate = '';
    slots.forEach(slot => {
      if (slot.dateLabel !== lastDate) {
        if (lastDate) html += '</div>';
        html += `<div class="pw-date-group">
          <div class="pw-date-tag">${esc(slot.dateLabel)}</div>`;
        lastDate = slot.dateLabel;
      }
      const placeColor = slot.place.includes('唐木田') ? 'pw-place-karakida'
                       : slot.place.includes('堀之内') ? 'pw-place-horinouchi'
                       : 'pw-place-other';
      html += `
        <div class="pw-slot-card" data-slotkey="${esc(slot.slotKey)}"
          onclick="openPWAssignment('${esc(slot.slotKey)}')">
          <span class="material-icons pw-slot-icon">access_time</span>
          <span class="pw-slot-time">${esc(slot.time)}</span>
          <span class="pw-place-badge ${placeColor}">${esc(slot.place)}</span>
          <span class="material-icons" style="color:#bbb;font-size:20px">chevron_right</span>
        </div>`;
    });
    if (lastDate) html += '</div>';
    list.innerHTML = html;

    // スロットデータをキャッシュ
    list._pwSlots = slots;

  } catch (e) {
    list.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}

// ── 割当て画面を開く
function openPWAssignment(slotKey) {
  const list = document.getElementById('pw-slot-list');
  const slots = list._pwSlots || [];
  const slot = slots.find(s => s.slotKey === slotKey);
  if (!slot) return;

  pwCurrentSlot = slot;

  // タイトル更新
  document.getElementById('pw-assignment-title').textContent =
    `${slot.dateLabel} ${slot.time} 策定`;

  renderPWAssignment(slot);
  navigate('admin-pw-assignment');
}

// ── 割当て画面の描画
function renderPWAssignment(slot) {
  const body = document.getElementById('pw-assignment-body');
  const subMap = pwAssignmentsMap[slot.slotKey] || {};

  let html = '';
  slot.fullPlaces.forEach(fp => {
    const data = subMap[fp] || { '司会者': null, '参加者': [null,null,null,null,null] };
    html += `
      <div class="pw-subloc-card">
        <div class="pw-subloc-header">${esc(fp)}</div>
        <div class="pw-subloc-body">
          ${buildPWRow('司会者', fp, '司会者', data['司会者'], slot.conductorApplicants)}
          <div class="pw-divider"></div>
          ${[0,1,2,3,4].map(i =>
            buildPWRow(`参加者 ${i+1}`, fp, `参加者_${i}`, data['参加者'][i], slot.allApplicants)
          ).join('')}
        </div>
      </div>`;
  });
  body.innerHTML = html;
}

// ── 割当て行を構築
function buildPWRow(label, fp, key, currentVal, applicants) {
  const allAssigned = pwGetAllAssigned(pwCurrentSlot.slotKey);
  const locMap = pwCurrentSlot.applicantLocMap || {};
  const filtered = applicants.filter(n => n === currentVal || !allAssigned.has(n));

  let options = '<option value="">未選択</option>';
  if (currentVal && !filtered.includes(currentVal)) {
    const loc = locMap[currentVal];
    const locSuffix = loc ? `【${loc}】` : '';
    options += `<option value="${esc(currentVal)}" selected>${esc(currentVal)}${esc(locSuffix)}</option>`;
  }
  filtered.forEach(n => {
    const sel = n === currentVal ? ' selected' : '';
    const loc = locMap[n];
    const locSuffix = loc ? `【${loc}】` : '';
    options += `<option value="${esc(n)}"${sel}>${esc(n)}${esc(locSuffix)}</option>`;
  });

  const safeKey = key.replace(/\s/g, '_');
  return `
    <div class="pw-assign-row">
      <span class="pw-assign-label">${esc(label)}</span>
      <select class="pw-assign-select"
        onchange="onPWSelectChange('${esc(pwCurrentSlot.slotKey)}','${esc(fp)}','${esc(key)}',this.value)">
        ${options}
      </select>
    </div>`;
}

// ── 全割当て済み名前を取得
function pwGetAllAssigned(slotKey) {
  const assigned = new Set();
  const subMap = pwAssignmentsMap[slotKey] || {};
  Object.values(subMap).forEach(data => {
    if (data['司会者']) assigned.add(data['司会者']);
    (data['参加者'] || []).forEach(n => { if (n) assigned.add(n); });
  });
  return assigned;
}

// ── セレクト変更時
function onPWSelectChange(slotKey, fp, key, value) {
  const subMap = pwAssignmentsMap[slotKey];
  if (!subMap || !subMap[fp]) return;
  const val = value || null;

  if (key === '司会者') {
    subMap[fp]['司会者'] = val;
  } else if (key.startsWith('参加者_')) {
    const idx = parseInt(key.split('_')[1]);
    subMap[fp]['参加者'][idx] = val;
  }
  // 重複排除のため再描画
  renderPWAssignment(pwCurrentSlot);
}

// ── Firestore に保存
async function savePWAssignments() {
  const btn = document.getElementById('pw-save-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const slot = pwCurrentSlot;
    const datePart = slot.dateStr;
    const subMap = pwAssignmentsMap[slot.slotKey] || {};
    const batch = db.batch();

    slot.fullPlaces.forEach(fp => {
      const data = subMap[fp] || {};
      const docId = `${datePart}_${slot.time}_${fp}`;
      const ref = db.collection('PUBLIC_WITNESSING_ASSIGNMENTS').doc(docId);
      batch.set(ref, {
        date:  slot.dateLabel,
        time:  slot.time,
        place: fp,
        assignments: {
          '司会者': data['司会者'] || null,
          '参加者': data['参加者'] || [null,null,null,null,null],
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    btn.textContent = '✓ 保存しました';
    setTimeout(() => {
      btn.innerHTML = '<span class="material-icons" style="font-size:16px;vertical-align:middle">save</span> 保存';
      btn.disabled = false;
    }, 1500);

  } catch (e) {
    btn.textContent = '保存失敗';
    btn.disabled = false;
    alert('保存に失敗しました: ' + e.message);
  }
}
