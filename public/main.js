
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

// ── カスタム確認ダイアログ（confirm()の代替） ──
function customConfirm(msg) {
  return new Promise(resolve => {
    const modal = document.getElementById('custom-confirm-modal');
    document.getElementById('custom-confirm-msg').textContent = msg;
    modal.classList.remove('hidden');
    const ok = document.getElementById('custom-confirm-ok');
    const cancel = document.getElementById('custom-confirm-cancel');
    const overlay = document.getElementById('custom-confirm-overlay');
    function cleanup(result) {
      modal.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onCancel);
  });
}

// ── 状態 ──────────────────────────────────────
let currentUser   = null;
let isAdmin       = false;
let isAnnaigakari = false;
let isElder       = false;
let isPortalAdmin = false;
let serverTimeOffset = 0; // サーバー時刻との差分(ms)
let currentPage   = 'home';
let scheduleType  = 'meeting';
let editingAnnounceId  = null;
let editingScheduleId  = null;
let editingAttendanceId = null;
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
  'admin-field-service': '野外奉仕取決表',
  'senkyo-field': '野外奉仕取決表',
  'pw-apply': '公共エリア伝道申込み',
  'admin-program': 'プログラム表作成',
  'admin-assignment': '担当者策定', 'admin-assignment-week': '割当編集',
  'admin-assignment-history': '割当履歴',
  'admin-s89': 'S-89 生成',
  'admin-schedule-editor': 'スケジュール編集',
  'admin-members': 'メンバー管理',
  'admin-attendance': '集会出席',
  'admin-attendance-monthly': '出席 月集計',
  'admin-access-log': 'アクセスログ',
  'attendance-form': '出席人数登録',
  'admin-s13': '区域割当ての記録',
  'admin-group-members': 'グループ成員表',
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
        
        if (snap.empty) {
          // USER_LISTに登録されていないアカウントはアクセス拒否
          console.warn('Access denied: not in USER_LIST', email);
          loginScreen.classList.remove('hidden');
          app.classList.add('hidden');
          if (loginError) loginError.textContent = 'アクセス権限がありません。管理者にお問い合わせください。';
          await auth.signOut();
          return;
        }

        const userData = snap.docs[0].data();
        console.log('User data loaded:', userData.name);
        // USER_LISTにある漢字の名前等に書き換える
        userNameEl.textContent = userData.name || user.displayName || '';
        memberUserName = userData.name || user.displayName || '';
        memberUserGroup = userData.group || '';

        const statusArr = Array.isArray(userData.status) ? userData.status : [];
        const statusUp = statusArr.map(v => String(v || '').toUpperCase().trim());
        isAdmin = statusUp.includes('WEB');
        isAnnaigakari = statusUp.includes('AT');
        isElder = statusUp.includes('EL');
        isPortalAdmin = statusUp.includes('ADMIN');

        const adminMenu = document.getElementById('menu-admin');
        if (adminMenu) adminMenu.classList.toggle('hidden', !isAdmin);
        const portalAdminSection = document.getElementById('admin-portal-section');
        if (portalAdminSection) portalAdminSection.classList.toggle('hidden', !isPortalAdmin);
        // サーバー時刻オフセットを取得（セッションに1回）
        try {
          const uid = user.uid;
          const ref = db.collection('_serverTime').doc(uid);
          await ref.set({ t: firebase.firestore.FieldValue.serverTimestamp() });
          const tDoc = await ref.get();
          const serverNow = tDoc.data().t.toDate();
          serverTimeOffset = serverNow.getTime() - Date.now();
          ref.delete();
        } catch (e2) { console.warn('Server time sync failed:', e2); }

        // ログイン履歴を記録
        try {
          await db.collection('LOGIN_LOG').add({
            email: user.email || '',
            name: memberUserName || user.displayName || '',
            uid: user.uid,
            loginAt: firebase.firestore.FieldValue.serverTimestamp(),
            userAgent: navigator.userAgent || ''
          });
        } catch (e3) { console.warn('Login log failed:', e3); }

      } catch (e) {
        console.error('Auth Check Error:', e);
      }
    } else {
      currentUser = null;
      isAdmin = false;
      isAnnaigakari = false;
      isElder = false;
      isPortalAdmin = false;
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
    const assignSubs = ['admin-assignment-history','admin-assignment-week'];
    const programSubs = ['admin-schedule-editor'];
    if (assignSubs.includes(page)) {
      backBtn._backTarget = 'admin-assignment';
    } else if (programSubs.includes(page)) {
      backBtn._backTarget = 'admin-program';
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
  if (page === 'admin-program')              initProgramPage();
  if (page === 'admin-assignment')           initAssignmentPage();
  if (page === 'admin-assignment-history')   initHistoryPage();
  if (page === 'admin-s89')                 initS89Page();
  if (page === 'admin-members')            initMembersPage();
  if (page === 'admin-attendance')         loadAdminAttendance();
  if (page === 'admin-attendance-monthly') initAttendanceMonthly();
  if (page === 'admin-s13')                loadAdminS13Table();
  if (page === 'admin-reports')            loadAdminReports();
  if (page === 'admin-report-card')        loadAdminReportCard();
  if (page === 'admin-report-check')       loadAdminReportCheck();
  if (page === 'admin-report-approve')     loadAdminReportApprove();
  if (page === 'admin-field-service')      loadAdminFieldService();
  if (page === 'senkyo-field')             loadUserFieldService();
  if (page === 'admin-org')                loadOrgEditor();
  if (page === 'admin-access-log')         loadAccessLog();
  if (page === 'attendance-form')          initAttendanceForm();

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

document.getElementById('admin-manage-group-members')?.addEventListener('click', () => {
  navigate('admin-group-members');
  loadGroupMembers();
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

document.getElementById('admin-manage-field-service')?.addEventListener('click', () => {
  navigate('admin-field-service');
});

document.getElementById('admin-manage-attendance')?.addEventListener('click', () => {
  openAttendanceModal(null);
});

document.getElementById('admin-manage-attendance-monthly')?.addEventListener('click', () => {
  navigate('admin-attendance-monthly');
});

document.getElementById('admin-manage-access-log')?.addEventListener('click', () => {
  navigate('admin-access-log');
});

// メニューのクリック（data-page属性があるもののみ）
document.querySelectorAll('[data-page]').forEach(item => {
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

// ── 発表管理 週次ダッシュボード ─────────────────

function _getThursday(d) {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const diff = (4 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function _dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let annCurrentThursday = _getThursday(new Date());
let annCurrentWeekDocs = [];

function _updateAnnWeekLabel() {
  const thu = annCurrentThursday;
  document.getElementById('ann-week-label').textContent =
    `${thu.getFullYear()}年${thu.getMonth()+1}月${thu.getDate()}日（木）`;
  const isNow = _dateKey(thu) === _dateKey(_getThursday(new Date()));
  document.getElementById('ann-today-btn').classList.toggle('hidden', isNow);
}

async function loadAdminAnnouncements() {
  _updateAnnWeekLabel();
  const weekList = document.getElementById('ann-week-list');
  weekList.innerHTML = '<div class="loading">読み込み中...</div>';

  const start = new Date(annCurrentThursday); start.setHours(0, 0, 0, 0);
  const end   = new Date(annCurrentThursday); end.setHours(23, 59, 59, 999);

  try {
    const snap = await db.collection('ANNOUNCEMENT')
      .where('date', '>=', firebase.firestore.Timestamp.fromDate(start))
      .where('date', '<=', firebase.firestore.Timestamp.fromDate(end))
      .get();

    annCurrentWeekDocs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        (a.order ?? 9999) - (b.order ?? 9999) ||
        (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));

    renderAnnWeekList();
  } catch (e) {
    weekList.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}

function renderAnnWeekList() {
  const weekList = document.getElementById('ann-week-list');
  if (annCurrentWeekDocs.length === 0) {
    weekList.innerHTML = '<div class="ann-empty"><span class="material-icons">inbox</span><span>この週の発表はありません</span></div>';
    return;
  }
  const total = annCurrentWeekDocs.length;
  let html = '';
  annCurrentWeekDocs.forEach((item, idx) => {
    const links = (item.links || []).filter(l => l.title && l.url);
    const preview = (item.body || '').trim();
    html += `
      <div class="ann-item-card">
        <div class="ann-item-order">
          <button class="ann-order-btn" onclick="annMoveUp(${idx})" ${idx === 0 ? 'disabled' : ''}>
            <span class="material-icons">arrow_upward</span>
          </button>
          <span class="ann-order-num">${idx + 1}</span>
          <button class="ann-order-btn" onclick="annMoveDown(${idx})" ${idx === total - 1 ? 'disabled' : ''}>
            <span class="material-icons">arrow_downward</span>
          </button>
        </div>
        <div class="ann-item-body">
          <div class="ann-item-title">
            ${item.type && item.type !== 'general' ? `<span class="af-type-badge af-type-${esc(item.type)}">${esc({'ann-notice':'発表と確認事項','announcement':'発表と確認事項','notice':'確認事項','pioneer':'補助開拓','accounting':'会計報告','circuit':'巡回監督','circuit-assembly':'巡回大会','district-convention':'地区大会'}[item.type]||item.type)}</span>` : ''}
            ${esc(item.title || '（タイトルなし）')}
          </div>
          ${preview ? `<div class="ann-item-preview">${esc(preview.length > 60 ? preview.slice(0,60)+'…' : preview)}</div>` : ''}
          <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap">
            ${links.length > 0 ? `<div class="ann-link-badge"><span class="material-icons">link</span>${links.length}</div>` : ''}
            ${item.publishNow ? `<div class="ann-publish-now-badge"><span class="material-icons">flash_on</span>即時公開</div>` : ''}
          </div>
        </div>
        <div class="ann-item-actions">
          <button class="icon-btn" style="color:var(--primary)" onclick="openAnnounceModal('${esc(item.id)}')">
            <span class="material-icons">edit</span>
          </button>
          <button class="icon-btn" style="color:#d32f2f" onclick="openDeleteModal('${esc(item.id)}','announce')">
            <span class="material-icons">delete</span>
          </button>
        </div>
      </div>`;
  });
  weekList.innerHTML = html;
}

async function annMoveUp(idx) {
  if (idx === 0) return;
  [annCurrentWeekDocs[idx-1], annCurrentWeekDocs[idx]] = [annCurrentWeekDocs[idx], annCurrentWeekDocs[idx-1]];
  renderAnnWeekList();
  await _annSaveOrder();
}
async function annMoveDown(idx) {
  if (idx >= annCurrentWeekDocs.length - 1) return;
  [annCurrentWeekDocs[idx], annCurrentWeekDocs[idx+1]] = [annCurrentWeekDocs[idx+1], annCurrentWeekDocs[idx]];
  renderAnnWeekList();
  await _annSaveOrder();
}
async function _annSaveOrder() {
  const batch = db.batch();
  annCurrentWeekDocs.forEach((item, idx) => {
    item.order = idx;
    batch.update(db.collection('ANNOUNCEMENT').doc(item.id), { order: idx });
  });
  await batch.commit();
}

document.getElementById('ann-prev-week')?.addEventListener('click', () => {
  annCurrentThursday = new Date(annCurrentThursday);
  annCurrentThursday.setDate(annCurrentThursday.getDate() - 7);
  loadAdminAnnouncements();
});
document.getElementById('ann-next-week')?.addEventListener('click', () => {
  annCurrentThursday = new Date(annCurrentThursday);
  annCurrentThursday.setDate(annCurrentThursday.getDate() + 7);
  loadAdminAnnouncements();
});
document.getElementById('ann-today-btn')?.addEventListener('click', () => {
  annCurrentThursday = _getThursday(new Date());
  loadAdminAnnouncements();
});

// ── 週/全表示 切替 ────────────────────────────
let annViewMode = 'week'; // 'week' | 'all'

document.getElementById('ann-toggle-week')?.addEventListener('click', () => _setAnnView('week'));
document.getElementById('ann-toggle-all')?.addEventListener('click',  () => _setAnnView('all'));

function _setAnnView(mode) {
  annViewMode = mode;
  document.getElementById('ann-view-week').classList.toggle('hidden', mode !== 'week');
  document.getElementById('ann-view-all').classList.toggle('hidden',  mode !== 'all');
  document.getElementById('ann-toggle-week').classList.toggle('active', mode === 'week');
  document.getElementById('ann-toggle-all').classList.toggle('active',  mode === 'all');
  if (mode === 'all') loadAnnAllList();
}

async function loadAnnAllList() {
  const container = document.getElementById('ann-all-list');
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('ANNOUNCEMENT').orderBy('date', 'desc').limit(200).get();
    if (snap.empty) { container.innerHTML = '<div class="ann-empty"><span class="material-icons">inbox</span><span>発表データがありません</span></div>'; return; }

    // 日付ごとにグループ化
    const dateGroups = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const dt = data.date?.toDate ? data.date.toDate() : new Date(data.date);
      const key = `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${WD[dt.getDay()]}）`;
      if (!dateGroups[key]) dateGroups[key] = [];
      dateGroups[key].push({ id: d.id, ...data, _dt: dt });
    });

    let html = '';
    Object.keys(dateGroups).forEach(dateKey => {
      html += `<div class="ann-all-date-group">
        <div class="ann-all-date-label">${esc(dateKey)}</div>`;
      dateGroups[dateKey]
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .forEach(item => {
          const typeBadge = item.type && item.type !== 'general'
            ? `<span class="af-type-badge af-type-${esc(item.type)}">${esc({'ann-notice':'発表と確認事項','announcement':'発表と確認事項','notice':'確認事項','pioneer':'補助開拓','accounting':'会計報告','circuit':'巡回監督','circuit-assembly':'巡回大会','district-convention':'地区大会'}[item.type]||item.type)}</span>`
            : '';
          const publishBadge = item.publishNow ? `<span class="ann-publish-now-badge"><span class="material-icons">flash_on</span>即時</span>` : '';
          html += `<div class="ann-item-card" data-id="${esc(item.id)}">
            <div class="ann-item-body">
              <div class="ann-item-title">${typeBadge}${esc(item.title||'（タイトルなし）')}</div>
              ${(item.body||'').trim() ? `<div class="ann-item-preview">${esc((item.body||'').trim().length>60?(item.body||'').trim().slice(0,60)+'…':(item.body||'').trim())}</div>` : ''}
              <div style="display:flex;gap:6px;margin-top:4px">${publishBadge}</div>
            </div>
            <div class="ann-item-actions">
              <button class="icon-btn" style="color:var(--primary)" onclick="openAnnounceModal('${esc(item.id)}')">
                <span class="material-icons">edit</span>
              </button>
              <button class="icon-btn" style="color:#d32f2f" onclick="openDeleteModal('${esc(item.id)}','announce')">
                <span class="material-icons">delete</span>
              </button>
            </div>
          </div>`;
        });
      html += `</div>`;
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}

const WD = ['日','月','火','水','木','金','土'];

// 日付から次の集会日（木曜）の20:40を返す
function getNextMeetingRelease(date) {
  const d = new Date(date);
  const dow = d.getDay(); // 0=日 ... 4=木
  let daysUntilThu = (4 - dow + 7) % 7;
  if (daysUntilThu === 0) {
    // 書き込みが木曜日の場合、20:40前なら当日、20:40以降なら翌週木曜
    const thuCutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 40);
    if (d >= thuCutoff) daysUntilThu = 7;
  }
  const thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilThu, 20, 40);
  return thu;
}

function renderAnnouncements(docs) {
  const list = document.getElementById('announce-list');
  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">article</span>発表はありません</div>';
    return;
  }
  list.innerHTML = '';

  const now = new Date(Date.now() + serverTimeOffset);
  // 長老 or 即時公開フラグがあれば表示、それ以外は木曜20:40以降
  const visibleDocs = docs.filter(docSnap => {
    const d = docSnap.data();
    if (isElder || d.publishNow) return true;
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    return now >= getNextMeetingRelease(date);
  });

  if (visibleDocs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">article</span>発表はありません</div>';
    return;
  }

  // 日付でグループ化
  const groups = {};
  visibleDocs.forEach(docSnap => {
    const d = docSnap.data();
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const dateKey = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日（${WD[date.getDay()]}）`;
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push({ id: docSnap.id, ...d });
  });

  const TYPE_LABEL_MAP = {
    'ann-notice':'発表と確認事項','announcement':'発表と確認事項','notice':'確認事項',
    'pioneer':'補助開拓','accounting':'会計報告','circuit':'巡回監督訪問',
    'circuit-assembly':'巡回大会','district-convention':'地区大会'
  };

  Object.keys(groups).forEach(dateKey => {
    const items = groups[dateKey];
    // 全アイテムの種別が同一かチェック → カードヘッダー色に使う
    const firstType = items[0]?.type || 'general';
    const singleType = items.every(it => (it.type || 'general') === firstType) ? firstType : 'general';
    const typeLabel = singleType !== 'general' ? (TYPE_LABEL_MAP[singleType] || '') : '';

    const groupDiv = document.createElement('div');
    groupDiv.className = `announce-group atype-${singleType}`;

    let itemsHtml = '';
    items.forEach(item => {
      const links = item.links || [];
      if (item.link1_title && item.link1_url) links.push({ title: item.link1_title, url: item.link1_url });
      if (item.link2_title && item.link2_url) links.push({ title: item.link2_title, url: item.link2_url });

      // 補助開拓奉仕者はグループ別テーブル表示
      let bodyHtml = '';
      if (item.type === 'pioneer' && Array.isArray(item.members) && item.members.length > 0) {
        const grpMap = {};
        item.members.forEach(m => {
          const g = m.group || '未分類';
          if (!grpMap[g]) grpMap[g] = [];
          grpMap[g].push(m.name);
        });
        bodyHtml = '<div class="pioneer-group-table">';
        Object.keys(grpMap).sort((a,b) => a.localeCompare(b,'ja')).forEach(g => {
          bodyHtml += `<div class="pioneer-group-row">
            <div class="pioneer-group-label">${esc(g)}</div>
            <div class="pioneer-group-names">${grpMap[g].map(n => esc(n)).join('　')}</div>
          </div>`;
        });
        bodyHtml += '</div>';
        const note = (item.body || '').replace(item.members.map(m=>m.name).join('、'), '').replace(/^[、\n]+/, '').trim();
        if (note) bodyHtml += `<div class="announce-item-body" style="margin-top:6px">${esc(note).replace(/\n/g,'<br>')}</div>`;
      } else if (item.body) {
        bodyHtml = `<div class="announce-item-body">${item.body.replace(/\n/g, '<br>')}</div>`;
      }

      // 複数種別混在のときだけ各アイテムにバッジ表示
      const itemType = item.type || 'general';
      const showBadge = singleType === 'general' && itemType !== 'general';
      const badgeHtml = showBadge
        ? `<span class="af-type-badge af-type-${esc(itemType)}" style="margin-bottom:6px;display:inline-block">${esc(TYPE_LABEL_MAP[itemType]||itemType)}</span>`
        : '';

      itemsHtml += `
        <div class="announce-item">
          ${badgeHtml}
          ${item.title ? `<div class="announce-item-title">${esc(item.title)}</div>` : ''}
          ${bodyHtml}
          ${links.length ? `<div class="announce-item-links">
            ${links.map(l => `<a class="announce-item-link" href="${esc(l.url)}" target="_blank" rel="noopener">
              <span class="material-icons">open_in_new</span>${esc(l.title)}</a>`).join('')}
          </div>` : ''}
        </div>
      `;
    });

    groupDiv.innerHTML = `
      <div class="announce-group-date">
        <span class="announce-group-date-label">${esc(dateKey)}</span>
        ${typeLabel ? `<span class="announce-group-type-badge">${esc(typeLabel)}</span>` : ''}
      </div>
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
document.getElementById('admin-add-announce-btn')?.addEventListener('click', () => openAnnounceModal(null));
document.getElementById('announce-modal-close')?.addEventListener('click', closeAnnounceModal);
document.getElementById('announce-overlay')?.addEventListener('click', closeAnnounceModal);
document.getElementById('af-cancel')?.addEventListener('click', closeAnnounceModal);

addLinkBtn.addEventListener('click', () => addLinkInput('', ''));


document.getElementById('af-type')?.addEventListener('change', function() {
  _afTypeChanged(this.value);
});

document.getElementById('af-convention-venue')?.addEventListener('change', function() {
  document.getElementById('af-convention-other-row').classList.toggle('hidden', this.value !== 'other');
});

document.getElementById('af-pm-venue')?.addEventListener('change', function() {
  document.getElementById('af-pm-other-row').classList.toggle('hidden', this.value !== 'other');
});

// ── 種別切替 ────────────────────────────────────
const GENERAL_TYPES = ['general', 'announcement', 'notice', 'ann-notice', 'accounting'];
const MONTH_TYPES = new Set(['ann-notice', 'accounting']);

function _afTypeChanged(type) {
  const isConvention = type === 'circuit-assembly' || type === 'district-convention';
  const isDistrict   = type === 'district-convention';
  const isMonthType  = MONTH_TYPES.has(type);
  document.getElementById('af-section-general').classList.toggle('hidden', !GENERAL_TYPES.includes(type));
  const monthRow = document.getElementById('af-month-row');
  if (monthRow) {
    monthRow.classList.toggle('hidden', !isMonthType);
    const monthSel = document.getElementById('af-month');
    if (isMonthType && monthSel && !monthSel.dataset.built) {
      monthSel.innerHTML = _buildMonthOptions('');
      monthSel.dataset.built = '1';
    }
  }
  document.getElementById('af-section-member-pick').classList.toggle('hidden', type !== 'pioneer');
  document.getElementById('af-section-circuit').classList.toggle('hidden', type !== 'circuit');
  document.getElementById('af-section-convention').classList.toggle('hidden', !isConvention);
  document.getElementById('af-convention-venue-top').classList.toggle('hidden', !isConvention);
  // 地区大会のみ日付2・3を表示
  document.getElementById('af-convention-days-row').classList.toggle('hidden', !isDistrict);
  // 巡回大会のみ開拓者集まりセクションを表示
  const pmSection = document.getElementById('af-pioneer-meeting-section');
  if (pmSection) {
    pmSection.classList.toggle('hidden', type !== 'circuit-assembly');
    if (type !== 'circuit-assembly') {
      document.getElementById('af-pioneer-meeting-enabled').checked = false;
      document.getElementById('af-pioneer-meeting-fields').classList.add('hidden');
    }
  }
  // 日付ラベルを切替
  const dateLabel = document.getElementById('af-date-label');
  if (dateLabel) dateLabel.textContent = isDistrict ? '日付 1' : '日付';
  // 成員ピッカーをロード
  if (type === 'pioneer') _renderMemberPicker();
  // 巡回監督名セレクトを初期化
  if (type === 'circuit') {
    const sel = document.getElementById('af-circuit-name-select');
    if (sel) { sel.value = '井出佳範 兄弟'; onCircuitNameSelectChange(sel.value); }
  }
}

document.getElementById('af-pioneer-meeting-enabled')?.addEventListener('change', function() {
  document.getElementById('af-pioneer-meeting-fields').classList.toggle('hidden', !this.checked);
});

// 地区大会：日付1変更で日付2・3を自動入力
document.getElementById('af-date')?.addEventListener('change', function() {
  if (document.getElementById('af-type')?.value !== 'district-convention') return;
  if (!this.value) return;
  const d1 = new Date(this.value + 'T12:00:00');
  const d2 = new Date(d1); d2.setDate(d2.getDate() + 1);
  const d3 = new Date(d1); d3.setDate(d3.getDate() + 2);
  const fmt = d => d.toISOString().split('T')[0];
  document.getElementById('af-convention-day2').value = fmt(d2);
  document.getElementById('af-convention-day3').value = fmt(d3);
});

// ── 成員ピッカー ────────────────────────────────
let _cachedUserList = null;

async function _renderMemberPicker() {
  const container = document.getElementById('af-member-picker');
  if (!container) return;

  // 既にチェック済みの状態を保持しながら再描画しないよう初回のみ描画
  if (container.dataset.loaded === '1') return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    if (!_cachedUserList) {
      const snap = await db.collection('USER_LIST').orderBy('name').get();
      _cachedUserList = snap.docs
        .map(d => d.data())
        .filter(d => d.name)
        .sort((a, b) => {
          const ga = a.group || 'zzz', gb = b.group || 'zzz';
          if (ga !== gb) return ga.localeCompare(gb, 'ja');
          return a.name.localeCompare(b.name, 'ja');
        });
    }

    const members = _cachedUserList
      .filter(m => !isPioneer(m))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    let html = '';
    members.forEach(m => {
      html += `<label class="af-member-check af-member-check-row">
        <input type="checkbox" value="${esc(m.name)}">
        <span class="af-member-check-name">${esc(m.name)}</span>
        <span class="af-member-check-group">${esc(m.group || '')}</span>
      </label>`;
    });

    container.innerHTML = html;
    container.dataset.loaded = '1';
  } catch (e) {
    container.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}

const LINK_TITLE_PRESETS   = ['会計報告', '寄付受領書', 'お知らせ', '発表と確認事項'];
const LINK_TITLE_MONTH_SET = new Set(['発表と確認事項']);

function _buildMonthOptions(selected = '') {
  const now = new Date();
  let html = '<option value="">月を選択</option>';
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    html += `<option value="${label}"${selected === label ? ' selected' : ''}>${label}</option>`;
  }
  return html;
}

function addLinkInput(title = '', url = '') {
  // タイトルが「発表 2026年5月」のような形式か判定
  const monthMatch = title.match(/^(発表と確認事項)\s+(.+)$/);
  let selectVal, customVal, monthVal;
  if (monthMatch) {
    selectVal = monthMatch[1]; monthVal = monthMatch[2]; customVal = '';
  } else {
    selectVal = LINK_TITLE_PRESETS.includes(title) ? title : 'other';
    monthVal  = '';
    customVal = selectVal === 'other' ? title : '';
  }

  const showMonth  = LINK_TITLE_MONTH_SET.has(selectVal);
  const showCustom = selectVal === 'other';

  const row = document.createElement('div');
  row.className = 'link-input-row';

  // select要素を先に作成（value比較を安全にするためescを使わない）
  const titleSelect = document.createElement('select');
  titleSelect.className = 'link-title-select';
  titleSelect.innerHTML = `<option value="other">その他</option>` +
    LINK_TITLE_PRESETS.map(p => `<option value="${p}">${p}</option>`).join('');
  titleSelect.value = selectVal;

  const monthSelect = document.createElement('select');
  monthSelect.className = 'link-title-month';
  monthSelect.innerHTML = _buildMonthOptions(monthVal);
  monthSelect.style.display = showMonth ? '' : 'none';

  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.className = 'link-title-custom';
  customInput.placeholder = 'タイトルを入力';
  customInput.value = customVal;
  customInput.style.display = showCustom ? '' : 'none';

  titleSelect.addEventListener('change', function() {
    const isMonth  = LINK_TITLE_MONTH_SET.has(this.value);
    const isOther  = this.value === 'other';
    monthSelect.style.display  = isMonth  ? '' : 'none';
    customInput.style.display  = isOther  ? '' : 'none';
    if (!isMonth) monthSelect.value = '';
    if (!isOther) customInput.value = '';
  });

  const titleRow = document.createElement('div');
  titleRow.className = 'link-title-row';
  titleRow.append(titleSelect, monthSelect, customInput);

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'link-url';
  urlInput.placeholder = 'URL (https://...)';
  urlInput.value = url;

  const fields = document.createElement('div');
  fields.className = 'link-input-fields';
  fields.append(titleRow, urlInput);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-link';
  removeBtn.innerHTML = '<span class="material-icons">delete</span>';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(fields, removeBtn);
  linksContainer.appendChild(row);
}

function openAnnounceModal(id) {
  editingAnnounceId = id;
  document.getElementById('announce-modal-title').textContent = id ? '発表を編集' : '発表を追加';
  linksContainer.innerHTML = '';

  // ピッカーの再ロードフラグをリセット
  const picker = document.getElementById('af-member-picker');
  if (picker) { picker.dataset.loaded = ''; picker.innerHTML = ''; }

  document.getElementById('af-type-row').classList.remove('hidden');

  if (!id) {
    // ── 新規
    announceForm.reset();
    const defaultDate = currentPage === 'admin-announcements'
      ? _dateKey(annCurrentThursday)
      : new Date().toISOString().split('T')[0];
    document.getElementById('af-date').value = defaultDate;
    document.getElementById('af-type').value = 'general';

    document.getElementById('af-convention-venue').value = '';
    document.getElementById('af-convention-other-row').classList.add('hidden');
    document.getElementById('af-convention-venue-top').classList.add('hidden');
    document.getElementById('af-convention-day2').value = '';
    document.getElementById('af-convention-day3').value = '';
    document.getElementById('af-date-label').textContent = '日付';
    document.getElementById('af-pioneer-meeting-enabled').checked = false;
    document.getElementById('af-pioneer-meeting-fields').classList.add('hidden');
    document.getElementById('af-pm-venue').value = '';
    document.getElementById('af-pm-other-row').classList.add('hidden');
    const monthSel = document.getElementById('af-month');
    if (monthSel) { monthSel.innerHTML = _buildMonthOptions(''); monthSel.dataset.built = '1'; }
    _afTypeChanged('general');
    addLinkInput('', '');
  } else {
    // ── 編集：rawデータで全フィールド復元
    db.collection('ANNOUNCEMENT').doc(id).get().then(async snap => {
      const d = snap.data();
      const r = d.raw || {};
      // rawがない旧データはタイトルから種別を逆引き
      const titleTypeMap = {
        '巡回監督訪問': 'circuit',
        '補助開拓奉仕者': 'pioneer',
        '会計報告': 'accounting',
        '巡回大会': 'circuit-assembly',
        '地区大会': 'district-convention',
      };
      let type = r.type || d.type || 'general';
      if (type === 'general' && titleTypeMap[d.title]) type = titleTypeMap[d.title];
      const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);

      // 種別セット＆フォーム切替
      const typeEl = document.getElementById('af-type');
      if (typeEl) typeEl.value = type;
      _afTypeChanged(type);

      // 共通
      document.getElementById('af-date').value = date.toISOString().split('T')[0];
      const pnEl = document.getElementById('af-publish-now');
      if (pnEl) pnEl.checked = !!d.publishNow;

      // 月選択の復元
      if (MONTH_TYPES.has(type) && r.month) {
        const monthSel = document.getElementById('af-month');
        if (monthSel) { monthSel.innerHTML = _buildMonthOptions(r.month); monthSel.dataset.built = '1'; }
      }

      // 種別ごと
      if (GENERAL_TYPES.includes(type)) {
        document.getElementById('af-title').value = r.title ?? d.title ?? '';
        document.getElementById('af-body').value  = r.body  ?? d.body  ?? '';

      } else if (type === 'pioneer') {
        await _renderMemberPicker();
        const savedNames = (d.members || []).map(m => m.name);
        document.querySelectorAll('#af-member-picker input[type=checkbox]').forEach(cb => {
          cb.checked = savedNames.includes(cb.value);
        });
        document.getElementById('af-pioneer-note').value = r.pioneerNote || '';

      } else if (type === 'circuit') {
        const sel = document.getElementById('af-circuit-name-select');
        if (sel) {
          // rawがない旧データはbody1行目から推定
          const bodyLines = (d.body || '').split('\n');
          const firstLine = bodyLines[0] || '';
          const overseerSelect = r.overseerSelect ||
            (firstLine === '代理巡回監督' ? '代理巡回監督' :
             firstLine === '井出佳範 兄弟' ? '井出佳範 兄弟' :
             firstLine ? '代理巡回監督' : '井出佳範 兄弟');
          sel.value = overseerSelect;
          onCircuitNameSelectChange(sel.value);
          if (sel.value === '代理巡回監督') {
            // rawあり→raw値、rawなし→bodyのうち代理以外の行
            const customName = r.overseerCustom ||
              (firstLine === '代理巡回監督' ? (bodyLines[1] && !/月.*日/.test(bodyLines[1]) ? bodyLines[1] : '') : firstLine);
            document.getElementById('af-circuit-name-custom').value = customName;
          }
        }
        document.getElementById('af-circuit-start').value = r.circuitStart || '';
        document.getElementById('af-circuit-end').value   = r.circuitEnd   || '';
        document.getElementById('af-circuit-note').value  = r.circuitNote  || '';

      } else if (type === 'circuit-assembly' || type === 'district-convention') {
        const venueEl = document.getElementById('af-convention-venue');
        if (venueEl) {
          venueEl.value = r.venue || '';
          const otherRow = document.getElementById('af-convention-other-row');
          if (r.venue === 'other') {
            otherRow?.classList.remove('hidden');
            document.getElementById('af-convention-location').value = r.venueLocation || '';
            document.getElementById('af-convention-address').value  = r.venueAddress  || '';
          } else {
            otherRow?.classList.add('hidden');
          }
        }
        document.getElementById('af-convention-note').value = r.conventionNote || '';
        if (type === 'district-convention') {
          document.getElementById('af-convention-day2').value = r.conventionDay2 || '';
          document.getElementById('af-convention-day3').value = r.conventionDay3 || '';
        }
        if (type === 'circuit-assembly' && r.pmEnabled) {
          const pmEl = document.getElementById('af-pioneer-meeting-enabled');
          if (pmEl) { pmEl.checked = true; document.getElementById('af-pioneer-meeting-fields').classList.remove('hidden'); }
          document.getElementById('af-pm-date').value = r.pmDate || '';
          document.getElementById('af-pm-time').value = r.pmTime || '';
          const pmVenueEl = document.getElementById('af-pm-venue');
          if (pmVenueEl) {
            pmVenueEl.value = r.pmVenue || '';
            const pmOtherRow = document.getElementById('af-pm-other-row');
            if (r.pmVenue === 'other') {
              pmOtherRow?.classList.remove('hidden');
              document.getElementById('af-pm-location').value = r.pmVenueLocation || '';
              document.getElementById('af-pm-address').value  = r.pmVenueAddress  || '';
            } else {
              pmOtherRow?.classList.add('hidden');
            }
          }
          document.getElementById('af-pm-note').value = r.pmNote || '';
        }
      }

      // リンク
      const links = d.links || [];
      if (d.link1_title && d.link1_url) links.push({ title: d.link1_title, url: d.link1_url });
      if (d.link2_title && d.link2_url) links.push({ title: d.link2_title, url: d.link2_url });
      if (links.length > 0) links.forEach(l => addLinkInput(l.title, l.url));
      else addLinkInput('', '');

      // Google Form
    });
  }
  announceModal.classList.remove('hidden');
}

function closeAnnounceModal() {
  announceModal.classList.add('hidden');
  editingAnnounceId = null;
}

function onCircuitNameSelectChange(val) {
  const custom = document.getElementById('af-circuit-name-custom');
  if (!custom) return;
  custom.style.display = val === '代理巡回監督' ? '' : 'none';
  if (val !== '代理巡回監督') custom.value = '';
}

announceForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const baseDate = new Date(document.getElementById('af-date').value + 'T12:00:00');
  const type = document.getElementById('af-type')?.value || 'general';

  let finalTitle = '', finalBody = '', finalLinks = [];
  const baseDataExtra = {}; // 種別ごとの追加フィールド
  const raw = { type }; // 編集時の復元用生データ

  if (GENERAL_TYPES.includes(type)) {
    // 一般発表 / 発表 / 確認事項 / 会計報告
    const selectedMonth = MONTH_TYPES.has(type) ? (document.getElementById('af-month')?.value || '') : '';
    if (MONTH_TYPES.has(type) && !selectedMonth) {
      alert('対象月を選択してください。');
      return;
    }
    finalTitle = document.getElementById('af-title').value.trim();
    if (!finalTitle && !MONTH_TYPES.has(type)) {
      document.getElementById('af-title').focus();
      alert('タイトルを入力してください。');
      return;
    }
    if (MONTH_TYPES.has(type)) {
      const typeLabel = type === 'accounting' ? '会計報告' : '発表と確認事項';
      finalTitle = finalTitle ? `${typeLabel} ${selectedMonth} ${finalTitle}` : `${typeLabel} ${selectedMonth}`;
      raw.month = selectedMonth;
    }
    finalBody  = document.getElementById('af-body').value.trim();
    raw.title = document.getElementById('af-title').value.trim(); raw.body = finalBody;

  } else if (type === 'pioneer') {
    // 補助開拓奉仕者
    const checked = [...document.querySelectorAll('#af-member-picker input:checked')]
      .map(cb => cb.value);
    if (checked.length === 0) { alert('成員を1人以上選択してください。'); return; }
    const note = document.getElementById('af-pioneer-note').value.trim();
    finalTitle = '補助開拓奉仕者';
    finalBody  = checked.join('、') + (note ? '\n' + note : '');
    baseDataExtra.members = checked.map(name => {
      const m = (_cachedUserList || []).find(u => u.name === name);
      return { name, group: m?.group || '' };
    });
    raw.pioneerNote = note;

  } else if (type === 'circuit') {
    // 巡回監督訪問
    const sel  = document.getElementById('af-circuit-name-select');
    const customName = document.getElementById('af-circuit-name-custom').value.trim();
    const name = sel?.value === '代理巡回監督'
      ? ('代理巡回監督' + (customName ? '\n' + customName : ''))
      : (sel?.value || '');
    const start = document.getElementById('af-circuit-start').value;
    const end   = document.getElementById('af-circuit-end').value;
    const note  = document.getElementById('af-circuit-note').value.trim();
    const fmt = d => { const dt = new Date(d+'T12:00:00'); return `${dt.getMonth()+1}月${dt.getDate()}日（${WD[dt.getDay()]}）`; };
    finalTitle = '巡回監督訪問';
    finalBody  = name ? name + '\n' : '';
    if (start && end) finalBody += `${fmt(start)} 〜 ${fmt(end)}`;
    else if (start)   finalBody += fmt(start);
    if (note) finalBody += '\n' + note;
    raw.overseerSelect = sel?.value || ''; raw.overseerCustom = customName;
    raw.circuitStart = start; raw.circuitEnd = end; raw.circuitNote = note;

  } else if (type === 'circuit-assembly' || type === 'district-convention') {
    // 巡回大会 / 地区大会
    const venue   = document.getElementById('af-convention-venue').value;
    const locName = venue === 'other' ? document.getElementById('af-convention-location').value.trim() : venue;
    const address = venue === 'other' ? document.getElementById('af-convention-address').value.trim() : '';
    const note    = document.getElementById('af-convention-note').value.trim();
    const fmt = d => { const dt = new Date(d+'T12:00:00'); return `${dt.getMonth()+1}月${dt.getDate()}日（${WD[dt.getDay()]}）`; };
    finalTitle = type === 'circuit-assembly' ? '巡回大会' : '地区大会';
    raw.venue = venue; raw.venueLocation = locName; raw.venueAddress = address; raw.conventionNote = note;

    if (type === 'circuit-assembly') {
      finalBody = fmt(document.getElementById('af-date').value);
      if (document.getElementById('af-pioneer-meeting-enabled')?.checked) {
        const pmDate    = document.getElementById('af-pm-date').value;
        const pmTime    = document.getElementById('af-pm-time').value;
        const pmVenue   = document.getElementById('af-pm-venue').value;
        const pmLocName = pmVenue === 'other' ? document.getElementById('af-pm-location').value.trim() : pmVenue;
        const pmAddress = pmVenue === 'other' ? document.getElementById('af-pm-address').value.trim() : '';
        const pmNote    = document.getElementById('af-pm-note').value.trim();
        finalBody += '\n\n【開拓者の集まり】';
        if (pmDate)    finalBody += '\n' + fmt(pmDate);
        if (pmTime)    finalBody += ' ' + pmTime;
        if (pmLocName) finalBody += '\n' + pmLocName;
        if (pmAddress) finalBody += '\n' + pmAddress;
        if (pmNote)    finalBody += '\n' + pmNote;
        raw.pmEnabled = true; raw.pmDate = pmDate; raw.pmTime = pmTime;
        raw.pmVenue = pmVenue; raw.pmVenueLocation = pmLocName; raw.pmVenueAddress = pmAddress; raw.pmNote = pmNote;
      } else {
        raw.pmEnabled = false;
      }
    } else {
      const d1 = document.getElementById('af-date').value;
      const d2 = document.getElementById('af-convention-day2').value;
      const d3 = document.getElementById('af-convention-day3').value;
      finalBody = fmt(d1);
      if (d2) finalBody += ` 〜 ${fmt(d3 || d2)}`;
      raw.conventionDay2 = d2; raw.conventionDay3 = d3;
    }
    if (locName) finalBody += '\n' + locName;
    if (address) finalBody += '\n' + address;
    if (note) finalBody += '\n' + note;
  }

  // リンク収集（全種別共通）
  linksContainer.querySelectorAll('.link-input-row').forEach(row => {
    const sel = row.querySelector('.link-title-select');
    let t;
    if (sel?.value === 'other') {
      t = row.querySelector('.link-title-custom')?.value.trim();
    } else if (LINK_TITLE_MONTH_SET.has(sel?.value)) {
      const month = row.querySelector('.link-title-month')?.value;
      t = month ? `${sel.value} ${month}` : sel.value;
    } else {
      t = sel?.value;
    }
    const u = row.querySelector('.link-url').value.trim();
    if (t && u) finalLinks.push({ title: t, url: u });
  });

  const publishNow = document.getElementById('af-publish-now')?.checked || false;
  const baseData = {
    title: finalTitle, body: finalBody, links: finalLinks, type,
    publishNow,
    raw,
    link1_title: '', link1_url: '', link2_title: '', link2_url: '',
    ...baseDataExtra,
  };

  try {
    if (editingAnnounceId) {
      await db.collection('ANNOUNCEMENT').doc(editingAnnounceId).update({
        ...baseData,
        date: firebase.firestore.Timestamp.fromDate(baseDate),
      });
    } else {
      const createdAt = firebase.firestore.Timestamp.now();
      await db.collection('ANNOUNCEMENT').add({ ...baseData, date: firebase.firestore.Timestamp.fromDate(baseDate), order: 9999, createdAt });
    }

    closeAnnounceModal();
    if (currentPage === 'admin-announcements') {
      if (annViewMode === 'all') loadAnnAllList();
      else loadAdminAnnouncements();
    } else loadAnnouncements();
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
      if (isAnnaigakari || isAdmin) {
        formItems.push({ icon: 'how_to_reg', label: '出席人数登録', page: 'attendance-form' });
      }
      formItems.forEach(fi => {
        const el = document.createElement('div');
        el.className = 'admin-list-row';
        el.style.cursor = 'pointer';
        el.innerHTML = `<span class="material-icons admin-row-icon">${fi.icon}</span><span class="admin-row-label">${fi.label}</span><span class="material-icons admin-row-chevron">chevron_right</span>`;
        el.addEventListener('click', () => navigate(fi.page));
        listEl.appendChild(el);
      });
    }

    if (!snap.empty) {
      snap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const a = document.createElement('a');
        a.className = 'admin-list-row';
        a.href = d.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.innerHTML = `<span class="material-icons admin-row-icon">${esc(d.icon || 'insert_drive_file')}</span><span class="admin-row-label">${esc(d.title)}</span><span class="material-icons admin-row-chevron">open_in_new</span>`;
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
      if (isAnnaigakari || isAdmin) {
        formItems2.push({ icon: 'how_to_reg', label: '出席人数登録', page: 'attendance-form' });
      }
      formItems2.forEach(fi => {
        const el = document.createElement('div');
        el.className = 'admin-list-row';
        el.style.cursor = 'pointer';
        el.innerHTML = `<span class="material-icons admin-row-icon">${fi.icon}</span><span class="admin-row-label">${fi.label}</span><span class="material-icons admin-row-chevron">chevron_right</span>`;
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
  const deletedId = deleteTargetId;
  try {
    await db.collection(col).doc(deletedId).delete();
    closeDeleteModal();
    if (deleteTargetType === 'announce') {
      if (currentPage === 'admin-announcements') {
        if (annViewMode === 'all') {
          // 全表示：該当カードをDOMから即削除（再取得なし）
          const card = document.querySelector(`.ann-item-card[data-id="${deletedId}"]`);
          if (card) {
            const group = card.closest('.ann-all-date-group');
            card.remove();
            // グループ内のカードがなくなったら日付グループごと削除
            if (group && group.querySelectorAll('.ann-item-card').length === 0) group.remove();
          }
        } else {
          loadAdminAnnouncements();
        }
      } else {
        loadAnnouncements();
      }
    } else {
      loadSchedule();
    }
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
});

// ── 成員情報登録 ──────────────────────────────
let currentMemberData = null;
let memberUserName = '';
let memberUserGroup = '';

let currentUserDocId = null;

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
      const doc = snap.docs[0];
      currentUserDocId = doc.id;
      currentMemberData = doc.data();
      memberUserName = currentMemberData.name || currentUser.displayName || '';
      memberUserGroup = currentMemberData.group || '';
    } else {
      currentUserDocId = null;
      currentMemberData = {};
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

  let contacts = [];
  if (Array.isArray(data.emergencyContacts)) contacts = data.emergencyContacts;
  else if (typeof data.emergencyContacts === 'string' && data.emergencyContacts) {
    try { contacts = JSON.parse(data.emergencyContacts) || []; } catch(e) { contacts = []; }
  }
  if (contacts.length === 0) contacts = [{ name: '', phone: '' }];

  const contactsHtml = contacts.map((c, i) => `
    <div class="form-group mf-contact-row" data-idx="${i}">
      <label>緊急連絡先 ${i + 1}</label>
      <input type="text" class="mf-emergency-name" value="${esc(c.name || '')}" placeholder="氏名" style="margin-bottom:6px;">
      <input type="tel" class="mf-emergency-phone" value="${esc(c.phone || '')}" placeholder="電話番号">
    </div>
  `).join('');

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
        <input type="tel" id="mf-phone" value="${esc(data.phone || '')}" placeholder="例: 090-1540-3718" required>
      </div>

      <div class="form-group">
        <label>住所</label>
        <textarea id="mf-address" rows="2" placeholder="例: 別所2-9 エミネンス長池1-307">${esc(data.address || '')}</textarea>
      </div>

      <div class="form-group">
        <label>生年月日</label>
        <input type="date" id="mf-birth-date" value="${esc(data.birthDate || '')}">
      </div>

      <div class="form-group">
        <label>バプテスマの日付</label>
        <input type="date" id="mf-baptism-date" value="${esc(data.baptismDate || '')}">
      </div>

      <div class="section-divider"></div>
      <h3 class="section-title">緊急連絡先</h3>
      <div id="mf-contacts">${contactsHtml}</div>
      <button type="button" id="mf-add-contact" class="btn-secondary" style="margin-top:8px;">
        <span class="material-icons" style="font-size:16px;vertical-align:middle;">add</span> 連絡先を追加
      </button>

      <div style="margin-top:32px;">
        <button type="button" id="mf-submit" class="btn-primary" style="width:100%;">
          <span class="material-icons" style="font-size:18px; vertical-align:middle;">save</span> 保存する
        </button>
      </div>
    </div>
  `;

  document.getElementById('mf-submit').addEventListener('click', submitMemberInfo);
  document.getElementById('mf-add-contact').addEventListener('click', () => {
    const wrap = document.getElementById('mf-contacts');
    const idx = wrap.querySelectorAll('.mf-contact-row').length;
    const div = document.createElement('div');
    div.className = 'form-group mf-contact-row';
    div.dataset.idx = idx;
    div.innerHTML = `<label>緊急連絡先 ${idx + 1}</label>
      <input type="text" class="mf-emergency-name" placeholder="氏名" style="margin-bottom:6px;">
      <input type="tel" class="mf-emergency-phone" placeholder="電話番号">`;
    wrap.appendChild(div);
  });
}

async function submitMemberInfo() {
  const phone = document.getElementById('mf-phone').value.trim();
  if (!phone) {
    alert('携帯電話は必須です');
    return;
  }
  if (!currentUserDocId) {
    alert('ユーザー情報が見つかりません。管理者にお問い合わせください。');
    return;
  }

  const btn = document.getElementById('mf-submit');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="material-icons" style="font-size:18px; vertical-align:middle;">hourglass_empty</span> 保存中...';
  btn.disabled = true;

  try {
    const contacts = [];
    document.querySelectorAll('#mf-contacts .mf-contact-row').forEach(row => {
      const n = row.querySelector('.mf-emergency-name').value.trim();
      const p = row.querySelector('.mf-emergency-phone').value.trim();
      if (n || p) contacts.push({ name: n, phone: p });
    });

    const data = {
      homePhone: document.getElementById('mf-home-phone').value.trim(),
      phone: phone,
      address: document.getElementById('mf-address').value.trim(),
      birthDate: document.getElementById('mf-birth-date').value || '',
      baptismDate: document.getElementById('mf-baptism-date').value || '',
      emergencyContacts: contacts,
    };

    await db.collection('USER_LIST').doc(currentUserDocId).update(data);

    alert('保存しました！');
    currentMemberData = { ...currentMemberData, ...data };
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
    if (!(await customConfirm(msg))) return;

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
      { label: '性別', value: d.gender || '' },
      { label: '生年月日', value: d.birthDate || '' },
      { label: 'バプテスマ日', value: d.baptismDate || '' },
      { label: '携帯電話', value: d.phone || '' },
      { label: '自宅電話', value: d.homePhone || '' },
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
      birthDate: String(d.birthDate || '').trim(),
      baptismDate: String(d.baptismDate || '').trim(),
      status: Array.isArray(d.status) ? d.status : [],
      hope: String(d.hope || '').trim(),
    };

    const year = getServiceYear();
    const years = [year, year - 1];

    const reportSnap = await db.collection('PREACHING_REPORT')
      .where('name', '==', member.name)
      .get();

    const reportMaps = years.map(y => {
      const map = {};
      reportSnap.docs.forEach(doc => {
        const data = doc.data();
        const mo = data.month;
        const yr = data.year || null;
        const ts = data.timestamp ? (data.timestamp.seconds || 0) : 0;
        let belongsYear;
        if (mo >= 9) belongsYear = yr || y;
        else belongsYear = (yr ? yr - 1 : null) || y;
        if (belongsYear !== y) return;
        if (!map[mo] || ts > map[mo]._ts) {
          map[mo] = {
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
      return map;
    });

    renderReportCard(member, reportMaps, years, 'jouhou-card-view');
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
    if (!(await customConfirm(msg))) return;

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
      await db.collection('PREACHING_REPORT_DRAFTS').add(reportData);
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
const PW_LOCATIONS = ['唐木田駅', '堀之内駅', '唐木田駅＞堀之内駅', '堀之内駅＞唐木田駅'];
let pwApplySelected = {};  // key → { role, location }

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
        <div class="pwa-options hidden">
          <div class="pwa-section">
            <div class="pwa-section-label">参加立場</div>
            <div class="pwa-roles-list"></div>
          </div>
          <div class="pwa-section">
            <div class="pwa-section-label">参加希望場所</div>
            <div class="pwa-locations-list"></div>
          </div>
        </div>
      `;

      const mainRow = card.querySelector('.pwa-row-main');
      const optionsDiv = card.querySelector('.pwa-options');
      const rolesDiv = card.querySelector('.pwa-roles-list');
      const locsDiv = card.querySelector('.pwa-locations-list');

      PW_ROLES.forEach(role => {
        const label = document.createElement('label');
        label.className = 'pwa-role-label';
        label.innerHTML = `<span class="material-icons pwa-radio">radio_button_unchecked</span><span>${esc(role)}</span>`;
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!pwApplySelected[item.key]) pwApplySelected[item.key] = {};
          pwApplySelected[item.key].role = role;
          rolesDiv.querySelectorAll('.pwa-radio').forEach(ic => {
            ic.textContent = 'radio_button_unchecked';
            ic.style.color = '#999';
          });
          label.querySelector('.pwa-radio').textContent = 'radio_button_checked';
          label.querySelector('.pwa-radio').style.color = 'var(--primary)';
        });
        rolesDiv.appendChild(label);
      });

      PW_LOCATIONS.forEach(loc => {
        const label = document.createElement('label');
        label.className = 'pwa-role-label';
        label.innerHTML = `<span class="material-icons pwa-radio">radio_button_unchecked</span><span>${esc(loc)}</span>`;
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!pwApplySelected[item.key]) pwApplySelected[item.key] = {};
          pwApplySelected[item.key].location = loc;
          locsDiv.querySelectorAll('.pwa-radio').forEach(ic => {
            ic.textContent = 'radio_button_unchecked';
            ic.style.color = '#999';
          });
          label.querySelector('.pwa-radio').textContent = 'radio_button_checked';
          label.querySelector('.pwa-radio').style.color = 'var(--primary)';
        });
        locsDiv.appendChild(label);
      });

      mainRow.addEventListener('click', () => {
        const isSelected = card.classList.contains('pwa-selected');
        if (isSelected) {
          card.classList.remove('pwa-selected');
          optionsDiv.classList.add('hidden');
          card.querySelector('.pwa-check .material-icons').textContent = 'check_circle_outline';
          card.querySelector('.pwa-check .material-icons').style.color = '#999';
          delete pwApplySelected[item.key];
          optionsDiv.querySelectorAll('.pwa-radio').forEach(ic => {
            ic.textContent = 'radio_button_unchecked';
            ic.style.color = '#999';
          });
        } else {
          card.classList.add('pwa-selected');
          optionsDiv.classList.remove('hidden');
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

  // 全選択カードに役割と場所があるかチェック
  const allCards = document.querySelectorAll('.pwa-card.pwa-selected');
  for (const card of allCards) {
    const key = card.dataset.key;
    const sel = pwApplySelected[key];
    if (!sel || !sel.role) {
      alert('すべての項目で参加立場を選択してください');
      return;
    }
    if (!sel.location) {
      alert('すべての項目で参加希望場所を選択してください');
      return;
    }
  }

  // 確認メッセージ作成
  let msg = '【送信内容の確認】' + keys.length + '件\n\n';
  keys.forEach(key => {
    const item = items.find(i => i.key === key);
    if (!item) return;
    const sel = pwApplySelected[key];
    msg += item.date + ' (' + item.weekday + ') ' + item.startTime + '〜' + item.endTime + '\n';
    msg += item.place.replace(/駅/g, '') + ' / ' + sel.role + ' / ' + sel.location + '\n\n';
  });
  msg += '送信しますか？';
  if (!(await customConfirm(msg))) return;

  const btn = document.getElementById('pwa-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons" style="font-size:18px">hourglass_empty</span> 送信中...';

  try {
    for (const key of keys) {
      const item = items.find(i => i.key === key);
      if (!item) continue;
      const sel = pwApplySelected[key];
      await db.collection('PUBLIC_WITNESSING').add({
        name: memberUserName || '不明',
        day: item.date,
        dayofweek: item.weekday,
        starttime: item.startTime,
        endtime: item.endTime,
        place: item.place,
        role: sel.role,
        preferredLocation: sel.location,
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
        gender: String(data.gender || '').trim(),
        birthDate: String(data.birthDate || '').trim(),
        baptismDate: String(data.baptismDate || '').trim(),
        status: Array.isArray(data.status) ? data.status : [],
        hope: String(data.hope || '').trim(),
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
  const arr = Array.isArray(m.status) ? m.status : [];
  return arr.some(v => { const s = String(v || ''); return s === 'RP' || s.includes('開拓'); });
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
  const arr = Array.isArray(m.status) ? m.status : [];
  const parts = [];
  if (arr.includes('EL')) parts.push('長老');
  else if (arr.includes('MS')) parts.push('援助奉仕者');
  if (arr.includes('RP') || arr.includes('正規開拓者')) parts.push('開拓者');
  if (parts.length === 0) parts.push('伝道者');
  return parts.join(' / ');
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
  const years = [year, year - 1];

  try {
    const reportSnap = await db.collection('PREACHING_REPORT')
      .where('name', '==', m.name)
      .get();

    const reportMaps = years.map(y => {
      const map = {};
      reportSnap.docs.forEach(d => {
        const data = d.data();
        const mo = data.month;
        const yr = data.year || null;
        const ts = data.timestamp ? (data.timestamp.seconds || 0) : 0;
        let belongsYear;
        if (mo >= 9) belongsYear = yr || y;
        else belongsYear = (yr ? yr - 1 : null) || y;
        if (belongsYear !== y) return;
        if (!map[mo] || ts > map[mo]._ts) {
          map[mo] = {
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
      return map;
    });

    renderReportCard(m, reportMaps, years);
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

function renderReportCard(member, reportMaps, years, targetViewId) {
  const view = document.getElementById(targetViewId || 'rpt-card-view');

  // ヘッダー情報（1回だけ）
  let html = '<div class="s21-card">';
  html += '<div class="s21-header">';
  html += '<div class="s21-title">伝道者記録カード（S-21）</div>';
  const roleLabel = displayRole(member);
  html += '<table class="s21-info-table">';
  html += '<tr><td class="s21-info-label">氏名</td><td class="s21-info-value">' + esc(member.name) + '</td><td class="s21-info-label">性別</td><td class="s21-info-value">' + esc(displayGender(member.gender)) + '</td></tr>';
  html += '<tr><td class="s21-info-label">生年月日</td><td class="s21-info-value" colspan="3">' + esc(member.birthDate || '-') + '</td></tr>';
  html += '<tr><td class="s21-info-label">バプテスマ日</td><td class="s21-info-value" colspan="3">' + esc(member.baptismDate || '-') + '</td></tr>';
  html += '<tr><td class="s21-info-label">立場</td><td class="s21-info-value">' + esc(roleLabel) + '</td><td class="s21-info-label">希望</td><td class="s21-info-value">' + esc(member.hope || '-') + '</td></tr>';
  html += '<tr><td class="s21-info-label">グループ</td><td class="s21-info-value" colspan="3">' + esc(member.group || '-') + '</td></tr>';
  html += '</table></div>';

  // 互換: 旧呼び出し（単年）対応
  if (!Array.isArray(years)) {
    years = [years];
    reportMaps = [reportMaps];
  }

  years.forEach((year, idx) => {
  const reportMap = reportMaps[idx];

  // 年度ラベル
  html += '<div class="s21-year-label">' + (year+1) + '奉仕年度（' + year + '/9〜' + (year+1) + '/8）</div>';

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

  }); // years.forEach end

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
  const svSnap = await db.collection('USER_LIST').where('status', 'array-contains', 'SV').get();
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
      if (!(await customConfirm(`区域No.${territory} を ${groupName}（${svName}）に割当てますか？\n開始: ${startDate}　終了: ${endDate}`))) return;

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
  const chartView = document.getElementById('org-view-chart') || document.getElementById('org-view');
  const groupView = document.getElementById('org-view-group');
  if (!chartView) return;
  chartView.innerHTML = '<div class="loading">読み込み中...</div>';
  if (groupView) groupView.innerHTML = '';
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
    chartView.innerHTML = html;

    // グループ成員表
    if (groupView) {
      const userSnap = await db.collection('USER_LIST').get();
      const users = [];
      userSnap.docs.forEach(d => {
        const data = d.data();
        const name = String(data.name || '').trim();
        if (!name) return;
        const arr = Array.isArray(data.status) ? data.status : [];
        let roleLabel = '伝道者';
        if (arr.includes('EL')) roleLabel = '長老';
        else if (arr.includes('MS')) roleLabel = '援助奉仕者';
        if (arr.includes('RP') || arr.includes('正規開拓者')) roleLabel += ' / 開拓者';
        users.push({ name, group: String(data.group || '').trim(), gender: String(data.gender || '').trim(), roleLabel });
      });
      users.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
      const groupMap = {};
      users.forEach(u => { if (!u.group) return; if (!groupMap[u.group]) groupMap[u.group] = []; groupMap[u.group].push(u); });
      let gHtml = '';
      Object.keys(groupMap).sort().forEach(gName => {
        const members = groupMap[gName];
        gHtml += '<div class="group-member-card">';
        gHtml += '<div class="group-member-header">' + esc(gName) + '<span class="group-member-count">' + members.length + '名</span></div>';
        gHtml += '<div class="group-member-list">';
        members.forEach(m => {
          const gIcon = m.gender === 'M' || m.gender === '男' ? 'man' : m.gender === 'F' || m.gender === '女' ? 'woman' : 'person';
          gHtml += '<div class="group-member-row"><span class="material-icons group-member-icon">' + gIcon + '</span><span class="group-member-name">' + esc(m.name) + '</span><span class="group-member-role">' + esc(m.roleLabel) + '</span></div>';
        });
        gHtml += '</div></div>';
      });
      groupView.innerHTML = gHtml;
    }
  } catch (e) {
    console.error('loadOrgView error:', e);
    chartView.innerHTML = '<div class="empty-state">読み込みエラー: ' + e.message + '</div>';
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
  if (!(await customConfirm('この行を削除しますか？'))) return;
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
      if (place.includes('唐木田')) return ['唐木田構内'];
      if (place.includes('堀之内')) {
        const base = '堀之内';
        if (weekday === '水' && time === '18:00') return [base+'三和前', base+'FM前'];
        return [base+'三和前', base+'FM前', base+'信号前'];
      }
      return [place];
    }

    container.innerHTML = '';

    // 日付＋時間でグループ化
    const groups = [];
    let lastKey = '';
    options.forEach(opt => {
      const day = (opt.day || '').toString();
      const weekday = (opt.dayofweek || '').toString();
      const time = (opt.starttime || '').toString();
      const place = (opt.place || '').toString();
      const key = `${day}_${time}`;
      if (key !== lastKey) {
        groups.push({ day, weekday, time, slots: [] });
        lastKey = key;
      }
      groups[groups.length - 1].slots.push({ place, places: getPlaces(weekday, time, place) });
    });

    groups.forEach(group => {
      // 全サブ場所をフラット化
      const allPlaces = [];
      group.slots.forEach(slot => {
        slot.places.forEach(p => allPlaces.push(p));
      });

      const section = document.createElement('div');
      section.className = 'aw-inline-section pw-cols-' + allPlaces.length;

      const isWeekend = group.weekday === '土' || group.weekday === '日';
      const hdr = document.createElement('div');
      hdr.className = 'pw-card-header';
      hdr.innerHTML = `
        <div class="pw-card-date${isWeekend ? ' pw-weekend' : ''}">${esc(group.day)}（${esc(group.weekday)}）</div>
        <div class="pw-card-time">${esc(group.time)}</div>
      `;
      section.appendChild(hdr);

      const body = document.createElement('div');
      body.className = 'pw-grid-wrap';

      const grid = document.createElement('div');
      grid.className = 'pw-grid';

      // 場所ヘッダー行
      let hdrRow = '<div class="pw-grid-row pw-grid-header">';
      allPlaces.forEach(p => {
        const label = p === '唐木田構内' ? '唐木田駅構内' : p;
        hdrRow += `<div class="pw-grid-cell pw-grid-place">${esc(label)}</div>`;
      });
      hdrRow += '</div>';

      // 司会者行
      let cRow = '<div class="pw-grid-row pw-grid-conductor">';
      allPlaces.forEach(p => {
        const docId = `${group.day}_${group.time}_${p}`;
        const ass = (assMap[docId] || {}).assignments || {};
        cRow += `<div class="pw-grid-cell">${esc(ass['司会者'] || '')}</div>`;
      });
      cRow += '</div>';

      // 参加者行（5行）
      let pRows = '';
      for (let i = 0; i < 5; i++) {
        pRows += '<div class="pw-grid-row">';
        allPlaces.forEach(p => {
          const docId = `${group.day}_${group.time}_${p}`;
          const ass = (assMap[docId] || {}).assignments || {};
          const parts = ass['参加者'] || [];
          pRows += `<div class="pw-grid-cell">${esc(parts[i] || '')}</div>`;
        });
        pRows += '</div>';
      }

      grid.innerHTML = hdrRow + cRow + pRows;
      body.appendChild(grid);
      section.appendChild(body);
      container.appendChild(section);
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
    const snap = await db.collection('PREACHING_REPORT_DRAFTS').orderBy('timestamp', 'desc').get();
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
  if (!(await customConfirm('この報告を承認してPREACHING_REPORTに反映しますか？'))) return;
  try {
    const docRef = db.collection('PREACHING_REPORT_DRAFTS').doc(docId);
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
  if (!(await customConfirm('この報告を却下して削除しますか？'))) return;
  try {
    await db.collection('PREACHING_REPORT_DRAFTS').doc(docId).delete();
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

// ── 野外奉仕取決表 ────────────────────────────────
let fsWeekStart = null;
let fsEditId = null;

function getFsWeekStart(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0,0,0,0);
  return dt;
}

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function fmtDateShort(dateStr) {
  const d = new Date(dateStr);
  return (d.getMonth()+1) + '/' + d.getDate();
}

const FS_DOW = ['日','月','火','水','木','金','土'];

function getDow(dateStr) {
  return FS_DOW[new Date(dateStr).getDay()];
}

async function loadFieldServiceData(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startStr = fmtDate(weekStart);
  const endStr = fmtDate(weekEnd);
  const snap = await db.collection('FIELD_SERVICE')
    .where('date', '>=', startStr)
    .where('date', '<=', endStr)
    .get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
  return rows;
}

function renderFsTable(rows, viewId, isAdmin) {
  const view = document.getElementById(viewId);
  if (!rows.length) {
    view.innerHTML = '<div class="empty-state">この週の取決めはありません</div>';
    return;
  }

  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  });

  let html = '';
  Object.keys(grouped).sort().forEach(date => {
    const dayRows = grouped[date];
    const dow = getDow(date);
    const isWeekend = dow === '土' || dow === '日';

    html += '<div class="aw-inline-section">';
    html += `<div class="aw-inline-header" style="background:#2e7d32">
      <div class="aw-header-left">
        <div class="aw-inline-title${isWeekend ? ' fs-hdr-weekend' : ''}">${fmtDateShort(date)}（${dow}）</div>
      </div>
    </div>`;
    html += '<div style="padding:4px 12px 12px">';

    dayRows.forEach(r => {
      html += '<div class="fs-card-row">';
      html += '<div class="fs-card-left">';
      html += `<div class="fs-card-time">${esc(r.time || '')}</div>`;
      if (r.place) html += `<div class="fs-card-place">${esc(r.place)}</div>`;
      html += '</div>';
      html += '<div class="fs-card-center">';
      if (r.type) html += `<span class="fs-card-type">${esc(r.type)}</span>`;
      html += `<div class="fs-card-conductor">${esc(r.conductor || '')}`;
      if (r.conductorSub) html += `<br><span style="font-size:12px;color:var(--text-light)">${esc(r.conductorSub)}</span>`;
      html += '</div>';
      html += '</div>';
      if (isAdmin) {
        html += '<div class="fs-card-actions">';
        html += `<button onclick="editFsRow('${r.id}')" title="編集"><span class="material-icons" style="font-size:16px">edit</span></button>`;
        html += `<button onclick="deleteFsRow('${r.id}')" title="削除"><span class="material-icons" style="font-size:16px;color:#c62828">delete</span></button>`;
        html += '</div>';
      }
      html += '</div>';
    });

    html += '</div></div>';
  });

  view.innerHTML = html;
}

function updateFsWeekLabel(labelId, weekStart) {
  const el = document.getElementById(labelId);
  if (!el) return;
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  el.textContent = fmtDateShort(fmtDate(weekStart)) + '(' + getDow(fmtDate(weekStart)) + ') 〜 ' + fmtDateShort(fmtDate(end)) + '(' + getDow(fmtDate(end)) + ')';
}

async function loadAdminFieldService() {
  if (!fsWeekStart) fsWeekStart = getFsWeekStart(new Date());
  updateFsWeekLabel('fs-week-label', fsWeekStart);
  const view = document.getElementById('fs-view');
  view.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const rows = await loadFieldServiceData(fsWeekStart);
    renderFsTable(rows, 'fs-view', true);
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

document.getElementById('fs-prev-week')?.addEventListener('click', () => {
  fsWeekStart.setDate(fsWeekStart.getDate() - 7);
  loadAdminFieldService();
});
document.getElementById('fs-next-week')?.addEventListener('click', () => {
  fsWeekStart.setDate(fsWeekStart.getDate() + 7);
  loadAdminFieldService();
});
document.getElementById('fs-add-row')?.addEventListener('click', () => {
  fsEditId = null;
  showFsForm({});
});

// ── 週を生成 ──
document.getElementById('fs-generate-week')?.addEventListener('click', async () => {
  if (!(await customConfirm('この週のテンプレートを生成しますか？\n既存の取決めがある場合は上書きしません。'))) return;
  try {
    // ローテ設定を読み込み
    const rotSnap = await db.collection('FS_ROTATION').get();
    const rotations = {};
    rotSnap.docs.forEach(d => {
      const data = d.data();
      rotations[data.dayOfWeek + '_' + data.time] = data;
    });

    // テンプレート読み込み
    const tplSnap = await db.collection('FS_TEMPLATE').orderBy('sortOrder').get();
    if (tplSnap.empty) {
      alert('テンプレートが未設定です。先にローテ設定からテンプレートを登録してください。');
      return;
    }

    // 既存データ確認
    const existing = await loadFieldServiceData(fsWeekStart);
    const existKeys = new Set(existing.map(r => r.date + '_' + r.time + '_' + r.type));

    // 週番号計算（ローテ用）
    const refDate = new Date('2026-01-05'); // 基準月曜
    const weekNum = Math.round((fsWeekStart - refDate) / (7 * 86400000));

    let addedCount = 0;
    for (const tplDoc of tplSnap.docs) {
      const tpl = tplDoc.data();
      // 曜日→日付計算 (0=日,1=月...6=土)
      const dayOffset = tpl.dayOfWeek === 0 ? 6 : tpl.dayOfWeek - 1;
      const rowDate = new Date(fsWeekStart);
      rowDate.setDate(rowDate.getDate() + dayOffset);
      const dateStr = fmtDate(rowDate);

      const key = dateStr + '_' + tpl.time + '_' + tpl.type;
      if (existKeys.has(key)) continue;

      // 司会者: ローテがあれば適用
      let conductor = tpl.conductor || '';
      let conductorSub = tpl.conductorSub || '';
      const rotKey = tpl.dayOfWeek + '_' + tpl.time;
      if (rotations[rotKey] && rotations[rotKey].conductors && rotations[rotKey].conductors.length > 0) {
        const list = rotations[rotKey].conductors;
        const idx = ((weekNum % list.length) + list.length) % list.length;
        conductor = list[idx];
        if (list.length > 1 && rotations[rotKey].pairMode) {
          conductorSub = list[(idx + 1) % list.length] || '';
        }
      }

      await db.collection('FIELD_SERVICE').add({
        date: dateStr,
        dayOfWeek: getDow(dateStr),
        time: tpl.time || '',
        place: tpl.place || '',
        type: tpl.type || '',
        conductor,
        conductorSub,
        sortOrder: tpl.sortOrder || 0,
        timestamp: firebase.firestore.Timestamp.now(),
      });
      addedCount++;
    }

    alert(addedCount + '件の取決めを生成しました');
    loadAdminFieldService();
  } catch (err) {
    alert('生成エラー: ' + err.message);
  }
});

// ── ローテ設定 ──
document.getElementById('fs-rotation-settings')?.addEventListener('click', () => {
  showFsRotationSettings();
});

async function showFsRotationSettings() {
  let overlay = document.getElementById('fs-form-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fs-form-overlay';
    overlay.className = 'fs-form-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('hidden');

  // 既存ローテ読み込み
  const rotSnap = await db.collection('FS_ROTATION').get();
  let rotList = rotSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let html = '<div class="fs-form-box" style="width:340px">';
  html += '<h3>ローテーション設定</h3>';
  html += '<p style="font-size:12px;color:#666;margin:0 0 12px">司会者をカンマ区切りで入力。週ごとに順番に割り当てます。</p>';

  if (rotList.length === 0) {
    // デフォルト設定
    rotList = [
      { dayOfWeek: 6, time: '17:00', label: '土曜 17:00', conductors: [], id: null },
      { dayOfWeek: 0, time: '10:30', label: '日曜 10:30', conductors: [], id: null },
    ];
  }

  rotList.forEach((r, i) => {
    html += '<div class="fs-form-field">';
    html += '<label>' + esc(r.label || FS_DOW[r.dayOfWeek] + ' ' + r.time) + '</label>';
    html += '<input type="text" id="fs-rot-' + i + '" value="' + esc((r.conductors || []).join(', ')) + '" placeholder="石橋, 青木, 岩下">';
    html += '<input type="hidden" id="fs-rot-dow-' + i + '" value="' + r.dayOfWeek + '">';
    html += '<input type="hidden" id="fs-rot-time-' + i + '" value="' + esc(r.time) + '">';
    html += '<input type="hidden" id="fs-rot-id-' + i + '" value="' + (r.id || '') + '">';
    html += '</div>';
  });

  html += '<div class="fs-form-field" style="margin-top:8px">';
  html += '<label>新規追加（曜日番号,時間）</label>';
  html += '<div style="display:flex;gap:6px">';
  html += '<select id="fs-rot-new-dow" style="flex:1"><option value="">曜日</option>';
  FS_DOW.forEach((d, i) => { html += '<option value="' + i + '">' + d + '</option>'; });
  html += '</select>';
  html += '<input type="time" id="fs-rot-new-time" style="flex:1">';
  html += '<input type="text" id="fs-rot-new-cond" style="flex:2" placeholder="司会者（カンマ区切り）">';
  html += '</div></div>';

  html += '<div id="fs-rot-count" style="font-size:12px;color:#666;margin-top:4px">' + rotList.length + '件のローテ設定</div>';

  html += '<div class="fs-form-actions">';
  html += '<button class="fs-form-cancel" onclick="closeFsForm()">閉じる</button>';
  html += '<button class="fs-form-save" onclick="saveFsRotation(' + rotList.length + ')">保存</button>';
  html += '</div></div>';

  overlay.innerHTML = html;
}

async function saveFsRotation(count) {
  try {
    // 既存を更新
    for (let i = 0; i < count; i++) {
      const input = document.getElementById('fs-rot-' + i);
      const dow = parseInt(document.getElementById('fs-rot-dow-' + i).value);
      const time = document.getElementById('fs-rot-time-' + i).value;
      const id = document.getElementById('fs-rot-id-' + i).value;
      const conductors = input.value.split(/[,、]/).map(s => s.trim()).filter(s => s);

      const data = {
        dayOfWeek: dow,
        time: time,
        label: FS_DOW[dow] + ' ' + time,
        conductors: conductors,
        timestamp: firebase.firestore.Timestamp.now(),
      };

      if (id) {
        await db.collection('FS_ROTATION').doc(id).update(data);
      } else {
        await db.collection('FS_ROTATION').add(data);
      }
    }

    // 新規追加
    const newDow = document.getElementById('fs-rot-new-dow').value;
    const newTime = document.getElementById('fs-rot-new-time').value;
    const newCond = document.getElementById('fs-rot-new-cond').value;
    if (newDow !== '' && newTime && newCond) {
      const dow = parseInt(newDow);
      await db.collection('FS_ROTATION').add({
        dayOfWeek: dow,
        time: newTime,
        label: FS_DOW[dow] + ' ' + newTime,
        conductors: newCond.split(/[,、]/).map(s => s.trim()).filter(s => s),
        timestamp: firebase.firestore.Timestamp.now(),
      });
    }

    alert('ローテ設定を保存しました');
    closeFsForm();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
}

function showFsForm(data) {
  let overlay = document.getElementById('fs-form-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fs-form-overlay';
    overlay.className = 'fs-form-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('hidden');
  const defaultDate = data.date || fmtDate(fsWeekStart || new Date());
  overlay.innerHTML = '<div class="fs-form-box">' +
    '<h3>' + (fsEditId ? '取決め編集' : '取決め追加') + '</h3>' +
    '<div class="fs-form-field"><label>日付</label><input type="date" id="fs-f-date" value="' + esc(defaultDate) + '"></div>' +
    '<div class="fs-form-field"><label>時間</label><input type="time" id="fs-f-time" value="' + esc(data.time || '') + '"></div>' +
    '<div class="fs-form-field"><label>集合場所</label><input type="text" id="fs-f-place" value="' + esc(data.place || '') + '" placeholder="王国会館、Z岩下 等"></div>' +
    '<div class="fs-form-field"><label>種別</label><input type="text" id="fs-f-type" value="' + esc(data.type || '') + '" placeholder="翡翠、合同、ビジネス 等"></div>' +
    '<div class="fs-form-field"><label>司会者</label><input type="text" id="fs-f-conductor" value="' + esc(data.conductor || '') + '"></div>' +
    '<div class="fs-form-field"><label>司会者2</label><input type="text" id="fs-f-conductor-sub" value="' + esc(data.conductorSub || '') + '"></div>' +
    '<div class="fs-form-field"><label>表示順</label><input type="number" id="fs-f-order" value="' + (data.sortOrder || 0) + '" min="0"></div>' +
    '<div class="fs-form-actions">' +
    '<button class="fs-form-cancel" onclick="closeFsForm()">キャンセル</button>' +
    '<button class="fs-form-save" onclick="saveFsRow()">保存</button>' +
    '</div></div>';
}

function closeFsForm() {
  const overlay = document.getElementById('fs-form-overlay');
  if (overlay) overlay.classList.add('hidden');
}

async function saveFsRow() {
  const dateVal = document.getElementById('fs-f-date').value;
  if (!dateVal) { alert('日付を入力してください'); return; }
  const data = {
    date: dateVal,
    dayOfWeek: getDow(dateVal),
    time: document.getElementById('fs-f-time').value || '',
    place: document.getElementById('fs-f-place').value.trim(),
    type: document.getElementById('fs-f-type').value.trim(),
    conductor: document.getElementById('fs-f-conductor').value.trim(),
    conductorSub: document.getElementById('fs-f-conductor-sub').value.trim(),
    sortOrder: parseInt(document.getElementById('fs-f-order').value) || 0,
    timestamp: firebase.firestore.Timestamp.now(),
  };
  try {
    if (fsEditId) {
      await db.collection('FIELD_SERVICE').doc(fsEditId).update(data);
    } else {
      await db.collection('FIELD_SERVICE').add(data);
    }
    closeFsForm();
    loadAdminFieldService();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
}

async function editFsRow(docId) {
  try {
    const snap = await db.collection('FIELD_SERVICE').doc(docId).get();
    if (!snap.exists) { alert('データが見つかりません'); return; }
    fsEditId = docId;
    showFsForm(snap.data());
  } catch (err) {
    alert('読み込みエラー: ' + err.message);
  }
}

async function deleteFsRow(docId) {
  if (!(await customConfirm('この取決めを削除しますか？'))) return;
  try {
    await db.collection('FIELD_SERVICE').doc(docId).delete();
    loadAdminFieldService();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

let fsUserWeekStart = null;

async function loadUserFieldService() {
  fsUserWeekStart = getFsWeekStart(new Date());
  updateFsWeekLabel('fs-user-week-label', fsUserWeekStart);
  const view = document.getElementById('fs-user-view');
  view.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const rows = await loadFieldServiceData(fsUserWeekStart);
    renderFsTable(rows, 'fs-user-view', false);
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

// ── 集会出席 ────────────────────────────────
const ATT_VENUE_LABELS = { kingdom_hall: '王国会館', zoom: 'Zoom' };
const ATT_TYPE_LABELS  = { midweek: '週中', weekend: '週末', memorial: '記念式', special: '特別' };

async function loadAdminAttendance() {
  const list = document.getElementById('attendance-list');
  list.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection('MEETING_ATTENDANCE')
      .orderBy('date', 'desc').limit(200).get();
    renderAdminAttendance(snap.docs);
  } catch (e) {
    list.innerHTML = '<div class="loading">読み込みエラー: ' + esc(e.message) + '</div>';
  }
}

function renderAdminAttendance(docs) {
  const list = document.getElementById('attendance-list');
  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state">出席データがありません</div>';
    return;
  }
  list.innerHTML = '';
  docs.forEach(docSnap => {
    const d = docSnap.data();
    const dateStr = d.date || '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    let label = dateStr;
    if (m) {
      const dt = new Date(+m[1], +m[2]-1, +m[3]);
      label = `${+m[1]}/${+m[2]}/${+m[3]}（${WD[dt.getDay()]}）`;
    }
    const venue = ATT_VENUE_LABELS[d.venue] || d.venue || '';
    const type  = ATT_TYPE_LABELS[d.meetingType] || d.meetingType || '';
    const detail = d.meetingType === 'special' && d.specialDetail ? `（${d.specialDetail}）` : '';
    const count = (d.count != null) ? d.count : '-';
    const submitter = d.submitterName || '';

    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div class="admin-list-info">
        <div class="admin-list-date">${esc(label)}</div>
        <div class="admin-list-title">${esc(venue)} / ${esc(type)}${esc(detail)} ・ <strong>${esc(String(count))}名</strong></div>
        <div style="font-size:12px;color:var(--text-light,#888);margin-top:2px">提出者: ${esc(submitter)}</div>
      </div>
      <div class="admin-list-actions">
        <button class="btn-edit icon-btn" data-id="${esc(docSnap.id)}" style="color:var(--primary)">
          <span class="material-icons">edit</span>
        </button>
        <button class="btn-delete icon-btn" data-id="${esc(docSnap.id)}" style="color:#d32f2f">
          <span class="material-icons">delete</span>
        </button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.btn-edit').forEach(btn =>
    btn.addEventListener('click', () => openAttendanceModal(btn.dataset.id)));
  list.querySelectorAll('.btn-delete').forEach(btn =>
    btn.addEventListener('click', () => openAttendanceDeleteModal(btn.dataset.id)));
}

function openAttendanceModal(id) {
  editingAttendanceId = id;
  const modal = document.getElementById('attendance-modal');
  document.getElementById('attendance-modal-title').textContent = id ? '集会出席を編集' : '集会出席を登録';
  const form = document.getElementById('attendance-form');
  form.reset();
  document.getElementById('att-submitter').value =
    memberUserName || (currentUser && currentUser.displayName) || (currentUser && currentUser.email) || '';

  document.getElementById('att-special-detail').value = '';
  document.getElementById('att-special-group').classList.add('hidden');

  if (!id) {
    document.getElementById('att-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('att-venue').value = 'kingdom_hall';
    document.getElementById('att-type').value  = 'midweek';
  } else {
    db.collection('MEETING_ATTENDANCE').doc(id).get().then(snap => {
      if (!snap.exists) return;
      const d = snap.data();
      document.getElementById('att-date').value = d.date || '';
      document.getElementById('att-venue').value = d.venue || 'kingdom_hall';
      document.getElementById('att-type').value  = d.meetingType || 'midweek';
      document.getElementById('att-count').value = (d.count != null) ? d.count : '';
      document.getElementById('att-remarks').value = d.remarks || '';
      if (d.specialDetail) document.getElementById('att-special-detail').value = d.specialDetail;
      if (d.submitterName) document.getElementById('att-submitter').value = d.submitterName;
      // 特別な集会ならテキスト表示
      document.getElementById('att-special-group').classList.toggle('hidden', d.meetingType !== 'special');
    });
  }
  modal.classList.remove('hidden');
}

function closeAttendanceModal() {
  document.getElementById('attendance-modal').classList.add('hidden');
  editingAttendanceId = null;
}

document.getElementById('att-add-btn')?.addEventListener('click', () => openAttendanceModal(null));
document.getElementById('attendance-modal-close')?.addEventListener('click', closeAttendanceModal);
document.getElementById('attendance-overlay')?.addEventListener('click', closeAttendanceModal);
document.getElementById('att-cancel')?.addEventListener('click', closeAttendanceModal);

document.getElementById('att-type')?.addEventListener('change', () => {
  const sg = document.getElementById('att-special-group');
  if (sg) sg.classList.toggle('hidden', document.getElementById('att-type').value !== 'special');
});

document.getElementById('attendance-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date  = document.getElementById('att-date').value;
  const venue = document.getElementById('att-venue').value;
  const type  = document.getElementById('att-type').value;
  const specialDetail = document.getElementById('att-special-detail').value.trim();
  const countStr = document.getElementById('att-count').value;
  const remarks  = document.getElementById('att-remarks').value.trim();
  if (!date || !venue || !type || countStr === '') {
    alert('必須項目を入力してください');
    return;
  }
  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 0) {
    alert('出席人数は0以上の数値を入力してください');
    return;
  }

  // 送信前確認
  const typeLabel = {'midweek':'週中の集会','weekend':'週末の集会','memorial':'記念式','special':'特別な集会'}[type] || type;
  const detailStr = type === 'special' && specialDetail ? `（${specialDetail}）` : '';
  const venueLabel = {'kingdom_hall':'王国会館','zoom':'Zoom'}[venue] || venue;
  let confirmMsg = '【送信内容の確認】\n';
  confirmMsg += '日付: ' + date + '\n';
  confirmMsg += '会場: ' + venueLabel + '\n';
  confirmMsg += '集会: ' + typeLabel + detailStr + '\n';
  confirmMsg += '出席人数: ' + count + '名\n';
  if (remarks) confirmMsg += '備考: ' + remarks + '\n';
  confirmMsg += '\n送信しますか？';
  if (!(await customConfirm(confirmMsg))) return;

  const data = {
    date,
    venue,
    meetingType: type,
    specialDetail: type === 'special' ? specialDetail : '',
    count,
    remarks,
    submitterName:  memberUserName || (currentUser && currentUser.displayName) || '',
    submitterEmail: (currentUser && currentUser.email) || '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    if (editingAttendanceId) {
      await db.collection('MEETING_ATTENDANCE').doc(editingAttendanceId).set(data, { merge: true });
    } else {
      const docId = `${date}_${venue}_${type}`;
      const ref = db.collection('MEETING_ATTENDANCE').doc(docId);
      const existing = await ref.get();
      if (existing.exists) {
        if (!(await customConfirm('同じ日付・会場・集会種別の報告が既にあります。上書きしますか？'))) return;
      }
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await ref.set(data, { merge: true });
    }
    closeAttendanceModal();
    alert(`✅ 出席を登録しました\n\n${date}　${venueLabel}　${typeLabel}${detailStr}\n出席人数: ${count}名`);
    // 出席ページが開いていれば更新
    if (document.getElementById('page-admin-attendance') && !document.getElementById('page-admin-attendance').classList.contains('hidden')) {
      loadAdminAttendance();
    }
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
});

async function openAttendanceDeleteModal(id) {
  if (!(await customConfirm('この出席記録を削除しますか？'))) return;
  db.collection('MEETING_ATTENDANCE').doc(id).delete()
    .then(() => loadAdminAttendance())
    .catch(err => alert('削除エラー: ' + err.message));
}

// ── 出席 月集計 ────────────────────────────────
let atmCurrentMonth = '';
let atmInitialized = false;

function initAttendanceMonthly() {
  const select = document.getElementById('atm-month-select');
  if (!select) return;

  if (!atmInitialized) {
    const now = new Date();
    const months = [];
    for (let i = 0; i < 36; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      months.push({ ym, label });
    }
    select.innerHTML = months.map(m => `<option value="${m.ym}">${m.label}</option>`).join('');
    atmCurrentMonth = months[0].ym;
    select.value = atmCurrentMonth;

    select.addEventListener('change', () => {
      atmCurrentMonth = select.value;
      loadAttendanceMonthly();
    });
    document.getElementById('atm-prev')?.addEventListener('click', () => shiftAtmMonth(-1));
    document.getElementById('atm-next')?.addEventListener('click', () => shiftAtmMonth(1));
    atmInitialized = true;
  }
  loadAttendanceMonthly();
}

function shiftAtmMonth(delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(atmCurrentMonth);
  if (!m) return;
  const d = new Date(+m[1], +m[2] - 1 + delta, 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const select = document.getElementById('atm-month-select');
  if (![...select.options].some(o => o.value === ym)) return;
  atmCurrentMonth = ym;
  select.value = ym;
  loadAttendanceMonthly();
}

async function loadAttendanceMonthly() {
  const wrap = document.getElementById('atm-table-wrap');
  const summary = document.getElementById('atm-summary');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading">読み込み中...</div>';
  if (summary) summary.innerHTML = '';

  const ym = atmCurrentMonth;
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return;
  const start = `${ym}-01`;
  const lastDay = new Date(+m[1], +m[2], 0).getDate();
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`;

  try {
    const snap = await db.collection('MEETING_ATTENDANCE')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();
    renderAttendanceMonthly(snap.docs);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(e.message) + '</div>';
  }
}

function renderAttendanceMonthly(docs) {
  const wrap = document.getElementById('atm-table-wrap');
  const summary = document.getElementById('atm-summary');

  const rows = {};
  docs.forEach(snap => {
    const d = snap.data();
    if (!d.date) return;
    const key = `${d.date}__${d.meetingType || ''}`;
    if (!rows[key]) {
      rows[key] = { date: d.date, type: d.meetingType || '', kingdom_hall: null, zoom: null, specialDetail: d.specialDetail || '' };
    }
    if (d.venue === 'kingdom_hall') rows[key].kingdom_hall = d.count;
    else if (d.venue === 'zoom')    rows[key].zoom = d.count;
  });

  const all = Object.values(rows).sort((a, b) => a.date.localeCompare(b.date));

  if (all.length === 0) {
    if (summary) summary.innerHTML = '';
    wrap.innerHTML = '<div class="empty-state">この月の出席データはありません</div>';
    return;
  }

  // 種類別に分ける
  const midweek = all.filter(r => r.type === 'midweek');
  const weekend = all.filter(r => r.type === 'weekend');
  const others  = all.filter(r => r.type !== 'midweek' && r.type !== 'weekend');

  function calcStats(list) {
    let kh = 0, zm = 0, cnt = 0;
    list.forEach(r => {
      if (r.kingdom_hall != null) kh += r.kingdom_hall;
      if (r.zoom != null) zm += r.zoom;
      if (r.kingdom_hall != null || r.zoom != null) cnt++;
    });
    return { kh, zm, total: kh + zm, cnt, avg: cnt > 0 ? Math.round((kh + zm) / cnt) : 0 };
  }
  const sMid = calcStats(midweek);
  const sWkd = calcStats(weekend);
  const sAll = calcStats(all);

  if (summary) {
    summary.innerHTML = `
      <div class="atm-sum-card"><div class="atm-sum-label">週中 平均</div><div class="atm-sum-value">${sMid.avg}</div><div class="atm-sum-unit">名</div></div>
      <div class="atm-sum-card"><div class="atm-sum-label">週末 平均</div><div class="atm-sum-value">${sWkd.avg}</div><div class="atm-sum-unit">名</div></div>
      <div class="atm-sum-card"><div class="atm-sum-label">全体 平均</div><div class="atm-sum-value">${sAll.avg}</div><div class="atm-sum-unit">名</div></div>
      <div class="atm-sum-card"><div class="atm-sum-label">集会数</div><div class="atm-sum-value">${sAll.cnt}</div><div class="atm-sum-unit">回</div></div>
    `;
  }

  function buildTable(list, stats, label) {
    if (list.length === 0) return '';
    let html = `<div class="atm-section-label">${esc(label)}</div>`;
    html += '<table class="atm-table"><thead><tr>' +
      '<th>日付</th><th class="atm-num">王国会館</th><th class="atm-num">Zoom</th><th class="atm-num">合計</th>' +
      '</tr></thead><tbody>';
    list.forEach(r => {
      const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date);
      let dateLabel = r.date;
      if (md) {
        const dt = new Date(+md[1], +md[2]-1, +md[3]);
        dateLabel = `${+md[2]}/${+md[3]}（${WD[dt.getDay()]}）`;
      }
      const detail = r.type === 'special' && r.specialDetail ? `（${r.specialDetail}）` : '';
      const kh = r.kingdom_hall != null ? r.kingdom_hall : '';
      const zm = r.zoom != null ? r.zoom : '';
      const total = (r.kingdom_hall || 0) + (r.zoom || 0);
      html += `<tr>
        <td>${esc(dateLabel)}${esc(detail)}</td>
        <td class="atm-num">${kh}</td>
        <td class="atm-num">${zm}</td>
        <td class="atm-num atm-total">${total}</td>
      </tr>`;
    });
    html += `</tbody><tfoot><tr>
      <td><strong>小計（平均 ${stats.avg}名）</strong></td>
      <td class="atm-num"><strong>${stats.kh}</strong></td>
      <td class="atm-num"><strong>${stats.zm}</strong></td>
      <td class="atm-num atm-total"><strong>${stats.total}</strong></td>
    </tr></tfoot></table>`;
    return html;
  }

  let html = '';
  html += buildTable(midweek, sMid, '週中の集会');
  html += buildTable(weekend, sWkd, '週末の集会');
  if (others.length > 0) {
    html += buildTable(others, calcStats(others), 'その他（記念式・特別な集会）');
  }
  wrap.innerHTML = html;
}

// ── グループ成員表 ────────────────────────────
async function loadGroupMembers() {
  const container = document.getElementById('group-members-list');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const snap = await db.collection('USER_LIST').orderBy('name').get();

    // グループ別に振り分け
    const groupMap = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      const name  = String(d.name  || '').trim();
      const group = String(d.group || '（未所属）').trim() || '（未所属）';
      const arr = Array.isArray(d.status) ? d.status : [];
      let role = '';
      if (arr.includes('EL')) role = '長老';
      else if (arr.includes('MS')) role = '援助奉仕者';
      if (arr.includes('RP')) role = role ? role + ' / 開拓者' : '開拓者';
      const gender = String(d.gender || '').trim();
      if (!name) return;
      if (!groupMap[group]) groupMap[group] = [];
      groupMap[group].push({ name, role, gender });
    });

    const sortedGroups = Object.keys(groupMap).sort((a, b) => {
      if (a === '（未所属）') return 1;
      if (b === '（未所属）') return -1;
      return a.localeCompare(b, 'ja');
    });

    if (sortedGroups.length === 0) {
      container.innerHTML = '<div class="empty-state">データがありません</div>';
      return;
    }

    let html = '';
    sortedGroups.forEach(group => {
      const members = groupMap[group];
      html += `
        <div class="gm-group">
          <div class="gm-group-header">
            <span class="material-icons" style="font-size:20px;vertical-align:middle;margin-right:6px">group</span>
            ${esc(group)}
            <span class="gm-count">${members.length}名</span>
          </div>
          <div class="admin-list">
            ${members.map(m => `
              <div class="admin-list-item">
                <div class="admin-list-info">
                  <div class="admin-list-title">${esc(m.name)}</div>
                  ${m.role ? `<div class="admin-list-date">${esc(m.role)}</div>` : ''}
                </div>
                ${m.gender ? `<span class="gm-gender-badge gm-gender-${m.gender === '男' ? 'm' : 'f'}">${esc(m.gender)}</span>` : ''}
              </div>`).join('')}
          </div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="loading">読み込みエラー: ${e.message}</div>`;
  }
}

// ── 出席人数登録ページ ──
function initAttendanceForm() {
  document.getElementById('attf-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('attf-venue').value = 'kingdom_hall';
  document.getElementById('attf-type').value = 'midweek';
  document.getElementById('attf-count').value = '';
  document.getElementById('attf-remarks').value = '';
  document.getElementById('attf-special-detail').value = '';
  document.getElementById('attf-special-group').classList.add('hidden');
  document.getElementById('attf-submitter').value =
    memberUserName || (currentUser && currentUser.displayName) || (currentUser && currentUser.email) || '';
}

document.getElementById('attf-type')?.addEventListener('change', () => {
  const sg = document.getElementById('attf-special-group');
  if (sg) sg.classList.toggle('hidden', document.getElementById('attf-type').value !== 'special');
});

document.getElementById('attf-submit')?.addEventListener('click', async () => {
  const date  = document.getElementById('attf-date').value;
  const venue = document.getElementById('attf-venue').value;
  const type  = document.getElementById('attf-type').value;
  const specialDetail = document.getElementById('attf-special-detail').value.trim();
  const countStr = document.getElementById('attf-count').value;
  const remarks  = document.getElementById('attf-remarks').value.trim();
  if (!date || !venue || !type || countStr === '') {
    alert('必須項目を入力してください');
    return;
  }
  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 0) {
    alert('出席人数は0以上の数値を入力してください');
    return;
  }
  const typeLabel = {'midweek':'週中の集会','weekend':'週末の集会','memorial':'記念式','special':'特別な集会'}[type] || type;
  const detailStr = type === 'special' && specialDetail ? `（${specialDetail}）` : '';
  const venueLabel = {'kingdom_hall':'王国会館','zoom':'Zoom'}[venue] || venue;
  let confirmMsg = '【送信内容の確認】\n';
  confirmMsg += '日付: ' + date + '\n';
  confirmMsg += '会場: ' + venueLabel + '\n';
  confirmMsg += '集会: ' + typeLabel + detailStr + '\n';
  confirmMsg += '出席人数: ' + count + '名\n';
  if (remarks) confirmMsg += '備考: ' + remarks + '\n';
  confirmMsg += '\n送信しますか？';
  if (!(await customConfirm(confirmMsg))) return;

  const btn = document.getElementById('attf-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons" style="font-size:18px">hourglass_empty</span> 送信中...';

  const data = {
    date, venue, meetingType: type,
    specialDetail: type === 'special' ? specialDetail : '',
    count, remarks,
    submitterName:  memberUserName || (currentUser && currentUser.displayName) || '',
    submitterEmail: (currentUser && currentUser.email) || '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    const docId = `${date}_${venue}_${type}`;
    const ref = db.collection('MEETING_ATTENDANCE').doc(docId);
    const existing = await ref.get();
    if (existing.exists) {
      if (!(await customConfirm('同じ日付・会場・集会種別の報告が既にあります。上書きしますか？'))) {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons" style="font-size:18px">send</span> 送信する';
        return;
      }
    }
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await ref.set(data, { merge: true });
    alert(`✅ 出席を登録しました\n\n${date}　${venueLabel}　${typeLabel}${detailStr}\n出席人数: ${count}名`);
    navigate('shinsei');
  } catch (err) {
    alert('保存エラー: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons" style="font-size:18px">send</span> 送信する';
  }
});

// ── 組織ページタブ切替 ──
function switchOrgTab(tab) {
  document.getElementById('org-tab-chart').classList.toggle('active', tab === 'chart');
  document.getElementById('org-tab-group').classList.toggle('active', tab === 'group');
  document.getElementById('org-view-chart').classList.toggle('hidden', tab !== 'chart');
  document.getElementById('org-view-group').classList.toggle('hidden', tab !== 'group');
}

// ── アクセスログ ──
function alFormatDt(dt) {
  return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}
function alDevice(ua) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'その他';
}

async function loadAccessLog() {
  const view = document.getElementById('access-log-view');
  if (!view) return;
  view.innerHTML = '<div class="empty-state">読み込み中...</div>';
  try {
    const snap = await db.collection('LOGIN_LOG')
      .orderBy('loginAt', 'desc')
      .limit(500)
      .get();
    if (snap.empty) {
      view.innerHTML = '<div class="empty-state">ログがありません</div>';
      return;
    }
    const userMap = {};
    snap.forEach(doc => {
      const d = doc.data();
      const key = d.email || d.name || 'unknown';
      if (!userMap[key]) userMap[key] = { name: d.name || '不明', email: d.email || '', logs: [] };
      const dt = d.loginAt?.toDate ? d.loginAt.toDate() : null;
      userMap[key].logs.push({ dt, ua: d.userAgent || '' });
    });
    const users = Object.values(userMap).sort((a, b) => {
      const ta = a.logs[0]?.dt?.getTime() || 0;
      const tb = b.logs[0]?.dt?.getTime() || 0;
      return tb - ta;
    });

    let html = '<div class="access-log-list">';
    users.forEach((u, idx) => {
      const latest = u.logs[0];
      const latestStr = latest.dt ? alFormatDt(latest.dt) : '';
      const device = alDevice(latest.ua);
      html += `<div class="access-log-card" onclick="document.getElementById('al-detail-${idx}').classList.toggle('hidden')">`;
      html += `<div class="access-log-main">`;
      html += `<span class="material-icons access-log-icon">person</span>`;
      html += `<div class="access-log-info"><div class="access-log-name">${esc(u.name)}</div><div class="access-log-email">${esc(u.email)}</div></div>`;
      html += `<div class="access-log-meta"><div class="access-log-time">${esc(latestStr)}</div><div class="access-log-device">${esc(device)}　${u.logs.length}回</div></div>`;
      html += `<span class="material-icons" style="color:#bbb;font-size:20px;margin-left:4px">expand_more</span>`;
      html += `</div>`;
      html += `<div id="al-detail-${idx}" class="al-detail hidden">`;
      u.logs.forEach(log => {
        const dtStr = log.dt ? alFormatDt(log.dt) : '';
        const dev = alDevice(log.ua);
        html += `<div class="al-detail-row"><span class="al-detail-time">${esc(dtStr)}</span><span class="al-detail-device">${esc(dev)}</span></div>`;
      });
      html += `</div></div>`;
    });
    html += '</div>';
    view.innerHTML = html;
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}
