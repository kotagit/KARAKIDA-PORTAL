
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
let senkyoCardsBackTarget = 'senkyo-all';
let senkyoCardsContext = {}; // { territory, groupName, fromPage }
let senkyoCardViewBack = 'senkyo-cards';
let senkyoCardViewName = ''; // e.g. '1-1'

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
  senkyo: '宣教', shukai: '集会', shinsei: 'フォーム',
  soshiki: '組織', gyoji: '行事', saigai: '災害対応',
  jouhou: '情報', 'jouhou-contact': '会衆登録情報', 'jouhou-renraku': '連絡先情報', 'jouhou-card': '伝道者カード',
  admin: '管理画面', 'admin-announcements': '発表管理',
  'member-info': '成員情報登録',
  'area-info': '区域情報登録',
  'service-report': '奉仕報告提出',
  'admin-reports': '奉仕報告管理',
  'admin-report-card': '伝道者記録',
  'admin-report-check': '奉仕報告',
  'admin-report-approve': '報告承認',
  'pw-apply': '公共エリア伝道申込み',
  'admin-assignment': '割当管理', 'admin-assignment-week': '割当編集',
  'admin-assignment-history': '割当履歴',
  'admin-schedule-editor': 'スケジュール編集',
  'admin-members': 'メンバー管理',
  'admin-s13': '区域割当ての記録',
  'admin-org': '組織表管理',
  'senkyo-mycard': '割当て区域カード',
  'senkyo-cardview': '区域カード',
  'senkyo-cards': '区域カード',
  'senkyo-all': '全ての区域カード',
  'senkyo-autolock': 'オートロック区域',
  'senkyo-night': '夜間区域',
  'senkyo-public': '公共エリア伝道',
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
          memberUserName = userData.name || user.displayName || '';
          memberUserGroup = userData.group || '';

          const statusFields = ['status1','status2','status3','status4','status5','status6','status7','status8'];
          isAdmin = statusFields.some(f => (userData[f] || '').toString().toUpperCase().trim() === 'WEB');

          const adminMenu = document.getElementById('menu-admin');
          if (adminMenu) adminMenu.classList.toggle('hidden', !isAdmin);
        } else {
          console.warn('User not found in USER_LIST');
          memberUserName = user.displayName || '';
          memberUserGroup = '';
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
function navigate(page, pushHistory) {
  if (!page) { page = 'home'; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById('page-' + page);
  if (targetPage) {
    targetPage.classList.add('active');
  } else {
    // 存在しないページ → ホームに戻す
    document.getElementById('page-home')?.classList.add('active');
    page = 'home';
  }

  // ブラウザ履歴に追加（戻る/進むボタン対応）
  if (pushHistory !== false) {
    history.pushState({ page }, '', '#' + page);
  }
  
  currentPage = page;
  if (page === 'senkyo-cardview' && senkyoCardViewName) {
    headerTitle.textContent = '区域No.' + senkyoCardViewName;
  } else if (page === 'senkyo-cards' && senkyoCardsContext.territory) {
    headerTitle.textContent = '区域No.' + senkyoCardsContext.territory;
  } else {
    headerTitle.textContent = PAGE_TITLES[page] || page;
  }

  if (page === 'home') {
    backBtn.classList.add('hidden');
    // 毎月1〜7日に奉仕報告バナー表示
    const banner = document.getElementById('home-report-banner');
    if (banner) {
      const today = new Date().getDate();
      banner.classList.toggle('hidden', today < 1 || today > 10);
    }
  } else {
    backBtn.classList.remove('hidden');
  }

  // サブページの戻り先を設定
  if (page === 'senkyo-cardview') {
    backBtn._backTarget = senkyoCardViewBack || 'senkyo-cards';
  } else if (page === 'senkyo-cards') {
    backBtn._backTarget = senkyoCardsBackTarget || 'senkyo-all';
  } else if (page.startsWith('senkyo-')) {
    backBtn._backTarget = 'senkyo';
  } else if (page.startsWith('jouhou-')) {
    backBtn._backTarget = 'jouhou';
  } else if (page === 'member-info' || page === 'area-info' || page === 'service-report' || page === 'pw-apply') {
    backBtn._backTarget = 'shinsei';
  } else if (page.startsWith('admin-')) {
    const subPages = ['admin-assignment-history','admin-schedule-editor','admin-assignment-week'];
    if (subPages.includes(page)) {
      backBtn._backTarget = 'admin-assignment';
    } else if (page === 'admin-report-card') {
      backBtn._backTarget = 'admin-reports';
    } else {
      backBtn._backTarget = 'admin';
    }
  } else if (page === 'admin') {
    backBtn._backTarget = 'home';
  } else {
    backBtn._backTarget = 'home';
  }

  if (page === 'hatsuhy')  loadAnnouncements();
  if (page === 'keikaku')  loadLinks('keikaku');
  if (page === 'senkyo-mycard')    loadSenkyoMyCards();
  if (page === 'senkyo-cards')     loadSenkyoCards();
  if (page === 'senkyo-cardview')  loadSenkyoCardView();
  if (page === 'senkyo-all')       loadSenkyoTerritories('NORMAL', 'senkyo-all-view');
  if (page === 'senkyo-autolock')  loadSenkyoTerritories('AUTOLOCK', 'senkyo-autolock-view');
  if (page === 'senkyo-night')     loadSenkyoTerritories('NIGHT', 'senkyo-night-view');
  if (page === 'senkyo-public')    loadSenkyoPublic();
  if (page === 'shukai')   { loadLinks('shukai'); loadAssignmentWeekDisplay(); }
  if (page === 'shinsei')  loadLinks('shinsei');
  if (page === 'soshiki')  loadOrgView();
  if (page === 'gyoji')    loadLinks('gyoji');
  if (page === 'saigai')   loadLinks('saigai');
  if (page === 'jouhou-contact')        loadJouhouContact();
  if (page === 'jouhou-renraku')       loadJouhouRenraku();
  if (page === 'jouhou-card')           loadJouhouCard();
  if (page === 'admin-announcements') loadAdminAnnouncements();
  if (page === 'member-info')           loadMemberInfoForm();
  if (page === 'area-info')             initAreaInfoForm();
  if (page === 'service-report')        initServiceReportForm();
  if (page === 'pw-apply')              loadPwApply();
  if (page === 'admin-assignment')         initAssignmentPage();
  if (page === 'admin-assignment-history') initHistoryPage();
  if (page === 'admin-members')            initMembersPage();
  if (page === 'admin-s13')                loadAdminS13Table();
  if (page === 'admin-reports')            loadAdminReports();
  if (page === 'admin-report-card')        loadAdminReportCard();
  if (page === 'admin-report-check')       loadAdminReportCheck();
  if (page === 'admin-report-approve')     loadAdminReportApprove();
  if (page === 'admin-org')                loadOrgEditor();

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

document.getElementById('admin-manage-org')?.addEventListener('click', () => {
  navigate('admin-org');
});

document.getElementById('admin-manage-reports')?.addEventListener('click', () => {
  navigate('admin-reports');
});

document.getElementById('admin-manage-report-check')?.addEventListener('click', () => {
  navigate('admin-report-check');
});

document.getElementById('admin-manage-report-approve')?.addEventListener('click', () => {
  navigate('admin-report-approve');
});

// メニューグリッドのクリック（data-page属性があるもののみ）
document.querySelectorAll('.menu-item[data-page]').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.page));
});

backBtn.addEventListener('click', () => navigate(backBtn._backTarget || 'home'));
headerHomeBtn.addEventListener('click', () => navigate('home'));

// ブラウザの戻る/進むボタン対応
window.addEventListener('popstate', (e) => {
  const page = (e.state && e.state.page) || 'home';
  navigate(page, false);
});
// 初期状態をhistoryに設定
history.replaceState({ page: 'home' }, '', '#home');

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

document.getElementById('add-announce-btn')?.addEventListener('click', () => openAnnounceModal(null));
document.getElementById('announce-modal-close')?.addEventListener('click', closeAnnounceModal);
document.getElementById('announce-overlay')?.addEventListener('click', closeAnnounceModal);
document.getElementById('af-cancel')?.addEventListener('click', closeAnnounceModal);

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

      const formItems = [
        { icon: 'location_city', label: '公共エリア伝道申込み', page: 'pw-apply' },
        { icon: 'summarize', label: '奉仕報告', page: 'service-report' },
        { icon: 'location_on', label: '区域情報登録', page: 'area-info' },
        { icon: 'contact_phone', label: '成員情報登録', page: 'member-info' },
      ];
      formItems.forEach(fi => {
        const el = document.createElement('div');
        el.className = 'link-item';
        el.style.cursor = 'pointer';
        el.innerHTML = `<div class="link-item-icon"><span class="material-icons">${fi.icon}</span></div><span class="link-item-label">${fi.label}</span>`;
        el.addEventListener('click', () => navigate(fi.page));
        listEl.appendChild(el);
      });
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
    console.error('loadLinks error:', section, e);
    if (section === 'shinsei') {
      listEl.innerHTML = '';
      const formItems2 = [
        { icon: 'location_city', label: '公共エリア伝道申込み', page: 'pw-apply' },
        { icon: 'summarize', label: '奉仕報告', page: 'service-report' },
        { icon: 'location_on', label: '区域情報登録', page: 'area-info' },
        { icon: 'contact_phone', label: '成員情報登録', page: 'member-info' },
      ];
      formItems2.forEach(fi => {
        const el = document.createElement('div');
        el.className = 'link-item';
        el.style.cursor = 'pointer';
        el.innerHTML = `<div class="link-item-icon"><span class="material-icons">${fi.icon}</span></div><span class="link-item-label">${fi.label}</span>`;
        el.addEventListener('click', () => navigate(fi.page));
        listEl.appendChild(el);
      });
    } else {
      listEl.innerHTML = '<div class="empty-state"><span class="material-icons">link</span>準備中</div>';
    }
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
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), 1);
    var end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
    var filtered = snap.docs.filter(function(doc) {
      var d = doc.data();
      var date = d.date && d.date.toDate ? d.date.toDate() : new Date(d.date);
      return date >= start && date <= end;
    });
    renderSchedule(filtered);
  } catch (e) {
    console.error('loadSchedule error:', e);
    // インデックス未作成の場合はフィルタなしで全件取得
    try {
      const snap2 = await db.collection('SCHEDULE')
        .where('type', '==', scheduleType).get();
      var now2 = new Date();
      var start2 = new Date(now2.getFullYear(), now2.getMonth(), 1);
      var end2 = new Date(now2.getFullYear(), now2.getMonth() + 2, 0, 23, 59, 59);
      var filtered2 = snap2.docs.filter(function(doc) {
        var d = doc.data();
        var date = d.date && d.date.toDate ? d.date.toDate() : new Date(d.date);
        return date >= start2 && date <= end2;
      }).sort(function(a, b) {
        var da = a.data().date, db2 = b.data().date;
        da = da && da.toDate ? da.toDate() : new Date(da);
        db2 = db2 && db2.toDate ? db2.toDate() : new Date(db2);
        return da - db2;
      });
      renderSchedule(filtered2);
    } catch (e2) {
      list.innerHTML = '<div class="loading">読み込みエラー: ' + e2.message + '</div>';
    }
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

document.getElementById('add-schedule-btn')?.addEventListener('click', () => openScheduleModal(null));
document.getElementById('schedule-modal-close')?.addEventListener('click', closeScheduleModal);
document.getElementById('schedule-overlay')?.addEventListener('click', closeScheduleModal);
document.getElementById('sf-cancel')?.addEventListener('click', closeScheduleModal);

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

document.getElementById('delete-cancel')?.addEventListener('click', closeDeleteModal);
document.getElementById('delete-overlay')?.addEventListener('click', closeDeleteModal);
document.getElementById('delete-confirm')?.addEventListener('click', async () => {
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

// ── 区域情報登録 ────────────────────────────────
function initAreaInfoForm() {
  const form = document.getElementById('area-info-form');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const address = document.getElementById('ai-address').value.trim();
    if (!address) { alert('住所を入力してください'); return; }
    const building = document.getElementById('ai-building').value.trim();
    const reject = document.getElementById('ai-reject').value.trim();
    const memo = document.getElementById('ai-memo').value.trim();

    const msg = `【送信内容の確認】\n住所: ${address}` +
      (building ? `\n建物名: ${building}` : '') +
      (reject ? `\n拒否理由: ${reject}` : '') +
      (memo ? `\nメモ: ${memo}` : '') +
      `\n\n送信しますか？`;
    if (!confirm(msg)) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons" style="font-size:18px">hourglass_empty</span> 送信中...';

    try {
      await db.collection('AREA_INFO_REQUESTS').add({
        name: memberUserName || '不明',
        address, buildingName: building, rejectReason: reject, memo,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
      });
      await db.collection('ADMIN_NOTIFICATIONS').add({
        type: 'area_info',
        message: (memberUserName || '不明') + 'さんが新規物件情報を登録しました',
        fromUser: memberUserName || '不明',
        extra: { address, buildingName: building },
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
      alert('登録しました');
      form.reset();
      navigate('shinsei');
    } catch (err) {
      alert('登録エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="font-size:18px">send</span> 送信する';
    }
  };
}

// ── 情報：連絡先情報（グループ監督・補佐） ──────────
async function loadJouhouRenraku() {
  const view = document.getElementById('jouhou-renraku-view');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    // ORG_CHARTから長老団（グループ監督・補佐）を取得
    const [orgSnap, userSnap] = await Promise.all([
      db.collection('ORG_CHART').where('section', '==', '長老団').orderBy('order', 'asc').get(),
      db.collection('USER_LIST').get(),
    ]);

    // USER_LISTを名前でマップ
    const userMap = {};
    userSnap.docs.forEach(d => {
      const data = d.data();
      const name = String(data.name || '').trim();
      if (name) userMap[name] = data;
    });

    const groups = [];
    orgSnap.docs.forEach(d => {
      const data = d.data();
      const dept = String(data.department || '').trim();
      const sv = String(data.supervisor || '').trim();
      const asst = String(data.assistant || '').trim();
      if (dept && (sv || asst)) groups.push({ dept, sv, asst });
    });

    if (groups.length === 0) {
      view.innerHTML = '<div class="empty-state">連絡先情報がありません</div>';
      return;
    }

    let html = '';
    groups.forEach(g => {
      html += '<div class="renraku-group">';
      html += '<div class="renraku-group-title">' + esc(g.dept) + '</div>';

      if (g.sv) {
        const u = userMap[g.sv] || {};
        html += '<div class="renraku-card">';
        html += '<div class="renraku-role">グループ監督</div>';
        html += '<div class="renraku-name">' + esc(g.sv) + '</div>';
        if (u.address) html += '<div class="renraku-detail"><span class="material-icons">home</span>' + esc(u.address) + '</div>';
        if (u.phone) html += '<div class="renraku-detail"><span class="material-icons">phone</span><a href="tel:' + esc(u.phone) + '">' + esc(u.phone) + '</a></div>';
        html += '</div>';
      }

      if (g.asst) {
        const u = userMap[g.asst] || {};
        html += '<div class="renraku-card">';
        html += '<div class="renraku-role">補佐</div>';
        html += '<div class="renraku-name">' + esc(g.asst) + '</div>';
        if (u.address) html += '<div class="renraku-detail"><span class="material-icons">home</span>' + esc(u.address) + '</div>';
        if (u.phone) html += '<div class="renraku-detail"><span class="material-icons">phone</span><a href="tel:' + esc(u.phone) + '">' + esc(u.phone) + '</a></div>';
        html += '</div>';
      }

      html += '</div>';
    });

    view.innerHTML = html;
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

// ── 情報：会衆登録情報 ────────────────────────────────
async function loadJouhouContact() {
  const view = document.getElementById('jouhou-contact-view');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const email = currentUser?.email?.trim() || '';
    let snap = await db.collection('USER_LIST').where('mail', '==', email.toLowerCase()).limit(1).get();
    if (snap.empty) snap = await db.collection('USER_LIST').where('mail', '==', email).limit(1).get();

    if (snap.empty) {
      view.innerHTML = '<div class="empty-state">ユーザー情報が見つかりません</div>';
      return;
    }

    const d = snap.docs[0].data();
    console.log('USER_LIST raw data:', JSON.stringify(d, (k, v) => {
      if (v && typeof v === 'object' && v.seconds !== undefined) return '__Timestamp__' + new Date(v.seconds * 1000).toLocaleDateString('ja-JP');
      return v;
    }));
    const fields = [
      { label: '氏名', value: d.name },
      { label: 'ふりがな', value: d.furigana },
      { label: 'グループ', value: d.group },
      { label: '性別', value: displayGender(d.gender) },
      { label: '生年月日', value: tsToStr(d.birthDay) },
      { label: 'バプテスマ日', value: tsToStr(d.bapDate) },
      { label: '携帯電話', value: d.phone },
      { label: 'メール', value: d.mail },
      { label: '住所', value: d.address },
    ];

    let html = '<div class="form-container">';
    html += '<p class="form-description">あなたの会衆登録情報</p>';
    fields.forEach(f => {
      html += '<div class="sr-field">';
      html += '<label class="sr-label">' + esc(f.label) + '</label>';
      html += '<div class="sr-input-wrap"><input type="text" value="' + esc(f.value || '') + '" readonly style="background:#f5f5f5"></div>';
      html += '</div>';
    });
    html += '</div>';
    view.innerHTML = html;
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

// ── 情報：伝道者カード ────────────────────────────────
async function loadJouhouCard() {
  const view = document.getElementById('jouhou-card-view');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const email = currentUser?.email?.trim() || '';
    let snap = await db.collection('USER_LIST').where('mail', '==', email.toLowerCase()).limit(1).get();
    if (snap.empty) snap = await db.collection('USER_LIST').where('mail', '==', email).limit(1).get();

    if (snap.empty) {
      view.innerHTML = '<div class="empty-state">ユーザー情報が見つかりません</div>';
      return;
    }

    const d = snap.docs[0].data();
    const memberName = String(d.name || '').trim();
    const member = {
      id: snap.docs[0].id,
      name: memberName,
      group: String(d.group || '').trim(),
      gender: String(d.gender || '').trim(),
      birthDate: tsToStr(d.birthDay),
      baptismDate: tsToStr(d.bapDate),
      role: String(d.role || d.position || '').trim(),
      pioneer: String(d.pioneer || '').trim(),
    };

    const year = getServiceYear();

    const reportSnap = await db.collection('PREACHING_REPORT')
      .where('name', '==', member.name)
      .get();

    const reportMap = {};
    reportSnap.docs.forEach(doc => {
      const data = doc.data();
      const mo = data.month;
      const yr = data.year || null;
      const ts = data.timestamp ? (data.timestamp.seconds || 0) : 0;
      let belongsYear;
      if (mo >= 9) belongsYear = yr || year;
      else belongsYear = (yr ? yr - 1 : null) || year;
      if (belongsYear !== year) return;
      if (!reportMap[mo] || ts > reportMap[mo]._ts) {
        reportMap[mo] = {
          participation: data.participation || '',
          bibleStudy: data.bibleStudy,
          hours: data.hours,
          role: data.role || '',
          remarks: data.remarks || '',
          auxiliary: data.auxiliary || '',
          _ts: ts,
        };
      }
    });

    renderReportCard(member, reportMap, year, 'jouhou-card-view');
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

// ── 奉仕報告提出 ────────────────────────────────
let srMemberList = []; // 他の人用のメンバーリスト

function selectSrTarget(mode) {
  document.getElementById('sr-target').value = mode;
  document.getElementById('sr-target-overlay').classList.add('hidden');
  const isOther = mode === 'other';
  document.getElementById('sr-name-row').classList.toggle('hidden', isOther);
  document.getElementById('sr-other-name-row').classList.toggle('hidden', !isOther);
  document.getElementById('sr-other-furigana-row').classList.toggle('hidden', !isOther);
  document.getElementById('sr-group-row').classList.toggle('hidden', isOther);
  document.getElementById('sr-other-group-row').classList.toggle('hidden', !isOther);
  if (isOther) {
    loadSrGroupList();
  } else {
    document.getElementById('sr-group').value = memberUserGroup || '';
  }
}

async function initServiceReportForm() {
  document.getElementById('sr-name').value = memberUserName || '';
  document.getElementById('sr-group').value = memberUserGroup || '';

  // ポップアップ表示
  document.getElementById('sr-target-overlay').classList.remove('hidden');
  document.getElementById('sr-target').value = 'self';
  // デフォルト：自分モードのフィールド表示
  document.getElementById('sr-name-row').classList.remove('hidden');
  document.getElementById('sr-other-name-row').classList.add('hidden');
  document.getElementById('sr-other-furigana-row').classList.add('hidden');
  document.getElementById('sr-group-row').classList.remove('hidden');
  document.getElementById('sr-other-group-row').classList.add('hidden');

  // 月プルダウン（デフォルト：先月）
  const monthSel = document.getElementById('sr-month');
  if (monthSel && monthSel.options.length <= 1) {
    monthSel.innerHTML = '';
    const now = new Date();
    const defMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m + '月';
      if (m === defMonth) opt.selected = true;
      monthSel.appendChild(opt);
    }
  }

  // 立場切替で伝道参加/時間の表示切替
  const roleSel = document.getElementById('sr-role');
  const partRow = document.getElementById('sr-participation-row');
  const hoursRow = document.getElementById('sr-hours-row');
  function toggleRoleFields() {
    const isEv = roleSel.value === '伝道者';
    partRow.classList.toggle('hidden', !isEv);
    hoursRow.classList.toggle('hidden', isEv);
  }
  roleSel.onchange = toggleRoleFields;
  toggleRoleFields();

  // 送信
  const btn = document.getElementById('sr-submit');
  btn.onclick = async () => {
    const isOther = document.getElementById('sr-target').value === 'other';
    let submitName, submitGroup;
    if (isOther) {
      submitName = document.getElementById('sr-other-name').value.trim();
      submitGroup = document.getElementById('sr-other-group').value;
      if (!submitName) { alert('氏名を入力してください'); return; }
      if (!submitGroup) { alert('グループを選択してください'); return; }
    } else {
      submitName = memberUserName || '不明';
      submitGroup = memberUserGroup || '';
    }

    const gender = document.getElementById('sr-gender').value;
    const month = parseInt(document.getElementById('sr-month').value);
    const role = roleSel.value;
    const participation = document.getElementById('sr-participation').value;
    const hours = document.getElementById('sr-hours').value.trim();
    const bible = document.getElementById('sr-bible').value.trim();
    const remarks = document.getElementById('sr-remarks').value.trim();

    if (!gender) { alert('性別を選択してください'); return; }
    if (role === '伝道者' && !participation) { alert('伝道に参加したか選択してください'); return; }
    if (role !== '伝道者' && !hours) { alert('時間を入力してください'); return; }

    const isEv = role === '伝道者';
    let msg = '【送信内容の確認】\n';
    if (isOther) msg += '※ 代理提出\n';
    msg += '氏名: ' + submitName + '\n';
    msg += 'グループ: ' + submitGroup + '\n';
    msg += '性別: ' + gender + '\n';
    msg += '月: ' + month + '月\n';
    msg += '立場: ' + role + '\n';
    if (isEv) msg += '伝道に参加: ' + participation + '\n';
    else msg += '時間: ' + hours + '時間\n';
    msg += '聖書研究: ' + (bible || '0') + '\n';
    if (remarks) msg += '備考: ' + remarks + '\n';
    msg += '\n送信しますか？';
    if (!confirm(msg)) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons" style="font-size:18px">hourglass_empty</span> 送信中...';

    try {
      const reportData = {
        name: submitName,
        furigana: isOther ? (document.getElementById('sr-other-furigana').value.trim()) : '',
        groupName: submitGroup,
        gender,
        month,
        role,
        participation: isEv ? participation : null,
        hours: isEv ? null : parseInt(hours) || 0,
        bibleStudy: parseInt(bible) || 0,
        remarks,
        year: new Date().getFullYear(),
        timestamp: firebase.firestore.Timestamp.now(),
      };
      if (isOther) reportData.submittedBy = memberUserName || '';
      await db.collection('REPORT_DRAFTS').add(reportData);
      alert('送信しました（管理者の承認後に反映されます）');
      document.getElementById('sr-gender').value = '';
      document.getElementById('sr-participation').value = '';
      document.getElementById('sr-hours').value = '';
      document.getElementById('sr-bible').value = '';
      document.getElementById('sr-remarks').value = '';
      if (isOther) {
        document.getElementById('sr-other-name').value = '';
        document.getElementById('sr-other-furigana').value = '';
        document.getElementById('sr-other-group').value = '';
      }
      document.getElementById('sr-target').value = 'self';
      navigate('shinsei');
    } catch (err) {
      alert('送信エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="font-size:18px">send</span> 送信する';
    }
  };
}

let srGroupsLoaded = false;
async function loadSrGroupList() {
  if (srGroupsLoaded) return;
  const sel = document.getElementById('sr-other-group');
  sel.innerHTML = '<option value="">読み込み中...</option>';
  try {
    const snap = await db.collection('USER_LIST').get();
    const groupSet = new Set();
    snap.docs.forEach(d => {
      const g = String(d.data().group || '').trim();
      if (g) groupSet.add(g);
    });
    const groups = [...groupSet].sort();
    sel.innerHTML = '<option value="">選択してください</option>';
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      sel.appendChild(opt);
    });
    srGroupsLoaded = true;
  } catch (e) {
    sel.innerHTML = '<option value="">読み込みエラー</option>';
  }
}

// ── 公共エリア伝道申込み ────────────────────────
const PW_ROLES = ['参加者', '司会者（カート有）', 'カート運搬車', '司会者（カート無）'];
let pwApplySelected = {};  // key → role

async function loadPwApply() {
  const container = document.getElementById('pw-apply-view');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  pwApplySelected = {};

  try {
    const snap = await db.collection('PUBLIC_WITNESSING_OPTIONS').get();
    const items = [];
    snap.docs.forEach(d => {
      const data = d.data();
      const day = String(data.day || '');
      const place = String(data.place || '');
      if (!day && !place) return;
      items.push({
        key: d.id || (day + '_' + data.starttime + '_' + place),
        date: day,
        weekday: String(data.dayofweek || ''),
        startTime: String(data.starttime || ''),
        endTime: String(data.endtime || ''),
        place: place,
        order: typeof data.order === 'number' ? data.order : 9999,
      });
    });
    // APPと同じクライアント側ソート
    items.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      const da = a.date.replace(/[^\d]/g, '').padStart(4, '0');
      const db2 = b.date.replace(/[^\d]/g, '').padStart(4, '0');
      if (da !== db2) return da.localeCompare(db2);
      return a.startTime.localeCompare(b.startTime);
    });

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">event_busy</span>現在申込み可能な日程がありません</div>';
      return;
    }

    container.innerHTML = '';

    // ヘッダー
    const hdr = document.createElement('div');
    hdr.className = 'pwa-header';
    hdr.innerHTML = '<span style="width:36px"></span><span>日付</span><span>曜日</span><span>時間</span><span>場所</span>';
    container.appendChild(hdr);

    // 各項目
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'pwa-card';
      card.dataset.key = item.key;

      const placeClass = item.place.includes('唐木田') ? 'pwa-place-green' : item.place.includes('堀之内') ? 'pwa-place-blue' : '';
      const placeDisplay = item.place.replace(/駅/g, '');
      const wdClass = (item.weekday === '土' || item.weekday === '日') ? ' style="color:#c41c3b"' : '';

      card.innerHTML = `
        <div class="pwa-row-main">
          <span class="pwa-check"><span class="material-icons">check_circle_outline</span></span>
          <span class="pwa-col">${esc(item.date)}</span>
          <span class="pwa-col"${wdClass}>${esc(item.weekday)}</span>
          <span class="pwa-col">${esc(item.startTime)}</span>
          <span class="pwa-col ${placeClass}">${esc(placeDisplay)}</span>
        </div>
        <div class="pwa-roles hidden"></div>
      `;

      const mainRow = card.querySelector('.pwa-row-main');
      const rolesDiv = card.querySelector('.pwa-roles');

      // 役割ラジオボタン
      PW_ROLES.forEach(role => {
        const label = document.createElement('label');
        label.className = 'pwa-role-label';
        label.innerHTML = `<span class="material-icons pwa-radio">radio_button_unchecked</span><span>${esc(role)}</span>`;
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          pwApplySelected[item.key] = role;
          rolesDiv.querySelectorAll('.pwa-radio').forEach(ic => {
            ic.textContent = 'radio_button_unchecked';
            ic.style.color = '#999';
          });
          label.querySelector('.pwa-radio').textContent = 'radio_button_checked';
          label.querySelector('.pwa-radio').style.color = 'var(--primary)';
        });
        rolesDiv.appendChild(label);
      });

      mainRow.addEventListener('click', () => {
        const isSelected = card.classList.contains('pwa-selected');
        if (isSelected) {
          card.classList.remove('pwa-selected');
          rolesDiv.classList.add('hidden');
          card.querySelector('.pwa-check .material-icons').textContent = 'check_circle_outline';
          card.querySelector('.pwa-check .material-icons').style.color = '#999';
          delete pwApplySelected[item.key];
          rolesDiv.querySelectorAll('.pwa-radio').forEach(ic => {
            ic.textContent = 'radio_button_unchecked';
            ic.style.color = '#999';
          });
        } else {
          card.classList.add('pwa-selected');
          rolesDiv.classList.remove('hidden');
          card.querySelector('.pwa-check .material-icons').textContent = 'check_circle';
          card.querySelector('.pwa-check .material-icons').style.color = 'var(--primary)';
        }
      });

      container.appendChild(card);
    });

    // 送信ボタン
    const submitWrap = document.createElement('div');
    submitWrap.style.cssText = 'padding:16px 0';
    submitWrap.innerHTML = `<button id="pwa-submit-btn" class="btn-primary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;height:48px">
      <span class="material-icons" style="font-size:18px">send</span> 送信する
    </button>`;
    container.appendChild(submitWrap);

    document.getElementById('pwa-submit-btn').addEventListener('click', () => pwApplySubmit(items));

  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

async function pwApplySubmit(items) {
  const keys = Object.keys(pwApplySelected);
  if (keys.length === 0) { alert('申込む項目を選択してください'); return; }

  // 全選択カードに役割があるかチェック
  const allCards = document.querySelectorAll('.pwa-card.pwa-selected');
  for (const card of allCards) {
    const key = card.dataset.key;
    if (!pwApplySelected[key]) {
      alert('すべての項目で役割を選択してください');
      return;
    }
  }

  // 確認メッセージ作成
  let msg = '【送信内容の確認】' + keys.length + '件\n\n';
  keys.forEach(key => {
    const item = items.find(i => i.key === key);
    if (!item) return;
    msg += item.date + ' (' + item.weekday + ') ' + item.startTime + '〜' + item.endTime + '\n';
    msg += item.place.replace(/駅/g, '') + ' / ' + pwApplySelected[key] + '\n\n';
  });
  msg += '送信しますか？';
  if (!confirm(msg)) return;

  const btn = document.getElementById('pwa-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons" style="font-size:18px">hourglass_empty</span> 送信中...';

  try {
    for (const key of keys) {
      const item = items.find(i => i.key === key);
      if (!item) continue;
      await db.collection('PUBLIC_WITNESSING').add({
        name: memberUserName || '不明',
        day: item.date,
        dayofweek: item.weekday,
        starttime: item.startTime,
        endtime: item.endTime,
        place: item.place,
        role: pwApplySelected[key],
        timestamp: firebase.firestore.Timestamp.now(),
      });
    }
    alert('送信しました（' + keys.length + '件）');
    pwApplySelected = {};
    navigate('shinsei');
  } catch (err) {
    alert('送信エラー: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons" style="font-size:18px">send</span> 送信する';
  }
}

// ── 奉仕報告管理（INDEX + CARD） ────────────────────
let rptFilter = 'all'; // all, pioneer, pub
let rptMembers = [];
let rptSelectedYear = null;
let rptCardMember = null; // 選択中のメンバー（カード表示用）

// 奉仕年度を返す（9月〜翌8月）
function getServiceYear(date) {
  const d = date || new Date();
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

// 奉仕年度の月リスト [9,10,11,12,1,2,3,4,5,6,7,8]
const SERVICE_YEAR_MONTHS = [9,10,11,12,1,2,3,4,5,6,7,8];

async function loadAdminReports() {
  const view = document.getElementById('rpt-view');
  const yearSel = document.getElementById('rpt-year-select');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  // 年セレクト初期化
  if (yearSel && yearSel.options.length === 0) {
    const curYear = getServiceYear();
    for (let i = 0; i < 5; i++) {
      const y = curYear - i;
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y + '年度（' + y + '/9〜' + (y+1) + '/8）';
      if (y === curYear) opt.selected = true;
      yearSel.appendChild(opt);
    }
    rptSelectedYear = curYear;
    yearSel.addEventListener('change', () => {
      rptSelectedYear = parseInt(yearSel.value);
      renderAdminReportsIndex();
    });

    // フィルターボタン
    document.getElementById('rpt-filter-all')?.addEventListener('click', () => setRptFilter('all'));
    document.getElementById('rpt-filter-pioneer')?.addEventListener('click', () => setRptFilter('pioneer'));
    document.getElementById('rpt-filter-pub')?.addEventListener('click', () => setRptFilter('pub'));
  }

  try {
    const userSnap = await db.collection('USER_LIST').get();
    rptMembers = [];
    userSnap.docs.forEach(d => {
      const data = d.data();
      const name = String(data.name || '').trim();
      if (!name) return;
      rptMembers.push({
        id: d.id,
        name,
        group: String(data.group || '').trim(),
        role: String(data.role || data.position || '').trim(),
        gender: String(data.gender || '').trim(),
        birthDate: tsToStr(data.birthDay),
        baptismDate: tsToStr(data.bapDate),
        pioneer: String(data.pioneer || '').trim(),
      });
    });
    rptMembers.sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      return a.name.localeCompare(b.name);
    });
    renderAdminReportsIndex();
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

function setRptFilter(f) {
  rptFilter = f;
  document.querySelectorAll('.rpt-filter-btn').forEach(b => b.classList.remove('rpt-filter-active'));
  const id = f === 'all' ? 'rpt-filter-all' : f === 'pioneer' ? 'rpt-filter-pioneer' : 'rpt-filter-pub';
  document.getElementById(id)?.classList.add('rpt-filter-active');
  renderAdminReportsIndex();
}

function isPioneer(m) {
  const p = (m.pioneer || m.role || '');
  return p.includes('開拓') || p === 'RP';
}

function displayGender(g) {
  if (g === 'M') return '男性';
  if (g === 'F') return '女性';
  return g || '-';
}

function tsToStr(val) {
  if (!val) return '';
  let dt;
  if (typeof val === 'string') {
    dt = new Date(val);
    if (isNaN(dt.getTime())) return val;
  } else if (val.seconds !== undefined) {
    dt = new Date(val.seconds * 1000);
  } else if (val.toDate) {
    dt = val.toDate();
  } else {
    return String(val);
  }
  return dt.getFullYear() + '年' + (dt.getMonth()+1) + '月' + dt.getDate() + '日';
}

function displayRole(m) {
  const r = m.pioneer || m.role || '';
  if (r === 'RP') return '正規開拓者';
  if (r.includes('開拓')) return r;
  return '伝道者';
}

function renderAdminReportsIndex() {
  const view = document.getElementById('rpt-view');
  const summary = document.getElementById('rpt-summary');

  // フィルタ適用
  let filtered = rptMembers;
  if (rptFilter === 'pioneer') filtered = rptMembers.filter(m => isPioneer(m));
  if (rptFilter === 'pub') filtered = rptMembers.filter(m => !isPioneer(m));

  if (summary) summary.textContent = filtered.length + '名';

  // グループ別
  const groups = {};
  filtered.forEach(m => {
    const g = m.group || '未分類';
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  });

  if (Object.keys(groups).length === 0) {
    view.innerHTML = '<div class="empty-state"><span class="material-icons">search_off</span>該当するデータがありません</div>';
    return;
  }

  let html = '';
  Object.keys(groups).sort().forEach(groupName => {
    const list = groups[groupName];
    html += '<div class="rpt-group">';
    html += '<div class="rpt-group-title">' + esc(groupName) + '（' + list.length + '名）</div>';
    html += '<div class="rpt-member-list">';
    list.forEach(m => {
      const roleLabel = displayRole(m);
      const roleBadge = isPioneer(m) ? 'rpt-role-pioneer' : 'rpt-role-pub';
      html += '<div class="rpt-member-row" onclick="openReportCard(\'' + esc(m.id) + '\')">';
      html += '<span class="material-icons rpt-member-icon">person</span>';
      html += '<span class="rpt-member-name">' + esc(m.name) + '</span>';
      html += '<span class="rpt-role-badge ' + roleBadge + '">' + esc(roleLabel) + '</span>';
      html += '<span class="material-icons rpt-member-chevron">chevron_right</span>';
      html += '</div>';
    });
    html += '</div></div>';
  });

  view.innerHTML = html;
}

function openReportCard(memberId) {
  rptCardMember = rptMembers.find(m => m.id === memberId) || null;
  if (!rptCardMember) return;
  navigate('admin-report-card');
}

async function loadAdminReportCard() {
  const view = document.getElementById('rpt-card-view');
  const titleEl = document.getElementById('rpt-card-title');
  if (!view || !rptCardMember) {
    if (view) view.innerHTML = '<div class="empty-state">メンバーが選択されていません</div>';
    return;
  }

  const m = rptCardMember;
  if (titleEl) titleEl.textContent = m.name;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  const year = rptSelectedYear || getServiceYear();

  try {
    // 奉仕年度（9月〜翌8月）の報告を取得
    const reportSnap = await db.collection('PREACHING_REPORT')
      .where('name', '==', m.name)
      .get();

    // 月ごとに最新の報告のみ保持
    const reportMap = {};
    reportSnap.docs.forEach(d => {
      const data = d.data();
      const mo = data.month;
      const yr = data.year || null;
      const ts = data.timestamp ? (data.timestamp.seconds || 0) : 0;

      // 奉仕年度フィルタ: 9-12月はyear, 1-8月はyear+1
      let belongsYear;
      if (mo >= 9) belongsYear = yr || year;
      else belongsYear = (yr ? yr - 1 : null) || year;

      if (belongsYear !== year) return;

      if (!reportMap[mo] || ts > reportMap[mo]._ts) {
        reportMap[mo] = {
          participation: data.participation || '',
          bibleStudy: data.bibleStudy,
          hours: data.hours,
          role: data.role || '',
          remarks: data.remarks || '',
          auxiliary: data.auxiliary || '',
          _ts: ts,
        };
      }
    });

    renderReportCard(m, reportMap, year);
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

function renderReportCard(member, reportMap, year, targetViewId) {
  const view = document.getElementById(targetViewId || 'rpt-card-view');

  // ヘッダー情報
  let html = '<div class="s21-card">';
  html += '<div class="s21-header">';
  html += '<div class="s21-title">伝道者記録カード（S-21）</div>';
  html += '<table class="s21-info-table">';
  html += '<tr><td class="s21-info-label">氏名</td><td class="s21-info-value">' + esc(member.name) + '</td>';
  html += '<td class="s21-info-label">性別</td><td class="s21-info-value">' + esc(displayGender(member.gender)) + '</td></tr>';
  html += '<tr><td class="s21-info-label">生年月日</td><td class="s21-info-value">' + esc(member.birthDate || '-') + '</td>';
  html += '<td class="s21-info-label">バプテスマ日</td><td class="s21-info-value">' + esc(member.baptismDate || '-') + '</td></tr>';
  html += '<tr><td class="s21-info-label">グループ</td><td class="s21-info-value">' + esc(member.group || '-') + '</td>';
  const roleLabel = displayRole(member);
  html += '<td class="s21-info-label">立場</td><td class="s21-info-value">' + esc(roleLabel) + '</td></tr>';
  html += '</table></div>';

  // 年度ラベル
  html += '<div class="s21-year-label">' + year + '年度（' + year + '/9〜' + (year+1) + '/8）</div>';

  // 月別テーブル
  html += '<div class="s21-table-wrap"><table class="s21-table">';
  html += '<thead><tr>';
  html += '<th>月</th><th>参加</th><th>研究</th><th>補助</th><th>時間</th><th>備考</th>';
  html += '</tr></thead><tbody>';

  let totalStudy = 0, totalHours = 0, countStudy = 0, countHours = 0;
  let participationCount = 0;

  SERVICE_YEAR_MONTHS.forEach(mo => {
    const r = reportMap[mo] || null;
    const moLabel = mo + '月';
    if (r) {
      const partIcon = r.participation === 'はい' ? '✓' : (r.participation === 'いいえ' ? '✗' : '-');
      const partClass = r.participation === 'はい' ? 's21-yes' : (r.participation === 'いいえ' ? 's21-no' : '');
      const study = r.bibleStudy != null ? r.bibleStudy : '-';
      const hours = r.hours != null ? r.hours : '-';
      const aux = r.auxiliary || r.role || '';
      const isAux = aux.includes('補助');

      if (r.participation === 'はい') participationCount++;
      if (r.bibleStudy != null) { totalStudy += Number(r.bibleStudy); countStudy++; }
      if (r.hours != null) { totalHours += Number(r.hours); countHours++; }

      html += '<tr>';
      html += '<td class="s21-month">' + moLabel + '</td>';
      html += '<td class="s21-cell ' + partClass + '">' + partIcon + '</td>';
      html += '<td class="s21-cell">' + study + '</td>';
      html += '<td class="s21-cell">' + (isAux ? '✓' : '') + '</td>';
      html += '<td class="s21-cell">' + hours + '</td>';
      html += '<td class="s21-cell s21-remarks">' + esc(r.remarks) + '</td>';
      html += '</tr>';
    } else {
      html += '<tr class="s21-empty-row">';
      html += '<td class="s21-month">' + moLabel + '</td>';
      html += '<td class="s21-cell">-</td><td class="s21-cell">-</td>';
      html += '<td class="s21-cell"></td><td class="s21-cell">-</td>';
      html += '<td class="s21-cell"></td>';
      html += '</tr>';
    }
  });

  // 合計・平均行
  html += '<tr class="s21-total-row">';
  html += '<td class="s21-month">合計</td>';
  html += '<td class="s21-cell">' + participationCount + '</td>';
  html += '<td class="s21-cell">' + totalStudy + '</td>';
  html += '<td class="s21-cell"></td>';
  html += '<td class="s21-cell">' + totalHours + '</td>';
  html += '<td class="s21-cell"></td>';
  html += '</tr>';
  html += '<tr class="s21-avg-row">';
  html += '<td class="s21-month">平均</td>';
  html += '<td class="s21-cell"></td>';
  html += '<td class="s21-cell">' + (countStudy ? (totalStudy / countStudy).toFixed(1) : '-') + '</td>';
  html += '<td class="s21-cell"></td>';
  html += '<td class="s21-cell">' + (countHours ? (totalHours / countHours).toFixed(1) : '-') + '</td>';
  html += '<td class="s21-cell"></td>';
  html += '</tr>';

  html += '</tbody></table></div>';
  html += '</div>';

  view.innerHTML = html;
}

async function exportS21Pdf() {
  const card = document.querySelector('.s21-card');
  if (!card) return;
  const btn = document.getElementById('s21-pdf-btn');
  if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }

  try {
    const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pageW - margin * 2;
    const imgW = maxW;
    const imgH = (canvas.height / canvas.width) * imgW;

    if (imgH <= pageH - margin * 2) {
      pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
    } else {
      // 長い場合はページに収まるようスケール
      const scale = (pageH - margin * 2) / imgH;
      pdf.addImage(imgData, 'PNG', margin, margin, imgW * scale, imgH * scale);
    }

    const name = rptCardMember ? rptCardMember.name : 'S-21';
    pdf.save('S-21_' + name + '.pdf');
  } catch (e) {
    console.error('PDF export error:', e);
    alert('PDF生成に失敗しました');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="font-size:18px">picture_as_pdf</span> PDFダウンロード';
    }
  }
}

// ── 奉仕報告チェック（月別提出状況） ────────────────
let rptChkFilter = 'all';
let rptChkData = { members: [], reportMap: {} };

async function loadAdminReportCheck() {
  const view = document.getElementById('rptchk-view');
  const monthSel = document.getElementById('rptchk-month-select');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  if (monthSel && monthSel.options.length === 0) {
    const now = new Date();
    const defMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const defYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    for (let i = 0; i < 12; i++) {
      let m = now.getMonth() - i;
      let y = now.getFullYear();
      if (m <= 0) { m += 12; y--; }
      const opt = document.createElement('option');
      opt.value = y + '-' + m;
      opt.textContent = y + '年' + m + '月';
      if (m === defMonth && y === defYear) opt.selected = true;
      monthSel.appendChild(opt);
    }
    monthSel.addEventListener('change', () => loadReportCheckData());

    document.getElementById('rptchk-filter-all')?.addEventListener('click', () => setRptChkFilter('all'));
    document.getElementById('rptchk-filter-done')?.addEventListener('click', () => setRptChkFilter('done'));
    document.getElementById('rptchk-filter-none')?.addEventListener('click', () => setRptChkFilter('none'));
  }

  await loadReportCheckData();
}

function setRptChkFilter(f) {
  rptChkFilter = f;
  document.querySelectorAll('#page-admin-report-check .rpt-filter-btn').forEach(b => b.classList.remove('rpt-filter-active'));
  const id = f === 'all' ? 'rptchk-filter-all' : f === 'done' ? 'rptchk-filter-done' : 'rptchk-filter-none';
  document.getElementById(id)?.classList.add('rpt-filter-active');
  renderReportCheck();
}

async function loadReportCheckData() {
  const view = document.getElementById('rptchk-view');
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  const monthSel = document.getElementById('rptchk-month-select');
  const val = monthSel.value.split('-');
  const year = parseInt(val[0]);
  const month = parseInt(val[1]);

  try {
    const [userSnap, reportSnap] = await Promise.all([
      db.collection('USER_LIST').get(),
      db.collection('PREACHING_REPORT').where('month', '==', month).get(),
    ]);

    const members = [];
    userSnap.docs.forEach(d => {
      const data = d.data();
      const name = String(data.name || '').trim();
      if (!name) return;
      members.push({
        name,
        group: String(data.group || '').trim(),
      });
    });
    members.sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      return a.name.localeCompare(b.name);
    });

    const reportMap = {};
    reportSnap.docs.forEach(d => {
      const data = d.data();
      const name = String(data.name || '').trim();
      const ts = data.timestamp ? (data.timestamp.seconds || 0) : 0;
      if (!reportMap[name] || ts > reportMap[name]._ts) {
        reportMap[name] = {
          role: data.role || '',
          participation: data.participation || '',
          hours: data.hours,
          bibleStudy: data.bibleStudy,
          remarks: data.remarks || '',
          _ts: ts,
        };
      }
    });

    rptChkData = { members, reportMap, month, year };
    renderReportCheck();
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

function renderReportCheck() {
  const view = document.getElementById('rptchk-view');
  const { members, reportMap, month } = rptChkData;

  let submitted = 0;
  members.forEach(m => { if (reportMap[m.name]) submitted++; });
  const summary = document.getElementById('rptchk-summary');
  if (summary) summary.textContent = '提出: ' + submitted + ' / ' + members.length + '名';

  const groups = {};
  members.forEach(m => {
    const report = reportMap[m.name] || null;
    const isDone = !!report;
    if (rptChkFilter === 'done' && !isDone) return;
    if (rptChkFilter === 'none' && isDone) return;
    const g = m.group || '未分類';
    if (!groups[g]) groups[g] = [];
    groups[g].push({ ...m, report });
  });

  if (Object.keys(groups).length === 0) {
    view.innerHTML = '<div class="empty-state"><span class="material-icons">search_off</span>該当するデータがありません</div>';
    return;
  }

  let html = '';
  Object.keys(groups).sort().forEach(groupName => {
    const list = groups[groupName];
    html += '<div class="rpt-group">';
    html += '<div class="rpt-group-title">' + esc(groupName) + '</div>';
    html += '<table class="rpt-table"><thead><tr>';
    html += '<th>氏名</th><th>立場</th><th>参加/時間</th><th>研究</th><th>状態</th>';
    html += '</tr></thead><tbody>';

    list.forEach(item => {
      const r = item.report;
      if (r) {
        const isEv = r.role === '伝道者';
        const activity = isEv ? (r.participation || '-') : (r.hours != null ? r.hours + '時間' : '-');
        html += '<tr>';
        html += '<td>' + esc(item.name) + '</td>';
        html += '<td class="rpt-cell-sm">' + esc(r.role) + '</td>';
        html += '<td class="rpt-cell-sm">' + esc(activity) + '</td>';
        html += '<td class="rpt-cell-sm">' + (r.bibleStudy != null ? r.bibleStudy : '-') + '</td>';
        html += '<td><span class="rpt-badge-done">✓ 提出済</span></td>';
        html += '</tr>';
        if (r.remarks) {
          html += '<tr><td colspan="5" class="rpt-remarks">備考: ' + esc(r.remarks) + '</td></tr>';
        }
      } else {
        html += '<tr class="rpt-row-none">';
        html += '<td>' + esc(item.name) + '</td>';
        html += '<td class="rpt-cell-sm">-</td>';
        html += '<td class="rpt-cell-sm">-</td>';
        html += '<td class="rpt-cell-sm">-</td>';
        html += '<td><span class="rpt-badge-none">未提出</span></td>';
        html += '</tr>';
      }
    });

    html += '</tbody></table></div>';
  });

  view.innerHTML = html;
}

// ── S-13 区域割当ての記録 ────────────────────────

var s13TerritoryCity = {};   // 区域番号(string) → City
var s13GroupsByCity = {};    // City → [groupName]
var s13SupervisorMap = {};
var s13AllHistory = {};

async function s13LoadConfig() {
  const [areaSnap, groupSnap] = await Promise.all([
    db.collection('AREA_LIST').get(),
    db.collection('GROUP_LIST').get(),
  ]);

  s13TerritoryCity = {};
  areaSnap.docs.forEach(doc => {
    const d = doc.data();
    const type = String(d.type || '').trim();
    if (type !== 'NORMAL') return;
    const num = String(d.Number ?? d.number ?? '');
    const city = String(d.City ?? d.city ?? '').trim();
    if (num && city) s13TerritoryCity[num] = city;
  });
  console.log('s13TerritoryCity:', JSON.stringify(s13TerritoryCity));

  s13GroupsByCity = {};
  groupSnap.docs.forEach(doc => {
    const d = doc.data();
    const name = String(d.groupName ?? d.name ?? '').trim();
    const city = String(d.City ?? d.city ?? '').trim();
    if (name && city) {
      if (!s13GroupsByCity[city]) s13GroupsByCity[city] = [];
      s13GroupsByCity[city].push(name);
    }
  });
  console.log('s13GroupsByCity:', JSON.stringify(s13GroupsByCity));
}

function s13GetCityForTerritory(tNum) {
  return s13TerritoryCity[String(tNum)] || null;
}

function s13GetGroupsForCity(city) {
  return s13GroupsByCity[city] || [];
}

async function s13LoadSupervisors() {
  const svSnap = await db.collection('USER_LIST').where('status4', '==', 'SV').get();
  s13SupervisorMap = {};
  svSnap.docs.forEach(doc => {
    const d = doc.data();
    const group = (d.group || '').trim();
    const name = (d.name || '').trim();
    if (group && name) s13SupervisorMap[group] = name;
  });
  console.log('s13SupervisorMap:', JSON.stringify(s13SupervisorMap));
}

async function s13LoadHistory() {
  const snap = await db.collection('GROUP_ASS_NO').get();
  s13AllHistory = {};
  snap.docs.forEach(doc => {
    const data = doc.data();
    if ((data.type || 'NORMAL').toString().trim() !== 'NORMAL') return;
    const territory = (data.territories || '').toString();
    if (!territory) return;
    if (!s13AllHistory[territory]) s13AllHistory[territory] = [];
    s13AllHistory[territory].push({
      name: s13SupervisorMap[data.groupName] || data.groupName || '',
      groupName: data.groupName || '',
      start: data.startDate || '',
      end: data.endDate || '',
    });
  });
  Object.keys(s13AllHistory).forEach(t => {
    s13AllHistory[t].sort((a, b) => b.start.localeCompare(a.start));
  });
}

function s13FindNextTerritory(city) {
  const nums = Object.keys(s13TerritoryCity).filter(t => s13TerritoryCity[t] === city);
  let oldest = null;
  let oldestEnd = null;

  for (const num of nums) {
    const key = String(num);
    const history = s13AllHistory[key] || [];
    if (history.length === 0) {
      return { territory: key, lastEnd: null, daysSince: 99999 };
    }
    const latest = history[0];
    if (!latest.end) continue; // 未返却 = 使用中、スキップ
    if (!oldestEnd || latest.end < oldestEnd) {
      oldestEnd = latest.end;
      oldest = key;
    }
  }

  if (!oldest) return null;
  const days = Math.floor((new Date() - new Date(oldestEnd)) / 86400000);
  return { territory: oldest, lastEnd: oldestEnd, daysSince: days };
}

function s13RecommendGroup(territory, city) {
  const groups = s13GetGroupsForCity(city);
  if (groups.length === 0) return null;

  const history = s13AllHistory[territory] || [];
  const lastAssigned = {};
  history.forEach(h => {
    if (h.groupName && !lastAssigned[h.groupName]) {
      lastAssigned[h.groupName] = h.start;
    }
  });

  const scored = groups.map(g => {
    const last = lastAssigned[g];
    if (!last) return { group: g, score: 99999, reason: '未担当' };
    const days = Math.floor((new Date() - new Date(last)) / 86400000);
    return { group: g, score: days, reason: `前回 ${last}` };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function s13RenderAssignPanel() {
  const panel = document.getElementById('s13-assign-panel');
  if (!panel) return;

  const cities = [...new Set(Object.values(s13TerritoryCity))];
  if (cities.length === 0) {
    panel.innerHTML = '<div class="s13-assign-note">AREA_LISTにCity情報がありません</div>';
    return;
  }
  let html = '';

  for (const city of cities) {
    const next = s13FindNextTerritory(city);
    const groups = s13GetGroupsForCity(city);

    if (!next) {
      html += `<div class="s13-assign-city">
        <div class="s13-assign-city-name">${esc(city)}</div>
        <div class="s13-assign-info">割当可能な区域がありません（全て使用中）</div>
      </div>`;
      continue;
    }

    const ranked = s13RecommendGroup(next.territory, city);
    const recommended = ranked && ranked.length > 0 ? ranked[0] : null;

    const groupOptions = (ranked || []).map(r => {
      const svName = s13SupervisorMap[r.group] || '';
      const label = svName ? `${r.group}（${svName}）- ${r.reason}` : `${r.group}（${r.reason}）`;
      return `<option value="${esc(r.group)}">${esc(label)}</option>`;
    }).join('');

    const daysLabel = next.lastEnd
      ? `前回返却: ${esc(next.lastEnd)}（${next.daysSince}日経過）`
      : '未割当（最優先）';

    const territoryNums = Object.keys(s13TerritoryCity).filter(t => s13TerritoryCity[t] === city).sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    const territoryOptions = territoryNums.map(t =>
      `<option value="${esc(t)}" ${t === next.territory ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');

    html += `
      <div class="s13-assign-city" data-city="${esc(city)}">
        <div class="s13-assign-city-name">${esc(city)}</div>
        <div class="s13-assign-territory">
          次の区域: <select class="s13-assign-territory-select">${territoryOptions}</select>
          <span class="s13-assign-days">${daysLabel}</span>
        </div>
        ${recommended ? `<div class="s13-assign-recommend">推薦: ${esc(recommended.group)}（${esc(recommended.reason)}）</div>` : ''}
        <div class="s13-assign-form">
          <label>割当先:
            <select class="s13-assign-group">${groupOptions}</select>
          </label>
          <label>開始日: <input type="date" class="s13-assign-start"></label>
          <label>終了日: <input type="date" class="s13-assign-end"></label>
          <button class="btn-primary s13-assign-btn">割当実行</button>
        </div>
      </div>`;
  }

  panel.innerHTML = html;

  panel.querySelectorAll('.s13-assign-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cityDiv = btn.closest('.s13-assign-city');
      const territory = cityDiv.querySelector('.s13-assign-territory-select').value;
      const groupName = cityDiv.querySelector('.s13-assign-group').value;
      const startDate = cityDiv.querySelector('.s13-assign-start').value;
      const endDate = cityDiv.querySelector('.s13-assign-end').value;

      if (!groupName || !startDate || !endDate) {
        alert('グループ・開始日・終了日を全て入力してください');
        return;
      }
      const svName = s13SupervisorMap[groupName] || groupName;
      if (!confirm(`区域No.${territory} を ${groupName}（${svName}）に割当てますか？\n開始: ${startDate}　終了: ${endDate}`)) return;

      try {
        await db.collection('GROUP_ASS_NO').add({
          territories: territory,
          groupName: groupName,
          startDate: startDate,
          endDate: endDate,
          type: 'NORMAL',
          timestamp: firebase.firestore.Timestamp.now(),
        });
        alert('割当を登録しました');
        await s13LoadHistory();
        s13RenderAssignPanel();
        s13RenderTable();
      } catch (e) {
        alert('エラー: ' + e.message);
      }
    });
  });
}

function s13RenderTable() {
  const S13_ROWS = 24;
  const S13_COLS = 5;
  const grid = document.getElementById('s13-grid');

  const sortedTerritories = Object.keys(s13AllHistory).sort((a, b) => {
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

    for (let r = 0; r < S13_ROWS; r++) {
      const dataRow = document.createElement('div');
      dataRow.className = 's13-data-row';
      for (let c = 0; c < S13_COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 's13-data-cell';
        const history = chunk[c] ? (s13AllHistory[chunk[c]] || []) : [];
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
}

async function loadAdminS13Table() {
  const grid = document.getElementById('s13-grid');
  grid.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    await Promise.all([s13LoadConfig(), s13LoadSupervisors()]);
    await s13LoadHistory();
    s13RenderAssignPanel();
    s13RenderTable();
  } catch (e) {
    console.error('S-13 load error:', e);
    grid.innerHTML = `<div class="empty-state">エラーが発生しました: ${e.message}</div>`;
  }
}

// ── 組織表管理 ────────────────────────────────

var orgData = [];
var orgSections = ['長老団', '奉仕委員会', '集会', 'その他'];

async function loadOrgView() {
  const view = document.getElementById('org-view');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('ORG_CHART').orderBy('order', 'asc').get();
    const allData = snap.docs.map(doc => doc.data());

    const elders = allData.filter(d => d.section === '長老団');
    const committee = allData.filter(d => d.section === '奉仕委員会');
    const rest = allData.filter(d => d.section === '集会' || d.section === 'その他');

    function toArr(v) {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v) return v.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      return [];
    }
    function mRows(item) {
      return Math.max(1, Math.ceil(toArr(item.members).length / 3));
    }

    // 奉仕委員会の部門を長老団の役職に紐付け
    var roleGroups = [];
    if (elders.length === 3 && committee.length >= 3) {
      var splits = [3, 2, committee.length - 5];
      if (committee.length === 8) splits = [3, 2, 3];
      var idx = 0;
      for (var e = 0; e < 3; e++) {
        var g = { role: elders[e], depts: committee.slice(idx, idx + splits[e]) };
        idx += splits[e];
        roleGroups.push(g);
      }
    } else {
      var per = Math.ceil(committee.length / Math.max(elders.length, 1));
      for (var e = 0; e < elders.length; e++) {
        roleGroups.push({ role: elders[e], depts: committee.slice(e * per, (e + 1) * per) });
      }
    }

    // 行数計算
    var colors = ['#e8f5e9', '#fff3e0', '#e3f2fd'];
    for (var i = 0; i < roleGroups.length; i++) {
      var g = roleGroups[i];
      g.totalRows = g.depts.reduce(function(s, d) { return s + mRows(d); }, 0);
      g.color = colors[i % colors.length];
    }
    var totalCommRows = roleGroups.reduce(function(s, g) { return s + g.totalRows; }, 0);

    var html = '<div class="org-xl-wrap">';
    html += '<h3 class="org-xl-title">東京都多摩市唐木田会衆　組織表</h3>';
    html += '<div class="org-xl-scroll"><table class="org-xl">';
    html += '<thead><tr><th colspan="2"></th><th>監督</th><th>補佐</th><th>部門</th><th>責任者</th><th colspan="3">奉仕者</th></tr></thead>';
    html += '<tbody>';

    var firstRole = true;
    for (var gi = 0; gi < roleGroups.length; gi++) {
      var g = roleGroups[gi];
      var firstDept = true;
      for (var di = 0; di < g.depts.length; di++) {
        var dept = g.depts[di];
        var rows = mRows(dept);
        var members = toArr(dept.members);
        for (var r = 0; r < rows; r++) {
          html += '<tr>';
          if (firstRole && firstDept && r === 0)
            html += '<td class="org-xl-sec" rowspan="' + totalCommRows + '">奉<br>仕<br>委<br>員<br>会</td>';
          if (firstDept && r === 0) {
            html += '<td class="org-xl-role" style="background:' + g.color + '" rowspan="' + g.totalRows + '">' + esc(g.role.department || '') + '</td>';
            html += '<td class="org-xl-sv" style="background:' + g.color + '" rowspan="' + g.totalRows + '">' + esc(g.role.supervisor || '') + '</td>';
            html += '<td style="background:' + g.color + '" rowspan="' + g.totalRows + '">' + esc(g.role.assistant || '') + '</td>';
          }
          if (r === 0) {
            html += '<td class="org-xl-dept"' + (rows > 1 ? ' rowspan="' + rows + '"' : '') + '>' + esc(dept.department || '') + '</td>';
            html += '<td' + (rows > 1 ? ' rowspan="' + rows + '"' : '') + '>' + esc(dept.responsible || '') + '</td>';
          }
          for (var c = 0; c < 3; c++) {
            var mi = r * 3 + c;
            html += '<td class="org-xl-m">' + (mi < members.length ? esc(members[mi]) : '') + '</td>';
          }
          html += '</tr>';
        }
        firstDept = false;
      }
      firstRole = false;
    }

    // 下段: 長老団
    if (rest.length > 0) {
      var totalRestRows = rest.reduce(function(s, d) { return s + mRows(d); }, 0);
      var firstRest = true;
      for (var ri = 0; ri < rest.length; ri++) {
        var item = rest[ri];
        var rows = mRows(item);
        var members = toArr(item.members);
        for (var r = 0; r < rows; r++) {
          html += '<tr class="org-xl-bottom">';
          if (firstRest && r === 0)
            html += '<td class="org-xl-sec org-xl-sec-bottom" rowspan="' + totalRestRows + '">長<br>老<br>団</td>';
          if (r === 0) {
            html += '<td class="org-xl-dept" colspan="4"' + (rows > 1 ? ' rowspan="' + rows + '"' : '') + '>' + esc(item.department || '') + '</td>';
            html += '<td' + (rows > 1 ? ' rowspan="' + rows + '"' : '') + '>' + esc(item.responsible || '') + '</td>';
          }
          for (var c = 0; c < 3; c++) {
            var mi = r * 3 + c;
            html += '<td class="org-xl-m">' + (mi < members.length ? esc(members[mi]) : '') + '</td>';
          }
          html += '</tr>';
        }
        firstRest = false;
      }
    }

    html += '</tbody></table></div></div>';
    view.innerHTML = html;
  } catch (e) {
    console.error('loadOrgView error:', e);
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + e.message + '</div>';
  }
}

async function loadOrgEditor() {
  const editor = document.getElementById('org-editor');
  editor.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('ORG_CHART').orderBy('order', 'asc').get();
    orgData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderOrgEditor();
  } catch (e) {
    console.error('ORG_CHART load error:', e);
    editor.innerHTML = `<div class="empty-state">エラー: ${e.message}</div>`;
  }
}

function renderOrgEditor() {
  const editor = document.getElementById('org-editor');
  let html = '<div class="org-editor-wrap">';

  for (const section of orgSections) {
    const items = orgData.filter(d => d.section === section);
    html += `<div class="org-section">
      <div class="org-section-header">
        <h3>${esc(section)}</h3>
        <button class="btn-small org-add-btn" data-section="${esc(section)}">＋ 追加</button>
      </div>
      <div class="org-section-body">`;

    for (const item of items) {
      html += renderOrgRow(item);
    }

    html += '</div></div>';
  }

  html += '</div>';
  editor.innerHTML = html;

  editor.querySelectorAll('.org-add-btn').forEach(btn => {
    btn.addEventListener('click', () => orgAddRow(btn.dataset.section));
  });
  editor.querySelectorAll('.org-save-btn').forEach(btn => {
    btn.addEventListener('click', () => orgSaveRow(btn.dataset.id));
  });
  editor.querySelectorAll('.org-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => orgDeleteRow(btn.dataset.id));
  });
}

function renderOrgRow(item) {
  const membersStr = Array.isArray(item.members) ? item.members.join(', ') : (item.members || '');
  return `<div class="org-row" data-id="${esc(item.id)}">
    <div class="org-fields">
      <div class="org-field">
        <label>部門 / 役割</label>
        <input type="text" class="org-input org-f-dept" value="${esc(item.department || item.role || '')}" data-id="${esc(item.id)}">
      </div>
      <div class="org-field">
        <label>監督</label>
        <input type="text" class="org-input org-f-sv" value="${esc(item.supervisor || '')}" data-id="${esc(item.id)}">
      </div>
      <div class="org-field">
        <label>補佐</label>
        <input type="text" class="org-input org-f-asst" value="${esc(item.assistant || '')}" data-id="${esc(item.id)}">
      </div>
      <div class="org-field">
        <label>責任者</label>
        <input type="text" class="org-input org-f-resp" value="${esc(item.responsible || '')}" data-id="${esc(item.id)}">
      </div>
      <div class="org-field org-field-wide">
        <label>奉仕者</label>
        <input type="text" class="org-input org-f-members" value="${esc(membersStr)}" data-id="${esc(item.id)}" placeholder="カンマ区切り">
      </div>
    </div>
    <div class="org-actions">
      <button class="btn-small org-save-btn" data-id="${esc(item.id)}">保存</button>
      <button class="btn-small btn-danger org-delete-btn" data-id="${esc(item.id)}">削除</button>
    </div>
  </div>`;
}

async function orgSaveRow(id) {
  const row = document.querySelector(`.org-row[data-id="${id}"]`);
  if (!row) return;
  const dept = row.querySelector('.org-f-dept').value.trim();
  const sv = row.querySelector('.org-f-sv').value.trim();
  const asst = row.querySelector('.org-f-asst').value.trim();
  const resp = row.querySelector('.org-f-resp').value.trim();
  const membersRaw = row.querySelector('.org-f-members').value.trim();
  const members = membersRaw ? membersRaw.split(/[,、]/).map(s => s.trim()).filter(Boolean) : [];

  const item = orgData.find(d => d.id === id);
  if (!item) return;

  const isRole = ['調整者', '書記', '奉仕監督'].includes(dept);
  const data = {
    section: item.section,
    role: isRole ? '' : '',
    department: dept,
    supervisor: sv,
    assistant: asst,
    responsible: resp,
    members: members,
    order: item.order,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await db.collection('ORG_CHART').doc(id).set(data);
    item.department = dept;
    item.supervisor = sv;
    item.assistant = asst;
    item.responsible = resp;
    item.members = members;
    alert('保存しました');
  } catch (e) {
    alert('エラー: ' + e.message);
  }
}

async function orgDeleteRow(id) {
  if (!confirm('この行を削除しますか？')) return;
  try {
    await db.collection('ORG_CHART').doc(id).delete();
    orgData = orgData.filter(d => d.id !== id);
    renderOrgEditor();
  } catch (e) {
    alert('エラー: ' + e.message);
  }
}

async function orgAddRow(section) {
  const maxOrder = orgData.reduce((m, d) => Math.max(m, d.order || 0), 0);
  const data = {
    section: section,
    role: '',
    department: '',
    supervisor: '',
    assistant: '',
    responsible: '',
    members: [],
    order: maxOrder + 1,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    const ref = await db.collection('ORG_CHART').add(data);
    orgData.push({ id: ref.id, ...data });
    renderOrgEditor();
  } catch (e) {
    alert('エラー: ' + e.message);
  }
}

// ══════════════════════════════════════════════
// 宣教ページ
// ══════════════════════════════════════════════

async function loadSenkyoMyCards() {
  const container = document.getElementById('senkyo-mycard-view');
  if (!container) return;
  container.innerHTML = '<div class="loading">あなたに割り当てられた区域カードを読み込んでいます...</div>';

  const userName = memberUserName.trim();
  if (!userName) {
    container.innerHTML = '<div class="empty-state">ユーザー情報が取得できません</div>';
    return;
  }

  try {
    // 個人カードとグループ情報を並列取得
    const [cardSnap, groupSnap] = await Promise.all([
      db.collection('CARD_ASSIGNMENTS').where('memberName', '==', userName).get(),
      memberUserGroup
        ? db.collection('GROUP_ASS_NO').get()
        : Promise.resolve(null),
    ]);

    // グループに割当てられた区域番号リスト（フィルター用）
    let groupTerritories = [];
    let groupCardSnap = null;
    if (memberUserGroup && groupSnap) {
      const gName = memberUserGroup.trim();
      const today = new Date(); today.setHours(0,0,0,0);
      let latestDate = null, latestStr = null;
      groupSnap.docs.forEach(d => {
        const data = d.data();
        if ((data.groupName || '').trim() !== gName) return;
        if ((data.type || 'NORMAL') !== 'NORMAL') return;
        const sd = data.startDate || data.start_date || '';
        const dt = parseSimpleDate(sd);
        if (dt && dt <= today && (!latestDate || dt > latestDate)) {
          latestDate = dt; latestStr = sd;
        }
      });
      if (latestStr) {
        groupSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.groupName || '').trim() !== gName) return;
          if ((data.type || 'NORMAL') !== 'NORMAL') return;
          const sd = data.startDate || data.start_date || '';
          if (sd === latestStr && data.territories) groupTerritories.push(data.territories.toString());
        });
      }
      // グループ区域カードも取得
      groupCardSnap = await db.collection('CARD_ASSIGNMENTS').where('memberName', '==', 'グループ区域').get();
    }

    // 個人カード: 各カード名の最新startDateのみ抽出
    const normCard = (n) => (n || '').toString().replace(/[−–ー]/g, '-');
    const latestPerCard = {};
    cardSnap.docs.forEach(d => {
      const data = d.data();
      const cn = normCard(data.cardName || '');
      const sd = data.startDate || data.start_date || '';
      const dt = parseSimpleDate(sd);
      if (!cn || !dt) return;
      if (!latestPerCard[cn] || dt > latestPerCard[cn].dt) {
        latestPerCard[cn] = { dt, sd };
      }
    });
    let personalCards = [];
    cardSnap.docs.forEach(d => {
      const data = d.data();
      const cn = normCard(data.cardName || '');
      const sd = data.startDate || data.start_date || '';
      if (cn && latestPerCard[cn] && sd === latestPerCard[cn].sd) {
        if (!personalCards.includes(cn)) personalCards.push(cn);
      }
    });

    // グループ区域でフィルター
    if (groupTerritories.length > 0) {
      personalCards = personalCards.filter(cn => {
        const t = cn.split('-')[0];
        return groupTerritories.includes(t);
      });
    }

    // ソート
    personalCards.sort((a, b) => {
      const am = a.match(/(\d+)-(\d+)/), bm = b.match(/(\d+)-(\d+)/);
      if (am && bm) {
        const d = parseInt(am[1]) - parseInt(bm[1]);
        return d !== 0 ? d : parseInt(am[2]) - parseInt(bm[2]);
      }
      return a.localeCompare(b);
    });

    // グループカード
    let groupCards = [];
    if (groupCardSnap) {
      const gcLatest = {};
      groupCardSnap.docs.forEach(d => {
        const data = d.data();
        const cn = normCard(data.cardName || '');
        const sd = data.startDate || data.start_date || '';
        const dt = parseSimpleDate(sd);
        if (!cn || !dt) return;
        if (!gcLatest[cn] || dt > gcLatest[cn].dt) gcLatest[cn] = { dt, sd };
      });
      groupCardSnap.docs.forEach(d => {
        const data = d.data();
        const cn = normCard(data.cardName || '');
        const sd = data.startDate || data.start_date || '';
        if (cn && gcLatest[cn] && sd === gcLatest[cn].sd && !groupCards.includes(cn)) {
          groupCards.push(cn);
        }
      });
      if (groupTerritories.length > 0) {
        groupCards = groupCards.filter(cn => groupTerritories.includes(cn.split('-')[0]));
      }
      groupCards.sort((a, b) => {
        const am = a.match(/(\d+)-(\d+)/), bm = b.match(/(\d+)-(\d+)/);
        if (am && bm) {
          const d = parseInt(am[1]) - parseInt(bm[1]);
          return d !== 0 ? d : parseInt(am[2]) - parseInt(bm[2]);
        }
        return a.localeCompare(b);
      });
    }

    // 描画
    container.innerHTML = '';
    // 個人カード
    const tag1 = document.createElement('div');
    tag1.className = 'senkyo-section-tag';
    tag1.textContent = userName;
    container.appendChild(tag1);

    function mkBtn(cn) {
      const btn = document.createElement('button');
      btn.className = 'mycard-item';
      btn.innerHTML = `<span class="material-icons" style="color:var(--primary);font-size:24px">map</span>
        <span class="mycard-name">区域No.${esc(cn)}</span>
        <span class="material-icons senkyo-chevron">chevron_right</span>`;
      btn.addEventListener('click', () => {
        senkyoCardViewName = cn;
        senkyoCardViewBack = 'senkyo-mycard';
        navigate('senkyo-cardview');
      });
      return btn;
    }

    if (personalCards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mycard-empty';
      empty.textContent = '割当てられたカードがありません';
      container.appendChild(empty);
    } else {
      personalCards.forEach(cn => container.appendChild(mkBtn(cn)));
    }

    // グループカード
    if (memberUserGroup) {
      const spacer = document.createElement('div');
      spacer.style.height = '16px';
      container.appendChild(spacer);

      const tag2 = document.createElement('div');
      tag2.className = 'senkyo-section-tag';
      tag2.textContent = 'グループカード';
      container.appendChild(tag2);

      if (groupCards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mycard-empty';
        empty.textContent = '割り当てられた区域はありません';
        container.appendChild(empty);
      } else {
        groupCards.forEach(cn => container.appendChild(mkBtn(cn)));
      }
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state">エラー: ' + esc(e.message) + '</div>';
    console.error('loadSenkyoMyCards error:', e);
  }
}

function parseSimpleDate(s) {
  if (!s) return null;
  const str = s.toString().trim();
  // yyyy/MM/dd or yyyy-MM-dd
  const m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return null;
}

async function loadSenkyoCardView() {
  const container = document.getElementById('senkyo-cardview-view');
  if (!container) return;
  const cardName = senkyoCardViewName;
  if (!cardName) { container.innerHTML = '<div class="empty-state">カード名が指定されていません</div>'; return; }

  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const parts = cardName.split('-');
    const areaId = parseInt(parts[0]);
    const sheetId = parseInt(parts[1] || '1');
    if (isNaN(areaId) || isNaN(sheetId)) { container.innerHTML = '<div class="empty-state">無効なカード名です</div>'; return; }

    // AREA_DATA_NORMAL を全件取得してクライアント側でフィルタリング
    const allSnap = await db.collection('AREA_DATA_NORMAL').get();
    const matchedDocs = allSnap.docs.filter(d => {
      const data = d.data();
      const a = parseInt((data.areaId || data.area_id || '').toString());
      const s = parseInt((data.sheetId || data.sheet_id || '').toString());
      return a === areaId && s === sheetId;
    });
    console.log('AREA_DATA_NORMAL: total=' + allSnap.docs.length + ', matched=' + matchedDocs.length + ' for area=' + areaId + ' sheet=' + sheetId);

    if (matchedDocs.length === 0) {
      container.innerHTML = '<div class="empty-state">データがありません（area=' + areaId + ', sheet=' + sheetId + '）</div>';
      return;
    }

    // CONFIG から訪問期間を取得
    let cvStartDate = '', cvEndDate = '';
    try {
      const configSnap = await db.collection('CONFIG').limit(1).get();
      if (!configSnap.empty) {
        const cfg = configSnap.docs[0].data();
        cvStartDate = (cfg.visitStartDate || '').toString();
        cvEndDate = (cfg.visitEndDate || '').toString();
      }
    } catch(e) { console.warn('CONFIG load error:', e); }

    // uidマップ
    const uidToAddr = {};
    matchedDocs.forEach(d => {
      const data = d.data();
      const uid = data.uid || d.id;
      if (uid) uidToAddr[uid] = data;
    });

    // 履歴取得
    const uids = Object.keys(uidToAddr);
    const histByUid = {};
    for (let i = 0; i < uids.length; i += 30) {
      const batch = uids.slice(i, i + 30);
      const histSnap = await db.collection('AREA_DATA_NORMAL_HISTORY')
        .where('uid', 'in', batch).get();
      histSnap.docs.forEach(d => {
        const data = d.data();
        const uid = (data.uid || '').toString();
        if (uid) { if (!histByUid[uid]) histByUid[uid] = []; histByUid[uid].push(data); }
      });
    }

    // Timestamp→文字列
    function toDateStr(v) {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (v.toDate) { const d = v.toDate(); const jst = new Date(d.getTime() + 9*3600000); return jst.getFullYear()+'/'+(jst.getMonth()+1)+'/'+jst.getDate(); }
      return v.toString();
    }

    // 結果構築
    const results = [];
    Object.entries(uidToAddr).forEach(([uid, addr]) => {
      const townName = (addr.townName || addr.town_name || '').toString();
      const houseNum = (addr.addressNumber || addr.house_num || addr.houseNum || '').toString();
      const roomNum = (addr.roomNum || addr.room_num || '').toString();
      const addressNumber = roomNum ? houseNum + '-' + roomNum : houseNum;
      const houseName = (addr.houseName || addr.house_name || '').toString();

      // 地図リンク
      const ido = (addr.build_ido || addr.ido || '').toString();
      const keido = (addr.buildKeido || addr.keido || '').toString();
      let mapLink = '';
      if (ido && keido) {
        const lat = parseFloat(ido), lng = parseFloat(keido);
        if (lat && lng) mapLink = 'https://www.google.com/maps?q=' + lat + ',' + lng;
      }

      const histDocs = (histByUid[uid] || []).sort((a, b) => {
        const aS = toDateStr(a.startDate || a.start_date);
        const bS = toDateStr(b.startDate || b.start_date);
        return bS.localeCompare(aS);
      });

      // 現在期間のステータスを取得
      let currentStatus = '';
      if (cvStartDate && cvEndDate) {
        const visitId = cvStartDate + '_' + cvEndDate;
        const match = histDocs.find(d => {
          const sd = toDateStr(d.startDate || d.start_date);
          const ed = toDateStr(d.endDate || d.end_date);
          return sd + '_' + ed === visitId;
        });
        if (match) currentStatus = (match.visitResult || match.visit_result || '').toString();
      }

      const visits = histDocs.filter(d => {
        const sd = toDateStr(d.startDate || d.start_date);
        const ed = toDateStr(d.endDate || d.end_date);
        return sd && ed;
      }).slice(0, 5).map(d => {
        const sd = toDateStr(d.startDate || d.start_date);
        const ed = toDateStr(d.endDate || d.end_date);
        return { startDate: sd, endDate: ed, status: (d.visitResult || d.visit_result || '').toString() };
      });

      results.push({ uid, addressNumber, townName, targetName: houseName, mapLink, visits, currentStatus });
    });

    // ソート
    results.sort((a, b) => {
      if (a.townName !== b.townName) return a.townName.localeCompare(b.townName);
      const an = parseInt(a.addressNumber), bn = parseInt(b.addressNumber);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return a.addressNumber.localeCompare(b.addressNumber);
    });

    // 描画
    container.innerHTML = '';

    // ヘッダー
    const hdr = document.createElement('div');
    hdr.className = 'cv-header';
    let hdrInfo = '';
    if (memberUserName) hdrInfo += '<div>担当者：' + esc(memberUserName) + '</div>';
    if (cvStartDate) hdrInfo += '<div>開始日付：' + esc(formatDateJP(cvStartDate)) + '</div>';
    if (cvEndDate) hdrInfo += '<div>終了日付：' + esc(formatDateJP(cvEndDate)) + '</div>';
    hdr.innerHTML = hdrInfo;
    container.appendChild(hdr);

    // アドレス一覧
    const groups = {};
    results.forEach(r => {
      if (!groups[r.townName]) groups[r.townName] = [];
      groups[r.townName].push(r);
    });

    Object.entries(groups).forEach(([town, addrs]) => {
      if (town) {
        const section = document.createElement('div');
        section.className = 'cv-section';
        section.textContent = town;
        container.appendChild(section);
      }
      addrs.forEach(addr => {
        const cs = addr.currentStatus;
        const row = document.createElement('div');
        row.className = 'cv-row';
        row.style.background = statusColor(cs);
        let mapIcon = '';
        if (addr.mapLink) {
          mapIcon = '<a href="' + esc(addr.mapLink) + '" target="_blank" class="cv-map-icon"><span class="material-icons" style="font-size:20px;color:#F1C232">location_on</span></a>';
        } else {
          mapIcon = '<span style="width:22px;display:inline-block"></span>';
        }
        const statusEl = document.createElement('span');
        statusEl.className = 'cv-status' + (cs ? '' : ' cv-status-empty');
        statusEl.textContent = cs || '入力';
        statusEl.style.cursor = 'pointer';
        statusEl.addEventListener('click', () => {
          openCvEditModal(addr.uid, cs, areaId, sheetId, cvStartDate, cvEndDate, statusEl, row);
        });

        row.innerHTML = mapIcon +
          '<span class="cv-no">' + esc(addr.addressNumber) + '</span>' +
          '<span class="cv-name">' + esc(addr.targetName) + '</span>';
        row.appendChild(statusEl);
        container.appendChild(row);
      });
    });

    if (results.length === 0) {
      container.innerHTML = '<div class="empty-state">データがありません</div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state">エラー: ' + esc(e.message) + '</div>';
    console.error('loadSenkyoCardView error:', e);
  }
}

// ── ステータス編集モーダル ──
function openCvEditModal(uid, currentStatus, areaId, sheetId, startDate, endDate, statusEl, rowEl) {
  const modal = document.getElementById('cv-edit-modal');
  const input = document.getElementById('cv-edit-input');
  const btnsContainer = document.getElementById('cv-edit-buttons');

  input.value = currentStatus;

  const statusOptions = [
    { label: 'ア', bg: '#C8E6C9' },
    { label: 'ル', bg: '#FFF9C4' },
    { label: 'アビ', bg: '#E8F5E9' },
    { label: 'ルビ', bg: '#FFF3E0' },
    { label: '白', bg: '#eee' },
    { label: 'クリア', bg: '#eee', value: '' },
  ];

  btnsContainer.innerHTML = '';
  statusOptions.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.style.background = opt.bg;
    btn.addEventListener('click', () => {
      const val = opt.value !== undefined ? opt.value : opt.label;
      saveCvStatus(uid, val, areaId, sheetId, startDate, endDate, statusEl, rowEl);
      modal.classList.add('hidden');
    });
    btnsContainer.appendChild(btn);
  });

  modal.classList.remove('hidden');

  document.getElementById('cv-edit-cancel').onclick = () => modal.classList.add('hidden');
  document.getElementById('cv-edit-overlay').onclick = () => modal.classList.add('hidden');
  document.getElementById('cv-edit-save').onclick = () => {
    saveCvStatus(uid, input.value, areaId, sheetId, startDate, endDate, statusEl, rowEl);
    modal.classList.add('hidden');
  };
}

async function saveCvStatus(uid, value, areaId, sheetId, startDate, endDate, statusEl, rowEl) {
  if (!startDate || !endDate) { alert('訪問期間が設定されていません'); return; }
  const safeDateStr = s => s.replace(/\//g, '');
  const docId = uid + '_' + safeDateStr(startDate) + '_' + safeDateStr(endDate);

  // Timestamp変換
  function toTimestamp(s) {
    const p = s.split('/');
    if (p.length !== 3) return null;
    return new firebase.firestore.Timestamp(new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])).getTime() / 1000, 0);
  }

  try {
    await db.collection('AREA_DATA_NORMAL_HISTORY').doc(docId).set({
      uid: uid,
      type: 'NORMAL',
      areaId: areaId,
      sheetId: sheetId,
      startDate: toTimestamp(startDate),
      endDate: toTimestamp(endDate),
      staffName: memberUserName || '',
      visitResult: value,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // UI即時更新
    statusEl.textContent = value || '入力';
    statusEl.className = 'cv-status' + (value ? '' : ' cv-status-empty');
    statusEl.style.cursor = 'pointer';
    rowEl.style.background = statusColor(value);
  } catch (e) {
    alert('保存エラー: ' + e.message);
    console.error('saveCvStatus error:', e);
  }
}

function formatDateJP(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const wd = ['日','月','火','水','木','金','土'][dt.getUTCDay()];
      return y + '年' + m + '月' + d + '日（' + wd + '）';
    }
  } catch(e) {}
  return dateStr;
}

function statusColor(s) {
  if (s === 'ア') return '#C8E6C9';
  if (s === 'アビ') return '#E8F5E9';
  if (s === 'ル') return '#FFF9C4';
  if (s === 'ルビ') return '#FFF3E0';
  if (s === '白') return '#f5f5f5';
  return 'transparent';
}

async function loadSenkyoCards() {
  const container = document.getElementById('senkyo-cards-view');
  if (!container) return;
  const { territory, groupName } = senkyoCardsContext;
  if (!territory) { container.innerHTML = '<div class="empty-state">区域番号が指定されていません</div>'; return; }

  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const areaId = parseInt(territory);
    if (isNaN(areaId)) { container.innerHTML = '<div class="empty-state">無効な区域番号です</div>'; return; }

    // 1. AREA_DATA_NORMAL から sheetId 一覧を取得 → カード名生成
    const areaSnap = await db.collection('AREA_DATA_NORMAL').where('areaId', '==', areaId).get();
    const sheetIds = new Set();
    areaSnap.docs.forEach(d => {
      const sid = d.data().sheetId;
      if (typeof sid === 'number') sheetIds.add(sid);
    });
    const cardNames = [...sheetIds].sort((a, b) => a - b).map(sid => areaId + '-' + sid);

    if (cardNames.length === 0) {
      container.innerHTML = '<div class="empty-state">カードが見つかりません</div>';
      return;
    }

    // 2. CARD_ASSIGNMENTS から該当区域のカード割当てを取得
    const assignmentMap = {};
    const assSnap = await db.collection('CARD_ASSIGNMENTS').get();
    const normCN = (n) => (n || '').toString().replace(/[−–ー]/g, '-');
    // cardName ごとに最新の startDate のドキュメントを特定
    const latestPerCard = {};
    assSnap.docs.forEach(d => {
      const data = d.data();
      const cn = normCN(data.cardName);
      if (!cn || !cn.startsWith(areaId + '-')) return;
      const sd = data.startDate || data.start_date || '';
      const dt = parseSimpleDate(sd);
      if (!dt) return;
      if (!latestPerCard[cn] || dt > latestPerCard[cn].dt) {
        latestPerCard[cn] = { dt, sd, member: (data.memberName || '').toString() };
      }
    });
    Object.keys(latestPerCard).forEach(cn => {
      const info = latestPerCard[cn];
      if (info.member) assignmentMap[cn] = info.member;
    });

    // 3. メンバーごとにグループ化
    const grouped = {};
    cardNames.forEach(cn => {
      const member = assignmentMap[cn] || '';
      if (!grouped[member]) grouped[member] = [];
      grouped[member].push(cn);
    });

    // ソート: 名前あり → アルファベット順、名前なし（未割当て）は最後
    const members = Object.keys(grouped).filter(k => k !== '').sort();

    function makeCardBtn(cn, backPage) {
      const btn = document.createElement('button');
      btn.className = 'mycard-item';
      btn.innerHTML = '<span class="material-icons" style="color:var(--primary);font-size:24px">map</span>' +
        '<span class="mycard-name">区域No.' + esc(cn) + '</span>' +
        '<span class="material-icons senkyo-chevron">chevron_right</span>';
      btn.addEventListener('click', () => {
        senkyoCardViewName = cn;
        senkyoCardViewBack = backPage;
        navigate('senkyo-cardview');
      });
      return btn;
    }

    container.innerHTML = '';
    members.forEach(member => {
      const tag = document.createElement('div');
      tag.className = 'senkyo-section-tag';
      tag.textContent = member;
      container.appendChild(tag);

      grouped[member].forEach(cn => container.appendChild(makeCardBtn(cn, 'senkyo-cards')));

      const spacer = document.createElement('div');
      spacer.style.height = '16px';
      container.appendChild(spacer);
    });

    // 未割当て
    if (grouped[''] && grouped[''].length > 0) {
      const tag = document.createElement('div');
      tag.className = 'senkyo-section-tag';
      tag.textContent = '未割当て';
      container.appendChild(tag);

      grouped[''].forEach(cn => container.appendChild(makeCardBtn(cn, 'senkyo-cards')));
    }

    if (members.length === 0 && (!grouped[''] || grouped[''].length === 0)) {
      container.innerHTML = '<div class="empty-state">カードが見つかりません</div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state">エラー: ' + esc(e.message) + '</div>';
    console.error('loadSenkyoCards error:', e);
  }
}

async function loadSenkyoTerritories(type, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('GROUP_ASS_NO').get();
    const byGroup = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const docType = (data.type || 'NORMAL').toString().trim();
      if (docType !== type) return;
      const group = data.groupName || '';
      const territory = data.territories || '';
      if (!group || !territory) return;
      if (!byGroup[group]) byGroup[group] = [];
      byGroup[group].push(territory);
    });

    const groups = Object.keys(byGroup).sort();
    groups.forEach(g => {
      byGroup[g].sort((a, b) => {
        const na = parseInt(a), nb = parseInt(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    });

    if (groups.length === 0) {
      container.innerHTML = '<div class="empty-state">区域データがありません</div>';
      return;
    }

    container.innerHTML = '';
    groups.forEach(group => {
      const tag = document.createElement('div');
      tag.className = 'senkyo-section-tag';
      tag.textContent = group;
      container.appendChild(tag);

      const wrap = document.createElement('div');
      wrap.className = 'senkyo-chips';
      byGroup[group].forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'senkyo-territory-chip';
        chip.textContent = t;
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => {
          senkyoCardsContext = { territory: t.toString(), groupName: group, fromPage: currentPage };
          senkyoCardsBackTarget = currentPage;
          navigate('senkyo-cards');
        });
        wrap.appendChild(chip);
      });
      container.appendChild(wrap);
    });
  } catch (e) {
    container.innerHTML = '<div class="empty-state">エラー: ' + esc(e.message) + '</div>';
  }
}

async function loadSenkyoPublic() {
  const container = document.getElementById('senkyo-public-view');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const [optSnap, assSnap] = await Promise.all([
      db.collection('PUBLIC_WITNESSING_OPTIONS').get(),
      db.collection('PUBLIC_WITNESSING_ASSIGNMENTS').get(),
    ]);

    const options = optSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    options.sort((a, b) => {
      if (a.order != null && b.order != null) return a.order - b.order;
      return (a.day || '').localeCompare(b.day || '');
    });

    const assMap = {};
    assSnap.docs.forEach(d => { assMap[d.id] = d.data(); });

    if (options.length === 0) {
      container.innerHTML = '<div class="empty-state">取決め情報がありません</div>';
      return;
    }

    function getPlaces(weekday, time, place) {
      if (place.includes('唐木田')) return ['唐木田駅構内'];
      if (place.includes('堀之内')) {
        const base = '堀之内駅';
        if (weekday === '水' && time === '18:00') return [base+'三和前', base+'FM前'];
        return [base+'三和前', base+'FM前', base+'信号前'];
      }
      return [place];
    }

    container.innerHTML = '';
    let prevDay = '';
    let isFirst = true;

    options.forEach(opt => {
      const day = (opt.day || '').toString();
      const weekday = (opt.dayofweek || '').toString();
      const time = (opt.starttime || '').toString();
      const place = (opt.place || '').toString();
      const placeBase = place.replace('駅', '');
      const places = getPlaces(weekday, time, place);
      const isWeekend = weekday === '土' || weekday === '日';

      // ヘッダー
      const hdr = document.createElement('div');
      hdr.className = 'pw-slot-header';
      if (!isFirst) hdr.style.marginTop = '24px';
      isFirst = false;
      let hdrHtml = '';
      const showDate = day !== prevDay;
      if (showDate) {
        hdrHtml += `<span class="pw-date${isWeekend ? ' pw-weekend' : ''}">${esc(day)}(${esc(weekday)})</span>`;
        prevDay = day;
      }
      hdrHtml += `<span class="material-icons" style="font-size:18px;color:var(--primary)">access_time</span>
        <span class="pw-time">${esc(time)}</span>
        <span class="material-icons" style="font-size:18px;color:#808080">location_on</span>
        <span class="pw-place">${esc(placeBase)}</span>`;
      hdr.innerHTML = hdrHtml;
      container.appendChild(hdr);

      // テーブル（列数×110px）
      const table = document.createElement('div');
      table.className = 'pw-table';
      table.style.width = (places.length * 110) + 'px';

      // 場所ヘッダー行
      let placeRow = '<div class="pw-row pw-row-place">';
      places.forEach(p => {
        const short = p.replace('堀之内駅', '').replace('唐木田駅', '').replace('唐木田', '構内');
        placeRow += `<div class="pw-cell pw-cell-place">${esc(short)}</div>`;
      });
      placeRow += '</div>';
      table.innerHTML = placeRow;

      // 司会者行
      let cRow = '<div class="pw-row pw-row-conductor">';
      places.forEach(p => {
        const docId = `${day}_${time}_${p}`;
        const ass = (assMap[docId] || {}).assignments || {};
        cRow += `<div class="pw-cell">${esc(ass['司会者'] || '')}</div>`;
      });
      cRow += '</div>';
      table.innerHTML += cRow;

      // 参加者行（5行）
      for (let i = 0; i < 5; i++) {
        let row = '<div class="pw-row">';
        places.forEach(p => {
          const docId = `${day}_${time}_${p}`;
          const ass = (assMap[docId] || {}).assignments || {};
          const participants = ass['参加者'] || [];
          row += `<div class="pw-cell">${esc(participants[i] || '')}</div>`;
        });
        row += '</div>';
        table.innerHTML += row;
      }

      container.appendChild(table);
    });
  } catch (e) {
    container.innerHTML = '<div class="empty-state">エラー: ' + esc(e.message) + '</div>';
  }
}

// ── 報告承認 ────────────────────────────────
async function loadAdminReportApprove() {
  const view = document.getElementById('approve-view');
  const countEl = document.getElementById('approve-count');
  if (!view) return;
  view.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const snap = await db.collection('REPORT_DRAFTS').orderBy('timestamp', 'desc').get();
    if (snap.empty) {
      view.innerHTML = '<div class="empty-state">承認待ちの報告はありません</div>';
      if (countEl) countEl.textContent = '';
      return;
    }
    if (countEl) countEl.textContent = snap.size + '件';

    let html = '';
    snap.docs.forEach(doc => {
      const d = doc.data();
      const id = doc.id;
      const isProxy = d.submittedBy ? true : false;
      const dateStr = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleDateString('ja-JP') : '';
      const isEv = d.role === '伝道者';

      html += '<div class="approve-card" id="approve-' + id + '">';
      html += '<div class="approve-header">';
      html += '<div>';
      html += '<span class="approve-name">' + esc(d.name || '') + '</span>';
      if (isProxy) html += ' <span class="approve-proxy">代理: ' + esc(d.submittedBy) + '</span>';
      html += '</div>';
      html += '<span class="approve-date">' + esc(dateStr) + '</span>';
      html += '</div>';
      html += '<div class="approve-body">';
      html += '<span class="approve-tag">' + esc(d.month + '月') + '</span>';
      html += '<span class="approve-tag">' + esc(d.role || '') + '</span>';
      html += '<span class="approve-tag">' + esc(d.groupName || '') + '</span>';
      if (isEv) {
        html += '<span class="approve-tag">参加: ' + esc(d.participation || '-') + '</span>';
      } else {
        html += '<span class="approve-tag">' + (d.hours || 0) + '時間</span>';
      }
      html += '<span class="approve-tag">研究: ' + (d.bibleStudy || 0) + '</span>';
      if (d.remarks) html += '<span class="approve-tag approve-tag-remark">' + esc(d.remarks) + '</span>';
      html += '</div>';
      html += '<div class="approve-actions">';
      html += '<button class="approve-btn-ok" onclick="approveReport(\'' + id + '\')"><span class="material-icons" style="font-size:16px">check</span> 承認</button>';
      html += '<button class="approve-btn-ng" onclick="rejectReport(\'' + id + '\')"><span class="material-icons" style="font-size:16px">close</span> 却下</button>';
      html += '</div>';
      html += '</div>';
    });
    view.innerHTML = html;
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

async function approveReport(docId) {
  if (!confirm('この報告を承認してPREACHING_REPORTに反映しますか？')) return;
  try {
    const docRef = db.collection('REPORT_DRAFTS').doc(docId);
    const snap = await docRef.get();
    if (!snap.exists) { alert('データが見つかりません'); return; }
    const d = snap.data();
    const reportData = { ...d, approvedAt: firebase.firestore.Timestamp.now() };
    await db.collection('PREACHING_REPORT').add(reportData);
    await docRef.delete();
    const card = document.getElementById('approve-' + docId);
    if (card) card.remove();
    // カウント更新
    const countEl = document.getElementById('approve-count');
    const remaining = document.querySelectorAll('.approve-card').length;
    if (countEl) countEl.textContent = remaining ? remaining + '件' : '';
    if (!remaining) {
      document.getElementById('approve-view').innerHTML = '<div class="empty-state">承認待ちの報告はありません</div>';
    }
  } catch (err) {
    alert('承認エラー: ' + err.message);
  }
}

async function rejectReport(docId) {
  if (!confirm('この報告を却下して削除しますか？')) return;
  try {
    await db.collection('REPORT_DRAFTS').doc(docId).delete();
    const card = document.getElementById('approve-' + docId);
    if (card) card.remove();
    const countEl = document.getElementById('approve-count');
    const remaining = document.querySelectorAll('.approve-card').length;
    if (countEl) countEl.textContent = remaining ? remaining + '件' : '';
    if (!remaining) {
      document.getElementById('approve-view').innerHTML = '<div class="empty-state">承認待ちの報告はありません</div>';
    }
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}
