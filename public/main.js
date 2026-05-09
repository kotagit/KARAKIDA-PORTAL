
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

// ── ユーティリティ ────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ── ページタイトル ────────────────────────────
const PAGE_TITLES = {
  home: '唐木田PORTAL', hatsuhy: '発表', keikaku: '計画',
  senkyo: '宣教', shukai: '集会', shinsei: '申請',
  soshiki: '組織', gyoji: '行事', saigai: '災害対応',
  admin: '管理画面', 'admin-announcements': '発表管理',
  'member-info': '成員情報登録',
  'admin-assignment': '割当管理', 'admin-assignment-week': '割当編集',
  'admin-assignment-history': '割当履歴',
  'admin-schedule-editor': 'スケジュール編集',
  'admin-members': 'メンバー管理',
  'admin-s13': '区域割当ての記録',
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

// ── 認証状態の監視と初期化 ──────────────────
async function initApp() {
  // リダイレクト結果の処理
  try {
    const result = await auth.getRedirectResult();
    if (result.user) {
      console.log('Redirect login success:', result.user.email);
    }
  } catch (err) {
    console.error('Redirect login error:', err);
    loginError.textContent = 'ログインエラー: ' + err.message;
  }

  // 認証状態の変化を監視
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      isAdmin = false;
      // 読み込み中はGoogleの表示名を出しておく
      userNameEl.textContent = user.displayName || 'ユーザー';
      loginScreen.classList.add('hidden');
      app.classList.remove('hidden');
      navigate('home');

      // 権限と名前のチェック（Firestoreから取得）
      try {
        const email = user.email.trim();
        console.log('Checking USER_LIST for:', email);
        
        let snap = await db.collection('USER_LIST').where('mail', '==', email.toLowerCase()).limit(1).get();
        if (snap.empty) {
          snap = await db.collection('USER_LIST').where('mail', '==', email).limit(1).get();
        }
        
        if (!snap.empty) {
          const userData = snap.docs[0].data();
          console.log('User data loaded:', userData.name);
          // USER_LISTにある漢字の名前等に書き換える
          userNameEl.textContent = userData.name || user.displayName || '';
          
          const statusFields = ['status1','status2','status3','status4','status5','status6','status7','status8'];
          isAdmin = statusFields.some(f => (userData[f] || '').toString().toUpperCase().trim() === 'WEB');
          
          const adminMenu = document.getElementById('menu-admin');
          if (adminMenu) adminMenu.classList.toggle('hidden', !isAdmin);
        } else {
          console.warn('User not found in USER_LIST');
        }
      } catch (e) {
        console.error('Auth Check Error:', e);
      }
    } else {
      currentUser = null;
      isAdmin = false;
      app.classList.add('hidden');
      loginScreen.classList.remove('hidden');
    }
  });
}

// ── ログインイベント ────────────────────────
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

// アプリ起動
initApp();

// ── ルーティング ──────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.add('active');
  
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
  if (page === 'shukai')   { loadLinks('shukai'); loadAssignmentWeekDisplay(); }
  if (page === 'shinsei')  loadLinks('shinsei');
  if (page === 'soshiki')  loadLinks('soshiki');
  if (page === 'gyoji')    loadLinks('gyoji');
  if (page === 'saigai')   loadLinks('saigai');
  if (page === 'admin-announcements') loadAdminAnnouncements();
  if (page === 'member-info')           loadMemberInfoForm();
  if (page === 'admin-assignment')         initAssignmentPage();
  if (page === 'admin-assignment-history') initHistoryPage();
  if (page === 'admin-members')            initMembersPage();
  if (page === 'admin-s13')                loadAdminS13Table();

  if (isAdmin) {
    const fab = document.getElementById('add-announce-btn');
    const sfab = document.getElementById('add-schedule-btn');
    if (fab)  fab.classList.toggle('hidden', page !== 'admin');
    if (sfab) sfab.classList.toggle('hidden', page !== 'admin' && page !== 'shukai');
  }

  window.scrollTo(0, 0);
}

// 管理画面のカード
document.getElementById('admin-manage-announcements')?.addEventListener('click', () => {
  navigate('admin-announcements');
});

document.getElementById('admin-add-announce-btn')?.addEventListener('click', () => {
  openAnnounceModal(null);
});

document.getElementById('admin-manage-members')?.addEventListener('click', () => {
  navigate('admin-members');
});

document.getElementById('admin-manage-s13')?.addEventListener('click', () => {
  navigate('admin-s13');
});

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

async function loadAdminAnnouncements() {
  const list = document.getElementById('admin-announce-list');
  list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('ANNOUNCEMENT')
      .orderBy('date', 'desc').limit(100).get();
    renderAdminAnnouncements(snap.docs);
  } catch (e) {
    list.innerHTML = '<div class="loading">読み込みエラー: ' + e.message + '</div>';
  }
}

function renderAdminAnnouncements(docs) {
  const list = document.getElementById('admin-announce-list');
  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state">発表データがありません</div>';
    return;
  }
  list.innerHTML = '';
  docs.forEach(docSnap => {
    const d = docSnap.data();
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
    
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div class="admin-list-info">
        <div class="admin-list-date">${esc(dateStr)}</div>
        <div class="admin-list-title">${esc(d.title || '(タイトルなし)')}</div>
      </div>
      <div class="admin-list-actions">
        <button class="btn-edit icon-btn" data-id="${docSnap.id}" style="color:var(--primary)">
          <span class="material-icons">edit</span>
        </button>
        <button class="btn-delete icon-btn" data-id="${docSnap.id}" data-type="announce" style="color:#d32f2f">
          <span class="material-icons">delete</span>
        </button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.btn-edit').forEach(btn =>
    btn.addEventListener('click', () => openAnnounceModal(btn.dataset.id)));
  list.querySelectorAll('.btn-delete').forEach(btn =>
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'announce')));
}

const WD = ['日','月','火','水','木','金','土'];

function renderAnnouncements(docs) {
  const list = document.getElementById('announce-list');
  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">article</span>発表はありません</div>';
    return;
  }
  list.innerHTML = '';

  // 日付でグループ化
  const groups = {};
  docs.forEach(docSnap => {
    const d = docSnap.data();
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const dateKey = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日（${WD[date.getDay()]}）`;
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push({ id: docSnap.id, ...d });
  });

  Object.keys(groups).forEach(dateKey => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'announce-group';
    
    let itemsHtml = '';
    groups[dateKey].forEach(item => {
      const links = item.links || [];
      if (item.link1_title && item.link1_url) links.push({ title: item.link1_title, url: item.link1_url });
      if (item.link2_title && item.link2_url) links.push({ title: item.link2_title, url: item.link2_url });

      itemsHtml += `
        <div class="announce-item">
          ${item.title ? `<div class="announce-item-title">${esc(item.title)}</div>` : ''}
          ${item.body  ? `<div class="announce-item-body">${item.body.replace(/\n/g, '<br>')}</div>` : ''}
          <div class="announce-item-links">
            ${links.map(l => `<a class="announce-item-link" href="${esc(l.url)}" target="_blank" rel="noopener">
              <span class="material-icons">open_in_new</span>${esc(l.title)}</a>`).join('')}
          </div>
        </div>
      `;
    });

    groupDiv.innerHTML = `
      <div class="announce-group-date">${esc(dateKey)}</div>
      <div class="announce-items-container">
        ${itemsHtml}
      </div>
    `;
    list.appendChild(groupDiv);
  });
}

// ── 発表モーダル ──────────────────────────────
const announceModal = document.getElementById('announce-modal');
const announceForm  = document.getElementById('announce-form');
const linksContainer = document.getElementById('af-links-container');
const addLinkBtn = document.getElementById('af-add-link-btn');

document.getElementById('add-announce-btn').addEventListener('click', () => openAnnounceModal(null));
document.getElementById('announce-modal-close').addEventListener('click', closeAnnounceModal);
document.getElementById('announce-overlay').addEventListener('click', closeAnnounceModal);
document.getElementById('af-cancel').addEventListener('click', closeAnnounceModal);

addLinkBtn.addEventListener('click', () => addLinkInput('', ''));

function addLinkInput(title = '', url = '') {
  const row = document.createElement('div');
  row.className = 'link-input-row';
  row.innerHTML = `
    <div class="link-input-fields">
      <input type="text" class="link-title" placeholder="リンクのタイトル" value="${esc(title)}">
      <input type="url" class="link-url" placeholder="URL (https://...)" value="${esc(url)}">
    </div>
    <button type="button" class="btn-remove-link"><span class="material-icons">delete</span></button>
  `;
  row.querySelector('.btn-remove-link').addEventListener('click', () => row.remove());
  linksContainer.appendChild(row);
}

function openAnnounceModal(id) {
  editingAnnounceId = id;
  document.getElementById('announce-modal-title').textContent = id ? '発表を編集' : '発表を追加';
  linksContainer.innerHTML = '';
  
  if (!id) {
    announceForm.reset();
    document.getElementById('af-date').value = new Date().toISOString().split('T')[0];
    addLinkInput('', '');
  } else {
    db.collection('ANNOUNCEMENT').doc(id).get().then(snap => {
      const d = snap.data();
      const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
      document.getElementById('af-date').value = date.toISOString().split('T')[0];
      document.getElementById('af-title').value = d.title || '';
      document.getElementById('af-body').value  = d.body  || '';
      
      const links = d.links || [];
      if (d.link1_title && d.link1_url) links.push({ title: d.link1_title, url: d.link1_url });
      if (d.link2_title && d.link2_url) links.push({ title: d.link2_title, url: d.link2_url });
      
      if (links.length > 0) {
        links.forEach(l => addLinkInput(l.title, l.url));
      } else {
        addLinkInput('', '');
      }
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
  
  const links = [];
  linksContainer.querySelectorAll('.link-input-row').forEach(row => {
    const title = row.querySelector('.link-title').value.trim();
    const url = row.querySelector('.link-url').value.trim();
    if (title && url) links.push({ title, url });
  });

  const data = {
    date:        firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('af-date').value)),
    title:       document.getElementById('af-title').value.trim(),
    body:        document.getElementById('af-body').value.trim(),
    links:       links,
    link1_title: '', link1_url: '', link2_title: '', link2_url: ''
  };
  try {
    if (editingAnnounceId) {
      await db.collection('ANNOUNCEMENT').doc(editingAnnounceId).update(data);
    } else {
      data.createdAt = firebase.firestore.Timestamp.now();
      await db.collection('ANNOUNCEMENT').add(data);
    }
    closeAnnounceModal();
    if (currentPage === 'admin-announcements') loadAdminAnnouncements();
    else loadAnnouncements();
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

    listEl.innerHTML = '';

    if (section === 'shinsei') {
      const versionDiv = document.createElement('div');
      versionDiv.style.cssText = 'text-align:center; padding:10px; color:#666; font-size:12px;';
      versionDiv.textContent = 'v1.1 (2026-05-08)';
      listEl.appendChild(versionDiv);

      const memberInfoItem = document.createElement('div');
      memberInfoItem.className = 'link-item';
      memberInfoItem.style.cursor = 'pointer';
      memberInfoItem.innerHTML = `
        <div class="link-item-icon"><span class="material-icons">contact_phone</span></div>
        <span class="link-item-label">成員情報登録</span>
      `;
      memberInfoItem.addEventListener('click', () => navigate('member-info'));
      listEl.appendChild(memberInfoItem);
    }

    if (!snap.empty) {
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
    } else if (section !== 'shinsei') {
      listEl.innerHTML = '<div class="empty-state"><span class="material-icons">link</span>準備中</div>';
    }
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

// ── 成員情報登録 ──────────────────────────────
let currentMemberData = null;
let memberUserName = '';
let memberUserGroup = '';

async function loadMemberInfoForm() {
  const container = document.getElementById('member-info-form-container');
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const email = currentUser.email.trim();
    let snap = await db.collection('USER_LIST').where('mail', '==', email.toLowerCase()).limit(1).get();
    if (snap.empty) {
      snap = await db.collection('USER_LIST').where('mail', '==', email).limit(1).get();
    }

    if (!snap.empty) {
      const userData = snap.docs[0].data();
      memberUserName = userData.name || currentUser.displayName || '';
      memberUserGroup = userData.group || '';

      const docSnap = await db.collection('MEMBER_INFO').doc(memberUserName).get();
      if (docSnap.exists) {
        currentMemberData = docSnap.data();
      }
    } else {
      memberUserName = currentUser.displayName || '';
      memberUserGroup = '';
    }

    renderMemberInfoForm();
  } catch (e) {
    container.innerHTML = '<div class="empty-state">読み込みエラー: ' + e.message + '</div>';
    console.error('loadMemberInfoForm error:', e);
  }
}

function renderMemberInfoForm() {
  const container = document.getElementById('member-info-form-container');
  const data = currentMemberData || {};

  container.innerHTML = `
    <div class="form-container">
      <p class="form-description">成員情報を登録・更新してください</p>

      <div class="section-divider"></div>
      <h3 class="section-title">成員基本情報</h3>

      <div class="form-group">
        <label>氏名</label>
        <input type="text" id="mf-name" value="${esc(memberUserName)}" readonly style="background:#f5f5f5;">
      </div>

      <div class="form-group">
        <label>所属グループ</label>
        <input type="text" id="mf-group" value="${esc(memberUserGroup)}" readonly style="background:#f5f5f5;">
      </div>

      <div class="form-group">
        <label>自宅電話</label>
        <input type="tel" id="mf-home-phone" value="${esc(data.homePhone || '')}" placeholder="例: 042-653-9740">
      </div>

      <div class="form-group">
        <label>携帯電話 <span style="color:#d32f2f;">*</span></label>
        <input type="tel" id="mf-mobile-phone" value="${esc(data.mobilePhone || '')}" placeholder="例: 090-1540-3718" required>
      </div>

      <div class="form-group">
        <label>メールアドレス</label>
        <input type="email" id="mf-email" value="${esc(data.email || '')}" placeholder="例: example@gmail.com">
      </div>

      <div class="form-group">
        <label>住所</label>
        <textarea id="mf-address" rows="2" placeholder="例: 別所2-9 エミネンス長池1-307">${esc(data.address || '')}</textarea>
      </div>

      <div class="form-group">
        <label>生年月日</label>
        <input type="date" id="mf-birth-date" value="${data.birthDate ? toDateInput(data.birthDate) : ''}">
      </div>

      <div class="form-group">
        <label>バプテスマの日付</label>
        <input type="date" id="mf-baptism-date" value="${data.baptismDate ? toDateInput(data.baptismDate) : ''}">
      </div>

      <div class="section-divider"></div>
      <h3 class="section-title">緊急連絡先</h3>

      <div class="form-group">
        <label>緊急連絡先氏名</label>
        <input type="text" id="mf-emergency-name" value="${esc(data.emergencyContactName || '')}" placeholder="例: 森永智裕">
      </div>

      <div class="form-group">
        <label>緊急連絡先電話</label>
        <input type="tel" id="mf-emergency-phone" value="${esc(data.emergencyContactPhone || '')}" placeholder="例: 090-1317-0795">
      </div>

      <div style="margin-top:32px;">
        <button type="button" id="mf-submit" class="btn-primary" style="width:100%;">
          <span class="material-icons" style="font-size:18px; vertical-align:middle;">save</span> 保存する
        </button>
      </div>
    </div>
  `;

  document.getElementById('mf-submit').addEventListener('click', submitMemberInfo);
}

async function submitMemberInfo() {
  const mobilePhone = document.getElementById('mf-mobile-phone').value.trim();
  if (!mobilePhone) {
    alert('携帯電話は必須です');
    return;
  }

  const btn = document.getElementById('mf-submit');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="material-icons" style="font-size:18px; vertical-align:middle;">hourglass_empty</span> 保存中...';
  btn.disabled = true;

  try {
    const birthDateVal = document.getElementById('mf-birth-date').value;
    const baptismDateVal = document.getElementById('mf-baptism-date').value;

    const data = {
      memberName: memberUserName,
      memberGroupName: memberUserGroup,
      homePhone: document.getElementById('mf-home-phone').value.trim(),
      mobilePhone: mobilePhone,
      email: document.getElementById('mf-email').value.trim(),
      address: document.getElementById('mf-address').value.trim(),
      birthDate: birthDateVal ? firebase.firestore.Timestamp.fromDate(new Date(birthDateVal)) : null,
      baptismDate: baptismDateVal ? firebase.firestore.Timestamp.fromDate(new Date(baptismDateVal)) : null,
      emergencyContactName: document.getElementById('mf-emergency-name').value.trim(),
      emergencyContactPhone: document.getElementById('mf-emergency-phone').value.trim(),
      registeredBy: memberUserName,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('MEMBER_INFO').doc(memberUserName).set(data, { merge: true });

    alert('保存しました！');
    currentMemberData = data;
    renderMemberInfoForm();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ── S-13 区域割当ての記録 ────────────────────────
const S13_ROWS = 24;
const S13_COLS = 5;

async function loadAdminS13Table() {
  const grid = document.getElementById('s13-grid');
  grid.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const svSnap = await db.collection('USER_LIST').where('status4', '==', 'SV').get();
    const supervisorByGroup = {};
    svSnap.docs.forEach(doc => {
      const d = doc.data();
      const group = (d.group || '').trim();
      const name = (d.name || '').trim();
      if (group && name) supervisorByGroup[group] = name;
    });

    const snap = await db.collection('GROUP_ASS_NO').get();
    const groupedByTerritory = {};

    snap.docs.forEach(doc => {
      const data = doc.data();
      if ((data.type || 'NORMAL').toString().trim() !== 'NORMAL') return;
      const territory = (data.territories || '').toString();
      if (!territory) return;
      if (!groupedByTerritory[territory]) groupedByTerritory[territory] = [];
      groupedByTerritory[territory].push({
        name: supervisorByGroup[data.groupName] || data.groupName || '',
        start: data.startDate || '',
        end: data.endDate || ''
      });
    });

    Object.keys(groupedByTerritory).forEach(t => {
      groupedByTerritory[t].sort((a, b) => b.start.localeCompare(a.start));
    });

    const sortedTerritories = Object.keys(groupedByTerritory).sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    if (sortedTerritories.length === 0) {
      grid.innerHTML = '<div class="empty-state">データがありません</div>';
      return;
    }

    grid.innerHTML = '';
    for (let g = 0; g < sortedTerritories.length; g += S13_COLS) {
      const chunk = sortedTerritories.slice(g, g + S13_COLS);

      const band = document.createElement('div');
      band.className = 's13-band';

      // ヘッダー行（区域番号）
      const headerRow = document.createElement('div');
      headerRow.className = 's13-header-row';
      for (let c = 0; c < S13_COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 's13-header-cell';
        if (chunk[c]) {
          cell.innerHTML = `<span class="s13-label">区域番号</span><span class="s13-num">${esc(chunk[c])}</span>`;
        }
        headerRow.appendChild(cell);
      }
      band.appendChild(headerRow);

      // テーブルヘッダー（奉仕者の名前 / 日付ラベル）
      const thRow = document.createElement('div');
      thRow.className = 's13-th-row';
      for (let c = 0; c < S13_COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 's13-th-cell';
        if (chunk[c]) {
          cell.innerHTML = `
            <div class="s13-th-name">奉仕者の名前</div>
            <div class="s13-th-dates">
              <span>区域が出された日付</span><span>区域が戻された日付</span>
            </div>`;
        }
        thRow.appendChild(cell);
      }
      band.appendChild(thRow);

      // データ行（24行）
      for (let r = 0; r < S13_ROWS; r++) {
        const dataRow = document.createElement('div');
        dataRow.className = 's13-data-row';
        for (let c = 0; c < S13_COLS; c++) {
          const cell = document.createElement('div');
          cell.className = 's13-data-cell';
          const history = chunk[c] ? (groupedByTerritory[chunk[c]] || []) : [];
          const h = history[r] || { name: '', start: '', end: '' };
          cell.innerHTML = `
            <div class="s13-name">${esc(h.name)}</div>
            <div class="s13-dates">
              <span>${esc(h.start)}</span><span>${esc(h.end)}</span>
            </div>`;
          dataRow.appendChild(cell);
        }
        band.appendChild(dataRow);
      }

      grid.appendChild(band);
    }

  } catch (e) {
    console.error('S-13 load error:', e);
    grid.innerHTML = `<div class="empty-state">エラーが発生しました: ${e.message}</div>`;
  }
}
