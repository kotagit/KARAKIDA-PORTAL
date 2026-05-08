// ── 状態 ──────────────────────────────────────
let currentUser    = null;
let isAdmin        = false;
let currentTab     = "meeting";
let editingId      = null;
let deleteTargetId = null;

// ── DOM ──────────────────────────────────────
const loginScreen  = document.getElementById("login-screen");
const mainScreen   = document.getElementById("main-screen");
const loginBtn     = document.getElementById("login-btn");
const logoutBtn    = document.getElementById("logout-btn");
const userNameEl   = document.getElementById("user-name");
const scheduleList = document.getElementById("schedule-list");
const fab          = document.getElementById("fab");
const adminModal   = document.getElementById("admin-modal");
const scheduleForm = document.getElementById("schedule-form");
const modalTitle   = document.getElementById("modal-title");
const loginError   = document.getElementById("login-error");
const tabs         = document.querySelectorAll(".tab");

// ── ログイン ──────────────────────────────────
loginBtn.addEventListener("click", () => {
  loginError.textContent = "Googleへ移動中...";
  auth.signInWithRedirect(provider);
});

logoutBtn.addEventListener("click", () => auth.signOut());

// ── 認証状態 ──────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    loginError.textContent = "ユーザー確認中...";
    try {
      const snap = await db.collection("USER_LIST")
        .where("mail", "==", user.email.toLowerCase())
        .limit(1)
        .get();

      if (snap.empty) {
        loginError.textContent = "アクセス権限がありません。";
        await auth.signOut();
        return;
      }

      const userData = snap.docs[0].data();
      currentUser = user;
      isAdmin     = userData.dev === "WEB";
      userNameEl.textContent = userData.name || user.displayName || "";

      if (isAdmin) fab.classList.remove("hidden");
      loginScreen.classList.add("hidden");
      mainScreen.classList.remove("hidden");
      loadSchedule();
    } catch (e) {
      loginError.textContent = "エラー: " + e.message;
      await auth.signOut();
    }
  } else {
    currentUser = null;
    isAdmin     = false;
    mainScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    fab.classList.add("hidden");
  }
});

// ── タブ切り替え ──────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    loadSchedule();
  });
});

// ── スケジュール読み込み ──────────────────────
async function loadSchedule() {
  scheduleList.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const snap = await db.collection("SCHEDULE")
      .where("type", "==", currentTab)
      .orderBy("date", "asc")
      .get();
    renderSchedule(snap.docs);
  } catch (e) {
    scheduleList.innerHTML = `<div class="loading">読み込みエラー: ${e.message}</div>`;
  }
}

// ── スケジュール描画 ──────────────────────────
const WEEKDAYS    = ["日","月","火","水","木","金","土"];
const TYPE_LABELS = { meeting:"集会", circuit:"巡回訪問", convention:"大会" };

function renderSchedule(docs) {
  if (docs.length === 0) {
    scheduleList.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">event_busy</span>
        スケジュールはありません
      </div>`;
    return;
  }

  scheduleList.innerHTML = "";
  docs.forEach(docSnap => {
    const d    = docSnap.data();
    const date = d.date?.toDate ? d.date.toDate() : new Date(d.date);
    const wday = WEEKDAYS[date.getDay()];

    let dateRange = "";
    if (d.endDate) {
      const end = d.endDate?.toDate ? d.endDate.toDate() : new Date(d.endDate);
      dateRange = ` ～ ${end.getMonth()+1}/${end.getDate()}(${WEEKDAYS[end.getDay()]})`;
    }

    const card = document.createElement("div");
    card.className = "schedule-card";
    card.innerHTML = `
      <div class="schedule-date-block">
        <div class="schedule-date-month">${date.getMonth()+1}月</div>
        <div class="schedule-date-day">${date.getDate()}</div>
        <div class="schedule-date-weekday">${wday}</div>
      </div>
      <div class="schedule-info">
        <span class="schedule-type-badge badge-${d.type}">${TYPE_LABELS[d.type]}</span>
        <div class="schedule-title">${esc(d.title || "")}</div>
        <div class="schedule-meta">
          ${dateRange ? `<span><span class="material-icons">date_range</span>${esc(dateRange)}</span>` : ""}
          ${d.location ? `<span><span class="material-icons">place</span>${esc(d.location)}</span>` : ""}
        </div>
        ${d.note ? `<div class="schedule-note">${esc(d.note)}</div>` : ""}
      </div>
      ${isAdmin ? `
        <div class="schedule-actions">
          <button class="icon-btn btn-edit" data-id="${docSnap.id}" title="編集">
            <span class="material-icons">edit</span>
          </button>
          <button class="icon-btn btn-delete" data-id="${docSnap.id}" title="削除">
            <span class="material-icons">delete</span>
          </button>
        </div>` : ""}
    `;
    scheduleList.appendChild(card);
  });

  if (isAdmin) {
    scheduleList.querySelectorAll(".btn-edit").forEach(btn =>
      btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
    scheduleList.querySelectorAll(".btn-delete").forEach(btn =>
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id)));
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── モーダル ──────────────────────────────────
fab.addEventListener("click", openAddModal);

function openAddModal() {
  editingId = null;
  modalTitle.textContent = "スケジュール追加";
  scheduleForm.reset();
  document.getElementById("form-type").value = currentTab;
  adminModal.classList.remove("hidden");
}

async function openEditModal(id) {
  editingId = id;
  modalTitle.textContent = "スケジュール編集";
  const snap = await db.collection("SCHEDULE").doc(id).get();
  const d = snap.data();
  document.getElementById("form-type").value     = d.type;
  document.getElementById("form-title").value    = d.title || "";
  document.getElementById("form-date").value     = toDateInput(d.date);
  document.getElementById("form-end-date").value = d.endDate ? toDateInput(d.endDate) : "";
  document.getElementById("form-location").value = d.location || "";
  document.getElementById("form-note").value     = d.note || "";
  adminModal.classList.remove("hidden");
}

function toDateInput(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split("T")[0];
}

function closeModal() {
  adminModal.classList.add("hidden");
  editingId = null;
}

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("form-cancel").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", closeModal);

// ── フォーム保存 ──────────────────────────────
scheduleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const endVal = document.getElementById("form-end-date").value;
  const data = {
    type:     document.getElementById("form-type").value,
    title:    document.getElementById("form-title").value.trim(),
    date:     firebase.firestore.Timestamp.fromDate(new Date(document.getElementById("form-date").value)),
    endDate:  endVal ? firebase.firestore.Timestamp.fromDate(new Date(endVal)) : null,
    location: document.getElementById("form-location").value.trim(),
    note:     document.getElementById("form-note").value.trim(),
  };
  try {
    if (editingId) {
      await db.collection("SCHEDULE").doc(editingId).update(data);
    } else {
      data.createdAt = firebase.firestore.Timestamp.now();
      await db.collection("SCHEDULE").add(data);
    }
    closeModal();
    loadSchedule();
  } catch (err) {
    alert("保存エラー: " + err.message);
  }
});

// ── 削除 ──────────────────────────────────────
function openDeleteModal(id) {
  deleteTargetId = id;
  document.getElementById("delete-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
  deleteTargetId = null;
}

document.getElementById("delete-cancel").addEventListener("click", closeDeleteModal);
document.getElementById("delete-overlay").addEventListener("click", closeDeleteModal);
document.getElementById("delete-confirm").addEventListener("click", async () => {
  if (!deleteTargetId) return;
  try {
    await db.collection("SCHEDULE").doc(deleteTargetId).delete();
    closeDeleteModal();
    loadSchedule();
  } catch (err) {
    alert("削除エラー: " + err.message);
  }
});
