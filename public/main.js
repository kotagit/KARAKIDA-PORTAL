
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
  'admin-assignment-review': '確認・公開',
  'admin-schedule-editor': 'スケジュール編集',
  'admin-family-groups': '家族グループ管理',
  'admin-attendance': '集会出席',
  'admin-attendance-monthly': '出席 月集計',
  'admin-access-log': 'アクセスログ',
  'attendance-form': '出席人数登録',
  'admin-s13': '区域割当ての記録',
  'admin-group-members': 'グループ成員表',
  'admin-group-emergency': 'グループ成員緊急連絡先',
  'admin-member-edit': 'グループ成員編集',
  'admin-org': '組織表管理',
  'admin-config': '会衆設定',
  'admin-permission-simulator': '権限シミュレーター',
  'senkyo-mycard': '割当て区域カード',
  'senkyo-cardview': '区域カード',
  'senkyo-cards': '区域カード',
  'senkyo-all': '全ての区域カード',
  'senkyo-autolock': 'オートロック区域',
  'senkyo-night': '夜間区域',
  'senkyo-public': '公共エリア伝道',
  'public-talk-view': '公開講演予定',
  'admin-public-talk': '公開講演予定表策定',
  'admin-s99': 'S-99 講演一覧',
  'talk-pref': '講演希望番号',
  'admin-dept-annai': '案内部門 取決め表',
  'admin-dept-avs': 'AVS 取決め表',
  'admin-dept-parking': '駐車場 取決め表',
  'admin-dept-cleaning': '清掃 取決め表',
  'admin-dept-literature': '文書 取決め表',
  bumon: '部門',
  'user-dept-annai': '案内部門',
  'user-dept-avs': 'AVS部門',
  'user-dept-parking': '駐車場部門',
  'user-dept-cleaning': '王国会館の清掃',
  'user-dept-literature': '文書部門',
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
  // status フィールドを配列に正規化(文字列JSON / 配列 / ROWY破損形式 等)
  function _cleanStatusItem(s) {
    return String(s || '').replace(/^[\[\]"\s]+|[\[\]"\s]+$/g, '');
  }
  function _parseStatus(v) {
    let arr = [];
    if (Array.isArray(v)) arr = v;
    else if (typeof v === 'string' && v) {
      try { const a = JSON.parse(v); arr = Array.isArray(a) ? a : []; }
      catch(e) { arr = v.split(/[,;]/); }
    }
    return arr.map(_cleanStatusItem).filter(Boolean);
  }
  window._parseStatus = _parseStatus;

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      isAdmin = false;
      // ログインチェック中はログイン画面に「確認中」を出して待たせる
      app.classList.add('hidden');
      loginScreen.classList.remove('hidden');
      if (loginError) loginError.textContent = 'ユーザー確認中...';

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
          if (loginError) loginError.textContent = 'アクセス権限がありません。管理者にお問い合わせください。';
          await auth.signOut();
          return;
        }

        // 認証OK → アプリ表示
        loginScreen.classList.add('hidden');
        app.classList.remove('hidden');
        if (loginError) loginError.textContent = '';
        navigate('home');

        const userData = snap.docs[0].data();
        console.log('User data loaded:', userData.name);
        // USER_LISTにある漢字の名前等に書き換える
        userNameEl.textContent = userData.name || user.displayName || '';
        memberUserName = userData.name || user.displayName || '';
        memberUserGroup = userData.group || '';

        const statusArr = _parseStatus(userData.status);
        const statusUp = statusArr.map(v => String(v || '').toUpperCase().trim());
        // システム権限フラグは status 配列に残る
        isAdmin = statusUp.includes('WEB');
        isPortalAdmin = statusUp.includes('ADMIN');
        // 長老・案内係は orgRoles + appointment から派生
        isElder = deriveIsElder({ ...userData, orgRoles: userData.orgRoles || [], appointment: userData.appointment });
        isAnnaigakari = deriveIsAnnaigakari({ ...userData, orgRoles: userData.orgRoles || [] });
        // 旧 status 値からの互換フォールバック
        if (!isElder && statusUp.includes('EL')) isElder = true;
        if (!isAnnaigakari && statusUp.includes('AT')) isAnnaigakari = true;

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
let _signingIn = false;
loginBtn.addEventListener('click', () => {
  if (_signingIn) return;
  _signingIn = true;
  loginBtn.disabled = true;
  loginError.textContent = 'Googleへ移動中...';
  if (isMobile()) {
    auth.signInWithRedirect(provider);
  } else {
    auth.signInWithPopup(provider)
      .catch((err) => {
        if (err && err.code === 'auth/cancelled-popup-request') {
          loginError.textContent = '';
        } else if (err && err.code === 'auth/popup-closed-by-user') {
          loginError.textContent = '';
        } else {
          loginError.textContent = 'エラー: ' + (err?.message || err);
        }
      })
      .finally(() => {
        _signingIn = false;
        loginBtn.disabled = false;
      });
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

// アプリ起動
initApp();

// ── ルーティング ──────────────────────────────
let _prevPage = 'home';
function navigate(page, pushHistory) {
  if (!page) { page = 'home'; }
  // 直前ページを記録（自分以外への遷移時のみ更新）
  if (currentPage && currentPage !== page) _prevPage = currentPage;
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
    backBtn._backTarget = (_prevPage === 'home') ? 'home' : 'senkyo';
  } else if (page.startsWith('user-dept-')) {
    backBtn._backTarget = (_prevPage === 'home') ? 'home' : 'bumon';
  } else if (page.startsWith('jouhou-')) {
    backBtn._backTarget = 'jouhou';
  } else if (page === 'public-talk-view') {
    backBtn._backTarget = 'home';
  } else if (page === 'member-info' || page === 'area-info' || page === 'service-report' || page === 'pw-apply' || page === 'attendance-form') {
    backBtn._backTarget = (_prevPage === 'home') ? 'home' : 'shinsei';
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
  if (page === 'public-talk-view') { if (typeof renderPublicTalkView === 'function') renderPublicTalkView(); }
  if (page === 'talk-pref') { if (typeof renderTalkPrefForm === 'function') renderTalkPrefForm(); }
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
  if (page === 'admin-assignment-review')   initReviewPage();
  if (page === 'admin-family-groups')      initFamilyGroupsPage();
  if (page === 'admin-member-edit')        initMemberEditPage();
  if (page === 'admin-group-emergency')    loadGroupEmergency();
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
  if (page === 'admin-config')             renderConfigPage();
  if (page === 'admin-permission-simulator') renderPermissionSimulator();
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

document.getElementById('admin-manage-family-groups')?.addEventListener('click', () => {
  navigate('admin-family-groups');
});

document.getElementById('admin-manage-s13')?.addEventListener('click', () => {
  navigate('admin-s13');
});

document.getElementById('admin-manage-group-members')?.addEventListener('click', () => {
  navigate('admin-group-members');
  loadGroupMembers();
});

document.getElementById('admin-manage-group-emergency')?.addEventListener('click', () => {
  navigate('admin-group-emergency');
});

document.getElementById('admin-manage-member-edit')?.addEventListener('click', () => {
  navigate('admin-member-edit');
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

document.getElementById('admin-manage-config')?.addEventListener('click', () => {
  navigate('admin-config');
});

// メニューのクリック（data-page属性があるもののみ）
document.querySelectorAll('[data-page]').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.page));
});

// ホームメニューのアコーディオン
['shukai','senkyo','bumon','shinsei'].forEach(key => {
  const hdr = document.getElementById(`home-acc-${key}-header`);
  if (hdr) hdr.addEventListener('click', () => {
    const acc = document.getElementById(`home-acc-${key}`);
    if (acc) acc.classList.toggle('open');
    if (key === 'shinsei' && acc?.classList.contains('open')) loadHomeShinseiLinks();
  });
});

// フォームアコーディオン：固定項目 + Firestore動的リンク
let _homeShinseiLoaded = false;
async function loadHomeShinseiLinks() {
  if (_homeShinseiLoaded) return;
  const body = document.getElementById('home-acc-shinsei-body');
  if (!body) return;
  body.innerHTML = '';
  // 固定の内部ページ項目
  const formItems = [
    { icon: 'location_city', label: '公共エリア伝道申込み', page: 'pw-apply',        color: '#ef6c00' },
    { icon: 'summarize',     label: '奉仕報告',           page: 'service-report',  color: '#00897b' },
    { icon: 'location_on',   label: '区域情報登録',       page: 'area-info',       color: '#2196f3' },
    { icon: 'contact_phone', label: '成員情報登録',       page: 'member-info',     color: '#7b1fa2' },
  ];
  if (isAnnaigakari || isAdmin) {
    formItems.push({ icon: 'how_to_reg', label: '出席人数登録', page: 'attendance-form', color: '#1976d2' });
  }
  formItems.forEach(fi => {
    const el = document.createElement('div');
    el.className = 'admin-list-row home-acc-item';
    el.style.cursor = 'pointer';
    el.innerHTML = `<span class="material-icons admin-row-icon" style="color:${fi.color} !important">${fi.icon}</span><span class="admin-row-label">${fi.label}</span><span class="material-icons admin-row-chevron">chevron_right</span>`;
    el.addEventListener('click', () => navigate(fi.page));
    body.appendChild(el);
  });
  // 動的リンク（Firestore LINKS）— orderBy省略＋クライアント側ソート
  try {
    const snap = await db.collection('LINKS')
      .where('section', '==', 'shinsei')
      .get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    docs.forEach(d => {
      const a = document.createElement('a');
      a.className = 'admin-list-row home-acc-item';
      a.href = d.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `<span class="material-icons admin-row-icon" style="color:#607d8b !important">${esc(d.icon || 'insert_drive_file')}</span><span class="admin-row-label">${esc(d.title || '')}</span><span class="material-icons admin-row-chevron">open_in_new</span>`;
      body.appendChild(a);
    });
    _homeShinseiLoaded = true;
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'loading';
    err.style.padding = '12px';
    err.textContent = '読み込みエラー: ' + e.message;
    body.appendChild(err);
  }
}

// 宣教アコーディオン：区域情報の権限に応じてサブ項目の表示を制御
function updateSenkyoAccordionVisibility() {
  // 既存の senkyo-area-list の hidden 状態を確認
  const senkyoAreaList = document.getElementById('senkyo-area-list');
  const isVisible = senkyoAreaList && !senkyoAreaList.classList.contains('hidden');
  document.querySelectorAll('.home-acc-area').forEach(el => {
    el.classList.toggle('hidden', !isVisible);
  });
}
// 既存の表示制御後にもう一度呼び出されるよう、可視性監視
(function watchSenkyoVisibility() {
  const target = document.getElementById('senkyo-area-list');
  if (!target) return;
  const obs = new MutationObserver(() => updateSenkyoAccordionVisibility());
  obs.observe(target, { attributes: true, attributeFilter: ['class'] });
  updateSenkyoAccordionVisibility();
})();

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

// ── CONFIG（会衆設定）共通 ────────────────────
let _appConfig = null;
async function getAppConfig() {
  if (_appConfig) return _appConfig;
  try {
    const snap = await db.collection('CONFIG').doc('app').get();
    _appConfig = snap.exists ? snap.data() : {};
  } catch (e) { console.warn('CONFIG load error:', e); _appConfig = {}; }
  return _appConfig;
}
async function saveAppConfig(updates) {
  await db.collection('CONFIG').doc('app').set(updates, { merge: true });
  _appConfig = { ..._appConfig, ...updates };
}
// 集会曜日を取得（デフォルト: 木=4, 日=0）
async function getMeetingDays() {
  const cfg = await getAppConfig();
  return Array.isArray(cfg.meetingDays) && cfg.meetingDays.length > 0 ? cfg.meetingDays : [4, 0];
}
// 指定月の集会日一覧を返す
async function getMeetingDatesForMonth(year, month) {
  const days = await getMeetingDays();
  const dates = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (days.includes(d.getDay())) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

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
// ── USER_LIST キャッシュ（Firestore readsを抑制） ──────────
// 書き込み後は invalidateUserListCache() を呼んで無効化
let _userListCache = null;
let _userListCachePromise = null;
let _cachedUserList = null; // 旧キャッシュ（member picker専用、フィルタ済み）

async function getUserListCached() {
  if (_userListCache) return _userListCache;
  if (_userListCachePromise) return _userListCachePromise;
  _userListCachePromise = (async () => {
    const snap = await db.collection('USER_LIST').get();
    _userListCache = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    _userListCachePromise = null;
    return _userListCache;
  })();
  return _userListCachePromise;
}

function invalidateUserListCache() {
  _userListCache = null;
  _userListCachePromise = null;
  _cachedUserList = null;
}

// 書き込み後にキャッシュを部分更新（再フェッチを回避）
function applyUserListLocal(docId, data) {
  _cachedUserList = null; // member picker 旧キャッシュは作り直し
  if (!_userListCache) return;
  const idx = _userListCache.findIndex(m => m.docId === docId);
  if (idx >= 0) {
    _userListCache[idx] = { ...(_userListCache[idx] || {}), ...data, docId };
  } else {
    _userListCache.push({ docId, ...data });
  }
}

function removeUserListLocal(docId) {
  _cachedUserList = null;
  if (!_userListCache) return;
  _userListCache = _userListCache.filter(m => m.docId !== docId);
}

window.invalidateUserListCache = invalidateUserListCache;
window.getUserListCached = getUserListCached;
window.applyUserListLocal = applyUserListLocal;
window.removeUserListLocal = removeUserListLocal;

async function _renderMemberPicker() {
  const container = document.getElementById('af-member-picker');
  if (!container) return;

  // 既にチェック済みの状態を保持しながら再描画しないよう初回のみ描画
  if (container.dataset.loaded === '1') return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    if (!_cachedUserList) {
      const all = await getUserListCached();
      _cachedUserList = all
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

    if (section === 'shukai' && isElder) {
      const shukaiItems = [
        { icon: 'record_voice_over', label: '講演希望番号', page: 'talk-pref' },
      ];
      shukaiItems.forEach(fi => {
        const el = document.createElement('div');
        el.className = 'admin-list-row';
        el.style.cursor = 'pointer';
        el.innerHTML = `<span class="material-icons admin-row-icon">${fi.icon}</span><span class="admin-row-label">${fi.label}</span><span class="material-icons admin-row-chevron">chevron_right</span>`;
        el.addEventListener('click', () => navigate(fi.page));
        listEl.appendChild(el);
      });
    }

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
        <label>生年月日</label>
        <input type="text" id="mf-birth-date" value="${esc(data.birthDate || '')}" readonly style="background:#f5f5f5;">
      </div>

      <div class="form-group">
        <label>バプテスマの日付</label>
        <input type="text" id="mf-baptism-date" value="${esc(data.baptismDate || '')}" readonly style="background:#f5f5f5;">
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
      emergencyContacts: contacts,
    };

    await db.collection('USER_LIST').doc(currentUserDocId).update(data);
    applyUserListLocal(currentUserDocId, data);

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
    const userList = await getUserListCached();

    // USER_LIST から GO / GA を抽出してグループ別に振り分け
    const groupMap = {};
    userList.forEach(data => {
      const name = String(data.name || '').trim();
      if (!name) return;
      const arr = _parseStatus(data.status);
      if (arr.includes('inactive')) return;
      const gr = deriveGroupRole(data);
      const isGO = gr?.position === '監督' || arr.includes('GO');
      const isGA = gr?.position === '補佐' || arr.includes('GA');
      if (!isGO && !isGA) return;
      const group = String(data.group || '').trim() || '（未所属）';
      if (!groupMap[group]) groupMap[group] = { go: [], ga: [] };
      const rec = {
        name,
        phone: String(data.phone || '').trim(),
        homePhone: String(data.homePhone || '').trim(),
        mail: String(data.mail || '').trim(),
        address: String(data.address || '').trim(),
      };
      if (isGO) groupMap[group].go.push(rec);
      if (isGA) groupMap[group].ga.push(rec);
    });

    const groupNames = Object.keys(groupMap).sort((a, b) => {
      if (a === '（未所属）') return 1;
      if (b === '（未所属）') return -1;
      return a.localeCompare(b, 'ja');
    });

    if (groupNames.length === 0) {
      view.innerHTML = '<div class="empty-state">グループ監督・補佐の情報がありません</div>';
      return;
    }

    function renderCard(role, rec) {
      let h = '<div class="renraku-card">';
      h += '<div class="renraku-role">' + esc(role) + '</div>';
      h += '<div class="renraku-name">' + esc(rec.name) + '</div>';
      if (rec.phone)     h += '<div class="renraku-detail"><span class="material-icons">smartphone</span><a href="tel:' + esc(rec.phone) + '">' + esc(rec.phone) + '</a></div>';
      if (rec.homePhone) h += '<div class="renraku-detail"><span class="material-icons">phone</span><a href="tel:' + esc(rec.homePhone) + '">' + esc(rec.homePhone) + '</a></div>';
      if (rec.mail)      h += '<div class="renraku-detail"><span class="material-icons">mail</span><a href="mailto:' + esc(rec.mail) + '">' + esc(rec.mail) + '</a></div>';
      if (rec.address)   h += '<div class="renraku-detail"><span class="material-icons">home</span>' + esc(rec.address) + '</div>';
      h += '</div>';
      return h;
    }

    const myGroup = (memberUserGroup || '').trim();

    let html = '';
    groupNames.forEach(group => {
      const { go, ga } = groupMap[group];
      const isMine = group === myGroup;
      // 自グループはデフォルトで展開、他グループは折りたたみ
      html += '<details class="renraku-group"' + (isMine ? ' open' : '') + '>';
      html += '<summary class="renraku-group-title">' + esc(group);
      if (isMine) html += '<span class="renraku-my-tag">自分のグループ</span>';
      html += '<span class="material-icons renraku-chevron">expand_more</span>';
      html += '</summary>';
      html += '<div class="renraku-group-body">';
      go.forEach(r => html += renderCard('グループ監督', r));
      ga.forEach(r => html += renderCard('補佐', r));
      html += '</div>';
      html += '</details>';
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

    // 氏名・ふりがな は名刺風ヘッダーで表示
    // ふりがなは「ひらがな・カタカナのみ」の場合に表示（漢字が混ざってる場合は非表示）
    const isPhonetic = s => !!s && !/[一-鿿]/.test(s) && /[぀-ゟ゠-ヿ]/.test(s);
    html += '<div class="contact-name-card">';
    if (isPhonetic(d.furigana)) html += '<div class="contact-furigana">' + esc(d.furigana) + '</div>';
    html += '<div class="contact-name">' + esc(d.name || '') + '</div>';
    html += '</div>';

    fields.slice(2).forEach(f => {
      html += '<div class="sr-field">';
      html += '<label class="sr-label">' + esc(f.label) + '</label>';
      html += '<div class="sr-input-wrap"><input type="text" value="' + esc(f.value || '') + '" readonly style="background:#f5f5f5"></div>';
      html += '</div>';
    });

    // 緊急連絡先（emergencyContacts: [{ name, phone }, ...]）
    let contacts = [];
    if (Array.isArray(d.emergencyContacts)) {
      contacts = d.emergencyContacts;
    } else if (typeof d.emergencyContacts === 'string' && d.emergencyContacts) {
      try { const a = JSON.parse(d.emergencyContacts); if (Array.isArray(a)) contacts = a; }
      catch (e) {}
    }
    contacts = contacts.filter(c => c && (c.name || c.phone));

    if (contacts.length > 0) {
      html += '<div class="sr-field-section">緊急連絡先</div>';
      contacts.forEach((c, i) => {
        html += '<div class="sr-emergency-card">';
        html += '<div class="sr-emergency-label">緊急連絡先 ' + (i + 1) + '</div>';
        if (c.name)  html += '<div class="sr-emergency-row"><span class="material-icons">person</span>' + esc(c.name) + '</div>';
        if (c.phone) html += '<div class="sr-emergency-row"><span class="material-icons">phone</span><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a></div>';
        html += '</div>';
      });
    }

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
      status: _parseStatus(d.status),
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
    const userList = await getUserListCached();
    const groupSet = new Set();
    userList.forEach(d => {
      const g = String(d.group || '').trim();
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
      // places 配列 もしくは レガシー place 文字列
      const placesArr = Array.isArray(data.places) && data.places.length
        ? data.places
        : (data.place ? String(data.place).split(/[、,／/]/).map(s => s.trim()).filter(Boolean) : []);
      if (!day || placesArr.length === 0) return;
      items.push({
        key: d.id || (day + '_' + data.starttime + '_' + placesArr.join(',')),
        date: day,
        weekday: String(data.dayofweek || ''),
        startTime: String(data.starttime || ''),
        endTime: String(data.endtime || ''),
        places: placesArr,
        place: placesArr.join('、'),
        order: typeof data.order === 'number' ? data.order : 9999,
      });
    });
    // 日付順 → 時刻順にソート
    items.sort((a, b) => {
      const da = a.date.replace(/[^\d]/g, '').padStart(4, '0');
      const db2 = b.date.replace(/[^\d]/g, '').padStart(4, '0');
      if (da !== db2) return da.localeCompare(db2);
      if (a.order !== b.order) return a.order - b.order;
      return a.startTime.localeCompare(b.startTime);
    });

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">event_busy</span>現在申込み可能な日程がありません</div>';
      return;
    }

    container.innerHTML = '';

    // 日付グループ＋スロットカード
    let curDate = '';
    let curGroup = null;
    items.forEach(item => {
      const dateLabel = `${item.date}(${item.weekday})`;
      if (dateLabel !== curDate) {
        curGroup = document.createElement('div');
        curGroup.className = 'pw-date-group';
        const tag = document.createElement('div');
        tag.className = 'pw-date-tag';
        tag.textContent = dateLabel;
        curGroup.appendChild(tag);
        container.appendChild(curGroup);
        curDate = dateLabel;
      }

      const card = document.createElement('div');
      card.className = 'pw-slot-card pwa-card';
      card.dataset.key = item.key;
      card.style.position = 'relative';
      card.style.cursor = 'pointer';

      const singlePlace = item.places && item.places.length === 1;
      const locSectionClass = singlePlace ? ' hidden' : '';
      const placeBadges = item.places.map(p => {
        const cls = p.includes('唐木田') ? 'pw-place-karakida'
                  : p.includes('堀之内') ? 'pw-place-horinouchi' : 'pw-place-other';
        const label = p.replace(/駅$/, '');
        return `<span class="pw-place-badge ${cls}">${esc(label)}</span>`;
      }).join('');

      card.innerHTML = `
        <div class="pwa-row-main" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%">
          <span class="material-icons pw-slot-icon">access_time</span>
          <span class="pw-slot-time">${esc(item.startTime)}〜${esc(item.endTime)}</span>
          ${placeBadges}
          <span class="pwa-check" style="margin-left:auto"><span class="material-icons">check_circle_outline</span></span>
        </div>
        <div class="pwa-options hidden" style="width:100%;margin-top:10px;padding-top:10px;border-top:1px dashed #ddd">
          <div class="pwa-section">
            <div class="pwa-section-label">参加立場</div>
            <div class="pwa-roles-list"></div>
          </div>
          <div class="pwa-section${locSectionClass}">
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

      if (singlePlace) {
        // 場所が1つだけなら自動で設定（UIは非表示）
        if (!pwApplySelected[item.key]) pwApplySelected[item.key] = {};
        pwApplySelected[item.key].location = item.places[0];
      } else {
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
      }

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
          // 場所が1つだけのときは自動で location を設定
          if (singlePlace) {
            if (!pwApplySelected[item.key]) pwApplySelected[item.key] = {};
            pwApplySelected[item.key].location = item.places[0];
          }
        }
      });

      curGroup.appendChild(card);
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
    // 場所が複数あるときだけ表示（単一の場合は location と重複するため省略）
    const parts = [];
    if (item.places && item.places.length > 1) {
      parts.push(item.places.map(p => p.replace(/駅$/, '')).join('・'));
    }
    if (sel.role) parts.push(sel.role);
    if (sel.location) parts.push(sel.location);
    msg += parts.join(' / ') + '\n\n';
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
    const userList = await getUserListCached();
    rptMembers = [];
    userList.forEach(data => {
      const name = String(data.name || '').trim();
      if (!name) return;
      // emergencyContacts: 配列・JSON文字列どちらでも受け取る
      let ec = data.emergencyContacts;
      if (typeof ec === 'string' && ec) {
        try { const a = JSON.parse(ec); if (Array.isArray(a)) ec = a; else ec = []; }
        catch (e) { ec = []; }
      }
      if (!Array.isArray(ec)) ec = [];

      rptMembers.push({
        id: data.docId,
        name,
        group: String(data.group || '').trim(),
        gender: String(data.gender || '').trim(),
        birthDate: String(data.birthDate || '').trim(),
        baptismDate: String(data.baptismDate || '').trim(),
        status: _parseStatus(data.status),
        hope: String(data.hope || '').trim(),
        phone: String(data.phone || '').trim(),
        homePhone: String(data.homePhone || '').trim(),
        emergencyContacts: ec.filter(c => c && (c.name || c.phone)),
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
  const arr = _parseStatus(m.status);
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
  const arr = _parseStatus(m.status);
  const parts = [];
  if (m.appointment === 'elder' || arr.includes('EL') || deriveIsElder(m)) parts.push('長老');
  else if (m.appointment === 'ministerial' || arr.includes('MS')) parts.push('援助奉仕者');
  if (deriveIsPioneer(m) || arr.includes('RP') || arr.includes('正規開拓者')) parts.push('開拓者');
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
    const [userList, reportSnap] = await Promise.all([
      getUserListCached(),
      db.collection('PREACHING_REPORT').where('month', '==', month).get(),
    ]);

    const members = [];
    userList.forEach(data => {
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
  const userList = await getUserListCached();
  s13SupervisorMap = {};
  userList.forEach(d => {
    const arr = _parseStatus(d.status);
    const gr = deriveGroupRole(d);
    const isGroupOverseer = gr?.position === '監督' || arr.includes('GO') || arr.includes('SV');
    if (!isGroupOverseer) return;
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

// USER_LIST.orgRoles （新形式: {department, position}）から組織表データを集約
function buildOrgChartFromUserList(userList) {
  // 部門マスタを起点に構築。各部門に supervisor/assistant/responsible/members[] を埋める
  const deptDataMap = new Map();
  ORG_DEPARTMENTS.forEach(d => {
    deptDataMap.set(d.id, { def: d, supervisor: '', assistant: '', responsible: '', members: [] });
  });
  const orgIdToPosDept = { annai:'annai', stage_av:'avs', parking:'parking' };
  userList.forEach(u => {
    const name = String(u.name || '').trim();
    if (!name) return;
    const roles = Array.isArray(u.orgRoles) ? u.orgRoles : [];
    roles.forEach(r => {
      if (!r) return;
      const deptId = r.department;
      const pos = r.position;
      if (!deptId || !pos) return;
      const d = deptDataMap.get(deptId);
      if (!d) return;
      if (pos === '監督')      d.supervisor  = name;
      else if (pos === '補佐') d.assistant   = name;
      else if (pos === '責任者') d.responsible = name;
      else if (pos === '奉仕者') d.members.push(name);
    });
    // deptPositions から奉仕者を導出
    const dp = (u.deptPositions && typeof u.deptPositions === 'object') ? u.deptPositions : {};
    Object.entries(orgIdToPosDept).forEach(([orgId, posDeptKey]) => {
      if (Array.isArray(dp[posDeptKey]) && dp[posDeptKey].length > 0) {
        const d = deptDataMap.get(orgId);
        if (d && !d.members.includes(name)) d.members.push(name);
      }
    });
  });
  // 奉仕者を50音順にソート
  deptDataMap.forEach(d => d.members.sort((a, b) => a.localeCompare(b, 'ja')));
  return deptDataMap;
}

function renderOrgFromUserList(deptDataMap) {
  const supervisors = ORG_DEPARTMENTS.filter(d => d.type === 'supervisor').sort((a,b) => a.order - b.order);
  const subDepts = ORG_DEPARTMENTS.filter(d => d.type === 'sub').sort((a,b) => a.order - b.order);
  const elders = ORG_DEPARTMENTS.filter(d => d.type === 'elder').sort((a,b) => a.order - b.order);

  function getNames(deptId, pos) {
    const d = deptDataMap.get(deptId);
    if (!d) return '';
    if (pos === '監督') return d.supervisor;
    if (pos === '補佐') return d.assistant;
    if (pos === '責任者') return d.responsible;
    if (pos === '奉仕者') return d.members.join(', ');
    return '';
  }

  let html = '<div class="org-pv-wrap">';
  html += '<h3 class="org-pv-title">東京都多摩市唐木田会衆　組織表</h3>';

  // 奉仕委員会
  html += '<table class="org-pv-tbl"><thead><tr><th>管轄</th><th>監督</th><th>補佐</th></tr></thead><tbody>';
  supervisors.forEach(sup => {
    html += '<tr><td><strong>' + esc(sup.label) + '</strong></td>';
    html += '<td>' + esc(getNames(sup.id, '監督')) + '</td>';
    html += '<td>' + esc(getNames(sup.id, '補佐')) + '</td></tr>';
  });
  html += '</tbody></table>';

  // 管轄別
  supervisors.forEach(sup => {
    const children = subDepts.filter(d => d.parent === sup.id);
    if (children.length === 0) return;
    html += '<table class="org-pv-tbl"><thead><tr><th colspan="3">' + esc(sup.label) + '管轄</th></tr>';
    html += '<tr><th>部門</th><th>責任者</th><th>奉仕者</th></tr></thead><tbody>';
    children.forEach(child => {
      html += '<tr><td>' + esc(child.label) + '</td>';
      html += '<td>' + esc(getNames(child.id, '責任者')) + '</td>';
      html += '<td>' + esc(getNames(child.id, '奉仕者')) + '</td></tr>';
    });
    html += '</tbody></table>';
  });

  // 長老団
  html += '<table class="org-pv-tbl"><thead><tr><th colspan="3">長老団管轄</th></tr>';
  html += '<tr><th>部門</th><th>責任者</th><th>奉仕者</th></tr></thead><tbody>';
  elders.forEach(d => {
    html += '<tr><td>' + esc(d.label) + '</td>';
    html += '<td>' + esc(getNames(d.id, '責任者')) + '</td>';
    html += '<td>' + esc(getNames(d.id, '奉仕者')) + '</td></tr>';
  });
  html += '</tbody></table>';

  html += '</div>';
  return html;
}

async function loadOrgView() {
  const chartView = document.getElementById('org-view-chart') || document.getElementById('org-view');
  const groupView = document.getElementById('org-view-group');
  if (!chartView) return;
  chartView.innerHTML = '<div class="loading">読み込み中...</div>';
  if (groupView) groupView.innerHTML = '';
  try {
    // まず USER_LIST.orgRoles から構築を試みる
    const userListAll = await getUserListCached();
    const hasOrgRoles = userListAll.some(u => Array.isArray(u.orgRoles) && u.orgRoles.length > 0);
    if (hasOrgRoles) {
      const depts = buildOrgChartFromUserList(userListAll);
      chartView.innerHTML = renderOrgFromUserList(depts);
    } else {
      // 互換: USER_LIST.orgRoles未登録の場合は従来通り ORG_CHART を使用
      await _loadOrgViewLegacy(chartView);
    }

    // グループ成員表（既存ロジック）
    await _renderGroupMemberSection(groupView, userListAll);
  } catch (e) {
    console.error('loadOrgView error:', e);
    chartView.innerHTML = '<div class="empty-state">読み込みエラー: ' + e.message + '</div>';
  }
}

async function _loadOrgViewLegacy(chartView) {
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
    for (var e2 = 0; e2 < elders.length; e2++) {
      roleGroups.push({ role: elders[e2], depts: committee.slice(e2 * per, (e2 + 1) * per) });
    }
  }

  var colors = ['#e8f5e9', '#fff3e0', '#e3f2fd'];
  for (var i = 0; i < roleGroups.length; i++) {
    var rg = roleGroups[i];
    rg.totalRows = rg.depts.reduce(function(s, d) { return s + mRows(d); }, 0);
    rg.color = colors[i % colors.length];
  }
  var totalCommRows = roleGroups.reduce(function(s, x) { return s + x.totalRows; }, 0);

  var html = '<div class="org-xl-wrap">';
  html += '<h3 class="org-xl-title">東京都多摩市唐木田会衆　組織表</h3>';
  html += '<div class="org-xl-scroll"><table class="org-xl">';
  html += '<thead><tr><th colspan="2"></th><th>監督</th><th>補佐</th><th>部門</th><th>責任者</th><th colspan="3">奉仕者</th></tr></thead>';
  html += '<tbody>';

  var firstRole = true;
  for (var gi = 0; gi < roleGroups.length; gi++) {
    var rgg = roleGroups[gi];
    var firstDept = true;
    for (var di = 0; di < rgg.depts.length; di++) {
      var dept = rgg.depts[di];
      var rows = mRows(dept);
      var mems = toArr(dept.members);
      for (var r = 0; r < rows; r++) {
        html += '<tr>';
        if (firstRole && firstDept && r === 0)
          html += '<td class="org-xl-sec" rowspan="' + totalCommRows + '">奉<br>仕<br>委<br>員<br>会</td>';
        if (firstDept && r === 0) {
          html += '<td class="org-xl-role" style="background:' + rgg.color + '" rowspan="' + rgg.totalRows + '">' + esc(rgg.role.department || '') + '</td>';
          html += '<td class="org-xl-sv" style="background:' + rgg.color + '" rowspan="' + rgg.totalRows + '">' + esc(rgg.role.supervisor || '') + '</td>';
          html += '<td style="background:' + rgg.color + '" rowspan="' + rgg.totalRows + '">' + esc(rgg.role.assistant || '') + '</td>';
        }
        if (r === 0) {
          html += '<td class="org-xl-dept"' + (rows > 1 ? ' rowspan="' + rows + '"' : '') + '>' + esc(dept.department || '') + '</td>';
          html += '<td' + (rows > 1 ? ' rowspan="' + rows + '"' : '') + '>' + esc(dept.responsible || '') + '</td>';
        }
        for (var c = 0; c < 3; c++) {
          var mi = r * 3 + c;
          html += '<td class="org-xl-m">' + (mi < mems.length ? esc(mems[mi]) : '') + '</td>';
        }
        html += '</tr>';
      }
      firstDept = false;
    }
    firstRole = false;
  }

  if (rest.length > 0) {
    var totalRestRows = rest.reduce(function(s, d) { return s + mRows(d); }, 0);
    var firstRest = true;
    for (var ri = 0; ri < rest.length; ri++) {
      var item = rest[ri];
      var rows2 = mRows(item);
      var mems2 = toArr(item.members);
      for (var r2 = 0; r2 < rows2; r2++) {
        html += '<tr class="org-xl-bottom">';
        if (firstRest && r2 === 0)
          html += '<td class="org-xl-sec org-xl-sec-bottom" rowspan="' + totalRestRows + '">長<br>老<br>団</td>';
        if (r2 === 0) {
          html += '<td class="org-xl-dept" colspan="4"' + (rows2 > 1 ? ' rowspan="' + rows2 + '"' : '') + '>' + esc(item.department || '') + '</td>';
          html += '<td' + (rows2 > 1 ? ' rowspan="' + rows2 + '"' : '') + '>' + esc(item.responsible || '') + '</td>';
        }
        for (var c2 = 0; c2 < 3; c2++) {
          var mi2 = r2 * 3 + c2;
          html += '<td class="org-xl-m">' + (mi2 < mems2.length ? esc(mems2[mi2]) : '') + '</td>';
        }
        html += '</tr>';
      }
      firstRest = false;
    }
  }

  html += '</tbody></table></div></div>';
  chartView.innerHTML = html;
}

async function _renderGroupMemberSection(groupView, userList) {
  if (!groupView) return;
  const users = [];
  userList.forEach(data => {
    const name = String(data.name || '').trim();
    if (!name) return;
    const arr = _parseStatus(data.status);
    // appointment + orgRoles 派生（旧status fallback付き）
    let roleLabel = '伝道者';
    if (data.appointment === 'elder' || arr.includes('EL') || deriveIsElder(data)) roleLabel = '長老';
    else if (data.appointment === 'ministerial' || arr.includes('MS')) roleLabel = '援助奉仕者';
    if (deriveIsPioneer(data) || arr.includes('RP') || arr.includes('AP')) roleLabel += ' / 開拓者';
    users.push({
      name,
      furigana: String(data.furigana || '').trim(),
      group: String(data.group || '').trim(),
      gender: String(data.gender || '').trim(),
      roleLabel,
    });
  });
  users.sort((a, b) => a.group.localeCompare(b.group) || (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja'));
  const groupMap = {};
  users.forEach(u => { if (!u.group) return; if (!groupMap[u.group]) groupMap[u.group] = []; groupMap[u.group].push(u); });

  const KANA_ROWS = [
    { tag: 'あ', chars: 'アァイィウゥエェオォあぁいぃうぅえぇおぉ' },
    { tag: 'か', chars: 'カガキギクグケゲコゴかがきぎくぐけげこご' },
    { tag: 'さ', chars: 'サザシジスズセゼソゾさざしじすずせぜそぞ' },
    { tag: 'た', chars: 'タダチヂツヅテデトドたぢちつづてでとど' },
    { tag: 'な', chars: 'ナニヌネノなにぬねの' },
    { tag: 'は', chars: 'ハバパヒビピフブプヘベペホボポはばぱひびぴふぶぷへべぺほぼぽ' },
    { tag: 'ま', chars: 'マミムメモまみむめも' },
    { tag: 'や', chars: 'ヤャユュヨョやゃゆゅよょ' },
    { tag: 'ら', chars: 'ラリルレロらりるれろ' },
    { tag: 'わ', chars: 'ワヰヱヲンわをん' },
  ];
  function getKanaTag(s) {
    if (!s) return '';
    const ch = s.charAt(0);
    for (const r of KANA_ROWS) { if (r.chars.includes(ch)) return r.tag; }
    return '';
  }

  let gHtml = '';
  Object.keys(groupMap).sort((a, b) => a.localeCompare(b, 'ja')).forEach(gName => {
    const members = groupMap[gName];
    gHtml += '<div class="group-member-card">';
    gHtml += '<div class="group-member-header">' + esc(gName) + '<span class="group-member-count">' + members.length + '名</span></div>';
    gHtml += '<div class="group-member-list">';
    let prevTag = '';
    members.forEach(m => {
      const tag = getKanaTag(m.furigana || m.name);
      if (tag && tag !== prevTag) {
        gHtml += '<div class="group-member-kana-tag">' + esc(tag) + '</div>';
        prevTag = tag;
      }
      const gIcon = m.gender === 'M' || m.gender === '男' ? 'man' : m.gender === 'F' || m.gender === '女' ? 'woman' : 'person';
      gHtml += '<div class="group-member-row"><span class="material-icons group-member-icon">' + gIcon + '</span><span class="group-member-name">' + esc(m.name) + '</span><span class="group-member-role">' + esc(m.roleLabel) + '</span></div>';
    });
    gHtml += '</div></div>';
  });
  groupView.innerHTML = gHtml;
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
      // places 配列 もしくは レガシー place 文字列を正規化
      const placesArr = Array.isArray(opt.places) && opt.places.length
        ? opt.places
        : (opt.place ? String(opt.place).split(/[、,／/]/).map(s => s.trim()).filter(Boolean) : []);
      if (placesArr.length === 0) return;

      const key = `${day}_${time}`;
      if (key !== lastKey) {
        groups.push({ day, weekday, time, slots: [] });
        lastKey = key;
      }
      // 各場所ごとにサブエリアを展開して追加
      placesArr.forEach(p => {
        groups[groups.length - 1].slots.push({ place: p, places: getPlaces(weekday, time, p) });
      });
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
      hdr.className = 'aw-inline-header';
      hdr.innerHTML = `
        <div class="aw-header-left">
          <div class="aw-inline-title${isWeekend ? ' fs-hdr-weekend' : ''}">${esc(group.day)}（${esc(group.weekday)}）</div>
          <div class="aw-inline-sub">${esc(group.time)}</div>
        </div>
      `;
      section.appendChild(hdr);

      const body = document.createElement('div');
      body.className = 'pw-grid-wrap';
      body.style.padding = '12px';

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
function _calcAge(birthDate) {
  if (!birthDate) return '';
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(birthDate));
  if (!m) return '';
  const b = new Date(+m[1], +m[2]-1, +m[3]);
  if (isNaN(b)) return '';
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const mDiff = today.getMonth() - b.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

function _gmMemberRank(arr, gender, user) {
  const gr = user ? deriveGroupRole(user) : null;
  if (gr?.position === '監督' || arr.includes('GO')) return 0;
  if (gr?.position === '補佐' || arr.includes('GA')) return 1;
  const isPioneer = (user && deriveIsPioneer(user)) || arr.includes('RP') || arr.includes('AP');
  if (gender === '男') return isPioneer ? 2 : 3;
  if (gender === '女') return isPioneer ? 4 : 5;
  return 6;
}

// グループ成員緊急連絡先
async function loadGroupEmergency() {
  const container = document.getElementById('group-emergency-list');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const userList = await getUserListCached();

    const members = userList
      .map(d => {
        const arr = _parseStatus(d.status);
        // emergencyContacts: 配列・JSON文字列どちらでも対応
        let ec = d.emergencyContacts;
        if (typeof ec === 'string' && ec) {
          try { const a = JSON.parse(ec); ec = Array.isArray(a) ? a : []; }
          catch (e) { ec = []; }
        }
        if (!Array.isArray(ec)) ec = [];
        ec = ec.filter(c => c && (c.name || c.phone));
        return {
          name: String(d.name || '').trim(),
          furigana: String(d.furigana || '').trim(),
          group: String(d.group || '').trim() || '（未所属）',
          gender: String(d.gender || '').trim(),
          phone: String(d.phone || '').trim(),
          homePhone: String(d.homePhone || '').trim(),
          status: arr,
          _inactive: arr.includes('inactive'),
          _rank: _gmMemberRank(arr, String(d.gender || '').trim()),
          contacts: ec,
        };
      })
      .filter(m => m.name && !m._inactive);

    const groupMap = {};
    members.forEach(m => {
      if (!groupMap[m.group]) groupMap[m.group] = [];
      groupMap[m.group].push(m);
    });
    Object.values(groupMap).forEach(arr => {
      arr.sort((a, b) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        return (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja');
      });
    });

    const groupNames = Object.keys(groupMap).sort((a, b) => {
      if (a === '（未所属）') return 1;
      if (b === '（未所属）') return -1;
      return a.localeCompare(b, 'ja');
    });

    if (groupNames.length === 0) {
      container.innerHTML = '<div class="empty-state">データがありません</div>';
      return;
    }

    let html = '';
    groupNames.forEach(group => {
      const list = groupMap[group];
      html += `<div class="gec-group">
        <div class="gec-group-header">${esc(group)} <span class="gec-count">${list.length}名</span></div>
        <div class="gec-list">`;
      list.forEach(m => {
        html += `<div class="gec-card">
          <div class="gec-card-head">
            <span class="gec-name">${esc(m.name)}</span>`;
        if (m.phone)     html += `<span class="gec-self-phone">本人: ${esc(m.phone)}</span>`;
        else if (m.homePhone) html += `<span class="gec-self-phone">本人: ${esc(m.homePhone)}</span>`;
        html += `</div>`;
        if (m.contacts.length === 0) {
          html += `<div class="gec-empty">緊急連絡先 未登録</div>`;
        } else {
          m.contacts.forEach((c, i) => {
            html += `<div class="gec-row">
              <span class="gec-row-num">${i+1}</span>
              <span class="gec-row-name">${esc(c.name || '')}</span>
              <span class="gec-row-phone">${esc(c.phone || '')}</span>
            </div>`;
          });
        }
        html += `</div>`;
      });
      html += `</div></div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="loading">読み込みエラー: ${esc(e.message)}</div>`;
  }
}

async function loadGroupMembers() {
  const container = document.getElementById('group-members-list');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const userList = await getUserListCached();

    // 各メンバーのデータを整形（無効化は除外）
    const members = userList
      .map(d => {
        const arr = _parseStatus(d.status);
        return {
          docId: d.docId,
          name: String(d.name || '').trim(),
          furigana: String(d.furigana || '').trim(),
          group: String(d.group || '').trim() || '（未所属）',
          gender: String(d.gender || '').trim(),
          age: _calcAge(d.birthDate),
          status: arr,
          stability: String(d.stability || '').trim(),  // 高 / 低 / ''
          hasCar: d.hasCar === true || d.hasCar === '○' || d.hasCar === '車',
          _inactive: arr.includes('inactive'),
          _rank: _gmMemberRank(arr, String(d.gender || '').trim()),
        };
      })
      .filter(m => m.name && !m._inactive);

    // グループ別に振り分け
    const groupMap = {};
    members.forEach(m => {
      if (!groupMap[m.group]) groupMap[m.group] = [];
      groupMap[m.group].push(m);
    });

    // グループ内ソート: ランク → ふりがな
    Object.values(groupMap).forEach(arr => {
      arr.sort((a, b) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        return (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja');
      });
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

    // 全グループの最大行数（揃った行数で表示）
    const maxRows = Math.max(...sortedGroups.map(g => groupMap[g].length));

    // ふりがな先頭文字 → 50音タグ
    const KANA_ROWS = [
      { tag: 'あ', chars: 'アァイィウゥエェオォあぁいぃうぅえぇおぉ' },
      { tag: 'か', chars: 'カガキギクグケゲコゴかがきぎくぐけげこご' },
      { tag: 'さ', chars: 'サザシジスズセゼソゾさざしじすずせぜそぞ' },
      { tag: 'た', chars: 'タダチヂツヅテデトドたぢちつづてでとど' },
      { tag: 'な', chars: 'ナニヌネノなにぬねの' },
      { tag: 'は', chars: 'ハバパヒビピフブプヘベペホボポはばぱひびぴふぶぷへべぺほぼぽ' },
      { tag: 'ま', chars: 'マミムメモまみむめも' },
      { tag: 'や', chars: 'ヤャユュヨョやゃゆゅよょ' },
      { tag: 'ら', chars: 'ラリルレロらりるれろ' },
      { tag: 'わ', chars: 'ワヰヱヲンわをん' },
    ];
    function getKanaTag(s) {
      if (!s) return '';
      const ch = s.charAt(0);
      for (const r of KANA_ROWS) { if (r.chars.includes(ch)) return r.tag; }
      return '';
    }

    let html = '<div class="gm-grid">';
    sortedGroups.forEach(group => {
      const list = groupMap[group];
      html += `<div class="gm-group">
        <div class="gm-group-header">${esc(group)} <span class="gm-count">${list.length}名</span></div>
        <table class="gm-table gm-table-simple">
          <thead>
            <tr>
              <th class="gm-tag-col">行</th>
              <th class="gm-num">#</th>
              <th class="gm-name">名前</th>
            </tr>
          </thead>
          <tbody>`;
      let prevTag = '';
      for (let i = 0; i < maxRows; i++) {
        const m = list[i];
        if (!m) {
          html += `<tr class="gm-row gm-row-empty"><td class="gm-tag-col"></td><td class="gm-num">${i+1}</td><td></td></tr>`;
          continue;
        }
        const mGr = deriveGroupRole(m);
        const rowClass = (mGr?.position === '監督' || m.status.includes('GO')) ? 'gm-row-go'
                       : (mGr?.position === '補佐' || m.status.includes('GA')) ? 'gm-row-ga'
                       : (m.gender === '男' ? 'gm-row-m' : m.gender === '女' ? 'gm-row-f' : '');
        const tag = getKanaTag(m.furigana || m.name);
        const tagCell = tag && tag !== prevTag ? tag : '';
        prevTag = tag;
        html += `<tr class="gm-row ${rowClass}">
          <td class="gm-tag-col">${esc(tagCell)}</td>
          <td class="gm-num">${i+1}</td>
          <td class="gm-name ${m.gender === '女' ? 'gm-female' : ''}">${esc(m.name)}</td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    });
    html += '</div>';
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
      userMap[key].logs.push({ docId: doc.id, dt, ua: d.userAgent || '' });
    });
    const users = Object.values(userMap).sort((a, b) => {
      const ta = a.logs[0]?.dt?.getTime() || 0;
      const tb = b.logs[0]?.dt?.getTime() || 0;
      return tb - ta;
    });

    // ツールバー（一括削除など）
    let html = '';
    if (isPortalAdmin) {
      html += `<div class="al-toolbar">
        <button class="btn-secondary al-tool-btn" id="al-delete-old-30">
          <span class="material-icons" style="font-size:16px;vertical-align:middle">delete_sweep</span> 30日より前を削除
        </button>
        <button class="btn-secondary al-tool-btn" id="al-delete-old-90">
          <span class="material-icons" style="font-size:16px;vertical-align:middle">delete_sweep</span> 90日より前を削除
        </button>
      </div>`;
    }

    html += '<div class="access-log-list">';
    users.forEach((u, idx) => {
      const latest = u.logs[0];
      const latestStr = latest.dt ? alFormatDt(latest.dt) : '';
      const device = alDevice(latest.ua);
      html += `<div class="access-log-card">`;
      html += `<div class="access-log-main" onclick="document.getElementById('al-detail-${idx}').classList.toggle('hidden')">`;
      html += `<span class="material-icons access-log-icon">person</span>`;
      html += `<div class="access-log-info"><div class="access-log-name">${esc(u.name)}</div><div class="access-log-email">${esc(u.email)}</div></div>`;
      html += `<div class="access-log-meta"><div class="access-log-time">${esc(latestStr)}</div><div class="access-log-device">${esc(device)}　${u.logs.length}回</div></div>`;
      html += `<span class="material-icons" style="color:#bbb;font-size:20px;margin-left:4px">expand_more</span>`;
      html += `</div>`;
      html += `<div id="al-detail-${idx}" class="al-detail hidden">`;
      if (isPortalAdmin) {
        const ids = u.logs.map(l => l.docId).join(',');
        html += `<div class="al-detail-toolbar">
          <button class="al-user-delete-btn" data-ids="${esc(ids)}" data-name="${esc(u.name)}">
            <span class="material-icons" style="font-size:14px;vertical-align:middle">delete_sweep</span>
            このユーザーのログを全削除 (${u.logs.length}件)
          </button>
        </div>`;
      }
      u.logs.forEach(log => {
        const dtStr = log.dt ? alFormatDt(log.dt) : '';
        const dev = alDevice(log.ua);
        html += `<div class="al-detail-row">
          <span class="al-detail-time">${esc(dtStr)}</span>
          <span class="al-detail-device">${esc(dev)}</span>`;
        if (isPortalAdmin) {
          html += `<button class="al-row-delete-btn icon-btn" data-id="${esc(log.docId)}" title="このログを削除">
            <span class="material-icons" style="font-size:16px;color:#d32f2f">delete</span>
          </button>`;
        }
        html += `</div>`;
      });
      html += `</div></div>`;
    });
    html += '</div>';
    view.innerHTML = html;

    // 削除イベント
    if (isPortalAdmin) {
      view.querySelectorAll('.al-row-delete-btn').forEach(btn =>
        btn.addEventListener('click', e => {
          e.stopPropagation();
          deleteAccessLog(btn.dataset.id);
        }));
      view.querySelectorAll('.al-user-delete-btn').forEach(btn =>
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const ids = btn.dataset.ids.split(',').filter(Boolean);
          deleteAccessLogs(ids, `「${btn.dataset.name}」の ${ids.length} 件のログ`);
        }));
      document.getElementById('al-delete-old-30')?.addEventListener('click', () => deleteAccessLogsOlderThan(30));
      document.getElementById('al-delete-old-90')?.addEventListener('click', () => deleteAccessLogsOlderThan(90));
    }
  } catch (err) {
    view.innerHTML = '<div class="empty-state">読み込みエラー: ' + esc(err.message) + '</div>';
  }
}

async function deleteAccessLog(id) {
  if (!isPortalAdmin) { alert('削除権限がありません'); return; }
  if (!confirm('このアクセスログを削除しますか？')) return;
  try {
    await db.collection('LOGIN_LOG').doc(id).delete();
    await loadAccessLog();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

async function deleteAccessLogs(ids, label) {
  if (!isPortalAdmin) { alert('削除権限がありません'); return; }
  if (!ids.length) return;
  if (!confirm(`${label} を削除しますか？\nこの操作は取り消せません。`)) return;
  try {
    // Firestore batch は500件まで → 必要に応じて分割
    const chunks = [];
    for (let i = 0; i < ids.length; i += 400) chunks.push(ids.slice(i, i + 400));
    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(id => batch.delete(db.collection('LOGIN_LOG').doc(id)));
      await batch.commit();
    }
    await loadAccessLog();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

async function deleteAccessLogsOlderThan(days) {
  if (!isPortalAdmin) { alert('削除権限がありません'); return; }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  if (!confirm(`${days}日より前のアクセスログ（${cutoff.toLocaleDateString('ja-JP')} 以前）を全て削除しますか？\nこの操作は取り消せません。`)) return;
  try {
    const snap = await db.collection('LOGIN_LOG')
      .where('loginAt', '<', firebase.firestore.Timestamp.fromDate(cutoff))
      .get();
    if (snap.empty) {
      alert('対象のログがありません');
      return;
    }
    const ids = snap.docs.map(d => d.id);
    const chunks = [];
    for (let i = 0; i < ids.length; i += 400) chunks.push(ids.slice(i, i + 400));
    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(id => batch.delete(db.collection('LOGIN_LOG').doc(id)));
      await batch.commit();
    }
    alert(`${ids.length}件削除しました`);
    await loadAccessLog();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

// ── 成員編集リスト ────────────────────────────────
// system フラグのみに集約（旧 GO/GA/EL/MS/RP/AP/AT/AM/PA は orgRoles + appointment から派生）
const ME_STATUS_OPTIONS = [
  { code: 'WEB',      label: 'WEB管理者' },
  { code: 'ADMIN',    label: 'ADMIN' },
  { code: 'inactive', label: 'ユーザ資格停止' },
];

// 任命（長老/援助奉仕者）
const ME_APPOINTMENT_OPTIONS = [
  { code: '',            label: '伝道者' },
  { code: 'elder',       label: '長老' },
  { code: 'ministerial', label: '援助奉仕者' },
];

// リスト表示用 正方形バッジ定義
const ME_BADGE_DEFS = [
  { kanji: '監', cls: 'meb-go',  test: m => deriveGroupRole(m)?.position === '監督' },
  { kanji: '補', cls: 'meb-ga',  test: m => deriveGroupRole(m)?.position === '補佐' },
  { kanji: '長', cls: 'meb-el',  test: m => deriveIsElder(m) },
  { kanji: '援', cls: 'meb-ms',  test: m => deriveIsMS(m) },
  { kanji: '開', cls: 'meb-rp',  test: m => deriveIsPioneer(m) },
  { kanji: '区', cls: 'meb-am',  test: m => Array.isArray(m.orgRoles) && m.orgRoles.some(r => r?.department === 'territory') },
  { kanji: '公', cls: 'meb-pa',  test: m => Array.isArray(m.orgRoles) && m.orgRoles.some(r => r?.department === 'pw_permit' || r?.department === 'pw_planner') },
  { kanji: '網', cls: 'meb-web', test: m => Array.isArray(m.status) && m.status.includes('WEB') },
  { kanji: '男', cls: 'meb-m',   test: m => m.gender === '男' },
  { kanji: '女', cls: 'meb-f',   test: m => m.gender === '女' },
];

let meAllMembers = [];
let meAllGroups = [];
let meEditingId = null;
let meInitialized = false;

async function initMemberEditPage() {
  if (!meInitialized) {
    document.getElementById('me-modal-close')?.addEventListener('click', closeMemberEditModal);
    document.getElementById('me-modal-overlay')?.addEventListener('click', closeMemberEditModal);
    document.getElementById('me-cancel')?.addEventListener('click', closeMemberEditModal);
    document.getElementById('me-form')?.addEventListener('submit', saveMemberEdit);
    document.getElementById('me-mode-basic')?.addEventListener('click', () => setMemberEditMode('basic'));
    document.getElementById('me-mode-dept')?.addEventListener('click', () => setMemberEditMode('dept'));
    document.getElementById('me-bulk-save')?.addEventListener('click', saveBulkChanges);
    document.getElementById('me-bulk-discard')?.addEventListener('click', discardBulkChanges);
    document.getElementById('me-bulk-delete-selected')?.addEventListener('click', deleteSelectedBulk);
    document.getElementById('me-add-btn')?.addEventListener('click', () => openMemberEditModal(null));
    document.getElementById('me-delete')?.addEventListener('click', deleteMemberEdit);
    document.getElementById('me-bulk-search')?.addEventListener('input', renderBulkEditTable);
    document.getElementById('me-bulk-filter')?.addEventListener('change', renderBulkEditTable);
    document.getElementById('me-orgrole-add')?.addEventListener('click', () => {
      _meOrgRolesState.push({ department: '', position: '奉仕者' });
      _renderMeOrgRoles();
    });
    meInitialized = true;
  }
  await loadMemberEditList();
}

let meMode = 'basic';
function setMemberEditMode(mode) {
  meMode = mode;
  document.getElementById('me-mode-basic')?.classList.toggle('me-mode-active', mode === 'basic');
  document.getElementById('me-mode-dept')?.classList.toggle('me-mode-active', mode === 'dept');
  document.getElementById('me-basic-mode')?.classList.toggle('hidden', mode !== 'basic');
  document.getElementById('me-dept-mode')?.classList.toggle('hidden', mode !== 'dept');
  renderBulkEditTable();
}

async function loadMemberEditList() {
  try {
    const userList = await getUserListCached();
    meAllMembers = userList.map(data => ({
      ...data,
      status: _parseStatus(data.status),
    }));
    meAllMembers.sort((a, b) =>
      (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja'));
    // ユニークなグループ名を抽出（既存値からのみ／未所属は空文字）
    const groupSet = new Set();
    meAllMembers.forEach(m => {
      const g = (m.group || '').trim();
      if (g) groupSet.add(g);
    });
    meAllGroups = [...groupSet].sort((a, b) => a.localeCompare(b, 'ja'));
    renderBulkEditTable();
  } catch (e) {
    console.error('loadMemberEditList error:', e);
  }
}

function meIsPioneer(m) {
  // 旧シグネチャ互換: status配列が渡された場合
  if (Array.isArray(m)) return m.includes('RP') || m.includes('AP');
  return deriveIsPioneer(m);
}

// グループ内優先度（orgRoles 派生版）
function meGroupRank(m) {
  const gr = deriveGroupRole(m);
  if (gr?.position === '監督') return 0;
  if (gr?.position === '補佐') return 1;
  const isPioneer = deriveIsPioneer(m);
  if (m.gender === '男') return isPioneer ? 2 : 3;
  if (m.gender === '女') return isPioneer ? 4 : 5;
  return 6;
}

function meSortMembers(arr) {
  return arr.slice().sort((a, b) => {
    const r = meGroupRank(a) - meGroupRank(b);
    if (r !== 0) return r;
    return (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja');
  });
}

// 旧 renderMemberEditList は削除（リストモード廃止）

async function deleteMemberFromList(id, name) {
  if (!isPortalAdmin) { alert('削除権限がありません'); return; }
  if (!confirm(`「${name || '(名前なし)'}」を完全に削除しますか？\nこの操作は取り消せません。`)) return;
  try {
    await db.collection('USER_LIST').doc(id).delete();
    removeUserListLocal(id);
    await loadMemberEditList();
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

function openMemberEditModal(id) {
  const member = id ? meAllMembers.find(m => m.docId === id) : null;
  meEditingId = id || null;
  document.getElementById('me-modal-title').textContent = id ? '成員を編集' : '成員を追加';
  document.getElementById('me-name').value     = member?.name     || '';
  document.getElementById('me-furigana').value = member?.furigana || '';

  // グループ選択肢を更新
  const groupSel = document.getElementById('me-group');
  const curGroup = member?.group || '';
  const opts = ['', ...meAllGroups, ...(curGroup && !meAllGroups.includes(curGroup) ? [curGroup] : [])];
  groupSel.innerHTML = opts.map(g => `<option value="${esc(g)}" ${g === curGroup ? 'selected' : ''}>${g === '' ? '（未所属）' : esc(g)}</option>`).join('');

  document.getElementById('me-gender').value   = member?.gender   || '';
  document.getElementById('me-mail').value     = member?.mail     || '';
  document.getElementById('me-address').value  = member?.address  || '';
  document.getElementById('me-stability').value = member?.stability || '';
  document.getElementById('me-hascar').checked  = member?.hasCar === true;
  const apEl = document.getElementById('me-appointment');
  if (apEl) apEl.value = member?.appointment || '';
  document.getElementById('me-is-wt-reader').checked = member?.isWtReader === true;
  document.getElementById('me-is-public-speaker').checked = member?.isPublicSpeaker === true;

  const grid = document.getElementById('me-status-grid');
  const cur = new Set(member?.status || []);
  grid.innerHTML = ME_STATUS_OPTIONS.map(opt => `
    <label class="me-status-check">
      <input type="checkbox" value="${esc(opt.code)}" ${cur.has(opt.code) ? 'checked' : ''}>
      <span class="me-status-check-label">
        <span class="me-status-check-code">${esc(opt.code)}</span>
        <span class="me-status-check-name">${esc(opt.label)}</span>
      </span>
    </label>
  `).join('');

  // orgRoles 行エディタ
  _meOrgRolesState = Array.isArray(member?.orgRoles) ? JSON.parse(JSON.stringify(member.orgRoles)) : [];
  _renderMeOrgRoles();

  const delBtn = document.getElementById('me-delete');
  if (delBtn) delBtn.classList.toggle('hidden', !id);
  document.getElementById('me-modal').classList.remove('hidden');
}

let _meOrgRolesState = [];

function _renderMeOrgRoles() {
  const list = document.getElementById('me-orgroles-list');
  if (!list) return;
  if (_meOrgRolesState.length === 0) {
    list.innerHTML = '<div class="me-orgrole-empty">役職が登録されていません</div>';
    return;
  }
  list.innerHTML = _meOrgRolesState.map((r, i) => {
    const def = getOrgDept(r.department);
    const positions = def ? getOrgPositions(def) : ['監督','補佐','責任者','奉仕者'];
    return `
    <div class="me-orgrole-row" data-idx="${i}">
      <div class="me-orgrole-fields">
        <select class="me-or-dept" data-idx="${i}">
          <option value="">(部門を選択)</option>
          ${ORG_DEPARTMENTS.map(d => `<option value="${esc(d.id)}" ${r.department===d.id?'selected':''}>${esc(d.section)} / ${esc(d.label)}</option>`).join('')}
        </select>
        <select class="me-or-pos" data-idx="${i}">
          ${positions.map(p => `<option value="${esc(p)}" ${r.position===p?'selected':''}>${esc(p)}</option>`).join('')}
        </select>
        <button type="button" class="icon-btn me-or-del" data-idx="${i}" title="削除" style="color:#d32f2f">
          <span class="material-icons" style="font-size:18px">delete</span>
        </button>
      </div>
    </div>
  `;
  }).join('');

  list.querySelectorAll('.me-or-dept').forEach(el => el.addEventListener('change', e => {
    const idx = +e.target.dataset.idx;
    _meOrgRolesState[idx].department = e.target.value;
    // position を新部門で有効なものに調整
    const def = getOrgDept(e.target.value);
    if (def) {
      const positions = getOrgPositions(def);
      if (!positions.includes(_meOrgRolesState[idx].position)) {
        _meOrgRolesState[idx].position = positions[0];
      }
    }
    _renderMeOrgRoles();
  }));
  list.querySelectorAll('.me-or-pos').forEach(el => el.addEventListener('change', e => {
    _meOrgRolesState[+e.target.dataset.idx].position = e.target.value;
  }));
  list.querySelectorAll('.me-or-del').forEach(el => el.addEventListener('click', e => {
    _meOrgRolesState.splice(+e.currentTarget.dataset.idx, 1);
    _renderMeOrgRoles();
  }));
}

// 「追加」ボタンのハンドラは initMemberEditPage 内でバインド

async function deleteMemberEdit() {
  if (!meEditingId) return;
  const member = meAllMembers.find(m => m.docId === meEditingId);
  const name = member?.name || meEditingId;
  if (!confirm(`「${name}」をUSER_LISTから削除しますか？\nこの操作は取り消せません。`)) return;
  try {
    await db.collection('USER_LIST').doc(meEditingId).delete();
    invalidateUserListCache();
    closeMemberEditModal();
    await loadMemberEditList();
    alert(`「${name}」を削除しました`);
  } catch (err) {
    alert('削除エラー: ' + err.message);
  }
}

function closeMemberEditModal() {
  document.getElementById('me-modal').classList.add('hidden');
  meEditingId = null;
}

async function saveMemberEdit(e) {
  e.preventDefault();
  const name     = document.getElementById('me-name').value.trim();
  const furigana = document.getElementById('me-furigana').value.trim();
  const group    = document.getElementById('me-group').value.trim();
  const gender   = document.getElementById('me-gender').value;
  const mail     = document.getElementById('me-mail').value.trim();
  const address  = document.getElementById('me-address').value.trim();
  const stability = document.getElementById('me-stability').value;
  const hasCar    = document.getElementById('me-hascar').checked;
  const appointment = document.getElementById('me-appointment')?.value || '';
  const isWtReader = document.getElementById('me-is-wt-reader').checked;
  const isPublicSpeaker = document.getElementById('me-is-public-speaker').checked;
  if (!name) { alert('氏名は必須です'); return; }

  const checks = document.querySelectorAll('#me-status-grid input[type="checkbox"]:checked');
  const status = [...checks].map(cb => cb.value);

  // orgRoles（新形式: {department, position}）
  const orgRoles = (_meOrgRolesState || [])
    .filter(r => r.department && r.position)
    .map(r => ({ department: r.department, position: r.position }));

  const data = {
    name, furigana, group, gender,
    mail: mail.toLowerCase(),
    address,
    stability, hasCar,
    status,
    appointment,
    isWtReader,
    isPublicSpeaker,
    orgRoles,
  };

  try {
    if (meEditingId) {
      await db.collection('USER_LIST').doc(meEditingId).update(data);
      applyUserListLocal(meEditingId, data);
    } else {
      const ref = await db.collection('USER_LIST').add(data);
      applyUserListLocal(ref.id, data);
    }
    closeMemberEditModal();
    await loadMemberEditList(); // キャッシュヒットで再フェッチなし
  } catch (err) {
    alert('保存エラー: ' + err.message);
  }
}

// ── 成員 一括編集 ────────────────────────────────
const ME_BULK_TEXT_FIELDS = [
  { key: 'name',     label: '氏名',       width: 110 },
  { key: 'furigana', label: 'ふりがな',   width: 100 },
  { key: 'group',    label: 'グループ',   width: 80,  type: 'select-group' },
  { key: 'gender',   label: '性別',       width: 50,  type: 'select', options: ['', '男', '女'] },
  { key: 'mail',     label: 'メール',     width: 140 },
  { key: 'address',  label: '住所',       width: 200 },
];

// 部門情報モード: 部門取決め表IDと組織表部門IDのマッピング
// 取決め表のピッカーでは orgRoles から導出する
const DUTY_TO_ORG_DEPT = {
  annai:    ['annai'],
  avs:      ['stage_av'],
  parking:  ['parking'],
  cleaning: ['cleaning_coord'],
  literature: ['literature'],
};
window.DUTY_TO_ORG_DEPT = DUTY_TO_ORG_DEPT;
// 後方互換: 旧 departments フィールドを参照する箇所のために残す
function deriveDepartmentsFromOrgRoles(orgRoles) {
  if (!Array.isArray(orgRoles)) return [];
  const set = new Set();
  orgRoles.forEach(r => {
    if (!r || !r.department) return;
    for (const [dutyId, orgIds] of Object.entries(DUTY_TO_ORG_DEPT)) {
      if (orgIds.includes(r.department)) set.add(dutyId);
    }
  });
  return [...set];
}
window.deriveDepartmentsFromOrgRoles = deriveDepartmentsFromOrgRoles;
// 部門情報モード: 生活と奉仕の集会 プログラム種類（USER_LIST.eligibleCodes に保存）
const LIFE_MEETING_CODE_GROUPS = [
  { label: '開会', codes: [
    { code: 'A', label: '司会' },
    { code: 'B', label: '開会祈り' },
  ]},
  { label: '神の言葉の宝', codes: [
    { code: 'C', label: '話（神の言葉の宝）' },
    { code: 'D', label: '宝石を探し出す' },
    { code: 'E', label: '聖書朗読' },
  ]},
  { label: '野外奉仕に励む', codes: [
    { code: 'F', label: '討議1' },
    { code: 'G', label: '討議2' },
    { code: 'H', label: '最初の話し合い — 担当' },
    { code: 'I', label: '最初の話し合い — 相手' },
    { code: 'J', label: '再訪問 — 担当' },
    { code: 'K', label: '再訪問 — 相手' },
    { code: 'L', label: '聖書研究 — 担当' },
    { code: 'M', label: '聖書研究 — 相手' },
    { code: 'N', label: '信じていることを説明する — 担当' },
    { code: 'O', label: '信じていることを説明する — 相手' },
    { code: 'P', label: '信じていることを説明する（話形式）' },
    { code: 'Q', label: '話' },
  ]},
  { label: 'クリスチャンとして生活する', codes: [
    { code: 'R', label: 'プログラム1' },
    { code: 'S', label: 'プログラム2' },
    { code: 'T', label: '会衆の必要' },
    { code: 'U', label: '会衆の聖書研究（司会）' },
    { code: 'V', label: '会衆の聖書研究（朗読者）' },
  ]},
  { label: '閉会', codes: [
    { code: 'W', label: '閉会祈り' },
  ]},
];

// 部門情報モード: 奉仕場所（部門ごとのポジション）
const ME_POSITION_DEFS = [
  { dept: 'annai',    pos: 'hall',     label: '会場' },
  { dept: 'annai',    pos: 'entrance', label: '入口' },
  { dept: 'annai',    pos: 'zoom',     label: 'Zoom' },
  { dept: 'avs',      pos: 'stage',    label: 'ステ' },
  { dept: 'avs',      pos: 'audio',    label: '音響' },
  { dept: 'avs',      pos: 'video',    label: 'ビデ' },
  { dept: 'parking',  pos: 'before',   label: '前' },
  { dept: 'parking',  pos: 'after',    label: '後' },
  { dept: 'cleaning', pos: 'group',    label: 'グ' },
];
// 組織表 部門マスタ
//   type:
//     'supervisor' = 奉仕委員会の監督部門（監督・補佐のみ）
//     'sub'        = 監督部門配下の実務部門（責任者・奉仕者）
//     'elder'      = 長老団の部門（責任者・奉仕者）
//     'pioneer'    = 開拓者区分（本人のみ）
//     'group'      = 野外宣教グループ（監督・補佐・成員）
const ORG_DEPARTMENTS = [
  // === 奉仕委員会・監督部門 ===
  { id:'coord',     label:'調整者',   section:'奉仕委員会', type:'supervisor', order:1 },
  { id:'secretary', label:'書記',     section:'奉仕委員会', type:'supervisor', order:2 },
  { id:'svc_ov',    label:'奉仕監督', section:'奉仕委員会', type:'supervisor', order:3 },

  // === 奉仕委員会・配下部門（parent で 調整者/書記/奉仕監督 の管轄を表す） ===
  { id:'annai',          label:'案内',                section:'奉仕委員会', type:'sub', parent:'coord',     order:1 },
  { id:'stage_av',       label:'AVS', section:'奉仕委員会', type:'sub', parent:'coord',     order:2 },
  { id:'account',        label:'会計',                section:'奉仕委員会', type:'sub', parent:'secretary', order:1 },
  { id:'donate_support', label:'donate.jw.orgサポート', section:'奉仕委員会', type:'sub', parent:'secretary', order:2 },
  { id:'territory',      label:'区域',                section:'奉仕委員会', type:'sub', parent:'svc_ov',    order:1 },
  { id:'pw_permit',      label:'公共エリア許可証取得',   section:'奉仕委員会', type:'sub', parent:'svc_ov',    order:2 },
  { id:'pw_planner',     label:'公共エリア取決策定者',   section:'奉仕委員会', type:'sub', parent:'svc_ov',    order:3 },
  { id:'literature',     label:'文書',                section:'奉仕委員会', type:'sub', parent:'svc_ov',    order:4 },

  // === 長老団 ===
  { id:'wt_chair',       label:'ものみの塔研究司会者',     section:'長老団', type:'elder', order:1 },
  { id:'life_meeting',   label:'生活と奉仕の集会の監督',    section:'長老団', type:'elder', order:2 },
  { id:'assistant_adv',  label:'補助助言者',              section:'長老団', type:'elder', order:3 },
  { id:'public_talk',    label:'公開講演調整者',           section:'長老団', type:'elder', order:4 },
  { id:'hall_committee', label:'王国会館管理委員会',       section:'長老団', type:'elder', order:5 },
  { id:'jw_domain',      label:'JW.ORGドメイン管理者',     section:'長老団', type:'elder', order:6 },
  { id:'jw_support',     label:'JW.ORGユーザーサポート',   section:'長老団', type:'elder', order:7 },
  { id:'digital_team',   label:'電子化チーム',            section:'長老団', type:'elder', order:8 },
  { id:'cleaning_coord', label:'清掃調整者',              section:'長老団', type:'elder', order:9 },
  { id:'parking',        label:'駐車場',                 section:'長老団', type:'elder', order:10 },

  // === 開拓者 ===
  { id:'pioneer_regular', label:'正規開拓者', section:'開拓者', type:'pioneer', order:1 },

  // === 野外宣教グループ ===
  { id:'group_poplar',      label:'ポプラ',      section:'野外宣教グループ', type:'group', order:1 },
  { id:'group_baobab',      label:'バオバブ',    section:'野外宣教グループ', type:'group', order:2 },
  { id:'group_almond',      label:'アーモンド',  section:'野外宣教グループ', type:'group', order:3 },
  { id:'group_metasequoia', label:'メタセコイア', section:'野外宣教グループ', type:'group', order:4 },
];
window.ORG_DEPARTMENTS = ORG_DEPARTMENTS;

// グループ名 → グループID マッピング
const GROUP_NAME_TO_ID = {
  'ポプラ':'group_poplar', 'バオバブ':'group_baobab',
  'アーモンド':'group_almond', 'メタセコイア':'group_metasequoia',
};
window.GROUP_NAME_TO_ID = GROUP_NAME_TO_ID;

function getOrgPositions(dept) {
  if (!dept) return [];
  if (dept.type === 'supervisor') return ['監督', '補佐'];
  if (dept.type === 'pioneer')    return ['本人'];
  if (dept.type === 'group')      return ['監督', '補佐', '成員'];
  return ['責任者', '奉仕者']; // sub, elder
}
function getOrgDept(id) { return ORG_DEPARTMENTS.find(d => d.id === id); }
window.getOrgPositions = getOrgPositions;
window.getOrgDept = getOrgDept;

// ─── 派生関数（status配列を使わず orgRoles + appointment から判定）───
function deriveIsElder(user) {
  return user?.appointment === 'elder';
}
function deriveIsMS(user) {
  return user?.appointment === 'ministerial';
}
function deriveIsPioneer(user) {
  if (!user) return false;
  return Array.isArray(user.orgRoles) && user.orgRoles.some(r =>
    r?.department === 'pioneer_regular' || r?.department === 'pioneer_aux');
}
function deriveIsRegularPioneer(user) {
  return Array.isArray(user?.orgRoles) && user.orgRoles.some(r => r?.department === 'pioneer_regular');
}
function deriveIsAuxPioneer(user) {
  return Array.isArray(user?.orgRoles) && user.orgRoles.some(r => r?.department === 'pioneer_aux');
}
function deriveIsAnnaigakari(user) {
  return Array.isArray(user?.orgRoles) && user.orgRoles.some(r => r?.department === 'annai');
}
function deriveGroupRole(user) {
  if (!user) return null;
  if (Array.isArray(user.orgRoles)) {
    const r = user.orgRoles.find(r => {
      const d = getOrgDept(r?.department);
      return d && d.type === 'group';
    });
    if (r) return { group: getOrgDept(r.department).label, position: r.position };
  }
  const gid = GROUP_NAME_TO_ID[user.group];
  if (!gid) return null;
  const status = Array.isArray(user.status) ? user.status : [];
  const pos = status.includes('GO') ? '監督' : status.includes('GA') ? '補佐' : '成員';
  return { group: getOrgDept(gid)?.label || user.group, position: pos };
}
window.deriveIsElder = deriveIsElder;
window.deriveIsMS = deriveIsMS;
window.deriveIsPioneer = deriveIsPioneer;
window.deriveIsAnnaigakari = deriveIsAnnaigakari;
window.deriveGroupRole = deriveGroupRole;

// docId -> { name?, furigana?, group?, gender?, mail?, status?: [] }
const meBulkChanges = new Map();
const _meDeleteSelected = new Set(); // docId of members selected for deletion

function meBulkOriginal(docId) {
  return meAllMembers.find(m => m.docId === docId);
}

function meBulkCurrentValue(member, key) {
  const change = meBulkChanges.get(member.docId);
  if (change && Object.prototype.hasOwnProperty.call(change, key)) return change[key];
  if (key === 'status')         return member.status || [];
  if (key === 'orgRoles')       return Array.isArray(member.orgRoles) ? member.orgRoles : [];
  if (key === 'deptPositions')  return (member.deptPositions && typeof member.deptPositions === 'object') ? member.deptPositions : {};
  if (key === 'dutyWeight')     return (typeof member.dutyWeight === 'number') ? member.dutyWeight : 1.0;
  return member[key] || '';
}

function _meDeepEq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => _meDeepEq(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => _meDeepEq(a[k], b[k]));
  }
  return false;
}

function meBulkRecordChange(docId, key, value) {
  const member = meBulkOriginal(docId);
  if (!member) return;
  // 元の値を取得
  let original;
  if (key === 'status')              original = member.status || [];
  else if (key === 'orgRoles')       original = Array.isArray(member.orgRoles) ? member.orgRoles : [];
  else if (key === 'deptPositions')  original = (member.deptPositions && typeof member.deptPositions === 'object') ? member.deptPositions : {};
  else if (key === 'dutyWeight')     original = (typeof member.dutyWeight === 'number') ? member.dutyWeight : 1.0;
  else                               original = member[key] || '';

  const same = _meDeepEq(value, original);
  let change = meBulkChanges.get(docId) || {};
  if (same) {
    delete change[key];
    if (Object.keys(change).length === 0) meBulkChanges.delete(docId);
    else meBulkChanges.set(docId, change);
  } else {
    change[key] = value;
    meBulkChanges.set(docId, change);
  }
  updateBulkToolbar();
  renderDeptPreview();
}

function updateBulkToolbar() {
  const dirty = meBulkChanges.size;
  const statusEl = document.getElementById('me-bulk-status');
  const saveBtn = document.getElementById('me-bulk-save');
  const discardBtn = document.getElementById('me-bulk-discard');
  if (statusEl) statusEl.textContent = dirty === 0 ? '変更なし' : `${dirty}件の変更`;
  if (statusEl) statusEl.classList.toggle('me-bulk-dirty', dirty > 0);
  if (saveBtn) saveBtn.disabled = dirty === 0;
  if (discardBtn) discardBtn.classList.toggle('hidden', dirty === 0);
}

let meBulkSortKey = null;   // 'name'|'furigana'|'group'|'gender'|'mail'|status code
let meBulkSortDir = 1;       // 1=asc, -1=desc

function renderBulkLegend() {
  const el = document.getElementById('me-bulk-legend');
  if (!el) return;
  el.innerHTML = '';
}

function renderBulkEditTable() {
  if (meMode === 'dept') return renderDeptEditTable();
  return renderBasicEditTable();
}

function _getFilteredSorted() {
  const q = (document.getElementById('me-bulk-search')?.value || '').trim().toLowerCase();
  const sFilter = document.getElementById('me-bulk-filter')?.value || 'all';

  const filtered = meAllMembers.filter(m => {
    if (sFilter !== 'all') {
      if (sFilter.startsWith('gender:')) {
        const g = sFilter.slice(7);
        if ((m.gender || '') !== g) return false;
      } else if (sFilter === 'GO') {
        if (deriveGroupRole(m)?.position !== '監督') return false;
      } else if (sFilter === 'GA') {
        if (deriveGroupRole(m)?.position !== '補佐') return false;
      } else if (sFilter === 'EL') {
        if (!deriveIsElder(m)) return false;
      } else if (sFilter === 'MS') {
        if (!deriveIsMS(m)) return false;
      } else if (sFilter === 'RP') {
        if (!deriveIsRegularPioneer(m)) return false;
      } else if (sFilter === 'AP') {
        if (!deriveIsAuxPioneer(m)) return false;
      } else if (sFilter === 'AT') {
        if (!deriveIsAnnaigakari(m)) return false;
      } else if (!Array.isArray(m.status) || !m.status.includes(sFilter)) {
        return false;
      }
    }
    if (!q) return true;
    return (
      (m.name     || '').toLowerCase().includes(q) ||
      (m.furigana || '').toLowerCase().includes(q) ||
      (m.group    || '').toLowerCase().includes(q) ||
      (m.mail     || '').toLowerCase().includes(q)
    );
  });

  const STATUS_CODES = ME_STATUS_OPTIONS.map(o => o.code);
  // 任命順ランク: 長老=0, 援助奉仕者=1, なし=2
  function appointmentRank(m) {
    if (deriveIsElder(m)) return 0;
    if (deriveIsMS(m)) return 1;
    return 2;
  }
  return filtered.slice().sort((a, b) => {
    let cmp = 0;
    if (meBulkSortKey && STATUS_CODES.includes(meBulkSortKey)) {
      const av = a.status.includes(meBulkSortKey) ? 0 : 1;
      const bv = b.status.includes(meBulkSortKey) ? 0 : 1;
      cmp = av - bv;
    } else if (meBulkSortKey) {
      const av = (a[meBulkSortKey] || '').toString();
      const bv = (b[meBulkSortKey] || '').toString();
      cmp = av.localeCompare(bv, 'ja');
    } else if (sFilter.startsWith('gender:')) {
      // 性別フィルター時: 任命順（長老→援助奉仕者→役職無）→フリガナ
      cmp = appointmentRank(a) - appointmentRank(b);
      if (cmp === 0) cmp = (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja');
      return cmp;
    } else {
      const apptRank = m => m.appointment === 'elder' ? 0 : m.appointment === 'ministerial' ? 1 : 2;
      cmp = apptRank(a) - apptRank(b);
      if (cmp === 0) cmp = (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja');
      return cmp;
    }
    if (cmp === 0) cmp = (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja');
    return cmp * meBulkSortDir;
  });
}

function renderBasicEditTable() {
  const thead = document.getElementById('me-basic-thead');
  const tbody = document.getElementById('me-basic-tbody');
  if (!thead || !tbody) return;

  const arrow = key => meBulkSortKey === key ? (meBulkSortDir === 1 ? ' ▲' : ' ▼') : '';

  let theadHtml = '<tr>';
  ME_BULK_TEXT_FIELDS.forEach((f, i) => {
    const sticky = i === 0 ? 'meb-sticky-col' : '';
    theadHtml += `<th class="${sticky} meb-sortable" data-sort="${esc(f.key)}" style="min-width:${f.width}px">${esc(f.label)}${arrow(f.key)}</th>`;
  });
  theadHtml += '</tr>';
  thead.innerHTML = theadHtml;

  thead.querySelectorAll('.meb-sortable').forEach(th =>
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (meBulkSortKey === k) meBulkSortDir = -meBulkSortDir;
      else { meBulkSortKey = k; meBulkSortDir = 1; }
      renderBulkEditTable();
    })
  );

  const sorted = _getFilteredSorted();
  let html = '';
  sorted.forEach((m, rowIdx) => {
    html += `<tr data-id="${esc(m.docId)}">`;
    ME_BULK_TEXT_FIELDS.forEach((f, i) => {
      const sticky = i === 0 ? 'meb-sticky-col' : '';
      const val = meBulkCurrentValue(m, f.key);
      const numPrefix = i === 0 ? `<span class="meb-rownum">${rowIdx + 1}</span>` : '';
      if (f.type === 'select' || f.type === 'select-group') {
        const options = f.type === 'select-group'
          ? ['', ...meAllGroups, ...(val && !meAllGroups.includes(val) ? [val] : [])]
          : f.options;
        html += `<td class="${sticky}"><div class="meb-cell-wrap">${numPrefix}<select class="meb-input" data-id="${esc(m.docId)}" data-key="${esc(f.key)}">`;
        options.forEach(opt => {
          html += `<option value="${esc(opt)}" ${opt === val ? 'selected' : ''}>${opt === '' ? '-' : esc(opt)}</option>`;
        });
        html += '</select></div></td>';
      } else {
        const type = f.key === 'mail' ? 'email' : 'text';
        html += `<td class="${sticky}"><div class="meb-cell-wrap">${numPrefix}<input type="${type}" class="meb-input" data-id="${esc(m.docId)}" data-key="${esc(f.key)}" value="${esc(val)}"></div></td>`;
      }
    });
    html += '</tr>';
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('.meb-input').forEach(el => {
    const handler = () => meBulkRecordChange(el.dataset.id, el.dataset.key, el.value);
    el.addEventListener('change', handler);
    if (el.tagName === 'INPUT') el.addEventListener('blur', handler);
  });

  updateBulkToolbar();
}

function renderDeptEditTable() {
  // 転置レイアウト: 行=役職、列=成員（氏名は縦書き）
  const thead = document.getElementById('me-dept-thead');
  const tbody = document.getElementById('me-dept-tbody');
  if (!thead || !tbody) return;

  renderBulkLegend();

  const members = _getFilteredSorted();

  // 行定義を構築: { kind: 'section'|'check'|'select', label, sectionCls, get/set, options? }
  const rows = [];

  function addSection(label, cls) { rows.push({ kind: 'section', label, cls }); }

  // 資格
  addSection('資格', 'meb-grp-dept');
  ['elder', 'ministerial'].forEach(code => {
    const label = code === 'elder' ? '長老' : '援助奉仕者';
    rows.push({
      kind: 'check',
      label,
      sectionCls: 'meb-grp-dept',
      get: m => (meBulkCurrentValue(m, 'appointment') || m.appointment || '') === code,
      set: (m, on) => meBulkRecordChange(m.docId, 'appointment', on ? code : '')
    });
  });
  // ものみの塔朗読者
  rows.push({
    kind: 'check',
    label: 'ものみの塔朗読者',
    sectionCls: 'meb-grp-dept',
    get: m => !!(meBulkCurrentValue(m, 'isWtReader') ?? m.isWtReader),
    set: (m, on) => meBulkRecordChange(m.docId, 'isWtReader', on)
  });
  // 公開講演者
  rows.push({
    kind: 'check',
    label: '公開講演者',
    sectionCls: 'meb-grp-dept',
    get: m => !!(meBulkCurrentValue(m, 'isPublicSpeaker') ?? m.isPublicSpeaker),
    set: (m, on) => meBulkRecordChange(m.docId, 'isPublicSpeaker', on)
  });
  // 正規開拓者
  rows.push({
    kind: 'check',
    label: '正規開拓者',
    sectionCls: 'meb-grp-dept',
    get: m => {
      const arr = meBulkCurrentValue(m, 'orgRoles') || [];
      return arr.some(r => r && r.department === 'pioneer_regular');
    },
    set: (m, on) => {
      const cur = (meBulkCurrentValue(m, 'orgRoles') || []).slice();
      const idx = cur.findIndex(r => r && r.department === 'pioneer_regular');
      if (on && idx === -1) cur.push({ department: 'pioneer_regular', position: '本人' });
      else if (!on && idx !== -1) cur.splice(idx, 1);
      meBulkRecordChange(m.docId, 'orgRoles', cur);
    }
  });

  // 奉仕場所は廃止（annai/avs/parking/cleaning は組織表タブ内へ移動済み）
  // 家族グループは専用ページ（admin-family-groups）で管理

  // 組織表役職: section/dept/position の階層
  let lastSection = '';
  let lastDept = '';
  let lastParent = '';
  let lifeMeetingSecAdded = false;
  const SVC_PARENT_LABELS = { coord: '調整者管轄', secretary: '書記管轄', svc_ov: '奉仕監督管轄' };
  ORG_DEPARTMENTS.forEach(d => {
    // 開拓者セクションは資格タグ内の「正規開拓者」と重複するためスキップ
    if (d.section === '開拓者') return;
    // 野外宣教グループに入る直前に「生活と奉仕のための集会」セクションを挟む
    if (d.section === '野外宣教グループ' && !lifeMeetingSecAdded) {
      addSection('生活と奉仕のための集会', 'meb-grp-org-life');
      LIFE_MEETING_CODE_GROUPS.forEach(grp => {
        addSection(grp.label, 'meb-grp-org-life-sub');
        grp.codes.forEach(({ code, label }) => {
          rows.push({
            kind: 'check',
            label,
            deptLabel: code,
            sectionCls: 'meb-grp-org',
            get: m => {
              const arr = meBulkCurrentValue(m, 'eligibleCodes') || [];
              return arr.includes(code);
            },
            set: (m, on) => {
              const cur = (meBulkCurrentValue(m, 'eligibleCodes') || []).slice();
              const idx = cur.indexOf(code);
              if (on && idx === -1) cur.push(code);
              else if (!on && idx !== -1) cur.splice(idx, 1);
              meBulkRecordChange(m.docId, 'eligibleCodes', cur);
            }
          });
        });
      });
      lifeMeetingSecAdded = true;
      lastDept = '';
    }
    if (d.section !== lastSection) {
      const cls = d.section === '奉仕委員会' ? 'meb-grp-org-svc'
                : d.section === '長老団' ? 'meb-grp-org-elder'
                : d.section === '野外宣教グループ' ? 'meb-grp-org-group'
                : 'meb-grp-org';
      addSection(d.section, cls);
      lastSection = d.section;
      lastDept = '';
      lastParent = '';
    }
    // 奉仕委員会 配下部門は parent ごとに「○○管轄」サブセクションを挿入
    if (d.section === '奉仕委員会' && d.type === 'sub' && d.parent !== lastParent) {
      const parentLabel = SVC_PARENT_LABELS[d.parent];
      if (parentLabel) {
        addSection(parentLabel, 'meb-grp-org-svc-sub');
        lastDept = '';
      }
      lastParent = d.parent;
    }
    getOrgPositions(d).forEach((pos, pi) => {
      const isFirstOfDept = (d.label !== lastDept);
      lastDept = d.label;
      rows.push({
        kind: 'check',
        label: pos,
        deptLabel: isFirstOfDept ? d.label : '',
        isSub: !isFirstOfDept,
        sectionCls: 'meb-grp-org',
        get: m => {
          const arr = meBulkCurrentValue(m, 'orgRoles') || [];
          return arr.some(r => r && r.department === d.id && r.position === pos);
        },
        set: (m, on) => {
          const cur = (meBulkCurrentValue(m, 'orgRoles') || []).slice();
          const idx = cur.findIndex(r => r && r.department === d.id && r.position === pos);
          if (on && idx === -1) cur.push({ department: d.id, position: pos });
          else if (!on && idx !== -1) cur.splice(idx, 1);
          meBulkRecordChange(m.docId, 'orgRoles', cur);
        }
      });
    });

    // 部門の役職（責任者/奉仕者など）の後に、その部門の奉仕場所行を追加
    //   案内 → 会場/入口/Zoom（既存役職の続きとして isSub=true）
    //   AVS  → ステ/音響/ビデ（同上）
    //   駐車場 → 前/後（同上）、その下に 清掃 グ（新部門として deptLabel='清掃'）
    const ORG_TO_POS_DEPT = { annai: 'annai', stage_av: 'avs', parking: 'parking' };
    const posDept = ORG_TO_POS_DEPT[d.id];
    function pushPosRow(p, opts = {}) {
      rows.push({
        kind: 'check',
        label: p.label,
        deptLabel: opts.deptLabel || '',
        isSub: !opts.deptLabel,
        sectionCls: 'meb-grp-org',
        get: m => {
          const o = meBulkCurrentValue(m, 'deptPositions') || {};
          return Array.isArray(o[p.dept]) && o[p.dept].includes(p.pos);
        },
        set: (m, on) => {
          const cur = meBulkCurrentValue(m, 'deptPositions') || {};
          const newObj = { ...cur };
          const arr = Array.isArray(newObj[p.dept]) ? newObj[p.dept].slice() : [];
          const idx = arr.indexOf(p.pos);
          if (on && idx === -1) arr.push(p.pos);
          else if (!on && idx !== -1) arr.splice(idx, 1);
          if (arr.length === 0) delete newObj[p.dept];
          else newObj[p.dept] = arr;
          meBulkRecordChange(m.docId, 'deptPositions', newObj);
        }
      });
    }
    if (posDept) {
      ME_POSITION_DEFS.filter(p => p.dept === posDept).forEach(p => pushPosRow(p));
    }
    if (d.id === 'parking') {
      ME_POSITION_DEFS.filter(p => p.dept === 'cleaning').forEach((p, i) => {
        pushPosRow(p, { deptLabel: i === 0 ? '清掃' : '' });
      });
    }
  });

  // システム
  addSection('システム', 'meb-grp-status');
  ME_STATUS_OPTIONS.forEach(opt => {
    rows.push({
      kind: 'check',
      label: opt.label,
      sectionCls: 'meb-grp-status',
      get: m => (m.status || []).includes(opt.code),
      set: (m, on) => {
        const cur = (meBulkCurrentValue(m, 'status') || []).slice();
        const idx = cur.indexOf(opt.code);
        if (on && idx === -1) cur.push(opt.code);
        else if (!on && idx !== -1) cur.splice(idx, 1);
        meBulkRecordChange(m.docId, 'status', cur);
      }
    });
  });

  // 負荷係数（数値）
  addSection('負荷係数', 'meb-grp-status');
  rows.push({
    kind: 'select',
    label: '負荷',
    sectionCls: 'meb-grp-status',
    options: [
      { value: 0.5, label: '0.5' },
      { value: 1,   label: '1.0' },
      { value: 1.5, label: '1.5' },
      { value: 2,   label: '2.0' },
    ],
    get: m => meBulkCurrentValue(m, 'dutyWeight'),
    set: (m, val) => meBulkRecordChange(m.docId, 'dutyWeight', Number(val))
  });

  // colgroup で列幅を固定（colspan によるずれを防止）
  const LABEL_W = 280, CELL_W = 20;
  const table = thead.closest('table');
  table.style.width = (LABEL_W + members.length * CELL_W) + 'px';
  let existingCg = table.querySelector('colgroup');
  if (existingCg) existingCg.remove();
  let cgHtml = '<colgroup><col class="meb-col-label">';
  for (let i = 0; i < members.length; i++) cgHtml += '<col class="meb-col-cell">';
  cgHtml += '</colgroup>';
  table.insertAdjacentHTML('afterbegin', cgHtml);

  // ヘッダー: 番号行 + 氏名行 + 選択チェック行
  let theadHtml = '<tr>';
  theadHtml += '<th class="meb-sticky-col meb-row-label-head"></th>';
  members.forEach((m, i) => {
    theadHtml += `<th class="meb-num-cell">${i + 1}</th>`;
  });
  theadHtml += '</tr><tr>';
  theadHtml += '<th class="meb-sticky-col meb-row-label-head">役職</th>';
  members.forEach(m => {
    theadHtml += `<th class="meb-name-vert" title="${esc(m.name || '')}"><div class="meb-name-vert-inner">${esc(m.name || '')}</div></th>`;
  });
  theadHtml += '</tr><tr>';
  theadHtml += '<th class="meb-sticky-col meb-row-label-head meb-select-head">' +
    '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;font-weight:normal">' +
    '<input type="checkbox" class="meb-select-all">削除選択' +
    '</label></th>';
  members.forEach(m => {
    const checked = _meDeleteSelected.has(m.docId) ? 'checked' : '';
    theadHtml += `<th class="meb-num-cell meb-select-cell"><input type="checkbox" class="meb-del-cb" data-mid="${esc(m.docId)}" ${checked}></th>`;
  });
  theadHtml += '</tr>';
  thead.innerHTML = theadHtml;

  // 本体
  let html = '';
  let secIdx = 0;
  let curSec = '';
  rows.forEach(row => {
    if (row.kind === 'section') {
      curSec = 'meb-sec-' + secIdx++;
      html += `<tr class="meb-section-row ${esc(row.cls)}" data-sec="${curSec}" data-sec-label="${esc(row.label)}"><td class="meb-sticky-col" colspan="${members.length + 1}"><span class="meb-sec-arrow">▼</span><strong>${esc(row.label)}</strong></td></tr>`;
      return;
    }
    // ラベルセル
    const subText = row.deptLabel || row.subLabel || '';
    const isSub = row.isSub || false;
    const innerStyle = row.alignRight ? ' style="justify-content:flex-end"' : '';
    html += `<tr data-sec-content="${curSec}">`;
    html += `<td class="meb-sticky-col meb-row-label ${esc(row.sectionCls || '')}"><div class="meb-row-inner"${innerStyle}>`
         +  (subText ? `<span class="meb-row-dept">${esc(subText)}</span>` : '')
         +  `<span class="meb-row-pos${isSub ? '' : ' meb-row-pos-main'}">${esc(row.label)}</span>`
         +  `</div></td>`;
    // 各成員のセル
    members.forEach((m, i) => {
      if (row.kind === 'select') {
        const cur = row.get(m);
        const val = (typeof cur === 'number') ? cur : 1.0;
        html += `<td class="meb-status-col"><select class="meb-tr-sel" data-row="${rows.indexOf(row)}" data-mid="${esc(m.docId)}">`;
        row.options.forEach(o => {
          html += `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${esc(o.label)}</option>`;
        });
        html += '</select></td>';
      } else {
        const checked = row.get(m) ? 'checked' : '';
        html += `<td class="meb-status-col"><input type="checkbox" class="meb-tr-cb" data-row="${rows.indexOf(row)}" data-mid="${esc(m.docId)}" ${checked}></td>`;
      }
    });
    html += '</tr>';
  });
  tbody.innerHTML = html;

  // バインド
  tbody.querySelectorAll('.meb-tr-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = rows[+cb.dataset.row];
      const member = meBulkOriginal(cb.dataset.mid);
      if (row && member) row.set(member, cb.checked);
    });
  });
  tbody.querySelectorAll('.meb-tr-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const row = rows[+sel.dataset.row];
      const member = meBulkOriginal(sel.dataset.mid);
      if (row && member) row.set(member, sel.value);
    });
  });

  // 削除選択チェックボックス
  thead.querySelectorAll('.meb-del-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const mid = cb.dataset.mid;
      if (cb.checked) _meDeleteSelected.add(mid);
      else _meDeleteSelected.delete(mid);
      updateDeleteSelectedUI();
    });
  });
  thead.querySelector('.meb-select-all')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    members.forEach(m => {
      if (on) _meDeleteSelected.add(m.docId);
      else _meDeleteSelected.delete(m.docId);
    });
    thead.querySelectorAll('.meb-del-cb').forEach(cb => { cb.checked = on; });
    updateDeleteSelectedUI();
  });
  updateDeleteSelectedUI();

  // アコーディオン（初期状態: 管轄セクションはオープン、その他はクローズ）
  tbody.querySelectorAll('.meb-section-row').forEach(secRow => {
    const sec = secRow.dataset.sec;
    const secLabel = secRow.dataset.secLabel || '';
    const contentRows = tbody.querySelectorAll(`tr[data-sec-content="${sec}"]`);
    const arrow = secRow.querySelector('.meb-sec-arrow');
    const closedByDefault = [
      '資格','奉仕委員会',
      '生活と奉仕のための集会','開会','神の言葉の宝','野外奉仕に励む','クリスチャンとして生活する','閉会',
      '野外宣教グループ','システム','負荷係数'
    ].includes(secLabel);
    if (closedByDefault) {
      contentRows.forEach(r => r.style.display = 'none');
      if (arrow) arrow.textContent = '▶';
    }
    secRow.style.cursor = 'pointer';
    secRow.addEventListener('click', () => {
      const isOpen = contentRows[0] && contentRows[0].style.display !== 'none';
      contentRows.forEach(r => r.style.display = isOpen ? 'none' : '');
      if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
    });
  });

  updateBulkToolbar();

  // 列ホバー
  if (table) {
    let hoverCol = -1;
    table.addEventListener('mouseover', function(e) {
      const td = e.target.closest('td, th');
      if (!td) return;
      const col = td.cellIndex;
      if (col === hoverCol || col === 0) return;
      table.querySelectorAll('.meb-col-hover').forEach(el => el.classList.remove('meb-col-hover'));
      hoverCol = col;
      table.querySelectorAll('tr').forEach(tr => {
        const cell = tr.cells[col];
        if (cell) cell.classList.add('meb-col-hover');
      });
    });
    table.addEventListener('mouseleave', function() {
      table.querySelectorAll('.meb-col-hover').forEach(el => el.classList.remove('meb-col-hover'));
      hoverCol = -1;
    });
  }
}

function renderDeptPreview() {
  const el = document.getElementById('me-dept-preview-content');
  if (!el) return;
  const members = meAllMembers;
  if (!members || members.length === 0) { el.innerHTML = ''; return; }

  let html = '';

  // 組織表プレビュー
  html += '<div class="me-dept-preview-section">';
  html += '<h4>組織表</h4>';
  const supervisors = ORG_DEPARTMENTS.filter(d => d.type === 'supervisor').sort((a,b) => a.order - b.order);
  const subDepts = ORG_DEPARTMENTS.filter(d => d.type === 'sub').sort((a,b) => a.order - b.order);
  const elders = ORG_DEPARTMENTS.filter(d => d.type === 'elder').sort((a,b) => a.order - b.order);

  const _sortByFurigana = (a, b) => (a.furigana || a.name || '').localeCompare(b.furigana || b.name || '', 'ja');
  const _orgIdToPosDeptPv = { annai:'annai', stage_av:'avs', parking:'parking' };

  function findMembers(deptId, pos) {
    return members.filter(m => {
      const roles = meBulkCurrentValue(m, 'orgRoles') || [];
      return roles.some(r => r && r.department === deptId && r.position === pos);
    }).sort(_sortByFurigana).map(m => m.name);
  }

  function findServiceMembers(deptId) {
    const posDeptKey = _orgIdToPosDeptPv[deptId];
    if (!posDeptKey) return findMembers(deptId, '奉仕者');
    return members.filter(m => {
      const dp = meBulkCurrentValue(m, 'deptPositions') || {};
      return Array.isArray(dp[posDeptKey]) && dp[posDeptKey].length > 0;
    }).sort(_sortByFurigana).map(m => m.name);
  }

  // 奉仕委員会
  html += '<table><thead><tr><th>管轄</th><th>監督</th><th>補佐</th></tr></thead><tbody>';
  supervisors.forEach(sup => {
    html += '<tr><td><strong>' + esc(sup.label) + '</strong></td>';
    html += '<td>' + esc(findMembers(sup.id, '監督').join(', ')) + '</td>';
    html += '<td>' + esc(findMembers(sup.id, '補佐').join(', ')) + '</td></tr>';
  });
  html += '</tbody></table>';

  // 管轄別
  supervisors.forEach(sup => {
    const children = subDepts.filter(d => d.parent === sup.id);
    if (children.length === 0) return;
    html += '<table><thead><tr><th colspan="3">' + esc(sup.label) + '管轄</th></tr>';
    html += '<tr><th>部門</th><th>責任者</th><th>奉仕者</th></tr></thead><tbody>';
    children.forEach(child => {
      html += '<tr><td>' + esc(child.label) + '</td>';
      html += '<td>' + esc(findMembers(child.id, '責任者').join(', ')) + '</td>';
      html += '<td>' + esc(findServiceMembers(child.id).join(', ')) + '</td></tr>';
    });
    html += '</tbody></table>';
  });

  // 長老団
  html += '<table><thead><tr><th colspan="3">長老団管轄</th></tr>';
  html += '<tr><th>部門</th><th>責任者</th><th>奉仕者</th></tr></thead><tbody>';
  elders.forEach(d => {
    html += '<tr><td>' + esc(d.label) + '</td>';
    html += '<td>' + esc(findMembers(d.id, '責任者').join(', ')) + '</td>';
    html += '<td>' + esc(findServiceMembers(d.id).join(', ')) + '</td></tr>';
  });
  html += '</tbody></table>';

  html += '</div>'; // /me-dept-preview-section (組織表)

  // グループ成員表プレビュー（横4列）
  html += '<div class="me-dept-preview-section">';
  html += '<h4>グループ成員表</h4>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
  const groups = ORG_DEPARTMENTS.filter(d => d.type === 'group').sort((a,b) => a.order - b.order);
  groups.forEach(g => {
    const go = findMembers(g.id, '監督');
    const ga = findMembers(g.id, '補佐');
    const gm = findMembers(g.id, '成員');
    html += '<div style="border:1px solid #ddd;border-radius:4px;padding:6px;">';
    html += '<div style="font-weight:bold;font-size:12px;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px;">' + esc(g.label) + ' (' + (go.length + ga.length + gm.length) + ')</div>';
    const allNames = [];
    go.forEach(n => allNames.push(n));
    ga.forEach(n => allNames.push(n));
    gm.forEach(n => allNames.push(n));
    allNames.forEach(n => { html += '<div style="font-size:11px;line-height:1.6;">' + esc(n) + '</div>'; });
    html += '</div>';
  });
  html += '</div>'; // /grid 4cols
  html += '</div>'; // /me-dept-preview-section (グループ成員表)

  el.innerHTML = html;
}

async function saveBulkChanges() {
  if (meBulkChanges.size === 0) return;
  const saveBtn = document.getElementById('me-bulk-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }
  try {
    const batch = db.batch();
    const pendingApply = [];
    meBulkChanges.forEach((change, docId) => {
      const data = {};
      Object.keys(change).forEach(k => {
        if (k === 'mail') data[k] = (change[k] || '').toLowerCase();
        else data[k] = change[k];
      });
      batch.update(db.collection('USER_LIST').doc(docId), data);
      pendingApply.push({ docId, data });
    });
    await batch.commit();
    pendingApply.forEach(({ docId, data }) => applyUserListLocal(docId, data));
    meBulkChanges.clear();
    await loadMemberEditList();
    renderBulkEditTable();
    alert('保存しました');
  } catch (err) {
    alert('保存エラー: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="material-icons" style="font-size:16px;vertical-align:middle">save</span> 保存';
    }
  }
}

function discardBulkChanges() {
  if (meBulkChanges.size === 0) return;
  if (!confirm(`${meBulkChanges.size}件の変更を破棄しますか？`)) return;
  meBulkChanges.clear();
  renderBulkEditTable();
}

function updateDeleteSelectedUI() {
  const btn = document.getElementById('me-bulk-delete-selected');
  const cnt = document.getElementById('me-bulk-delete-count');
  if (!btn || !cnt) return;
  const n = _meDeleteSelected.size;
  cnt.textContent = n;
  btn.classList.toggle('hidden', n === 0);
}

async function deleteSelectedBulk() {
  if (_meDeleteSelected.size === 0) return;
  const targets = [..._meDeleteSelected]
    .map(id => meAllMembers.find(m => m.docId === id))
    .filter(Boolean);
  if (targets.length === 0) { _meDeleteSelected.clear(); updateDeleteSelectedUI(); return; }
  const names = targets.map(m => m.name).join('\n');
  if (!confirm(`以下の${targets.length}名を USER_LIST から完全に削除します。\nこの操作は取り消せません。\n\n${names}`)) return;
  const btn = document.getElementById('me-bulk-delete-selected');
  if (btn) { btn.disabled = true; }
  try {
    const batch = db.batch();
    targets.forEach(m => {
      batch.delete(db.collection('USER_LIST').doc(m.docId));
    });
    await batch.commit();
    targets.forEach(m => {
      if (window.removeUserListLocal) window.removeUserListLocal(m.docId);
      meBulkChanges.delete(m.docId);
    });
    _meDeleteSelected.clear();
    await loadMemberEditList();
    renderBulkEditTable();
    alert(`${targets.length}名を削除しました`);
  } catch (err) {
    alert('削除エラー: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function migrateGroupToOrgRoles() {
  const snap = await db.collection('USER_LIST').get();
  const batch = db.batch();
  let count = 0;
  const details = [];
  snap.forEach(doc => {
    const data = doc.data();
    const gid = GROUP_NAME_TO_ID[data.group];
    if (!gid) return;
    const orgRoles = Array.isArray(data.orgRoles) ? data.orgRoles : [];
    const status = Array.isArray(data.status) ? data.status
                 : (typeof data.status === 'string' ? data.status.split(',').map(s => s.trim()) : []);
    const existing = orgRoles.find(r => r && r.department === gid);
    if (existing) return;
    const pos = status.includes('GO') ? '監督' : status.includes('GA') ? '補佐' : '成員';
    const updated = [...orgRoles, { department: gid, position: pos }];
    batch.update(doc.ref, { orgRoles: updated });
    details.push(`${data.name}: ${data.group}/${pos}`);
    count++;
  });
  if (count === 0) { alert('反映対象なし（全員設定済み）'); return; }
  console.log('反映内容:\n' + details.join('\n'));
  if (!confirm(`${count}件の成員にグループ所属を追加します。\n(詳細はコンソール参照)\n実行しますか？`)) return;
  await batch.commit();
  alert(`${count}件更新しました`);
  await loadMemberEditList();
  renderBulkEditTable();
}
window.migrateGroupToOrgRoles = migrateGroupToOrgRoles;

async function migratePioneerToOrgRoles() {
  const snap = await db.collection('USER_LIST').get();
  const batch = db.batch();
  let count = 0;
  const details = [];
  snap.forEach(doc => {
    const data = doc.data();
    const status = Array.isArray(data.status) ? data.status
                 : (typeof data.status === 'string' ? data.status.split(',').map(s => s.trim()) : []);
    if (!status.includes('RP')) return;
    const orgRoles = Array.isArray(data.orgRoles) ? data.orgRoles : [];
    if (orgRoles.some(r => r?.department === 'pioneer_regular')) return;
    const updated = [...orgRoles, { department: 'pioneer_regular', position: '本人' }];
    batch.update(doc.ref, { orgRoles: updated });
    details.push(`${data.name}: 正規開拓者追加`);
    count++;
  });
  if (count === 0) { alert('反映対象なし（全員設定済み）'); return; }
  console.log('反映内容:\n' + details.join('\n'));
  if (!confirm(`${count}件の成員に正規開拓者を追加します。\n(詳細はコンソール参照)\n実行しますか？`)) return;
  await batch.commit();
  alert(`${count}件更新しました`);
  await loadMemberEditList();
  renderBulkEditTable();
}
window.migratePioneerToOrgRoles = migratePioneerToOrgRoles;

// ── 会衆設定ページ ────────────────────────────
async function renderConfigPage() {
  const body = document.getElementById('config-body');
  if (!body) return;
  body.innerHTML = '<div class="loading">読み込み中...</div>';

  const cfg = await getAppConfig();
  const meetingDays = Array.isArray(cfg.meetingDays) && cfg.meetingDays.length > 0 ? cfg.meetingDays : [4, 0];

  let html = '<div style="max-width:500px;margin:0 auto;">';
  html += '<h3 style="margin:0 0 16px;">集会曜日</h3>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">';
  WD.forEach((label, i) => {
    const checked = meetingDays.includes(i) ? ' checked' : '';
    html += '<label style="display:flex;align-items:center;gap:4px;font-size:14px;cursor:pointer;">'
         +  '<input type="checkbox" class="cfg-meeting-day" value="' + i + '"' + checked + '>'
         +  label + '</label>';
  });
  html += '</div>';
  html += '<button id="cfg-save-btn" class="btn-primary" style="padding:8px 24px;">保存</button>';
  html += '<span id="cfg-save-status" style="margin-left:12px;font-size:13px;color:#4caf50;"></span>';
  html += '</div>';

  body.innerHTML = html;

  document.getElementById('cfg-save-btn').addEventListener('click', async () => {
    const checks = body.querySelectorAll('.cfg-meeting-day:checked');
    const days = Array.from(checks).map(c => Number(c.value)).sort((a, b) => a - b);
    if (days.length === 0) { alert('少なくとも1つの曜日を選択してください。'); return; }
    const btn = document.getElementById('cfg-save-btn');
    btn.disabled = true; btn.textContent = '保存中...';
    try {
      await saveAppConfig({ meetingDays: days });
      document.getElementById('cfg-save-status').textContent = '保存しました';
      setTimeout(() => { const s = document.getElementById('cfg-save-status'); if (s) s.textContent = ''; }, 2000);
    } catch (e) {
      alert('保存エラー: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = '保存';
    }
  });
}

// ─────────────────────────────────────────────
// 権限シミュレーター
// ─────────────────────────────────────────────

// 任命オプション
const PSIM_APPOINTMENTS = [
  { code: '',            label: '伝道者' },
  { code: 'elder',       label: '長老' },
  { code: 'ministerial', label: '援助奉仕者' },
];

// orgRoles ベースの選択肢（よく使うもの抜粋）
// それぞれ dept (ORG_DEPARTMENTS.id) と position
const PSIM_ROLE_OPTIONS = [
  { dept: 'coord',          pos: '監督',   label: '調整者(監督)' },
  { dept: 'secretary',      pos: '監督',   label: '書記(監督)' },
  { dept: 'svc_ov',         pos: '監督',   label: '奉仕監督(監督)' },
  { dept: 'annai',          pos: '責任者', label: '案内(責任者)' },
  { dept: 'annai',          pos: '奉仕者', label: '案内(奉仕者)' },
  { dept: 'stage_av',       pos: '責任者', label: 'AVS(責任者)' },
  { dept: 'public_talk',    pos: '責任者', label: '公開講演調整者' },
  { dept: 'account',        pos: '責任者', label: '会計' },
  { dept: 'territory',      pos: '責任者', label: '区域' },
  { dept: 'pw_permit',      pos: '責任者', label: '公共エリア許可証取得' },
  { dept: 'pw_planner',     pos: '責任者', label: '公共エリア取決策定者' },
  { dept: 'literature',     pos: '責任者', label: '文書' },
  { dept: 'pioneer_regular',pos: '本人',   label: '正規開拓者' },
  { dept: 'group_poplar',   pos: '監督',   label: 'ポプラ(監督)' },
  { dept: 'group_poplar',   pos: '補佐',   label: 'ポプラ(補佐)' },
];

// プリセット
const PSIM_PRESETS = {
  publisher:   { label: '一般成員', appointment: '', orgRoleKeys: [], status: [] },
  annaigakari: { label: '案内係',   appointment: '', orgRoleKeys: ['annai|奉仕者'], status: [] },
  ms:          { label: '援助奉仕者', appointment: 'ministerial', orgRoleKeys: [], status: [] },
  elder:       { label: '長老',     appointment: 'elder', orgRoleKeys: [], status: [] },
  secretary:   { label: '書記',     appointment: 'elder', orgRoleKeys: ['secretary|監督'], status: [] },
  svc_ov:      { label: '奉仕監督', appointment: 'elder', orgRoleKeys: ['svc_ov|監督'], status: [] },
  group_ov:    { label: 'グループ監督', appointment: 'elder', orgRoleKeys: ['group_poplar|監督'], status: [] },
  pioneer:     { label: '正規開拓者', appointment: '', orgRoleKeys: ['pioneer_regular|本人'], status: [] },
  web:         { label: 'WEB管理者', appointment: '', orgRoleKeys: [], status: ['WEB'] },
  admin:       { label: 'ADMIN',    appointment: '', orgRoleKeys: [], status: ['WEB', 'ADMIN'] },
};

// シミュレートされた user オブジェクトから派生フラグを計算
function psimDeriveFlags(state) {
  const orgRoles = state.orgRoleKeys.map(k => {
    const [dept, pos] = k.split('|');
    return { department: dept, position: pos };
  });
  const u = {
    appointment: state.appointment,
    orgRoles,
    status: state.status.slice(),
  };
  return {
    user: u,
    isAdmin:       u.status.includes('WEB'),
    isPortalAdmin: u.status.includes('ADMIN'),
    isElder:       deriveIsElder(u),
    isMS:          deriveIsMS(u),
    isPioneer:     deriveIsPioneer(u),
    isAnnaigakari: deriveIsAnnaigakari(u),
    isGroupOverseer:  deriveGroupRole(u)?.position === '監督',
    isGroupAssistant: deriveGroupRole(u)?.position === '補佐',
    inactive:      u.status.includes('inactive'),
  };
}

// 表示ルール: 各機能の表示条件と説明
// when(flags) → true なら表示
const PSIM_FEATURES = [
  { group: 'ホーム画面（上位タイル）', items: [
    { label: '発表', when: f => true },
    { label: '宣教', when: f => true },
    { label: '集会', when: f => true },
    { label: 'フォーム', when: f => true },
    { label: '組織', when: f => true },
    { label: 'イベント', when: f => true },
    { label: '情報', when: f => true },
    { label: '計画', when: f => true },
    { label: '災害対応', when: f => true },
    { label: '管理画面', when: f => f.isAdmin, hint: '要 WEB' },
    { label: '奉仕報告提出バナー', when: f => false, hint: '毎月1〜10日のみ表示（日付条件）' },
  ]},
  { group: 'ホーム > 宣教アコーディオン', items: [
    { label: '個人の区域カード', when: f => true, hint: '区域割り当てがあると表示' },
    { label: '全ての区域カード', when: f => true, hint: '区域割り当てがあると表示' },
    { label: 'オートロック区域', when: f => true, hint: '区域割り当てがあると表示' },
    { label: '夜間区域',         when: f => true, hint: '区域割り当てがあると表示' },
    { label: '野外奉仕取決表', when: f => true },
    { label: '公共エリア伝道', when: f => true },
  ]},
  { group: 'ホーム > 集会アコーディオン', items: [
    { label: '公開講演（週末の集会）', when: f => true },
    { label: '週中の集会',             when: f => true },
    { label: '王国会館の清掃',         when: f => true },
  ]},
  { group: 'ホーム > 部門アコーディオン', items: [
    { label: '案内部門',   when: f => true },
    { label: 'AVS部門',    when: f => true },
    { label: '駐車場部門', when: f => true },
    { label: '文書部門',   when: f => true },
  ]},
  { group: 'ホーム > フォームアコーディオン', items: [
    { label: '公共エリア伝道申込み', when: f => true },
    { label: '奉仕報告',           when: f => true },
    { label: '区域情報登録',       when: f => true },
    { label: '成員情報登録',       when: f => true },
    { label: '出席人数登録',       when: f => f.isAnnaigakari || f.isAdmin, hint: '要 案内係 or WEB' },
  ]},
  { group: '集会ページ内', items: [
    { label: '講演希望番号', when: f => f.isElder, hint: '要 長老' },
  ]},
  { group: '情報ページ', items: [
    { label: '会衆登録情報', when: f => true },
    { label: '連絡先情報',   when: f => true },
    { label: '伝道者カード', when: f => true },
  ]},
  { group: '管理画面（全体）', items: [
    { label: '管理画面に入る権限', when: f => f.isAdmin, hint: '要 WEB' },
  ]},
  { group: '管理画面: 宣教', cond: f => f.isAdmin, items: [
    { label: '公共エリア伝道取決表策定', when: f => true },
    { label: '公共エリア伝道参加者策定', when: f => true },
    { label: '野外奉仕取決表策定',       when: f => true },
    { label: 'S-13 作成',                when: f => true },
  ]},
  { group: '管理画面: 集会', cond: f => f.isAdmin, items: [
    { label: '発表',           when: f => true },
    { label: 'プログラム表作成', when: f => true },
    { label: '担当者策定',      when: f => true },
    { label: 'S-89 作成',       when: f => true },
    { label: '生徒管理',        when: f => true },
    { label: '公開講演予定表策定', when: f => true },
    { label: 'S-99 講演一覧',   when: f => true },
  ]},
  { group: '管理画面: 部門', cond: f => f.isAdmin, items: [
    { label: '案内 取決め表',   when: f => true },
    { label: 'AVS 取決め表',    when: f => true },
    { label: '駐車場 取決め表', when: f => true },
    { label: '文書 取決め表',   when: f => true },
    { label: '清掃 取決め表',   when: f => true },
  ]},
  { group: '管理画面: 会衆', cond: f => f.isAdmin, items: [
    { label: 'グループ成員表',          when: f => true },
    { label: 'グループ成員緊急連絡先',   when: f => true },
    { label: '組織表編集',              when: f => true },
    { label: '奉仕報告記録承認',         when: f => true },
    { label: '奉仕報告提出状況',         when: f => true },
    { label: 'S-21 伝道者カード',       when: f => true },
    { label: '出席者数月次集計',         when: f => true },
  ]},
  { group: '管理画面: 唐木田PORTAL', cond: f => f.isAdmin && f.isPortalAdmin, items: [
    { label: 'グループ成員編集',  when: f => f.isPortalAdmin, hint: '要 ADMIN' },
    { label: 'アクセスログ',      when: f => f.isPortalAdmin, hint: '要 ADMIN' },
    { label: '会衆設定',          when: f => f.isPortalAdmin, hint: '要 ADMIN' },
    { label: '権限シミュレーター', when: f => f.isPortalAdmin, hint: '要 ADMIN' },
  ]},
];

// 現在のシミュレーション状態
let _psimState = { appointment: '', orgRoleKeys: [], status: [] };

function renderPermissionSimulator() {
  const body = document.getElementById('psim-body');
  if (!body) return;

  let html = '<div class="psim-wrap">';

  // プリセット
  html += '<div class="psim-section">';
  html += '<div class="psim-section-title">プリセット</div>';
  html += '<div class="psim-presets">';
  Object.entries(PSIM_PRESETS).forEach(([key, p]) => {
    html += `<button class="psim-preset-btn" data-preset="${esc(key)}">${esc(p.label)}</button>`;
  });
  html += '<button class="psim-preset-btn psim-preset-clear" data-preset="">クリア</button>';
  html += '</div></div>';

  // カスタム設定
  html += '<div class="psim-section">';
  html += '<div class="psim-section-title">詳細設定（カスタム）</div>';
  html += '<div class="psim-grid">';

  // 任命
  html += '<div class="psim-cat"><div class="psim-cat-title">任命</div>';
  PSIM_APPOINTMENTS.forEach(opt => {
    const chk = _psimState.appointment === opt.code ? 'checked' : '';
    html += `<label class="psim-radio"><input type="radio" name="psim-appt" value="${esc(opt.code)}" ${chk}> ${esc(opt.label)}</label>`;
  });
  html += '</div>';

  // システム
  html += '<div class="psim-cat"><div class="psim-cat-title">システム</div>';
  ['WEB', 'ADMIN', 'inactive'].forEach(s => {
    const chk = _psimState.status.includes(s) ? 'checked' : '';
    html += `<label class="psim-check"><input type="checkbox" class="psim-status-cb" value="${esc(s)}" ${chk}> ${esc(s)}</label>`;
  });
  html += '</div>';

  // 組織役職
  html += '<div class="psim-cat psim-cat-wide"><div class="psim-cat-title">組織役職</div>';
  PSIM_ROLE_OPTIONS.forEach(r => {
    const k = `${r.dept}|${r.pos}`;
    const chk = _psimState.orgRoleKeys.includes(k) ? 'checked' : '';
    html += `<label class="psim-check"><input type="checkbox" class="psim-role-cb" value="${esc(k)}" ${chk}> ${esc(r.label)}</label>`;
  });
  html += '</div>';

  html += '</div></div>';

  // 派生フラグ
  const flags = psimDeriveFlags(_psimState);
  html += '<div class="psim-section">';
  html += '<div class="psim-section-title">派生フラグ</div>';
  html += '<div class="psim-flags">';
  const flagsToShow = [
    ['isAdmin', flags.isAdmin],
    ['isPortalAdmin', flags.isPortalAdmin],
    ['isElder', flags.isElder],
    ['isMS', flags.isMS],
    ['isPioneer', flags.isPioneer],
    ['isAnnaigakari', flags.isAnnaigakari],
    ['isGroupOverseer', flags.isGroupOverseer],
    ['isGroupAssistant', flags.isGroupAssistant],
    ['inactive', flags.inactive],
  ];
  flagsToShow.forEach(([k, v]) => {
    html += `<span class="psim-flag ${v ? 'psim-flag-on' : 'psim-flag-off'}">${esc(k)}: ${v ? 'true' : 'false'}</span>`;
  });
  html += '</div></div>';

  // プレビュー（各画面の表示項目）
  html += '<div class="psim-section">';
  html += '<div class="psim-section-title">プレビュー（表示される項目）<span class="psim-prev-actions">'
       +  '<button type="button" class="psim-prev-toggle" data-act="expand">すべて開く</button>'
       +  '<button type="button" class="psim-prev-toggle" data-act="collapse">すべて閉じる</button>'
       +  '</span></div>';
  PSIM_FEATURES.forEach(grp => {
    // セクション自体の表示条件
    const sectionVisible = !grp.cond || grp.cond(flags);
    // 可視/非表示カウント
    const totalCount = grp.items.length;
    const visibleCount = sectionVisible
      ? grp.items.filter(it => it.when(flags)).length
      : 0;
    const summary = `${esc(grp.group)} <span class="psim-prev-count">${visibleCount}/${totalCount}</span>${sectionVisible ? '' : ' <span class="psim-hidden-tag">非表示</span>'}`;
    html += `<details class="psim-prev-group ${sectionVisible ? '' : 'psim-prev-group-hidden'}">`;
    html += `<summary class="psim-prev-group-title">${summary}</summary>`;
    if (sectionVisible) {
      html += '<div class="psim-prev-items">';
      grp.items.forEach(it => {
        const visible = it.when(flags);
        const icon = visible ? '✓' : '✗';
        const cls = visible ? 'psim-item-on' : 'psim-item-off';
        const hint = it.hint ? ` <span class="psim-item-hint">(${esc(it.hint)})</span>` : '';
        html += `<div class="psim-item ${cls}"><span class="psim-item-icon">${icon}</span>${esc(it.label)}${hint}</div>`;
      });
      html += '</div>';
    }
    html += '</details>';
  });
  html += '</div>';

  html += '</div>';
  body.innerHTML = html;

  // イベント
  body.querySelectorAll('.psim-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (key && PSIM_PRESETS[key]) {
        const p = PSIM_PRESETS[key];
        _psimState = {
          appointment: p.appointment,
          orgRoleKeys: p.orgRoleKeys.slice(),
          status: p.status.slice(),
        };
      } else {
        _psimState = { appointment: '', orgRoleKeys: [], status: [] };
      }
      renderPermissionSimulator();
    });
  });
  body.querySelectorAll('input[name="psim-appt"]').forEach(r => {
    r.addEventListener('change', () => {
      _psimState.appointment = r.value;
      renderPermissionSimulator();
    });
  });
  body.querySelectorAll('.psim-status-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const v = cb.value;
      const i = _psimState.status.indexOf(v);
      if (cb.checked && i === -1) _psimState.status.push(v);
      else if (!cb.checked && i !== -1) _psimState.status.splice(i, 1);
      renderPermissionSimulator();
    });
  });
  body.querySelectorAll('.psim-role-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const v = cb.value;
      const i = _psimState.orgRoleKeys.indexOf(v);
      if (cb.checked && i === -1) _psimState.orgRoleKeys.push(v);
      else if (!cb.checked && i !== -1) _psimState.orgRoleKeys.splice(i, 1);
      renderPermissionSimulator();
    });
  });
  // プレビュー全展開/全折りたたみ
  body.querySelectorAll('.psim-prev-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.dataset.act === 'expand';
      body.querySelectorAll('details.psim-prev-group').forEach(d => { d.open = open; });
    });
  });
}

document.getElementById('admin-manage-permission-simulator')?.addEventListener('click', () => {
  navigate('admin-permission-simulator');
});

// ══════════════════════════════════════════════
// 家族グループ管理
// ══════════════════════════════════════════════

let _fgMembers = []; // [{ docId, name, furigana, gender, familyGroup }]

async function initFamilyGroupsPage() {
  const container = document.getElementById('fg-cards-container');
  if (container) container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const all = await getUserListCached();
    _fgMembers = all
      .map(u => ({
        docId: u.docId,
        name: u.name || '',
        furigana: u.furigana || '',
        gender: u.gender || '',
        familyGroup: u.familyGroup || '',
        _inactive: (Array.isArray(u.status) ? u.status : []).includes('inactive'),
      }))
      .filter(m => m.name && !m._inactive);
    renderFamilyGroups();
  } catch (e) {
    if (container) container.innerHTML = '<div class="loading">エラー: ' + esc(e.message) + '</div>';
  }
}

function renderFamilyGroups() {
  const container = document.getElementById('fg-cards-container');
  if (!container) return;
  // familyGroup → メンバー配列
  const byGroup = new Map();
  _fgMembers.forEach(m => {
    if (!m.familyGroup) return;
    if (!byGroup.has(m.familyGroup)) byGroup.set(m.familyGroup, []);
    byGroup.get(m.familyGroup).push(m);
  });
  // ソート: グループ名昇順、メンバーはフリガナ昇順
  const groups = [...byGroup.keys()].sort((a, b) => a.localeCompare(b, 'ja'));
  if (groups.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-light)">家族グループはまだありません。<br>上の「新しい家族グループを作成」ボタンから追加してください。</div>';
    return;
  }
  let html = '';
  groups.forEach(g => {
    const members = byGroup.get(g).sort((a, b) => (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja'));
    html += `<div class="fg-card" data-group="${esc(g)}">
      <div class="fg-card-header">
        <span class="fg-card-title">${esc(g)}</span>
        <span class="fg-card-count">${members.length}人</span>
        <button class="fg-btn-rename icon-btn" title="名前変更"><span class="material-icons" style="font-size:16px">edit</span></button>
        <button class="fg-btn-delete icon-btn" title="家族グループ解散" style="color:#d32f2f"><span class="material-icons" style="font-size:16px">delete</span></button>
      </div>
      <div class="fg-card-body">
        <div class="fg-member-chips">`;
    members.forEach(m => {
      const genderTag = m.gender === '男' ? '♂' : m.gender === '女' ? '♀' : '';
      html += `<span class="fg-chip" data-mid="${esc(m.docId)}">${esc(m.name)} <span class="fg-chip-gender">${genderTag}</span><button class="fg-chip-x" title="削除">×</button></span>`;
    });
    html += `</div>
        <div class="fg-add-member-row">
          <select class="fg-add-select">
            <option value="">＋ メンバーを追加…</option>`;
    // 候補: 家族グループ未設定 or 他の家族にいる人（移動可能）
    _fgMembers
      .filter(m => m.familyGroup !== g)
      .sort((a, b) => (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja'))
      .forEach(m => {
        const note = m.familyGroup ? `（現在: ${m.familyGroup}）` : '';
        html += `<option value="${esc(m.docId)}">${esc(m.name)}${esc(note)}</option>`;
      });
    html += `</select>
        </div>
      </div>
    </div>`;
  });
  container.innerHTML = html;
  // イベント配線
  container.querySelectorAll('.fg-card').forEach(card => {
    const group = card.dataset.group;
    card.querySelector('.fg-btn-rename')?.addEventListener('click', () => fgRenameGroup(group));
    card.querySelector('.fg-btn-delete')?.addEventListener('click', () => fgDeleteGroup(group));
    card.querySelectorAll('.fg-chip-x').forEach(btn => {
      const chip = btn.closest('.fg-chip');
      const mid = chip?.dataset.mid;
      btn.addEventListener('click', () => fgRemoveMember(mid, group));
    });
    card.querySelector('.fg-add-select')?.addEventListener('change', (e) => {
      const mid = e.target.value;
      if (mid) fgAddMember(mid, group);
    });
  });
}

async function fgUpdateMemberGroup(docId, newGroup) {
  await db.collection('USER_LIST').doc(docId).update({ familyGroup: newGroup || '' });
  applyUserListLocal(docId, { familyGroup: newGroup || '' });
  const target = _fgMembers.find(m => m.docId === docId);
  if (target) target.familyGroup = newGroup || '';
}

async function fgAddMember(docId, group) {
  try {
    await fgUpdateMemberGroup(docId, group);
    renderFamilyGroups();
  } catch (e) { alert('追加エラー: ' + e.message); }
}

async function fgRemoveMember(docId, group) {
  const target = _fgMembers.find(m => m.docId === docId);
  if (!target) return;
  if (!confirm(`${target.name} を家族グループ「${group}」から外しますか？`)) return;
  try {
    await fgUpdateMemberGroup(docId, '');
    renderFamilyGroups();
  } catch (e) { alert('削除エラー: ' + e.message); }
}

async function fgRenameGroup(oldName) {
  const newName = prompt(`家族グループ名「${oldName}」を変更します。\n新しい名前:`, oldName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  // 既存の別グループと衝突 → 合流させる挙動になる旨確認
  const conflict = _fgMembers.some(m => m.familyGroup === trimmed);
  if (conflict && !confirm(`「${trimmed}」は既に存在します。両グループを統合しますか？`)) return;
  try {
    const targets = _fgMembers.filter(m => m.familyGroup === oldName);
    const batch = db.batch();
    targets.forEach(m => {
      batch.update(db.collection('USER_LIST').doc(m.docId), { familyGroup: trimmed });
    });
    await batch.commit();
    targets.forEach(m => {
      m.familyGroup = trimmed;
      applyUserListLocal(m.docId, { familyGroup: trimmed });
    });
    renderFamilyGroups();
  } catch (e) { alert('変更エラー: ' + e.message); }
}

async function fgDeleteGroup(group) {
  const count = _fgMembers.filter(m => m.familyGroup === group).length;
  if (!confirm(`家族グループ「${group}」を解散します（${count}人の家族グループが空になります）。よろしいですか？`)) return;
  try {
    const targets = _fgMembers.filter(m => m.familyGroup === group);
    const batch = db.batch();
    targets.forEach(m => {
      batch.update(db.collection('USER_LIST').doc(m.docId), { familyGroup: '' });
    });
    await batch.commit();
    targets.forEach(m => {
      m.familyGroup = '';
      applyUserListLocal(m.docId, { familyGroup: '' });
    });
    renderFamilyGroups();
  } catch (e) { alert('解散エラー: ' + e.message); }
}

async function fgCreateNewGroup() {
  const name = prompt('新しい家族グループの名前を入力してください\n（例: 家A、スズキ家）');
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (_fgMembers.some(m => m.familyGroup === trimmed)) {
    alert(`「${trimmed}」は既に存在します`);
    return;
  }
  // 最初のメンバーを選んでもらう（空グループだと表示されないため）
  const candidate = _fgMembers
    .filter(m => !m.familyGroup)
    .sort((a, b) => (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja'));
  if (candidate.length === 0) {
    alert('未所属のメンバーがいないため、新規作成できません。\n既存の家族グループから誰かを外してから再度お試しください。');
    return;
  }
  const names = candidate.map((m, i) => `${i + 1}. ${m.name}${m.gender ? '（' + m.gender + '）' : ''}`).join('\n');
  const pick = prompt(`「${trimmed}」の最初のメンバーを番号で選択してください:\n\n${names}`);
  if (pick === null) return;
  const idx = parseInt(pick, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= candidate.length) {
    alert('無効な番号です');
    return;
  }
  try {
    await fgUpdateMemberGroup(candidate[idx].docId, trimmed);
    renderFamilyGroups();
  } catch (e) { alert('作成エラー: ' + e.message); }
}

document.getElementById('fg-add-btn')?.addEventListener('click', fgCreateNewGroup);
