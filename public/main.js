// ── Firebase 初期化 ────────────────────────────
firebase.initializeApp({
  apiKey: "AIzaSyCJ2EyLF-63hMs5PHLKCnGhO36bXv4zo7Q",
  authDomain: "karakida-app-7bbc0.web.app",
  projectId: "karakida-app-7bbc0",
  storageBucket: "karakida-app-7bbc0.appspot.com",
  messagingSenderId: "784037102811",
  appId: "1:784037102811:web:8173578b319adc6596f8fe"
});
var auth     = firebase.auth();
var db       = firebase.firestore();
var provider = new firebase.auth.GoogleAuthProvider();

// ── 状態 ──────────────────────────────────────
let currentUser   = null;
let isAdmin       = false;
let currentPage   = 'home';
let scheduleType  = 'meeting';
let editingAnnounceId  = null;
let editingScheduleId  = null;
let deleteTargetId     = null;
let deleteTargetType   = null;

// ── ページタイトル ────────────────────────────
const PAGE_TITLES = {
  home: '唐木田PORTAL', hatsuhy: '発表', keikaku: '計画',
  senkyo: '宣教', shukai: '集会', shinsei: '申請',
  soshiki: '組織', gyoji: '行事', saigai: '災害対応'
};

// ── DOM ──────────────────────────────────────
const loginScreen   = document.getElementById('login-screen');
const app           = document.getElementById('app');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');
const logoutBtn     = document.getElementById('logout-btn');
const userNameEl    = document.getElementById('user-name');
const backBtn       = document.getElementById('back-btn');
const headerTitle   = document.getElementById('header-title');
const headerHomeBtn = document.getElementById('header-home-btn');

// ── ログイン ──────────────────────────────────
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

loginBtn.addEventListener('click', () => {
  loginError.textContent = 'Googleへ移動中...';
  if (isMobile()) {
    auth.signInWithRedirect(provider);
  } else {
    auth.signInWithPopup(provider).catch((err) => {
      loginError.textContent = 'エラー: ' + err.message;
    });
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

// ── 認証状態 ──────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    loginError.textContent = 'ユーザー確認中...';
    try {
      const snap = await db.collection('USER_LIST')
        .where('mail', '==', user.email.toLowerCase())
        .limit(1).get();

      if (snap.empty) {
        loginError.textContent = 'アクセス権限がありません。';
        await auth.signOut();
        return;
      }

      const userData = snap.docs[0].data();
      currentUser = user;
      isAdmin = userData.dev === 'WEB';
      userNameEl.textContent = userData.name || user.displayName || '';

      loginScreen.classList.add('hidden');
      app.classList.remove('hidden');
      navigate('home');
    } catch (e) {
      loginError.textContent = 'エラー: ' + e.message;
      await auth.signOut();
    }
  } else {
    currentUser = null;
    isAdmin = false;
    app.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }
});

// ── ルーティング ──────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  currentPage = page;
  headerTitle.textContent = PAGE_TITLES[page] || page;

  if (page === 'home') {
    backBtn.classList.add('hidden');
  } else {
    backBtn.classList.remove('hidden');
  }

  if (page === 'hatsuhy')  loadAnnouncements();
  if (page === 'keikaku')  loadLinks('keikaku');
  if (page === 'senkyo')   loadLinks('senkyo');
  if (page === 'shukai')   { loadLinks('shukai'); loadSchedule(); }
  if (page === 'shinsei')  loadLinks('shinsei');
  if (page === 'soshiki')  loadLinks('soshiki');
  if (page === 'gyoji')    loadLinks('gyoji');
  if (page === 'saigai')   loadLinks('saigai');

  if (isAdmin) {
    const fab = document.getElementById('add-announce-btn');
    const sfab = document.getElementById('add-schedule-btn');
    if (fab)  fab.classList.toggle('hidden', page !== 'hatsuhy');
    if (sfab) sfab.classList.toggle('hidden', page !== 'shukai');
  }

  window.scrollTo(0, 0);
}

// メニューグリッドのクリック
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.page));
});

backBtn.addEventListener('click', () => navigate('home'));
headerHomeBtn.addEventListener('click', () => navigate('home'));

// ── 発表 ──────────────────────────────────────
async function loadAnnouncements() {
  const list = document.getElementById('announce-list');
  list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('ANNOUNCEMENT')
      .orderBy('date', 'desc').limit(50).get();
    renderAnnouncements(snap.docs);
  } catch (e) {
    list.innerHTML = '<div class="loading">読み込みエラー: ' + e.message + '</div>';
  }
}

const WD = ['日','月','火','水','木','金','土'];

function renderAnnouncements(docs) {
  const list = document.getElementById('announce-list');
  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">article</span>発表はありません</div>';
    return;
  }
  list.innerHTML = '';
  docs.forEach(docSnap => {
    const d = docSnap.data();
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const dateStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日（${WD[date.getDay()]}）`;

    const links = [
      d.link1_title && d.link1_url ? { title: d.link1_title, url: d.link1_url } : null,
      d.link2_title && d.link2_url ? { title: d.link2_title, url: d.link2_url } : null,
    ].filter(Boolean);

    const card = document.createElement('div');
    card.className = 'announce-card';
    card.innerHTML = `
      <div class="announce-date">${esc(dateStr)}</div>
      ${d.title ? `<div class="announce-title">${esc(d.title)}</div>` : ''}
      ${d.body  ? `<div class="announce-body">${esc(d.body)}</div>` : ''}
      <div class="announce-links">
        ${links.map(l => `<a class="announce-link" href="${esc(l.url)}" target="_blank" rel="noopener">
          <span class="material-icons">open_in_new</span>${esc(l.title)}</a>`).join('')}
      </div>
      ${isAdmin ? `<div class="announce-actions">
        <button class="btn-edit" data-id="${docSnap.id}"><span class="material-icons">edit</span>編集</button>
        <button class="btn-delete" data-id="${docSnap.id}" data-type="announce"><span class="material-icons">delete</span>削除</button>
      </div>` : ''}
    `;
    list.appendChild(card);
  });

  if (isAdmin) {
    list.querySelectorAll('.btn-edit').forEach(btn =>
      btn.addEventListener('click', () => openAnnounceModal(btn.dataset.id)));
    list.querySelectorAll('.btn-delete').forEach(btn =>
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'announce')));
  }
}

// ── 発表モーダル ──────────────────────────────
const announceModal = document.getElementById('announce-modal');
const announceForm  = document.getElementById('announce-form');

document.getElementById('add-announce-btn').addEventListener('click', () => openAnnounceModal(null));
document.getElementById('announce-modal-close').addEventListener('click', closeAnnounceModal);
document.getElementById('announce-overlay').addEventListener('click', closeAnnounceModal);
document.getElementById('af-cancel').addEventListener('click', closeAnnounceModal);

function openAnnounceModal(id) {
  editingAnnounceId = id;
  document.getElementById('announce-modal-title').textContent = id ? '発表を編集' : '発表を追加';
  if (!id) {
    announceForm.reset();
    document.getElementById('af-date').value = new Date().toISOString().split('T')[0];
  } else {
    db.collection('ANNOUNCEMENT').doc(id).get().then(snap => {
      const d = snap.data();
      const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
      document.getElementById('af-date').value = date.toISOString().split('T')[0];
      document.getElementById('af-title').value = d.title || '';
      document.getElementById('af-body').value  = d.body  || '';
      document.getElementById('af-link1-title').value = d.link1_title || '';
      document.getElementById('af-link1-url').value   = d.link1_url   || '';
      document.getElementById('af-link2-title').value = d.link2_title || '';
      document.getElementById('af-link2-url').value   = d.link2_url   || '';
    });
  }
  announceModal.classList.remove('hidden');
}

function closeAnnounceModal() {
  announceModal.classList.add('hidden');
  editingAnnounceId = null;
}

announceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    date:        firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('af-date').value)),
    title:       document.getElementById('af-title').value.trim(),
    body:        document.getElementById('af-body').value.trim(),
    link1_title: document.getElementById('af-link1-title').value.trim(),
    link1_url:   document.getElementById('af-link1-url').value.trim(),
    link2_title: document.getElementById('af-link2-title').value.trim(),
    link2_url:   document.getElementById('af-link2-url').value.trim(),
  };
  try {
    if (editingAnnounceId) {
      await db.collection('ANNOUNCEMENT').doc(editingAnnounceId).update(data);
    } else {
      data.createdAt = firebase.firestore.Timestamp.now();
      await db.collection('ANNOUNCEMENT').add(data);
    }
    closeAnnounceModal();
    loadAnnouncements();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
});

// ── リンクページ ──────────────────────────────
async function loadLinks(section) {
  const listEl = document.getElementById(section + '-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('LINKS')
      .where('section', '==', section)
      .orderBy('order', 'asc').get();

    if (snap.empty) {
      listEl.innerHTML = '<div class="empty-state"><span class="material-icons">link</span>準備中</div>';
      return;
    }
    listEl.innerHTML = '';
    snap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const a = document.createElement('a');
      a.className = 'link-item';
      a.href = d.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `
        <div class="link-item-icon"><span class="material-icons">${esc(d.icon || 'insert_drive_file')}</span></div>
        <span class="link-item-label">${esc(d.title)}</span>
      `;
      listEl.appendChild(a);
    });
  } catch (e) {
    listEl.innerHTML = '<div class="empty-state"><span class="material-icons">link</span>準備中</div>';
  }
}

// ── 集会スケジュール ──────────────────────────
async function loadSchedule() {
  const list = document.getElementById('schedule-list');
  list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('SCHEDULE')
      .where('type', '==', scheduleType)
      .orderBy('date', 'asc').get();
    renderSchedule(snap.docs);
  } catch (e) {
    list.innerHTML = '<div class="loading">読み込みエラー: ' + e.message + '</div>';
  }
}

const TYPE_LABELS = { meeting: '集会', circuit: '巡回訪問', convention: '大会' };

function renderSchedule(docs) {
  const list = document.getElementById('schedule-list');
  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">event_busy</span>スケジュールはありません</div>';
    return;
  }
  list.innerHTML = '';
  docs.forEach(docSnap => {
    const d = docSnap.data();
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const wday = WD[date.getDay()];
    let dateRange = '';
    if (d.endDate) {
      const end = d.endDate?.toDate ? d.endDate.toDate() : new Date(d.endDate);
      dateRange = ` ～ ${end.getMonth()+1}/${end.getDate()}(${WD[end.getDay()]})`;
    }
    const card = document.createElement('div');
    card.className = 'schedule-card';
    card.innerHTML = `
      <div class="schedule-date-block">
        <div class="schedule-date-month">${date.getMonth()+1}月</div>
        <div class="schedule-date-day">${date.getDate()}</div>
        <div class="schedule-date-weekday">${wday}</div>
      </div>
      <div class="schedule-info">
        <span class="schedule-type-badge badge-${d.type}">${TYPE_LABELS[d.type]}</span>
        <div class="schedule-title">${esc(d.title || '')}</div>
        <div class="schedule-meta">
          ${dateRange ? `<span><span class="material-icons">date_range</span>${esc(dateRange)}</span>` : ''}
          ${d.location ? `<span><span class="material-icons">place</span>${esc(d.location)}</span>` : ''}
        </div>
        ${d.note ? `<div class="schedule-note">${esc(d.note)}</div>` : ''}
      </div>
      ${isAdmin ? `<div class="schedule-actions">
        <button class="icon-btn btn-edit" data-id="${docSnap.id}" style="color:var(--primary)">
          <span class="material-icons">edit</span>
        </button>
        <button class="icon-btn btn-delete" data-id="${docSnap.id}" data-type="schedule" style="color:#d32f2f">
          <span class="material-icons">delete</span>
        </button>
      </div>` : ''}
    `;
    list.appendChild(card);
  });

  if (isAdmin) {
    list.querySelectorAll('.btn-edit').forEach(btn =>
      btn.addEventListener('click', () => openScheduleModal(btn.dataset.id)));
    list.querySelectorAll('.btn-delete').forEach(btn =>
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'schedule')));
  }
}

// スケジュールタブ
document.querySelectorAll('.stab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    scheduleType = tab.dataset.type;
    loadSchedule();
  });
});

// ── スケジュールモーダル ──────────────────────
const scheduleModal = document.getElementById('schedule-modal');
const scheduleForm  = document.getElementById('schedule-form');

document.getElementById('add-schedule-btn').addEventListener('click', () => openScheduleModal(null));
document.getElementById('schedule-modal-close').addEventListener('click', closeScheduleModal);
document.getElementById('schedule-overlay').addEventListener('click', closeScheduleModal);
document.getElementById('sf-cancel').addEventListener('click', closeScheduleModal);

function openScheduleModal(id) {
  editingScheduleId = id;
  document.getElementById('schedule-modal-title').textContent = id ? 'スケジュール編集' : 'スケジュール追加';
  if (!id) {
    scheduleForm.reset();
    document.getElementById('sf-type').value = scheduleType;
  } else {
    db.collection('SCHEDULE').doc(id).get().then(snap => {
      const d = snap.data();
      document.getElementById('sf-type').value     = d.type;
      document.getElementById('sf-title').value    = d.title || '';
      document.getElementById('sf-date').value     = toDateInput(d.date);
      document.getElementById('sf-end-date').value = d.endDate ? toDateInput(d.endDate) : '';
      document.getElementById('sf-location').value = d.location || '';
      document.getElementById('sf-note').value     = d.note || '';
    });
  }
  scheduleModal.classList.remove('hidden');
}

function closeScheduleModal() {
  scheduleModal.classList.add('hidden');
  editingScheduleId = null;
}

function toDateInput(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const endVal = document.getElementById('sf-end-date').value;
  const data = {
    type:     document.getElementById('sf-type').value,
    title:    document.getElementById('sf-title').value.trim(),
    date:     firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('sf-date').value)),
    endDate:  endVal ? firebase.firestore.Timestamp.fromDate(new Date(endVal)) : null,
    location: document.getElementById('sf-location').value.trim(),
    note:     document.getElementById('sf-note').value.trim(),
  };
  try {
    if (editingScheduleId) {
      await db.collection('SCHEDULE').doc(editingScheduleId).update(data);
    } else {
      data.createdAt = firebase.firestore.Timestamp.now();
      await db.collection('SCHEDULE').add(data);
    }
    closeScheduleModal();
    loadSchedule();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
});

// ── 削除 ──────────────────────────────────────
function openDeleteModal(id, type) {
  deleteTargetId   = id;
  deleteTargetType = type;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  deleteTargetId = null; deleteTargetType = null;
}

document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
document.getElementById('delete-overlay').addEventListener('click', closeDeleteModal);
document.getElementById('delete-confirm').addEventListener('click', async () => {
  if (!deleteTargetId) return;
  const col = deleteTargetType === 'announce' ? 'ANNOUNCEMENT' : 'SCHEDULE';
  try {
    await db.collection(col).doc(deleteTargetId).delete();
    closeDeleteModal();
    if (deleteTargetType === 'announce') loadAnnouncements();
    else loadSchedule();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
});

// ── ユーティリティ ────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
