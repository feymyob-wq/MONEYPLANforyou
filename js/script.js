/* ============================================================================
   MONEYPLAN — APPLICATION LOGIC
   Semua data disimpan di LocalStorage (tanpa backend).
   Struktur kode dibagi menjadi beberapa bagian besar, ditandai dengan komentar.
============================================================================ */

/* ----------------------------------------------------------------------------
   0. KONSTANTA & STATE GLOBAL
---------------------------------------------------------------------------- */
const CATEGORIES = [
  { key: 'Makanan',      icon: '🍔', type: 'pengeluaran' },
  { key: 'Transportasi', icon: '🚌', type: 'pengeluaran' },
  { key: 'Pendidikan',   icon: '📚', type: 'pengeluaran' },
  { key: 'Belanja',      icon: '🛍️', type: 'pengeluaran' },
  { key: 'Gaji',         icon: '💼', type: 'pemasukan' },
  { key: 'Bonus',        icon: '💰', type: 'pemasukan' },
  { key: 'Hadiah',       icon: '🎁', type: 'pemasukan' },
  { key: 'Rumah',        icon: '🏠', type: 'pengeluaran' },
  { key: 'Listrik',      icon: '💡', type: 'pengeluaran' },
  { key: 'Air',          icon: '💧', type: 'pengeluaran' },
  { key: 'Internet',     icon: '📱', type: 'pengeluaran' },
  { key: 'Kesehatan',    icon: '❤️', type: 'pengeluaran' },
  { key: 'Hiburan',      icon: '🎬', type: 'pengeluaran' },
  { key: 'Lainnya',      icon: '📌', type: 'pengeluaran' },
];

const LS_USERS   = 'mp_users';
const LS_SESSION = 'mp_session';
const LS_DARK    = 'mp_darkmode';
const dataKey    = (username) => `mp_data_${username}`;

let currentUser = null;      // { username, name }
let appData     = null;      // { transactions, target, budget }
let editingTxId = null;
let currentTxType = 'pemasukan';
let calendarViewDate = new Date();
let selectedCalendarDate = null;
let currentAnalyticsPeriod = 'week';
let charts = {};             // Chart.js instances keyed by canvas id
let pendingResetType = null;
let confirmResolver = null;

/* ----------------------------------------------------------------------------
   1. UTILITAS UMUM
---------------------------------------------------------------------------- */
function formatRupiah(num) {
  const n = Math.round(Number(num) || 0);
  return 'Rp ' + n.toLocaleString('id-ID');
}

function uuid() {
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function categoryIcon(name) {
  const c = CATEGORIES.find(c => c.key === name);
  return c ? c.icon : '📌';
}

// Toast notification: contoh toast('✅ Berhasil menambah transaksi')
function toast(message, duration = 2600) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

// Confirm dialog (Promise-based) menggantikan window.confirm bawaan browser
function askConfirm(title, message) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.remove('hidden');
  return new Promise(resolve => { confirmResolver = resolve; });
}
document.getElementById('confirmOk').addEventListener('click', () => {
  document.getElementById('confirmModal').classList.add('hidden');
  if (confirmResolver) confirmResolver(true);
});
document.getElementById('confirmCancel').addEventListener('click', () => {
  document.getElementById('confirmModal').classList.add('hidden');
  if (confirmResolver) confirmResolver(false);
});

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

/* ----------------------------------------------------------------------------
   2. PENYIMPANAN (LocalStorage helpers)
---------------------------------------------------------------------------- */
function getUsers() {
  return JSON.parse(localStorage.getItem(LS_USERS) || '{}');
}
function saveUsers(users) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}
function getSession() {
  return JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
}
function saveSession(session) {
  localStorage.setItem(LS_SESSION, JSON.stringify(session));
}
function loadUserData(username) {
  const raw = localStorage.getItem(dataKey(username));
  if (raw) return JSON.parse(raw);
  return { transactions: [], target: { amount: 0, date: null }, budget: { amount: 0 } };
}
function saveUserData() {
  if (!currentUser) return;
  localStorage.setItem(dataKey(currentUser.username), JSON.stringify(appData));
}

/* ----------------------------------------------------------------------------
   3. AUTENTIKASI (Login / Register / Logout)
---------------------------------------------------------------------------- */
document.getElementById('showRegister').addEventListener('click', () => {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
});
document.getElementById('showLogin').addEventListener('click', () => {
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
});
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

document.getElementById('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const pw = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;

  if (!name || !pw) { toast('⚠️ Lengkapi semua data'); return; }
  if (pw !== confirm) { toast('⚠️ Konfirmasi password tidak cocok'); return; }

  const users = getUsers();
  const username = name.toLowerCase().replace(/\s+/g, '_');
  if (users[username]) { toast('⚠️ Nama pengguna sudah terdaftar'); return; }

  users[username] = { name, password: pw };
  saveUsers(users);
  toast('✅ Akun berhasil dibuat, silakan masuk');
  document.getElementById('registerForm').reset();
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('loginUsername').value = name;
});

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('loginUsername').value.trim();
  const pw = document.getElementById('loginPassword').value;
  const remember = document.getElementById('rememberMe').checked;

  const users = getUsers();
  const username = nameInput.toLowerCase().replace(/\s+/g, '_');
  const user = users[username];

  if (!user) { toast('⚠️ Akun tidak ditemukan. Buat akun dulu, ya.'); return; }
  if (user.password !== pw) { toast('⚠️ Password salah, coba lagi.'); return; }

  saveSession({ username, remember });
  bootApp(username, user.name);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  const ok = await askConfirm('Keluar dari MoneyPlan?', 'Kamu harus masuk kembali untuk mengakses datamu.');
  if (!ok) return;
  localStorage.removeItem(LS_SESSION);
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('loginForm').reset();
});

/* ----------------------------------------------------------------------------
   4. BOOT APLIKASI SETELAH LOGIN
---------------------------------------------------------------------------- */
function bootApp(username, name) {
  currentUser = { username, name };
  appData = loadUserData(username);

  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('greetingText').textContent = `Halo, ${name} 👋`;
  document.getElementById('dateToday').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('settingsName').value = name;
  document.getElementById('txDate').value = todayISO();

  populateCategorySelect();
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderTransactionList();
  renderCalendar();
  renderAnalytics();
}

/* ----------------------------------------------------------------------------
   5. NAVIGASI TAB (Bottom Nav)
---------------------------------------------------------------------------- */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.goto));
});
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');
  if (tabId === 'tab-analitik') refreshCharts();
}

/* ----------------------------------------------------------------------------
   6. DARK MODE
---------------------------------------------------------------------------- */
function applyDarkMode(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  document.getElementById('darkModeToggle').textContent = mode === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(LS_DARK, mode);
}
document.getElementById('darkModeToggle').addEventListener('click', () => {
  const current = localStorage.getItem(LS_DARK) || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyDarkMode(next);
  refreshCharts();
});

/* ----------------------------------------------------------------------------
   7. TRANSAKSI — Modal Tambah/Edit
---------------------------------------------------------------------------- */
function populateCategorySelect(filterType) {
  const select = document.getElementById('txCategory');
  const type = filterType || currentTxType;
  select.innerHTML = CATEGORIES
    .filter(c => c.type === type || type === 'all')
    .map(c => `<option value="${c.key}">${c.icon} ${c.key}</option>`).join('');
}

document.getElementById('openTxModal').addEventListener('click', () => openTxModal());
document.getElementById('openTxModal2').addEventListener('click', () => openTxModal());
document.getElementById('closeTxModal').addEventListener('click', () => closeModal('txModal'));

function openTxModal(tx) {
  editingTxId = tx ? tx.id : null;
  document.getElementById('txModalTitle').textContent = tx ? 'Edit Transaksi' : 'Tambah Transaksi';
  currentTxType = tx ? tx.type : 'pemasukan';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === currentTxType));
  populateCategorySelect(currentTxType);

  document.getElementById('txId').value = tx ? tx.id : '';
  document.getElementById('txAmount').value = tx ? tx.amount : '';
  document.getElementById('txCategory').value = tx ? tx.category : CATEGORIES.find(c => c.type === currentTxType).key;
  document.getElementById('txNote').value = tx ? tx.note : '';
  document.getElementById('txDate').value = tx ? tx.date : todayISO();

  openModal('txModal');
}

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTxType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
    populateCategorySelect(currentTxType);
  });
});

document.getElementById('txForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('txAmount').value);
  const category = document.getElementById('txCategory').value;
  const note = document.getElementById('txNote').value.trim();
  const date = document.getElementById('txDate').value;

  if (!amount || amount <= 0) { toast('⚠️ Nominal harus lebih dari 0'); return; }
  if (!date) { toast('⚠️ Tanggal wajib diisi'); return; }

  if (editingTxId) {
    const tx = appData.transactions.find(t => t.id === editingTxId);
    Object.assign(tx, { type: currentTxType, amount, category, note, date });
    toast('✏️ Data berhasil diubah');
  } else {
    appData.transactions.push({ id: uuid(), type: currentTxType, amount, category, note, date });
    toast('✅ Berhasil menambah transaksi');
  }
  saveUserData();
  closeModal('txModal');
  renderAll();
});

// Quick Add (+10000 / +50000 / +100000) -> langsung pemasukan hari ini kategori Bonus
document.querySelectorAll('.quick-add').forEach(btn => {
  btn.addEventListener('click', () => {
    const amt = parseFloat(btn.dataset.amt);
    appData.transactions.push({ id: uuid(), type: 'pemasukan', amount: amt, category: 'Bonus', note: 'Tambah cepat', date: todayISO() });
    saveUserData();
    renderAll();
    toast(`✅ ${formatRupiah(amt)} ditambahkan`);
  });
});

function deleteTransaction(id) {
  askConfirm('Hapus Transaksi?', 'Data yang dihapus tidak dapat dikembalikan.').then(ok => {
    if (!ok) return;
    appData.transactions = appData.transactions.filter(t => t.id !== id);
    saveUserData();
    renderAll();
    toast('🗑️ Data berhasil dihapus');
  });
}

/* ----------------------------------------------------------------------------
   8. RENDER LIST TRANSAKSI (Dashboard ringkas & Tab penuh + search/filter)
---------------------------------------------------------------------------- */
function txItemHTML(t, withActions = true) {
  const dateFmt = new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon">${categoryIcon(t.category)}</div>
      <div class="tx-info">
        <strong>${t.category}${t.note ? ' — ' + escapeHTML(t.note) : ''}</strong>
        <span>${dateFmt}</span>
      </div>
      <div class="tx-amount ${t.type === 'pemasukan' ? 'income' : 'expense'}">
        ${t.type === 'pemasukan' ? '+' : '-'}${formatRupiah(t.amount)}
      </div>
      ${withActions ? `
      <div class="tx-actions">
        <button class="tx-edit" title="Edit">✏️</button>
        <button class="tx-delete" title="Hapus">🗑️</button>
      </div>` : ''}
    </div>`;
}
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function bindTxListEvents(container) {
  container.querySelectorAll('.tx-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.tx-item').dataset.id;
      const tx = appData.transactions.find(t => t.id === id);
      openTxModal(tx);
    });
  });
  container.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.tx-item').dataset.id;
      deleteTransaction(id);
    });
  });
}

function renderRecentTransactions() {
  const container = document.getElementById('recentTxList');
  const recent = [...appData.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🌱</div><h4>Belum ada riwayat</h4><p>Transaksi terbaru akan muncul di sini.</p></div>`;
    return;
  }
  container.innerHTML = recent.map(t => txItemHTML(t, false)).join('');
}

function getFilteredTransactions() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const filter = document.getElementById('filterSelect').value;
  const now = new Date();

  return appData.transactions
    .filter(t => {
      if (search) {
        const dateFmt = new Date(t.date).toLocaleDateString('id-ID');
        const hay = `${t.category} ${t.note} ${dateFmt} ${t.date}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      const d = new Date(t.date);
      if (filter === 'today') return d.toDateString() === now.toDateString();
      if (filter === 'week') { const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7); return d >= weekAgo && d <= now; }
      if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (filter === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderTransactionList() {
  const container = document.getElementById('fullTxList');
  const emptyState = document.getElementById('txEmptyState');
  const list = getFilteredTransactions();

  if (list.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    container.innerHTML = list.map(t => txItemHTML(t, true)).join('');
    bindTxListEvents(container);
  }
}
document.getElementById('searchInput').addEventListener('input', renderTransactionList);
document.getElementById('filterSelect').addEventListener('change', renderTransactionList);

/* ----------------------------------------------------------------------------
   9. DASHBOARD — Saldo, Target, Budget, Health Ring, Badge
---------------------------------------------------------------------------- */
function computeTotals() {
  let income = 0, expense = 0;
  appData.transactions.forEach(t => t.type === 'pemasukan' ? income += t.amount : expense += t.amount);
  return { income, expense, balance: income - expense };
}

function renderDashboard() {
  const { income, expense, balance } = computeTotals();
  document.getElementById('heroBalance').textContent = formatRupiah(balance);
  document.getElementById('heroIncome').textContent = formatRupiah(income);
  document.getElementById('heroExpense').textContent = formatRupiah(expense);

  renderRecentTransactions();
  renderTargetCard(balance);
  renderBudgetCard();
  renderHealthRing(income, expense, balance);
}

/* ---- Target Tabungan ---- */
function renderTargetCard(balance) {
  const target = appData.target || { amount: 0, date: null };
  const current = Math.max(balance, 0);
  const pct = target.amount > 0 ? Math.min(100, Math.round((current / target.amount) * 100)) : 0;

  document.getElementById('targetProgressBar').style.width = pct + '%';
  document.getElementById('targetPercent').textContent = pct + '%';
  document.getElementById('targetNumbers').textContent = `${formatRupiah(current)} / ${formatRupiah(target.amount)}`;

  const countdownEl = document.getElementById('targetCountdown');
  const estimateEl = document.getElementById('targetEstimate');

  if (target.amount > 0 && current >= target.amount) {
    countdownEl.textContent = '🎉 Target berhasil tercapai!';
    estimateEl.textContent = '';
  } else if (target.date) {
    const days = Math.ceil((new Date(target.date) - new Date()) / 86400000);
    countdownEl.textContent = days >= 0 ? `⏳ ${days} hari menuju target` : '⚠️ Tanggal target telah lewat';
  } else {
    countdownEl.textContent = '';
  }

  // Estimasi berdasarkan rata-rata menabung per bulan (income - expense per bulan berjalan)
  if (target.amount > 0 && current < target.amount) {
    const monthsActive = getActiveMonthsCount();
    const avgMonthly = monthsActive > 0 ? (income_expenseNet()) / monthsActive : 0;
    if (avgMonthly > 0) {
      const monthsNeeded = Math.ceil((target.amount - current) / avgMonthly);
      estimateEl.textContent = `📈 Estimasi tercapai dalam ~${monthsNeeded} bulan berdasarkan rata-rata menabung`;
    } else {
      estimateEl.textContent = '📈 Tambah transaksi untuk melihat estimasi pencapaian';
    }
  }
}
function income_expenseNet() {
  const { balance } = computeTotals();
  return balance;
}
function getActiveMonthsCount() {
  const months = new Set(appData.transactions.map(t => t.date.slice(0, 7)));
  return Math.max(months.size, 1);
}

document.getElementById('editTargetBtn').addEventListener('click', () => {
  document.getElementById('goalModalTitle').textContent = 'Atur Target Tabungan';
  document.getElementById('goalLabel').textContent = 'Nominal Target (Rp)';
  document.getElementById('goalAmount').value = appData.target.amount || '';
  document.getElementById('goalDateField').classList.remove('hidden');
  document.getElementById('goalDate').value = appData.target.date || '';
  document.getElementById('goalForm').dataset.mode = 'target';
  openModal('goalModal');
});
document.getElementById('editBudgetBtn').addEventListener('click', () => {
  document.getElementById('goalModalTitle').textContent = 'Atur Budget Bulanan';
  document.getElementById('goalLabel').textContent = 'Nominal Budget (Rp)';
  document.getElementById('goalAmount').value = appData.budget.amount || '';
  document.getElementById('goalDateField').classList.add('hidden');
  document.getElementById('goalForm').dataset.mode = 'budget';
  openModal('goalModal');
});
document.getElementById('closeGoalModal').addEventListener('click', () => closeModal('goalModal'));

document.getElementById('goalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const mode = e.target.dataset.mode;
  const amount = parseFloat(document.getElementById('goalAmount').value) || 0;
  if (mode === 'target') {
    appData.target = { amount, date: document.getElementById('goalDate').value || null };
    toast('✅ Target tabungan diperbarui');
  } else {
    appData.budget = { amount };
    toast('✅ Budget bulanan diperbarui');
  }
  saveUserData();
  closeModal('goalModal');
  renderDashboard();
});

/* ---- Budget Bulanan ---- */
function renderBudgetCard() {
  const budget = appData.budget || { amount: 0 };
  const now = new Date();
  const spentThisMonth = appData.transactions
    .filter(t => t.type === 'pengeluaran' && new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear())
    .reduce((s, t) => s + t.amount, 0);

  const pct = budget.amount > 0 ? Math.min(100, Math.round((spentThisMonth / budget.amount) * 100)) : 0;
  const bar = document.getElementById('budgetProgressBar');
  bar.style.width = pct + '%';
  bar.classList.remove('warn', 'danger');

  const statusEl = document.getElementById('budgetStatus');
  if (pct >= 100) { bar.classList.add('danger'); statusEl.textContent = '🔴 Terlampaui'; }
  else if (pct >= 80) { bar.classList.add('warn'); statusEl.textContent = '🟡 Hampir habis'; }
  else { statusEl.textContent = '🟢 Aman'; }

  document.getElementById('budgetPercent').textContent = pct + '%';
  document.getElementById('budgetNumbers').textContent = `${formatRupiah(spentThisMonth)} / ${formatRupiah(budget.amount)}`;

  // Notifikasi ambang batas (80/90/100), sekali per sesi per ambang
  const flagKey = `_budgetFlag_${now.getFullYear()}_${now.getMonth()}`;
  const flagged = sessionStorage.getItem(flagKey) || '';
  if (budget.amount > 0) {
    if (pct >= 100 && !flagged.includes('100')) { toast('🔴 Budget bulanan terlampaui!'); sessionStorage.setItem(flagKey, flagged + ',100'); }
    else if (pct >= 90 && !flagged.includes('90')) { toast('🟡 Budget sudah terpakai 90%'); sessionStorage.setItem(flagKey, flagged + ',90'); }
    else if (pct >= 80 && !flagged.includes('80')) { toast('🟡 Budget sudah terpakai 80%'); sessionStorage.setItem(flagKey, flagged + ',80'); }
  }
}

/* ---- Health Ring & Badge & Motivasi ---- */
function renderHealthRing(income, expense, balance) {
  const savingsRate = income > 0 ? (income - expense) / income : 0;
  let grade = 'D', color = '#ef4444', pct = 15;

  if (income === 0 && expense === 0) { grade = '-'; pct = 0; }
  else if (savingsRate >= 0.4) { grade = 'A+'; color = '#17b877'; pct = 100; }
  else if (savingsRate >= 0.25) { grade = 'A'; color = '#34d399'; pct = 82; }
  else if (savingsRate >= 0.1) { grade = 'B'; color = '#d4af37'; pct = 62; }
  else if (savingsRate >= 0) { grade = 'C'; color = '#f59e0b'; pct = 40; }
  else { grade = 'D'; color = '#ef4444'; pct = 15; }

  document.getElementById('healthGrade').textContent = grade;
  const circumference = 326.7;
  const ring = document.getElementById('healthRingProgress');
  ring.style.stroke = color;
  ring.style.strokeDashoffset = circumference - (circumference * pct / 100);

  const motivEl = document.getElementById('healthMotivation');
  if (grade === '-') motivEl.textContent = 'Mulai catat transaksi untuk melihat insight kamu.';
  else if (grade === 'A+' || grade === 'A') motivEl.textContent = 'Luar biasa! Tabunganmu tumbuh sehat bulan ini. 🌿';
  else if (grade === 'B') motivEl.textContent = 'Cukup baik — sedikit lagi untuk mencapai target ideal.';
  else if (grade === 'C') motivEl.textContent = 'Pengeluaran mulai mendekati pemasukan, coba lebih hemat.';
  else motivEl.textContent = 'Pengeluaran melebihi pemasukan. Yuk, evaluasi kembali!';

  // Badge Hemat / Boros berdasarkan bulan berjalan
  const badgeRow = document.getElementById('badgeRow');
  badgeRow.innerHTML = '';
  if (income > 0) {
    if (savingsRate >= 0.2) badgeRow.innerHTML += `<span class="badge badge-hemat">🌟 Hemat</span>`;
    else if (savingsRate < 0) badgeRow.innerHTML += `<span class="badge badge-boros">🔥 Boros</span>`;
  }
}

/* ----------------------------------------------------------------------------
   10. KALENDER TRANSAKSI
---------------------------------------------------------------------------- */
document.getElementById('calPrev').addEventListener('click', () => { calendarViewDate.setMonth(calendarViewDate.getMonth() - 1); renderCalendar(); });
document.getElementById('calNext').addEventListener('click', () => { calendarViewDate.setMonth(calendarViewDate.getMonth() + 1); renderCalendar(); });

function renderCalendar() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  document.getElementById('calMonthLabel').textContent = calendarViewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const txByDate = {};
  appData.transactions.forEach(t => { txByDate[t.date] = (txByDate[t.date] || 0) + 1; });

  const dows = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasTx = !!txByDate[iso];
    const isSelected = selectedCalendarDate === iso;
    html += `<div class="cal-day ${hasTx ? 'has-tx' : ''} ${isSelected ? 'selected' : ''}" data-date="${iso}">${day}${hasTx ? '<span class="cal-day-dot"></span>' : ''}</div>`;
  }
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-day:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedCalendarDate = cell.dataset.date;
      renderCalendar();
      renderCalendarSelectedList();
    });
  });
}

function renderCalendarSelectedList() {
  const label = document.getElementById('calSelectedDateLabel');
  const list = document.getElementById('calSelectedList');
  if (!selectedCalendarDate) { label.textContent = 'Pilih tanggal untuk melihat detail'; list.innerHTML = ''; return; }

  const dateFmt = new Date(selectedCalendarDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  label.textContent = dateFmt;
  const items = appData.transactions.filter(t => t.date === selectedCalendarDate);
  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><h4>Tidak ada transaksi</h4></div>`;
  } else {
    list.innerHTML = items.map(t => txItemHTML(t, true)).join('');
    bindTxListEvents(list);
  }
}

/* ----------------------------------------------------------------------------
   11. ANALITIK — Statistik & Insight Otomatis
---------------------------------------------------------------------------- */
document.querySelectorAll('.stat-period').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stat-period').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAnalyticsPeriod = btn.dataset.period;
    renderAnalytics();
  });
});

function getTransactionsInPeriod(period) {
  const now = new Date();
  return appData.transactions.filter(t => {
    const d = new Date(t.date);
    if (period === 'week') { const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7); return d >= weekAgo && d <= now; }
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function renderAnalytics() {
  const list = getTransactionsInPeriod(currentAnalyticsPeriod);
  const expenses = list.filter(t => t.type === 'pengeluaran');
  const incomes = list.filter(t => t.type === 'pemasukan');

  const biggest = expenses.reduce((max, t) => t.amount > (max ? max.amount : 0) ? t : max, null);
  document.getElementById('statBiggestExpense').textContent = biggest ? `${formatRupiah(biggest.amount)} (${biggest.category})` : '-';

  const catTotals = {};
  expenses.forEach(t => catTotals[t.category] = (catTotals[t.category] || 0) + t.amount);
  const topCatEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('statTopCategory').textContent = topCatEntry ? `${categoryIcon(topCatEntry[0])} ${topCatEntry[0]}` : '-';

  const avgExpense = expenses.length ? expenses.reduce((s, t) => s + t.amount, 0) / expenses.length : 0;
  document.getElementById('statAvgExpense').textContent = avgExpense ? formatRupiah(avgExpense) : '-';

  document.getElementById('statTxCount').textContent = list.length;
  document.getElementById('statIncomeCount').textContent = incomes.length;
  document.getElementById('statExpenseCount').textContent = expenses.length;

  renderInsights(list, catTotals);
  refreshCharts();
}

function renderInsights(list, catTotals) {
  const insights = [];
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topCat) insights.push(`Pengeluaran ${topCat[0]} paling tinggi (${formatRupiah(topCat[1])}).`);

  // Bandingkan bulan ini vs bulan lalu
  const now = new Date();
  const thisMonth = appData.transactions.filter(t => t.type === 'pengeluaran' && new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear()).reduce((s, t) => s + t.amount, 0);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = appData.transactions.filter(t => t.type === 'pengeluaran' && new Date(t.date).getMonth() === lastMonthDate.getMonth() && new Date(t.date).getFullYear() === lastMonthDate.getFullYear()).reduce((s, t) => s + t.amount, 0);
  if (lastMonth > 0) {
    const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    if (change > 0) insights.push(`Pengeluaran bulan ini naik ${change}% dibanding bulan lalu.`);
    else if (change < 0) insights.push(`Pengeluaran bulan ini turun ${Math.abs(change)}% dibanding bulan lalu — kerja bagus!`);
  }

  const { income, expense } = computeTotals();
  if (income > expense) insights.push('Tabungan meningkat — pemasukanmu lebih besar dari pengeluaran.');
  else if (income > 0 && income < expense) insights.push('Pengeluaran melebihi pemasukan bulan ini, perlu evaluasi.');

  if (insights.length === 0) insights.push('Belum cukup data untuk menampilkan insight. Tambahkan transaksi lebih banyak.');

  document.getElementById('insightList').innerHTML = insights.map(i => `<li>💡 ${i}</li>`).join('');
}

/* ----------------------------------------------------------------------------
   12. GRAFIK (Chart.js)
---------------------------------------------------------------------------- */
function chartColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: dark ? '#eaf5ef' : '#0d1a14',
    grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(6,78,59,0.08)',
    emerald: '#17b877',
    red: '#ef4444',
    gold: '#d4af37',
    palette: ['#17b877', '#d4af37', '#34d399', '#ef4444', '#0d9d5f', '#f59e0b', '#7c8f86', '#052e1f', '#e8cb6a', '#f87171', '#064e3b', '#a9c4b8', '#059669', '#fbbf24']
  };
}

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function refreshCharts() {
  if (typeof Chart === 'undefined') return;
  const c = chartColors();
  Chart.defaults.color = c.text;
  Chart.defaults.font.family = "'Inter', sans-serif";

  renderIncomeExpenseChart(c);
  renderPerMonthChart(c);
  renderPerCategoryChart(c);
  renderBalanceChart(c);
}

function renderIncomeExpenseChart(c) {
  const { income, expense } = computeTotals();
  destroyChart('chartIncomeExpense');
  charts.chartIncomeExpense = new Chart(document.getElementById('chartIncomeExpense'), {
    type: 'pie',
    data: { labels: ['Pemasukan', 'Pengeluaran'], datasets: [{ data: [income, expense], backgroundColor: [c.emerald, c.red] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderPerMonthChart(c) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('id-ID', { month: 'short' }) });
  }
  const totals = months.map(m => appData.transactions.filter(t => t.type === 'pengeluaran' && t.date.slice(0, 7) === m.key).reduce((s, t) => s + t.amount, 0));
  destroyChart('chartPerMonth');
  charts.chartPerMonth = new Chart(document.getElementById('chartPerMonth'), {
    type: 'bar',
    data: { labels: months.map(m => m.label), datasets: [{ label: 'Pengeluaran', data: totals, backgroundColor: c.emerald, borderRadius: 8 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: c.grid } } } }
  });
}

function renderPerCategoryChart(c) {
  const catTotals = {};
  appData.transactions.filter(t => t.type === 'pengeluaran').forEach(t => catTotals[t.category] = (catTotals[t.category] || 0) + t.amount);
  const labels = Object.keys(catTotals);
  const data = Object.values(catTotals);
  destroyChart('chartPerCategory');
  charts.chartPerCategory = new Chart(document.getElementById('chartPerCategory'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: c.palette }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }
  });
}

function renderBalanceChart(c) {
  const sorted = [...appData.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const points = sorted.map(t => { running += t.type === 'pemasukan' ? t.amount : -t.amount; return { x: t.date, y: running }; });
  destroyChart('chartBalance');
  charts.chartBalance = new Chart(document.getElementById('chartBalance'), {
    type: 'line',
    data: { labels: points.map(p => new Date(p.x).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })), datasets: [{ label: 'Saldo', data: points.map(p => p.y), borderColor: c.gold, backgroundColor: 'rgba(212,175,55,0.15)', fill: true, tension: 0.35 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: c.grid } } } }
  });
}

document.querySelectorAll('.export-png').forEach(btn => {
  btn.addEventListener('click', () => {
    const chart = charts[btn.dataset.chart];
    if (!chart) return;
    const link = document.createElement('a');
    link.download = `${btn.dataset.chart}.png`;
    link.href = chart.toBase64Image();
    link.click();
    toast('🖼️ Grafik berhasil diunduh sebagai PNG');
  });
});

/* ----------------------------------------------------------------------------
   13. EXPORT PDF / EXCEL / IMPORT EXCEL / BACKUP / RESTORE / PRINT
---------------------------------------------------------------------------- */
document.getElementById('exportPdfBtn').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const { income, expense, balance } = computeTotals();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('MoneyPlan — Laporan Keuangan', 14, 18);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(`Nama Pengguna: ${currentUser.name}`, 14, 28);
  doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 34);
  doc.text(`Saldo: ${formatRupiah(balance)}`, 14, 42);
  doc.text(`Total Pemasukan: ${formatRupiah(income)}`, 14, 48);
  doc.text(`Total Pengeluaran: ${formatRupiah(expense)}`, 14, 54);

  doc.setFont('helvetica', 'bold'); doc.text('Riwayat Transaksi', 14, 66);
  doc.setFont('helvetica', 'normal');
  let y = 74;
  const sorted = [...appData.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(t => {
    if (y > 280) { doc.addPage(); y = 20; }
    const line = `${t.date}  ${t.type === 'pemasukan' ? '+' : '-'}${formatRupiah(t.amount)}  ${t.category}  ${t.note || ''}`;
    doc.text(line, 14, y);
    y += 6;
  });

  doc.save(`MoneyPlan_Laporan_${todayISO()}.pdf`);
  toast('📄 PDF berhasil dibuat');
});

document.getElementById('exportExcelBtn').addEventListener('click', () => {
  const rows = appData.transactions.map(t => ({
    Tanggal: t.date, Tipe: t.type, Kategori: t.category, Keterangan: t.note, Nominal: t.amount
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');
  XLSX.writeFile(wb, `MoneyPlan_Transaksi_${todayISO()}.xlsx`);
  toast('📊 Excel berhasil dibuat');
});

document.getElementById('importExcelBtn').addEventListener('click', () => document.getElementById('importExcelInput').click());
document.getElementById('importExcelInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      let count = 0;
      rows.forEach(r => {
        const tanggal = r.Tanggal || r.tanggal || r.Date;
        const tipe = (r.Tipe || r.tipe || '').toLowerCase().includes('masuk') ? 'pemasukan' : 'pengeluaran';
        const kategori = r.Kategori || r.kategori || 'Lainnya';
        const nominal = parseFloat(r.Nominal || r.nominal || 0);
        if (tanggal && nominal) {
          appData.transactions.push({ id: uuid(), type: tipe, amount: nominal, category: kategori, note: r.Keterangan || r.keterangan || '', date: new Date(tanggal).toISOString().slice(0, 10) });
          count++;
        }
      });
      saveUserData();
      renderAll();
      toast(`✅ ${count} transaksi berhasil diimpor`);
    } catch (err) {
      toast('⚠️ Gagal membaca file Excel');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

document.getElementById('printReportBtn').addEventListener('click', () => window.print());

document.getElementById('backupJsonBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `MoneyPlan_Backup_${todayISO()}.json`;
  link.click();
  toast('⬇️ Backup data berhasil diunduh');
});
document.getElementById('restoreJsonBtn').addEventListener('click', () => document.getElementById('restoreJsonInput').click());
document.getElementById('restoreJsonInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed.transactions) throw new Error('invalid');
      appData = { transactions: parsed.transactions || [], target: parsed.target || { amount: 0, date: null }, budget: parsed.budget || { amount: 0 } };
      saveUserData();
      renderAll();
      toast('✅ Data berhasil dipulihkan');
    } catch (err) {
      toast('⚠️ File backup tidak valid');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ----------------------------------------------------------------------------
   14. PENGATURAN — Ubah Nama, Password, Reset Data
---------------------------------------------------------------------------- */
document.getElementById('saveNameBtn').addEventListener('click', () => {
  const newName = document.getElementById('settingsName').value.trim();
  if (!newName) { toast('⚠️ Nama tidak boleh kosong'); return; }
  const users = getUsers();
  users[currentUser.username].name = newName;
  saveUsers(users);
  currentUser.name = newName;
  document.getElementById('greetingText').textContent = `Halo, ${newName} 👋`;
  toast('✅ Nama berhasil diubah');
});

document.getElementById('savePwBtn').addEventListener('click', () => {
  const oldPw = document.getElementById('settingsOldPw').value;
  const newPw = document.getElementById('settingsNewPw').value;
  const users = getUsers();
  if (users[currentUser.username].password !== oldPw) { toast('⚠️ Password lama salah'); return; }
  if (!newPw) { toast('⚠️ Password baru tidak boleh kosong'); return; }
  users[currentUser.username].password = newPw;
  saveUsers(users);
  document.getElementById('settingsOldPw').value = '';
  document.getElementById('settingsNewPw').value = '';
  toast('✅ Password berhasil diubah');
});

document.querySelectorAll('[data-reset]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.reset;
    const labels = { transaksi: 'semua transaksi', budget: 'budget bulanan', target: 'target tabungan', semua: 'SEMUA data' };
    const ok = await askConfirm('Reset Data?', `Yakin ingin menghapus ${labels[type]}? Tindakan ini tidak bisa dibatalkan.`);
    if (!ok) return;

    if (type === 'transaksi') appData.transactions = [];
    else if (type === 'budget') appData.budget = { amount: 0 };
    else if (type === 'target') appData.target = { amount: 0, date: null };
    else if (type === 'semua') appData = { transactions: [], target: { amount: 0, date: null }, budget: { amount: 0 } };

    saveUserData();
    renderAll();
    toast('✅ Data berhasil direset');
  });
});

/* ----------------------------------------------------------------------------
   15. INISIALISASI SAAT HALAMAN DIMUAT
---------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  applyDarkMode(localStorage.getItem(LS_DARK) || 'light');

  const session = getSession();
  if (session && session.username) {
    const users = getUsers();
    const user = users[session.username];
    if (user) bootApp(session.username, user.name);
  }

  setTimeout(() => document.getElementById('loadingOverlay').classList.add('hidden'), 500);
});