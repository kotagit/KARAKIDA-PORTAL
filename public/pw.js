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
      // places 配列 もしくは レガシー place 文字列 を統一して扱う
      const placesArr = Array.isArray(item.places) && item.places.length
        ? item.places
        : (item.place ? String(item.place).split(/[、,／/]/).map(s => s.trim()).filter(Boolean) : []);
      const placeBadges = placesArr.map(p => {
        const c = p.includes('唐木田') ? 'pw-place-karakida'
                : p.includes('堀之内') ? 'pw-place-horinouchi' : 'pw-place-other';
        const label = p.replace(/駅$/, '');
        return `<span class="pw-place-badge ${c}">${esc(label)}</span>`;
      }).join('');
      html += `<div class="pw-slot-card" style="position:relative">
        <span class="material-icons pw-slot-icon">access_time</span>
        <span class="pw-slot-time">${esc(item.starttime || '')}〜${esc(item.endtime || '')}</span>
        ${placeBadges}
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
      // 既存 place（文字列）または新 places（配列）に対応してチェックを復元
      const placesArr = Array.isArray(item.places)
        ? item.places
        : (item.place ? String(item.place).split(/[、,／/]/).map(s => s.trim()).filter(Boolean) : []);
      document.querySelectorAll('.pws-place-cb').forEach(cb => {
        cb.checked = placesArr.includes(cb.value);
      });
      document.getElementById('pws-order').value = item.order ?? '';
    }
  } else {
    // 新規時はクリア
    document.querySelectorAll('.pws-place-cb').forEach(cb => { cb.checked = false; });
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
  const placesArr = [...document.querySelectorAll('.pws-place-cb:checked')].map(cb => cb.value);
  const data = {
    day: dayStr,
    dayofweek: document.getElementById('pws-dow').value,
    starttime: startVal,
    endtime: document.getElementById('pws-end').value.trim(),
    places: placesArr,
    // 後方互換用に place フィールドも複数結合で保存
    place: placesArr.join('、'),
    order: parseInt(document.getElementById('pws-order').value) || 0,
  };
  if (!data.day || !startVal || !data.endtime || placesArr.length === 0) {
    alert('必須項目を入力してください（場所は最低1つチェック）');
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
      // places 配列 もしくは レガシー place 文字列を統一処理
      const placesArr = Array.isArray(opt.places) && opt.places.length
        ? opt.places
        : (opt.place ? String(opt.place).split(/[、,／/]/).map(s => s.trim()).filter(Boolean) : []);
      if (placesArr.length === 0) return;
      const placeKey = placesArr.join(',');
      const dateLabel = `${dateStr}(${weekday})`;
      const slotKey  = `${dateStr}_${time}_${placeKey}`;

      // 申込者を抽出:
      // - 同じ date/weekday/time
      // - preferredLocation に places のいずれかが含まれる
      // - レガシーは d.place が places のどれかに一致
      const applicantsForSlot = appSnap.docs
        .map(d => d.data())
        .filter(d => {
          if (d.day !== dateStr) return false;
          if (d.dayofweek !== weekday) return false;
          if (d.starttime !== time) return false;
          const pref = String(d.preferredLocation || '').trim();
          if (pref) return placesArr.some(p => pref.includes(p));
          return placesArr.includes(d.place);
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

      // fullPlaces: 全 places のサブエリアを結合
      const fullPlaces = [];
      const fullPlaceParentMap = {}; // fullPlace → 親 place
      placesArr.forEach(p => {
        pwGetFullPlaceNames(weekday, time, p).forEach(fp => {
          if (!fullPlaces.includes(fp)) {
            fullPlaces.push(fp);
            fullPlaceParentMap[fp] = p;
          }
        });
      });

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

      slots.push({
        dateStr, weekday, dateLabel, time,
        endtime: String(opt.endtime || ''),
        places: placesArr,
        place: placesArr.join('、'), // 後方互換用
        slotKey, fullPlaces, fullPlaceParentMap,
        conductorApplicants, allApplicants, applicantLocMap
      });
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
      const placeBadges = slot.places.map(p => {
        const c = p.includes('唐木田') ? 'pw-place-karakida'
                : p.includes('堀之内') ? 'pw-place-horinouchi' : 'pw-place-other';
        return `<span class="pw-place-badge ${c}">${esc(p)}</span>`;
      }).join('');
      html += `
        <div class="pw-slot-card" data-slotkey="${esc(slot.slotKey)}"
          onclick="openPWAssignment('${esc(slot.slotKey)}')">
          <span class="material-icons pw-slot-icon">access_time</span>
          <span class="pw-slot-time">${esc(slot.time)}〜${esc(slot.endtime || '')}</span>
          ${placeBadges}
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

  // fullPlace ごとに、その親 place に preferredLocation がマッチする応募者だけ抽出
  function applicantsForFullPlace(fp, baseList) {
    const parent = (slot.fullPlaceParentMap || {})[fp];
    if (!parent) return baseList;
    const locMap = slot.applicantLocMap || {};
    return baseList.filter(name => {
      const pref = String(locMap[name] || '').trim();
      if (!pref) return true; // 旧データはそのまま
      return pref.includes(parent);
    });
  }

  let html = '';
  slot.fullPlaces.forEach(fp => {
    const data = subMap[fp] || { '司会者': null, '参加者': [null,null,null,null,null] };
    const cond = applicantsForFullPlace(fp, slot.conductorApplicants);
    const all  = applicantsForFullPlace(fp, slot.allApplicants);
    html += `
      <div class="pw-subloc-card">
        <div class="pw-subloc-header">${esc(fp)}</div>
        <div class="pw-subloc-body">
          ${buildPWRow('司会者', fp, '司会者', data['司会者'], cond)}
          <div class="pw-divider"></div>
          ${[0,1,2,3,4].map(i =>
            buildPWRow(`参加者 ${i+1}`, fp, `参加者_${i}`, data['参加者'][i], all)
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
