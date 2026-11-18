import {
  STATUS, ROLE_LABEL, availableTransitions, calculateQuote, escapeHtml, generateId,
  formatDate, formatMoney, statusLabel,
} from './domain.js';
import * as Store from './store.js';

Store.initializeDemoData();
Store.setRemoteMode(false);
let FirebaseService = null;
let firebaseInitError = '';
try {
  FirebaseService = await import('./firebase/service.js');
} catch {
  firebaseInitError = 'Firebase SDK tidak dapat dimuat. Periksa koneksi internet atau jalankan mode demo lokal.';
}
let sessionMode = localStorage.getItem('shipflow_auth_mode_v1') || 'demo';
let session = sessionMode === 'firebase' ? null : Store.getCurrentUser();
let remoteSession = null;
let stopRemoteWatch = () => {};
let manualFirebaseAuth = false;
let wizardStep = 1;
let draft = {};
let toast = null;
let loginError = '';
let registerError = '';
let firebaseLoginError = '';
let adminFilters = { query: '', status: 'all' };
let reportFilters = { from: '', to: '', status: 'all' };
let mobileMenuOpen = false;
let trackingLookup = { number: '', loading: false, data: null, error: '' };
const app = document.querySelector('#app');

const e = escapeHtml;
const routeInfo = () => {
  const raw = location.hash.slice(1) || '/';
  const [path = '/', query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query) };
};
const navigate = (path) => {
  const next = `#${path}`;
  if (location.hash === next) render();
  else location.hash = next;
};
const roleHome = (role) => ({ customer: '/customer/dashboard', admin: '/admin/dashboard', courier: '/courier/tasks' }[role] || '/');
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'SF';

function statusBadge(status) {
  const item = STATUS[status] || { label: 'Status tidak diketahui', tone: 'gray' };
  return `<span class="status status-${item.tone}">${e(item.label)}</span>`;
}

function emptyState(title, message, icon = '↗') {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div><h3>${e(title)}</h3><p>${e(message)}</p></div>`;
}

function pageHeading(title, subtitle, action = '') {
  return `<div class="page-heading"><div><h2>${e(title)}</h2><p>${e(subtitle)}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`;
}

function kpi(label, value, subtitle, icon) {
  return `<article class="kpi-card"><div class="kpi-top"><span>${e(label)}</span><span class="kpi-icon" aria-hidden="true">${icon}</span></div><div class="kpi-value">${e(value)}</div><div class="kpi-sub">${e(subtitle)}</div></article>`;
}

function publicHeader() {
  return `<header class="public-nav"><a class="brand" href="#/" data-nav="/"><img src="./assets/logo.svg" alt="" /><span>SHIPFLOW<small>CARGO & LOGISTICS</small></span></a><nav class="public-nav-links" aria-label="Navigasi utama"><a href="#/" data-nav="/">Beranda</a><a href="#/track" data-nav="/track">Lacak resi</a><a href="#/login" data-nav="/login">Tentang demo</a></nav><div class="public-nav-actions"><a class="btn btn-outline btn-sm" href="#/login" data-nav="/login">Masuk</a><a class="btn btn-primary btn-sm" href="#/register" data-nav="/register">Buat pengiriman <span aria-hidden="true">→</span></a></div></header>`;
}

function homePage() {
  return `<main class="public-page">
    ${publicHeader()}
    <section class="hero">
      <div class="hero-copy"><div class="eyebrow">Cargo antarkota lebih terpantau</div><h1>Perjalanan barang,<br /><em>jelas dari awal.</em></h1><p>Kelola pengiriman cargo dari pemesanan, penjemputan, hingga barang tiba. Satu alur yang mudah dipahami oleh pelanggan, operator, dan kurir.</p><div class="hero-actions"><a class="btn btn-primary" href="#/register" data-nav="/register">Buat pengiriman <span aria-hidden="true">→</span></a><a class="btn btn-outline" href="#/track" data-nav="/track">Lacak resi</a></div><div class="trust-row"><span class="trust-item"><b class="trust-check">✓</b> Status mudah dipantau</span><span class="trust-item"><b class="trust-check">✓</b> Estimasi transparan</span><span class="trust-item"><b class="trust-check">✓</b> Alur tercatat</span></div><div class="hero-note">Prototype demonstrasi • estimasi dan progres bersifat simulasi</div></div>
      <div class="hero-art" aria-label="Ilustrasi rute pengiriman cargo"><div class="route-map"><div class="map-grid"></div><div class="map-land one"></div><div class="map-land two"></div><div class="map-route"></div><div class="map-pin origin"></div><div class="map-pin destination"></div><div class="floating-card top"><div class="floating-icon">↗</div><div><strong>Dalam perjalanan</strong><small>Jakarta → Semarang</small></div></div><div class="floating-card bottom"><div class="floating-icon">✓</div><div><strong>Resi terpantau</strong><small>Informasi status dalam satu alur</small></div></div></div></div>
    </section>
    <section class="section"><div class="section-inner"><div class="section-heading"><div class="eyebrow">Satu platform, tiga peran</div><h2>Pengiriman yang mudah diikuti</h2><p>SHIPFLOW merapikan langkah penting pengiriman cargo agar setiap pihak tahu apa yang perlu dilakukan berikutnya.</p></div><div class="feature-grid"><article class="feature-card"><div class="feature-icon">▣</div><h3>Pesan dengan estimasi jelas</h3><p>Isi rute dan detail paket, lalu lihat berat tagih serta estimasi ongkir sebelum mengirim permintaan.</p></article><article class="feature-card"><div class="feature-icon">⌁</div><h3>Operasional tercatat</h3><p>Operator memeriksa pesanan, menyetujui tarif demo, dan menjadwalkan kurir dalam urutan yang terkontrol.</p></article><article class="feature-card"><div class="feature-icon">◷</div><h3>Lacak progres resi</h3><p>Pelanggan melihat status dan riwayat perubahan. Informasi publik tidak menampilkan alamat atau kontak pribadi.</p></article></div></div></section>
    <section class="flow-band"><div class="flow-band-inner"><h2>Dari pickup sampai tujuan.</h2><div class="flow-steps"><span><b>1</b> Pesan</span><span><b>2</b> Periksa</span><span><b>3</b> Jemput</span><span><b>4</b> Antar</span><span><b>5</b> Terkirim</span></div></div></section>
    <footer class="public-footer"><span>© SHIPFLOW • Prototype cargo & logistics</span><span>Demo lokal • Tidak memproses pembayaran atau GPS real-time</span></footer>
  </main>`;
}

function demoAccountButton(role, email, label) {
  return `<button class="demo-account" type="button" data-action="demo-login" data-role="${role}"><span><strong>${e(label)}</strong><small>${e(email)}</small></span><em>Coba demo →</em></button>`;
}

function authPage(kind) {
  const isRegister = kind === 'register';
  const err = isRegister ? registerError : loginError || firebaseLoginError;
  const firebaseOption = FirebaseService ? '<option value="firebase" selected>Akun Firebase</option>' : '<option value="firebase" disabled>Firebase tidak tersedia pada sesi ini</option>';
  const localOption = FirebaseService ? '<option value="demo">Demo lokal</option>' : '<option value="demo" selected>Demo lokal</option>';
  const content = isRegister
    ? `<h2>Buat akun pelanggan</h2><p>Daftar untuk membuat permintaan pengiriman dan melihat progres kiriman Anda.</p>${err ? `<div class="error-banner" role="alert">${e(err)}</div>` : ''}<form id="register-form"><div class="field"><label for="register-mode">Tempat penyimpanan akun</label><select class="select" id="register-mode" name="authMode">${firebaseOption}${localOption}</select><p class="helper">Akun Firebase disimpan di project SHIPFLOW. Demo lokal hanya tersimpan di browser ini.</p></div><div class="field"><label for="register-name">Nama lengkap</label><input class="input" id="register-name" name="displayName" autocomplete="name" required maxlength="80" placeholder="Nama Anda" /></div><div class="field"><label for="register-email">Email</label><input class="input" id="register-email" name="email" type="email" autocomplete="email" required maxlength="120" placeholder="nama@email.com" /></div><div class="field"><label for="register-phone">Nomor telepon</label><input class="input" id="register-phone" name="phone" autocomplete="tel" required pattern="[0-9+() -]{8,20}" maxlength="20" placeholder="08xx xxxx xxxx" /></div><div class="field"><label for="register-password">Kata sandi</label><input class="input" id="register-password" name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="64" placeholder="Minimal 6 karakter" /></div><div class="notice notice-warn" style="margin-bottom:16px">Firebase memerlukan metode Email/Password aktif dan aturan Realtime Database yang sesuai.</div><button class="btn btn-primary btn-block" type="submit">Buat akun <span aria-hidden="true">→</span></button></form><div class="auth-switch">Sudah punya akun? <a href="#/login" data-nav="/login">Masuk</a></div>`
    : `<h2>Selamat datang kembali</h2><p>Masuk dengan akun Firebase atau pilih akun lokal demo.</p>${err ? `<div class="error-banner" role="alert">${e(err)}</div>` : ''}${firebaseInitError ? `<div class="notice notice-warn" style="margin-bottom:15px">${e(firebaseInitError)}</div>` : ''}<form id="login-form"><div class="field"><label for="login-mode">Metode masuk</label><select class="select" id="login-mode" name="authMode">${firebaseOption}${localOption}</select></div><div class="field"><label for="login-email">Email</label><input class="input" id="login-email" name="email" type="email" autocomplete="username" required placeholder="nama@email.com" /></div><div class="field"><label for="login-password">Kata sandi</label><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Masukkan kata sandi" /></div><button class="btn btn-primary btn-block" type="submit">Masuk ke akun <span aria-hidden="true">→</span></button></form><div class="demo-box"><div class="demo-box-title">Akun demonstrasi lokal · kata sandi: demo123</div><div class="demo-accounts">${demoAccountButton('customer', 'customer.demo@shipflow.test', 'Pelanggan')}${demoAccountButton('admin', 'admin.demo@shipflow.test', 'Operator')}${demoAccountButton('courier', 'courier.demo@shipflow.test', 'Kurir')}</div></div><div class="auth-switch">Belum punya akun? <a href="#/register" data-nav="/register">Daftar sebagai pelanggan</a></div>`;
  return `<main class="auth-layout"><aside class="auth-aside"><a class="brand brand-light" href="#/" data-nav="/"><img src="./assets/logo.svg" alt="" /><span>SHIPFLOW<small>CARGO & LOGISTICS</small></span></a><div class="auth-aside-copy"><div class="mini-line"></div><h1>Kiriman Anda, setiap langkahnya.</h1><p>Masuk ke ruang kerja sesuai peran untuk membuat pesanan, memantau operasional, atau memperbarui tugas kurir.</p></div><div class="auth-aside-foot">Prototipe demonstrasi • Data fiktif</div></aside><section class="auth-main"><div class="auth-box">${content}<div class="auth-switch"><a href="#/" data-nav="/">← Kembali ke beranda</a></div></div></section></main>`;
}

function timeline(events = [], isPublic = false) {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!sorted.length) return emptyState('Belum ada riwayat', 'Perubahan status akan muncul di sini.', '◷');
  return `<div class="timeline">${sorted.map((event) => `<div class="timeline-item"><span class="timeline-dot" aria-hidden="true"></span><strong>${e(event.label || statusLabel(event.status))}</strong>${!isPublic && event.note ? `<p>${e(event.note)}</p>` : ''}${event.locationLabel ? `<p>${isPublic ? 'Kota: ' : 'Lokasi: '}${e(event.locationLabel)}</p>` : ''}<small>${e(formatDate(event.createdAt))}${!isPublic && event.actorRole ? ` · ${e(ROLE_LABEL[event.actorRole] || event.actorRole)}` : ''}</small></div>`).join('')}</div>`;
}

function publicTrackPage(params = new URLSearchParams()) {
  const query = params.get('resi') || '';
  const matchingLookup = trackingLookup.number.toLowerCase() === query.trim().toLowerCase();
  const remote = matchingLookup ? trackingLookup.data : null;
  const localSample = query ? Store.getShipments().find((item) => item.trackingNumber.toLowerCase() === query.trim().toLowerCase()) : null;
  const shipment = remote
    ? {
      ...remote,
      origin: { city: remote.originCity },
      destination: { city: remote.destinationCity },
      package: { description: 'Cargo' },
      events: Object.values(remote.timeline || {}).map((event, index) => ({ ...event, id: String(index), createdAt: event.createdAt })),
    }
    : localSample;
  const lookupError = matchingLookup ? trackingLookup.error : '';
  const result = query
    ? matchingLookup && trackingLookup.loading
      ? `<section class="panel">${emptyState('Mencari resi', 'Mengambil status publik dari Firebase Realtime Database…', '◷')}</section>`
      : shipment
      ? `<section class="panel"><div class="shipment-hero"><div><div class="eyebrow">Hasil pelacakan</div><h2>${e(shipment.trackingNumber)}</h2><p>${e(shipment.origin.city)} <span class="route-arrow">→</span> ${e(shipment.destination.city)}</p></div>${statusBadge(shipment.status)}</div><div class="panel-body"><div class="detail-grid"><div class="detail-card"><h3>Ringkasan pengiriman</h3><div class="detail-line"><small>Status terkini</small><strong>${e(statusLabel(shipment.status))}</strong></div><div class="detail-line"><small>Rute kota</small><strong>${e(shipment.origin.city)} → ${e(shipment.destination.city)}</strong></div><div class="detail-line"><small>Jenis paket</small><strong>${e(shipment.package.description)}</strong></div></div><div class="detail-card"><h3>Riwayat status</h3>${timeline(shipment.events, true)}</div></div><p class="helper" style="margin-top:14px">Pelacakan publik hanya menampilkan kota dan status umum. Alamat lengkap, nomor telepon, serta identitas akun tidak ditampilkan.</p></div></section>`
      : `<div class="panel">${emptyState('Resi belum ditemukan', lookupError || 'Periksa kembali nomor resi. Resi demo hanya tersedia dari data contoh di browser ini.', '⌕')}</div>`
    : '';
  const sourceNotice = matchingLookup && trackingLookup.loading
    ? 'Sedang mencari status resi pada Firebase Realtime Database.'
    : remote
      ? 'Pelacakan ini membaca status publik dari Firebase. Informasi lokasi aktual/GPS tidak disediakan.'
      : 'Resi contoh yang cocok berasal dari demo lokal di browser ini.';
  const sourceLabel = remote ? 'Data pelacakan Firebase' : FirebaseService ? 'Firebase dan demo lokal' : 'Data demo lokal';
  return `<main class="public-page">${publicHeader()}<section class="section" style="min-height:calc(100vh - 150px);background:#f7f9fb"><div class="section-inner" style="max-width:850px"><div class="page-heading"><div><div class="eyebrow">Pelacakan pengiriman</div><h2>Lacak nomor resi</h2><p>Masukkan nomor resi SHIPFLOW untuk melihat status dan riwayat pengiriman.</p></div></div><section class="panel"><div class="panel-body"><form id="track-form" class="filter-form" style="padding:0;border:0"><input class="input" name="resi" value="${e(query)}" required maxlength="40" aria-label="Nomor resi" placeholder="Contoh: SF-2611-104283" /><button class="btn btn-primary" type="submit">Lacak resi <span aria-hidden="true">→</span></button></form><p class="helper" style="margin-top:12px">Coba resi demo: SF-2611-104283 atau SF-2611-209144.</p></div></section>${result}<div class="notice notice-warn">${e(sourceNotice)}</div></div></section><footer class="public-footer"><span>© SHIPFLOW • Prototype cargo & logistics</span><span>${e(sourceLabel)}</span></footer></main>`;
}

function startTrackingLookup(trackingNumber) {
  const normalized = trackingNumber.trim().toUpperCase();
  if (!FirebaseService || !normalized || trackingLookup.number.toLowerCase() === normalized.toLowerCase()) return;
  trackingLookup = { number: normalized, loading: true, data: null, error: '' };
  FirebaseService.lookupPublicTracking(normalized).then((data) => {
    if (trackingLookup.number.toLowerCase() !== normalized.toLowerCase()) return;
    trackingLookup = { number: normalized, loading: false, data, error: '' };
    render();
  }).catch((error) => {
    if (trackingLookup.number.toLowerCase() !== normalized.toLowerCase()) return;
    trackingLookup = { number: normalized, loading: false, data: null, error: friendlyFirebaseError(error) };
    render();
  });
}

const NAV = {
  customer: [
    { label: 'Dashboard', path: '/customer/dashboard', icon: '▦' },
    { label: 'Pengiriman saya', path: '/customer/shipments', icon: '▤' },
    { label: 'Buat pengiriman', path: '/customer/shipments/new', icon: '＋' },
    { label: 'Lacak resi', path: '/track', icon: '⌕' },
  ],
  admin: [
    { label: 'Dashboard', path: '/admin/dashboard', icon: '▦' },
    { label: 'Semua pengiriman', path: '/admin/shipments', icon: '▤' },
    { label: 'Daftar kurir', path: '/admin/couriers', icon: '♧' },
    { label: 'Laporan', path: '/admin/reports', icon: '▥' },
  ],
  courier: [
    { label: 'Tugas saya', path: '/courier/tasks', icon: '⌖' },
  ],
};

function pageTitle(path) {
  if (path.includes('/shipments/new')) return 'Buat pengiriman';
  if (path.includes('/shipments/')) return 'Detail pengiriman';
  if (path.includes('/shipments')) return 'Pengiriman';
  if (path.includes('/couriers')) return 'Daftar kurir';
  if (path.includes('/reports')) return 'Laporan';
  if (path.includes('/tasks/')) return 'Detail tugas';
  if (path.includes('/tasks')) return 'Tugas saya';
  if (path === '/profile') return 'Profil saya';
  if (path === '/track') return 'Lacak resi';
  return 'Dashboard';
}

function isNavActive(path, itemPath) {
  if (path === itemPath) return true;
  if (itemPath === '/customer/shipments' && path === '/customer/shipments/new') return false;
  return path.startsWith(`${itemPath}/`);
}

function shell(content, path) {
  const links = NAV[session.role] || [];
  return `<div class="app-shell ${mobileMenuOpen ? 'menu-open' : ''}"><aside class="sidebar"><a class="brand brand-light" href="#${roleHome(session.role)}" data-nav="${roleHome(session.role)}"><img src="./assets/logo.svg" alt="" /><span>SHIPFLOW<small>CARGO & LOGISTICS</small></span></a><div class="sidebar-label">Menu utama</div><nav class="sidebar-nav" aria-label="Menu ${e(ROLE_LABEL[session.role])}">${links.map((item) => `<a class="nav-link ${isNavActive(path, item.path) ? 'active' : ''}" href="#${item.path}" data-nav="${item.path}"><span class="nav-icon" aria-hidden="true">${item.icon}</span>${e(item.label)}</a>`).join('')}</nav><div class="sidebar-spacer"></div><div class="sidebar-profile"><span class="avatar">${e(initials(session.displayName))}</span><div><strong>${e(session.displayName)}</strong><small>${e(ROLE_LABEL[session.role])} · ${sessionMode === 'firebase' ? 'Firebase RTDB' : 'Demo lokal'}</small></div></div></aside><div class="main-column"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu-button" type="button" data-action="mobile-menu" aria-label="Buka menu">☰</button><div><h1>${e(pageTitle(path))}</h1><p>Kelola pengiriman SHIPFLOW dengan alur yang tercatat</p></div></div><div class="topbar-actions"><a class="btn btn-plain btn-sm" href="#/profile" data-nav="/profile">Profil</a><div class="topbar-user"><span class="avatar">${e(initials(session.displayName))}</span><div class="topbar-user-info"><strong>${e(session.displayName)}</strong><small>${e(ROLE_LABEL[session.role])}</small></div></div><button class="btn btn-outline btn-sm" type="button" data-action="logout">Keluar</button></div></header><main class="page-content">${content}</main></div></div>`;
}

function shipmentTable(shipments, actionPath, opts = {}) {
  if (!shipments.length) return emptyState(opts.emptyTitle || 'Belum ada pengiriman', opts.emptyMessage || 'Data pengiriman akan muncul di sini.', '▤');
  const rows = shipments.map((shipment) => `<tr><td><span class="table-primary">${e(shipment.trackingNumber)}</span><span class="table-secondary">${e(shipment.package.description)}</span></td><td><div class="route-cell"><span>${e(shipment.origin.city)}</span><span class="route-arrow">→</span><span>${e(shipment.destination.city)}</span></div></td>${opts.customerName ? `<td>${e(opts.customerName(shipment))}</td>` : ''}<td>${statusBadge(shipment.status)}</td><td>${e(formatDate(shipment.createdAt, false))}</td><td><a class="row-link" href="#${actionPath(shipment)}" data-nav="${actionPath(shipment)}">Lihat detail →</a></td></tr>`).join('');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nomor resi / paket</th><th>Rute</th>${opts.customerName ? '<th>Pelanggan</th>' : ''}<th>Status</th><th>Tanggal</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function shipmentsForCustomer() {
  return Store.getShipments().filter((shipment) => shipment.ownerUid === session.uid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function customerDashboard() {
  const shipments = shipmentsForCustomer();
  const active = shipments.filter((item) => !['delivered', 'rejected', 'cancelled'].includes(item.status));
  const delivered = shipments.filter((item) => item.status === 'delivered');
  const pending = shipments.filter((item) => item.status === 'pending_review');
  const action = `<a class="btn btn-primary btn-sm" href="#/customer/shipments/new" data-nav="/customer/shipments/new">＋ Buat pengiriman</a>`;
  return `${pageHeading('Ringkasan kiriman', 'Pantau pengiriman Anda dari satu tempat.', action)}<div class="kpi-grid">${kpi('Total pengiriman', String(shipments.length), 'Semua kiriman akun Anda', '▤')}${kpi('Sedang berjalan', String(active.length), 'Menunggu proses hingga pengantaran', '↗')}${kpi('Menunggu konfirmasi', String(pending.length), 'Sedang diperiksa operator', '◷')}${kpi('Terkirim', String(delivered.length), 'Pengiriman yang sudah selesai', '✓')}</div><section class="panel"><div class="panel-head"><div><h3>Pengiriman terbaru</h3><p>Perubahan status muncul di riwayat setiap resi.</p></div><a class="row-link" href="#/customer/shipments" data-nav="/customer/shipments">Lihat semua →</a></div>${shipmentTable(shipments.slice(0, 5), (item) => `/customer/shipments/${item.id}`, { emptyTitle: 'Belum ada kiriman', emptyMessage: 'Mulai dengan membuat permintaan pengiriman cargo pertama Anda.' })}</section><div class="notice notice-warn">Estimasi biaya dan seluruh pembaruan pada demo ini bersifat simulasi.</div>`;
}

function customerShipmentsPage() {
  const shipments = shipmentsForCustomer();
  return `${pageHeading('Pengiriman saya', 'Daftar resi dan status semua pesanan milik Anda.', `<a class="btn btn-primary btn-sm" href="#/customer/shipments/new" data-nav="/customer/shipments/new">＋ Buat pengiriman</a>`)}<section class="panel"><div class="panel-head"><div><h3>Semua pengiriman</h3><p>${shipments.length} kiriman</p></div></div>${shipmentTable(shipments, (item) => `/customer/shipments/${item.id}`, { emptyTitle: 'Belum ada kiriman', emptyMessage: 'Pengiriman baru akan tampil di daftar ini.' })}</section>`;
}

function detailLine(label, value, options = {}) {
  return `<div class="detail-line"><small>${e(label)}</small><strong class="${options.sensitive ? 'sensitive' : ''}">${e(value || '—')}</strong></div>`;
}

function customerShipmentDetail(id) {
  const shipment = Store.getShipment(id);
  if (!shipment || shipment.ownerUid !== session.uid) return unauthorizedPage('Kiriman tidak ditemukan atau bukan milik akun Anda.');
  const action = shipment.status === 'pending_review' ? `<button class="btn btn-danger btn-sm" type="button" data-action="cancel-shipment" data-id="${e(shipment.id)}">Batalkan pesanan</button>` : '';
  const deliveryReceipt = shipment.status === 'delivered' ? `${detailLine('Diterima oleh', shipment.recipientName)}${detailLine('Waktu konfirmasi', formatDate(shipment.deliveredAt))}` : '';
  return `${pageHeading('Detail pengiriman', 'Ringkasan resi, paket, dan riwayat status.', `<button class="btn btn-outline btn-sm" type="button" data-action="print">Cetak ringkasan</button>${action}`)}<section class="panel"><div class="shipment-hero"><div><div class="eyebrow">Nomor resi</div><h2>${e(shipment.trackingNumber)}</h2><p>Dibuat ${e(formatDate(shipment.createdAt))}</p></div>${statusBadge(shipment.status)}</div><div class="panel-body"><div class="detail-grid"><div class="detail-card"><h3>↑ Informasi pengirim</h3>${detailLine('Kota asal', shipment.origin.city)}${detailLine('Alamat pickup', shipment.origin.address)}${detailLine('Kontak pengirim', shipment.origin.contactName)}${detailLine('Telepon', shipment.origin.phone)}</div><div class="detail-card"><h3>↓ Informasi penerima</h3>${detailLine('Kota tujuan', shipment.destination.city)}${detailLine('Alamat pengantaran', shipment.destination.address)}${detailLine('Kontak penerima', shipment.destination.contactName)}${detailLine('Telepon', shipment.destination.phone)}${deliveryReceipt}</div><div class="detail-card"><h3>▣ Detail paket</h3>${detailLine('Deskripsi', shipment.package.description)}${detailLine('Kategori', shipment.package.category)}${detailLine('Berat aktual / tagih', `${shipment.package.actualWeightKg} kg / ${shipment.quote.billableWeightKg} kg`)}${detailLine('Jumlah koli', String(shipment.package.pieces))}${detailLine('Layanan', serviceLabel(shipment.serviceLevel))}${shipment.package.instructions ? detailLine('Instruksi', shipment.package.instructions) : ''}</div><div class="detail-card"><h3>Rp Estimasi biaya</h3>${detailLine('Estimasi prototype', formatMoney(shipment.quote.estimatedAmountIdr))}${detailLine('Catatan', 'Tarif akhir menunggu pemeriksaan operator.')}</div></div></div></section><section class="panel"><div class="panel-head"><div><h3>Riwayat pengiriman</h3><p>Setiap perubahan status tercatat dengan waktu dan pelaku.</p></div></div><div class="panel-body">${timeline(shipment.events)}</div></section><div class="notice notice-warn">Pembatalan hanya tersedia sebelum pesanan dikonfirmasi. Setelah itu, hubungi operator melalui prosedur di luar prototype.</div>`;
}

function serviceLabel(service) {
  return ({ cargo_economy: 'Cargo Hemat', cargo_regular: 'Cargo Reguler', cargo_express: 'Cargo Ekspres' })[service] || service;
}

function adminDashboard() {
  const all = Store.getShipments().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const pending = all.filter((item) => item.status === 'pending_review');
  const active = all.filter((item) => !['delivered', 'rejected', 'cancelled'].includes(item.status));
  const delivered = all.filter((item) => item.status === 'delivered');
  const estimateTotal = all.reduce((sum, item) => sum + Number(item.quote.estimatedAmountIdr || 0), 0);
  return `${pageHeading('Dashboard operasional', 'Ringkasan pesanan dan pekerjaan yang membutuhkan perhatian.', `<a class="btn btn-outline btn-sm" href="#/admin/shipments" data-nav="/admin/shipments">Semua pengiriman →</a>`)}<div class="kpi-grid">${kpi('Menunggu konfirmasi', String(pending.length), 'Perlu ditinjau operator', '◷')}${kpi('Kiriman aktif', String(active.length), 'Belum berstatus terminal', '↗')}${kpi('Sudah terkirim', String(delivered.length), 'Selesai pada data demo', '✓')}${kpi('Total estimasi', formatMoney(estimateTotal), 'Bukan pembayaran aktual', 'Rp')}</div><section class="panel"><div class="panel-head"><div><h3>Perlu ditinjau</h3><p>Periksa rute, kontak, paket, dan estimasi sebelum menerima pesanan.</p></div><a class="row-link" href="#/admin/shipments" data-nav="/admin/shipments">Kelola daftar →</a></div>${shipmentTable(pending, (item) => `/admin/shipments/${item.id}`, { customerName: (item) => Store.getUser(item.ownerUid)?.displayName || 'Pelanggan' })}</section><section class="panel"><div class="panel-head"><div><h3>Aktivitas terbaru</h3><p>Kiriman terbaru lintas status.</p></div></div>${shipmentTable(all.slice(0, 6), (item) => `/admin/shipments/${item.id}`, { customerName: (item) => Store.getUser(item.ownerUid)?.displayName || 'Pelanggan' })}</section><div class="notice notice-warn">Seluruh data bersifat fiktif dan tersimpan lokal di browser ini. Tidak ada pembayaran nyata.</div>`;
}

function adminShipmentsPage() {
  const all = Store.getShipments().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const query = adminFilters.query.trim().toLowerCase();
  const filtered = all.filter((shipment) => {
    const customer = Store.getUser(shipment.ownerUid)?.displayName || '';
    const matchesQuery = !query || [shipment.trackingNumber, shipment.origin.city, shipment.destination.city, shipment.package.description, customer, shipment.status].some((value) => String(value).toLowerCase().includes(query));
    return matchesQuery && (adminFilters.status === 'all' || shipment.status === adminFilters.status);
  });
  const statuses = Object.keys(STATUS).map((key) => `<option value="${key}" ${adminFilters.status === key ? 'selected' : ''}>${e(STATUS[key].label)}</option>`).join('');
  return `${pageHeading('Semua pengiriman', 'Cari resi, rute, pelanggan, atau status untuk membuka detail operasional.')}<section class="panel"><form id="admin-filter-form" class="filter-form"><input class="input" name="query" value="${e(adminFilters.query)}" placeholder="Cari nomor resi, kota, paket, pelanggan…" aria-label="Pencarian pengiriman" /><select class="select" name="status" aria-label="Filter status"><option value="all" ${adminFilters.status === 'all' ? 'selected' : ''}>Semua status</option>${statuses}</select><button class="btn btn-outline btn-sm" type="submit">Terapkan filter</button></form><div class="panel-head"><div><h3>Daftar operasional</h3><p>${filtered.length} dari ${all.length} pengiriman</p></div></div>${shipmentTable(filtered, (item) => `/admin/shipments/${item.id}`, { customerName: (item) => Store.getUser(item.ownerUid)?.displayName || 'Pelanggan', emptyTitle: 'Tidak ada hasil', emptyMessage: 'Ubah kata kunci atau filter status lalu coba lagi.' })}</section>`;
}

function assignmentFields(shipment, allowTarget = false) {
  const couriers = Store.getUsers().filter((user) => user.role === 'courier' && user.active);
  const selected = shipment.assignedCourierUid || '';
  const target = allowTarget ? `<div class="field"><label for="retry-target">Jadwalkan ulang ke</label><select class="select" id="retry-target" name="targetStatus" required><option value="pickup_assigned">Kurir dijadwalkan</option><option value="out_for_delivery">Dalam pengantaran</option></select></div>` : '';
  const current = selected ? `<option value="${e(selected)}" selected>${e(Store.getUser(selected)?.displayName || 'Kurir saat ini')}</option>` : '';
  return `${target}<div class="field"><label for="courier-select">${allowTarget ? 'Pilih kurir aktif' : 'Kurir aktif'}</label><select class="select" id="courier-select" name="courierUid" required><option value="">Pilih kurir</option>${current}${couriers.filter((user) => user.uid !== selected).map((user) => `<option value="${e(user.uid)}">${e(user.displayName)} · ${e(user.serviceAreas?.join(', ') || 'Area demo')}</option>`).join('')}</select></div>`;
}

function adminActions(shipment) {
  if (shipment.status === 'pending_review') return `<section class="panel"><div class="panel-head"><div><h3>Tinjau permintaan</h3><p>Konfirmasi untuk melanjutkan ke penjadwalan kurir, atau tolak dengan alasan.</p></div></div><div class="panel-body"><div class="heading-actions" style="margin-bottom:16px"><button class="btn btn-primary btn-sm" type="button" data-action="approve-shipment" data-id="${e(shipment.id)}">Konfirmasi pesanan</button></div><form id="reject-form" data-id="${e(shipment.id)}"><div class="field"><label for="reject-reason">Alasan penolakan</label><textarea class="textarea" id="reject-reason" name="reason" required maxlength="240" placeholder="Jelaskan data yang perlu diperbaiki"></textarea></div><button class="btn btn-danger btn-sm" type="submit">Tolak pesanan</button></form></div></section>`;
  if (shipment.status === 'confirmed') return `<section class="panel"><div class="panel-head"><div><h3>Jadwalkan kurir</h3><p>Pilih kurir aktif untuk memulai tahap penjemputan.</p></div></div><div class="panel-body"><form id="assignment-form" data-id="${e(shipment.id)}">${assignmentFields(shipment)}<div class="field"><label for="assignment-note">Catatan penugasan <span class="optional">Opsional</span></label><textarea class="textarea" id="assignment-note" name="note" maxlength="240" placeholder="Instruksi untuk kurir"></textarea></div><button class="btn btn-primary btn-sm" type="submit">Tetapkan kurir</button></form></div></section>`;
  if (shipment.status === 'delivery_failed') return `<section class="panel"><div class="panel-head"><div><h3>Jadwalkan pengantaran ulang</h3><p>Perbaikan status wajib mencatat alasan operasional.</p></div></div><div class="panel-body"><form id="retry-form" data-id="${e(shipment.id)}">${assignmentFields(shipment, true)}<div class="field"><label for="retry-note">Catatan penjadwalan ulang</label><textarea class="textarea" id="retry-note" name="note" required maxlength="240" placeholder="Catatan untuk riwayat status"></textarea></div><button class="btn btn-primary btn-sm" type="submit">Simpan jadwal ulang</button></form></div></section>`;
  const options = availableTransitions(shipment, 'admin', session.uid);
  if (!options.length) return `<section class="panel"><div class="panel-head"><div><h3>Tindakan operasional</h3><p>Status ini sudah mencapai akhir alur.</p></div></div><div class="panel-body"><div class="notice">Tidak ada perubahan lanjutan yang tersedia untuk status ini.</div></div></section>`;
  return `<section class="panel"><div class="panel-head"><div><h3>Perbarui status</h3><p>Setiap transisi berikutnya akan masuk ke timeline.</p></div></div><div class="panel-body"><form id="status-form" data-id="${e(shipment.id)}"><div class="field"><label for="status-target">Status berikutnya</label><select class="select" id="status-target" name="targetStatus" required>${options.map((value) => `<option value="${value}">${e(statusLabel(value))}</option>`).join('')}</select></div><div id="conditional-status-fields">${conditionalStatusFields(options[0])}</div><div class="field"><label for="status-note">Catatan perubahan</label><textarea class="textarea" id="status-note" name="note" required maxlength="240" placeholder="Catatan untuk riwayat operasional"></textarea></div><button class="btn btn-primary btn-sm" type="submit">Simpan status</button></form></div></section>`;
}

function adminShipmentDetail(id) {
  const shipment = Store.getShipment(id);
  if (!shipment) return unauthorizedPage('Nomor pengiriman tidak ditemukan.');
  const owner = Store.getUser(shipment.ownerUid);
  const courier = shipment.assignedCourierUid ? Store.getUser(shipment.assignedCourierUid) : null;
  return `${pageHeading('Detail pengiriman', 'Tinjau informasi pesanan, penugasan, dan riwayat status.', `<button class="btn btn-outline btn-sm" type="button" data-action="print">Cetak ringkasan</button>`)}<section class="panel"><div class="shipment-hero"><div><div class="eyebrow">Nomor resi</div><h2>${e(shipment.trackingNumber)}</h2><p>Dibuat ${e(formatDate(shipment.createdAt))} · Pelanggan: ${e(owner?.displayName || 'Tidak diketahui')}</p></div>${statusBadge(shipment.status)}</div><div class="panel-body"><div class="detail-grid"><div class="detail-card"><h3>↑ Pengirim</h3>${detailLine('Kota asal', shipment.origin.city)}${detailLine('Alamat pickup', shipment.origin.address)}${detailLine('Kontak', shipment.origin.contactName)}${detailLine('Telepon', shipment.origin.phone)}</div><div class="detail-card"><h3>↓ Penerima</h3>${detailLine('Kota tujuan', shipment.destination.city)}${detailLine('Alamat pengantaran', shipment.destination.address)}${detailLine('Kontak', shipment.destination.contactName)}${detailLine('Telepon', shipment.destination.phone)}</div><div class="detail-card"><h3>▣ Paket & estimasi</h3>${detailLine('Deskripsi', shipment.package.description)}${detailLine('Berat / koli', `${shipment.package.actualWeightKg} kg / ${shipment.package.pieces}`)}${detailLine('Berat tagih', `${shipment.quote.billableWeightKg} kg`)}${detailLine('Tarif estimasi', formatMoney(shipment.quote.estimatedAmountIdr))}${detailLine('Layanan', serviceLabel(shipment.serviceLevel))}${shipment.package.instructions ? detailLine('Instruksi', shipment.package.instructions) : ''}</div><div class="detail-card"><h3>♧ Penugasan</h3>${detailLine('Kurir', courier?.displayName || 'Belum ditetapkan')}${detailLine('Area layanan', courier?.serviceAreas?.join(', ') || '—')}${detailLine('Status kurir', courier ? courier.active ? 'Aktif' : 'Tidak aktif' : '—')}</div></div></div></section>${adminActions(shipment)}<section class="panel"><div class="panel-head"><div><h3>Riwayat perubahan</h3><p>Catatan tidak dapat dihapus dari demo setelah tersimpan.</p></div></div><div class="panel-body">${timeline(shipment.events)}</div></section>`;
}

function adminCouriersPage() {
  const couriers = Store.getUsers().filter((user) => user.role === 'courier');
  const all = Store.getShipments();
  return `${pageHeading('Daftar kurir', 'Akun kurir demo dan ringkasan tugas yang ditetapkan.')}<div class="notice notice-warn" style="margin-bottom:18px">Pembuatan akun serta perubahan role harus dilakukan melalui proses tepercaya saat Firebase terhubung.</div><section class="panel"><div class="panel-head"><div><h3>Kurir</h3><p>${couriers.filter((item) => item.active).length} aktif</p></div></div><div class="panel-body"><div class="courier-list">${couriers.map((courier) => { const tasks = all.filter((item) => item.assignedCourierUid === courier.uid && !['delivered', 'rejected', 'cancelled'].includes(item.status)); return `<article class="courier-card"><span class="avatar">${e(initials(courier.displayName))}</span><div><h3>${e(courier.displayName)}</h3><p>${e(courier.phone || 'Kontak belum tersedia')} · <span class="status status-${courier.active ? 'green' : 'gray'}">${courier.active ? 'Aktif' : 'Nonaktif'}</span></p><div class="courier-meta">Area: ${e(courier.serviceAreas?.join(', ') || 'Belum ditentukan')}<br />Tugas berjalan: ${tasks.length}</div></div></article>`; }).join('')}</div></div></section>`;
}

function reportsPage() {
  const all = Store.getShipments();
  const filtered = filterReportShipments(all);
  const total = filtered.reduce((sum, item) => sum + Number(item.quote.estimatedAmountIdr || 0), 0);
  const countByStatus = Object.keys(STATUS).map((status) => {
    const count = filtered.filter((item) => item.status === status).length;
    return `<div class="detail-line"><small>${e(statusLabel(status))}</small><strong>${count} kiriman</strong></div>`;
  }).filter((line, index) => filtered.some((item) => item.status === Object.keys(STATUS)[index])).join('');
  const statusOptions = Object.keys(STATUS).map((status) => `<option value="${status}" ${reportFilters.status === status ? 'selected' : ''}>${e(statusLabel(status))}</option>`).join('');
  return `${pageHeading('Laporan ringkas', 'Rekap status dan estimasi untuk rentang data yang dipilih.', `<button class="btn btn-primary btn-sm" type="button" data-action="export-csv">Unduh CSV</button>`)}<section class="panel"><div class="panel-body"><form id="report-filter-form" class="report-filters"><div class="field"><label for="report-from">Dari tanggal</label><input class="input" id="report-from" name="from" type="date" value="${e(reportFilters.from)}" /></div><div class="field"><label for="report-to">Sampai tanggal</label><input class="input" id="report-to" name="to" type="date" value="${e(reportFilters.to)}" /></div><div class="field"><label for="report-status">Status</label><select class="select" id="report-status" name="status"><option value="all" ${reportFilters.status === 'all' ? 'selected' : ''}>Semua status</option>${statusOptions}</select></div><button class="btn btn-outline btn-sm" type="submit">Terapkan</button></form></div></section><div class="kpi-grid">${kpi('Total kiriman', String(filtered.length), 'Sesuai filter yang dipilih', '▤')}${kpi('Estimasi keseluruhan', formatMoney(total), 'Bukan nilai transaksi', 'Rp')}${kpi('Terkirim', String(filtered.filter((item) => item.status === 'delivered').length), 'Status terminal berhasil', '✓')}${kpi('Perlu tindak lanjut', String(filtered.filter((item) => ['pending_review', 'delivery_failed'].includes(item.status)).length), 'Menunggu operator', '◷')}</div><section class="panel"><div class="panel-head"><div><h3>Rekap per status</h3><p>${filtered.length} kiriman · hasil dihitung dari data demo lokal</p></div></div><div class="panel-body"><div class="detail-grid"><div class="detail-card">${countByStatus || emptyState('Tidak ada data', 'Ubah rentang tanggal atau filter status lalu coba lagi.')}</div><div class="detail-card"><h3>Ekspor data</h3><p class="helper">CSV berisi nomor resi, kota asal/tujuan, status, tanggal pembuatan, dan estimasi. Data kontak pribadi tidak disertakan.</p><button class="btn btn-outline btn-sm" type="button" data-action="export-csv">Ekspor CSV</button></div></div></div></section><div class="notice notice-warn">Laporan ini tidak mencerminkan pendapatan, pembayaran, pajak, atau settlement.</div>`;
}

function dateKeyJakarta(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function filterReportShipments(shipments) {
  return shipments.filter((shipment) => {
    const date = dateKeyJakarta(shipment.createdAt);
    return (!reportFilters.from || date >= reportFilters.from)
      && (!reportFilters.to || date <= reportFilters.to)
      && (reportFilters.status === 'all' || shipment.status === reportFilters.status);
  });
}

function tasksForCourier() {
  return Store.getShipments().filter((shipment) => shipment.assignedCourierUid === session.uid && !['delivered', 'rejected', 'cancelled'].includes(shipment.status)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function courierDashboard() {
  const tasks = tasksForCourier();
  const actionable = tasks.filter((item) => availableTransitions(item, 'courier', session.uid).length > 0);
  return `${pageHeading('Tugas pengiriman', 'Hanya kiriman yang ditetapkan kepada akun kurir ini yang tampil.')}<div class="kpi-grid">${kpi('Tugas berjalan', String(tasks.length), 'Kiriman yang ditugaskan kepada Anda', '⌖')}${kpi('Perlu pembaruan', String(actionable.length), 'Status berikutnya tersedia', '↗')}${kpi('Area layanan', String(session.serviceAreas?.length || 0), session.serviceAreas?.join(', ') || 'Area demo', '⌂')}${kpi('Peran', 'Kurir', 'Akses operasional terbatas', '♧')}</div><section class="panel"><div class="panel-head"><div><h3>Daftar tugas</h3><p>Gunakan detail tugas untuk memperbarui status secara berurutan.</p></div></div>${shipmentTable(tasks, (item) => `/courier/tasks/${item.id}`, { emptyTitle: 'Belum ada tugas aktif', emptyMessage: 'Tugas baru akan muncul setelah operator menetapkan kiriman kepada Anda.', })}</section><div class="notice notice-warn">Perubahan status disimulasikan di browser ini. Pembaruan lokasi GPS tidak digunakan.</div>`;
}

function courierTaskDetail(id) {
  const shipment = Store.getShipment(id);
  if (!shipment || shipment.assignedCourierUid !== session.uid) return unauthorizedPage('Tugas tidak ditemukan atau tidak ditetapkan kepada akun kurir ini.');
  const transitions = availableTransitions(shipment, 'courier', session.uid);
  const actionForm = transitions.length
    ? `<section class="panel"><div class="panel-head"><div><h3>Perbarui progres</h3><p>Pilih transisi yang tersedia. Alur status tidak dapat dilompati.</p></div></div><div class="panel-body"><form id="status-form" data-id="${e(shipment.id)}"><div class="field"><label for="status-target">Status berikutnya</label><select class="select" id="status-target" name="targetStatus" required>${transitions.map((value) => `<option value="${value}">${e(statusLabel(value))}</option>`).join('')}</select></div><div id="conditional-status-fields">${conditionalStatusFields(transitions[0])}</div><div class="field"><label for="status-note">Catatan / lokasi teks <span class="optional">Opsional</span></label><textarea class="textarea" id="status-note" name="note" maxlength="240" placeholder="Contoh: tiba di Hub Bandung"></textarea></div><button class="btn btn-primary btn-sm" type="submit">Simpan pembaruan</button></form></div></section>`
    : `<section class="panel"><div class="panel-head"><div><h3>Progres tugas</h3></div></div><div class="panel-body"><div class="notice">Belum ada pembaruan yang dapat dilakukan untuk status ini. Operator perlu menjadwalkan ulang jika pengantaran gagal.</div></div></section>`;
  return `${pageHeading('Detail tugas', 'Informasi operasional minimum untuk menyelesaikan penjemputan atau pengantaran.')}<section class="panel"><div class="shipment-hero"><div><div class="eyebrow">Nomor resi</div><h2>${e(shipment.trackingNumber)}</h2><p>${e(shipment.origin.city)} <span class="route-arrow">→</span> ${e(shipment.destination.city)}</p></div>${statusBadge(shipment.status)}</div><div class="panel-body"><div class="detail-grid"><div class="detail-card"><h3>↑ Informasi pickup</h3>${detailLine('Alamat pickup', shipment.origin.address)}${detailLine('Kontak pengirim', shipment.origin.contactName)}${detailLine('Telepon', shipment.origin.phone)}</div><div class="detail-card"><h3>↓ Informasi delivery</h3>${detailLine('Alamat tujuan', shipment.destination.address)}${detailLine('Kontak penerima', shipment.destination.contactName)}${detailLine('Telepon', shipment.destination.phone)}</div><div class="detail-card"><h3>▣ Informasi cargo</h3>${detailLine('Deskripsi paket', shipment.package.description)}${detailLine('Berat / koli', `${shipment.package.actualWeightKg} kg / ${shipment.package.pieces}`)}${detailLine('Instruksi penanganan', shipment.package.instructions || '—')}</div><div class="detail-card"><h3>◷ Catatan terakhir</h3>${detailLine('Diperbarui', formatDate(shipment.updatedAt))}${detailLine('Status', statusLabel(shipment.status))}</div></div></div></section>${actionForm}<section class="panel"><div class="panel-head"><div><h3>Riwayat status</h3><p>Perubahan Anda akan tercatat pada timeline.</p></div></div><div class="panel-body">${timeline(shipment.events)}</div></section>`;
}

function conditionalStatusFields(targetStatus) {
  const isDelivered = targetStatus === 'delivered';
  const isFailed = targetStatus === 'delivery_failed';
  if (!isDelivered && !isFailed) return '';
  return `<div class="field" data-show-status="delivered" ${isDelivered ? '' : 'hidden'}><label for="recipient-name">Nama penerima</label><input class="input" id="recipient-name" name="recipientName" ${isDelivered ? 'required' : ''} maxlength="80" placeholder="Nama yang menerima paket" /></div><div class="field" data-show-status="delivery_failed" ${isFailed ? '' : 'hidden'}><label for="failure-reason">Alasan gagal dikirim</label><textarea class="textarea" id="failure-reason" name="reason" ${isFailed ? 'required' : ''} maxlength="240" placeholder="Jelaskan alasan pengantaran gagal"></textarea></div>`;
}

function shipmentWizard() {
  const steps = ['Rute & kontak', 'Barang & layanan', 'Ringkasan'];
  const progress = `<div class="wizard-progress">${steps.map((label, index) => `<div class="wizard-step ${wizardStep === index + 1 ? 'active' : wizardStep > index + 1 ? 'done' : ''}"><span class="wizard-number">${wizardStep > index + 1 ? '✓' : index + 1}</span><span>${label}</span></div>`).join('')}</div>`;
  const cityOptions = ['Jakarta', 'Bandung', 'Semarang', 'Yogyakarta', 'Surabaya', 'Medan', 'Makassar', 'Bekasi', 'Bogor', 'Tangerang'];
  const citySelect = (field, label, value) => `<div class="field"><label for="${field}">${label}</label><select class="select" id="${field}" name="${field}" required><option value="">Pilih kota</option>${cityOptions.map((city) => `<option value="${city}" ${value === city ? 'selected' : ''}>${city}</option>`).join('')}</select></div>`;
  let form = '';
  if (wizardStep === 1) {
    form = `<form id="wizard-step-1"><h3>Rute & kontak</h3><p class="wizard-intro">Masukkan kota serta alamat lengkap untuk pickup dan pengantaran.</p><div class="detail-grid"><div class="detail-card"><h3>↑ Asal pengiriman</h3>${citySelect('originCity', 'Kota asal', draft.originCity)}<div class="field"><label for="origin-address">Alamat pickup</label><textarea class="textarea" id="origin-address" name="originAddress" required maxlength="240" placeholder="Nama jalan, nomor, kecamatan">${e(draft.originAddress || '')}</textarea></div><div class="field"><label for="origin-contact">Nama pengirim</label><input class="input" id="origin-contact" name="originContact" value="${e(draft.originContact || '')}" required maxlength="80" /></div><div class="field"><label for="origin-phone">Telepon pengirim</label><input class="input" id="origin-phone" name="originPhone" value="${e(draft.originPhone || '')}" required pattern="[0-9+() -]{8,20}" maxlength="20" placeholder="08xx xxxx xxxx" /></div></div><div class="detail-card"><h3>↓ Tujuan pengiriman</h3>${citySelect('destinationCity', 'Kota tujuan', draft.destinationCity)}<div class="field"><label for="destination-address">Alamat pengantaran</label><textarea class="textarea" id="destination-address" name="destinationAddress" required maxlength="240" placeholder="Nama jalan, nomor, kecamatan">${e(draft.destinationAddress || '')}</textarea></div><div class="field"><label for="destination-contact">Nama penerima</label><input class="input" id="destination-contact" name="destinationContact" value="${e(draft.destinationContact || '')}" required maxlength="80" /></div><div class="field"><label for="destination-phone">Telepon penerima</label><input class="input" id="destination-phone" name="destinationPhone" value="${e(draft.destinationPhone || '')}" required pattern="[0-9+() -]{8,20}" maxlength="20" placeholder="08xx xxxx xxxx" /></div></div></div><div class="wizard-actions"><a class="btn btn-outline btn-sm" href="#/customer/dashboard" data-nav="/customer/dashboard">Batalkan</a><button class="btn btn-primary btn-sm" type="submit">Lanjut: detail barang →</button></div></form>`;
  } else if (wizardStep === 2) {
    form = `<form id="wizard-step-2"><h3>Barang & layanan</h3><p class="wizard-intro">Dimensi boleh dikosongkan seluruhnya. Berat volumetrik demo memakai divisor 4.000 cm³/kg.</p><div class="field"><label for="package-description">Deskripsi barang</label><input class="input" id="package-description" name="description" value="${e(draft.description || '')}" required maxlength="120" placeholder="Contoh: peralatan sekolah" /></div><div class="field-row"><div class="field"><label for="package-category">Kategori barang</label><select class="select" id="package-category" name="category" required><option value="general">Umum</option><option value="fragile" ${draft.category === 'fragile' ? 'selected' : ''}>Mudah pecah</option><option value="document" ${draft.category === 'document' ? 'selected' : ''}>Dokumen</option><option value="electronic" ${draft.category === 'electronic' ? 'selected' : ''}>Elektronik</option></select></div><div class="field"><label for="package-weight">Berat aktual (kg)</label><input class="input" id="package-weight" name="actualWeightKg" value="${e(draft.actualWeightKg || '')}" type="number" required min="0.1" max="1000" step="0.1" placeholder="Contoh: 12" /></div><div class="field"><label for="package-pieces">Jumlah koli</label><input class="input" id="package-pieces" name="pieces" value="${e(draft.pieces || '')}" type="number" required min="1" max="999" step="1" placeholder="1" /></div></div><div class="field"><label>Dimensi paket (cm) <span class="optional">Opsional · isi semua atau kosongkan</span></label><div class="field-row"><input class="input" name="lengthCm" value="${e(draft.lengthCm || '')}" type="number" min="1" max="500" step="1" placeholder="Panjang" aria-label="Panjang dalam sentimeter" /><input class="input" name="widthCm" value="${e(draft.widthCm || '')}" type="number" min="1" max="500" step="1" placeholder="Lebar" aria-label="Lebar dalam sentimeter" /><input class="input" name="heightCm" value="${e(draft.heightCm || '')}" type="number" min="1" max="500" step="1" placeholder="Tinggi" aria-label="Tinggi dalam sentimeter" /></div></div><div class="field"><label for="service-level">Layanan cargo</label><select class="select" id="service-level" name="serviceLevel"><option value="cargo_regular" ${!draft.serviceLevel || draft.serviceLevel === 'cargo_regular' ? 'selected' : ''}>Cargo Reguler</option><option value="cargo_economy" ${draft.serviceLevel === 'cargo_economy' ? 'selected' : ''}>Cargo Hemat</option><option value="cargo_express" ${draft.serviceLevel === 'cargo_express' ? 'selected' : ''}>Cargo Ekspres</option></select></div><div class="field"><label for="package-instructions">Instruksi penanganan <span class="optional">Opsional</span></label><textarea class="textarea" id="package-instructions" name="instructions" maxlength="240" placeholder="Contoh: jangan ditumpuk">${e(draft.instructions || '')}</textarea></div><div class="wizard-actions"><button class="btn btn-outline btn-sm" type="button" data-action="wizard-back">← Kembali</button><button class="btn btn-primary btn-sm" type="submit">Lanjut: ringkasan →</button></div></form>`;
  } else {
    const quote = calculateQuote(draft);
    form = `<form id="wizard-step-3"><h3>Ringkasan & estimasi biaya</h3><p class="wizard-intro">Periksa kembali informasi sebelum mengirim permintaan kepada operator.</p><div class="detail-grid"><div class="detail-card"><h3>Rute</h3>${detailLine('Pickup', `${draft.originCity} · ${draft.originAddress}`)}${detailLine('Pengirim', `${draft.originContact} · ${draft.originPhone}`)}${detailLine('Tujuan', `${draft.destinationCity} · ${draft.destinationAddress}`)}${detailLine('Penerima', `${draft.destinationContact} · ${draft.destinationPhone}`)}</div><div class="detail-card"><h3>Paket</h3>${detailLine('Deskripsi', draft.description)}${detailLine('Kategori', draft.category)}${detailLine('Berat aktual', `${draft.actualWeightKg} kg`)}${detailLine('Berat tagih', `${quote.billableWeightKg} kg`)}${detailLine('Jumlah koli', String(draft.pieces))}${detailLine('Layanan', serviceLabel(draft.serviceLevel))}</div></div><div class="price-summary" style="margin-top:16px"><div class="price-summary-main"><div><small>Estimasi biaya · prototype</small><strong>${e(formatMoney(quote.amountIdr))}</strong></div><div class="status status-teal">${e(quote.billableWeightKg)} kg berat tagih</div></div><div class="price-breakdown"><span>Asal: ${e(quote.originZone)}</span><span>Tujuan: ${e(quote.destinationZone)}</span><span>Volumetrik: ${e(quote.volumetricWeightKg)} kg</span></div></div><div class="warning-foot">Estimasi dihitung dari zona demo, berat aktual/volumetrik, dan kelas layanan. Tarif final dikonfirmasi operator. Pajak, asuransi, surcharge, dan COD tidak dihitung.</div><label class="checkbox-row"><input type="checkbox" name="agree" required /><span>Saya memahami bahwa tarif dan konfirmasi pengiriman pada prototype ini bersifat estimasi dan simulasi.</span></label><div class="wizard-actions"><button class="btn btn-outline btn-sm" type="button" data-action="wizard-back">← Kembali</button><button class="btn btn-primary btn-sm" type="submit">Kirim permintaan <span aria-hidden="true">→</span></button></div></form>`;
  }
  return `${pageHeading('Buat pengiriman', 'Ikuti tiga langkah untuk mengirim permintaan cargo baru.')}<div class="wizard-card">${progress}<section class="panel"><div class="panel-body">${form}</div></section><div class="notice">${sessionMode === 'firebase' ? 'Data akan disimpan di Firebase Realtime Database pada akun yang masuk.' : 'Mode demo lokal: kiriman dan resi tersimpan di browser ini, bukan di server Firebase.'}</div></div>`;
}

function profilePage() {
  const isFirebase = sessionMode === 'firebase';
  const subtitle = isFirebase ? 'Perbarui nama tampilan dan kontak akun Firebase Anda.' : 'Perbarui nama tampilan dan kontak akun demo ini.';
  const profileNotice = isFirebase
    ? 'Profil tersimpan di Firebase Realtime Database. Role tidak dapat diubah dari aplikasi.'
    : 'Profil tersimpan lokal di browser. Data demo dapat diubah melalui developer tools.';
  return `${pageHeading('Profil saya', subtitle)}<section class="panel" style="max-width:700px"><div class="panel-head"><div><h3>Informasi akun</h3><p>Role: ${e(ROLE_LABEL[session.role])} · Role tidak bisa diubah dari profil.</p></div></div><div class="panel-body"><form id="profile-form"><div class="field"><label for="profile-name">Nama tampilan</label><input class="input" id="profile-name" name="displayName" value="${e(session.displayName)}" required maxlength="80" /></div><div class="field"><label for="profile-email">Email</label><input class="input" id="profile-email" value="${e(session.email)}" disabled /></div><div class="field"><label for="profile-phone">Nomor telepon</label><input class="input" id="profile-phone" name="phone" value="${e(session.phone || '')}" required pattern="[0-9+() -]{8,20}" maxlength="20" /></div><button class="btn btn-primary btn-sm" type="submit">Simpan perubahan</button></form></div></section><div class="notice notice-warn" style="max-width:700px">${e(profileNotice)}</div>`;
}

function unauthorizedPage(message) {
  return `<div class="unauthorized"><div class="empty-icon">!</div><h2>Akses tidak tersedia</h2><p>${e(message)}</p><a class="btn btn-primary btn-sm" href="#${roleHome(session.role)}" data-nav="${roleHome(session.role)}">Kembali ke halaman saya</a></div>`;
}

function accessPage(path, query) {
  if (path === '/track') return publicTrackPage(query);
  if (path === '/profile') return profilePage();
  if (session.role === 'customer' && path === '/customer/dashboard') return customerDashboard();
  if (session.role === 'customer' && path === '/customer/shipments') return customerShipmentsPage();
  if (session.role === 'customer' && path === '/customer/shipments/new') return shipmentWizard();
  if (session.role === 'customer' && path.startsWith('/customer/shipments/')) return customerShipmentDetail(path.split('/')[3]);
  if (session.role === 'admin' && path === '/admin/dashboard') return adminDashboard();
  if (session.role === 'admin' && path === '/admin/shipments') return adminShipmentsPage();
  if (session.role === 'admin' && path.startsWith('/admin/shipments/')) return adminShipmentDetail(path.split('/')[3]);
  if (session.role === 'admin' && path === '/admin/couriers') return adminCouriersPage();
  if (session.role === 'admin' && path === '/admin/reports') return reportsPage();
  if (session.role === 'courier' && path === '/courier/tasks') return courierDashboard();
  if (session.role === 'courier' && path.startsWith('/courier/tasks/')) return courierTaskDetail(path.split('/')[3]);
  return unauthorizedPage('Halaman ini tidak termasuk akses akun Anda.');
}

function friendlyFirebaseError(error) {
  const known = {
    'auth/invalid-credential': 'Email atau kata sandi Firebase tidak cocok.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/email-already-in-use': 'Email sudah terdaftar di Firebase. Silakan masuk.',
    'auth/weak-password': 'Kata sandi Firebase harus minimal 6 karakter.',
    'auth/operation-not-allowed': 'Aktifkan metode Email/Password pada Firebase Authentication.',
    'auth/network-request-failed': 'Koneksi ke Firebase gagal. Periksa internet lalu coba lagi.',
    'database/permission-denied': 'Firebase menolak akses. Periksa Realtime Database Rules dan role akun.',
  };
  return known[error?.code] || error?.message || 'Permintaan Firebase gagal. Periksa konfigurasi dan Rules.';
}

async function activateFirebaseUser(user) {
  if (!FirebaseService) throw new Error(firebaseInitError || 'Firebase belum tersedia.');
  const data = await FirebaseService.loadInitialData(user);
  remoteSession = data.profile;
  sessionMode = 'firebase';
  localStorage.setItem('shipflow_auth_mode_v1', 'firebase');
  Store.setRemoteMode(true);
  Store.setRemoteData(data);
  stopRemoteWatch();
  stopRemoteWatch = FirebaseService.watchData(data.profile, (nextData) => {
    if (sessionMode !== 'firebase') return;
    Store.setRemoteData(nextData);
    remoteSession = nextData.users.find((item) => item.uid === user.uid) || remoteSession;
    render();
  }, (error) => {
    firebaseLoginError = friendlyFirebaseError(error);
    render();
  });
  firebaseLoginError = '';
  return data.profile;
}

function render() {
  session = sessionMode === 'firebase' ? remoteSession : Store.getCurrentUser();
  const { path, query } = routeInfo();
  if (path === '/track' && query.get('resi')) startTrackingLookup(query.get('resi').trim());
  if (!session) {
    const page = path === '/login' ? authPage('login') : path === '/register' ? authPage('register') : path === '/track' ? publicTrackPage(query) : homePage();
    app.innerHTML = `${page}${toast ? `<div class="toast ${toast.type === 'error' ? 'error' : ''}" role="status">${e(toast.message)}</div>` : ''}`;
    return;
  }
  const resolvedPath = path === '/' || path === '/login' || path === '/register' ? roleHome(session.role) : path;
  const content = accessPage(resolvedPath, query);
  app.innerHTML = `${shell(content, resolvedPath)}${toast ? `<div class="toast ${toast.type === 'error' ? 'error' : ''}" role="status">${e(toast.message)}</div>` : ''}`;
}

function notify(message, type = 'success') {
  toast = { message, type };
  render();
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => { toast = null; render(); }, 3600);
}

function captureForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function useDemoMode() {
  sessionMode = 'demo';
  localStorage.setItem('shipflow_auth_mode_v1', 'demo');
  remoteSession = null;
  stopRemoteWatch();
  stopRemoteWatch = () => {};
  Store.setRemoteMode(false);
  Store.setRemoteData({ users: [], shipments: [] });
  if (FirebaseService?.currentAuthUser()) {
    try { await FirebaseService.signOut(); } catch { /* local demo can continue */ }
  }
}

async function transitionShipment(shipment, targetStatus, role, data = {}) {
  if (!shipment || !availableTransitions(shipment, role, session.uid).includes(targetStatus)) {
    notify('Transisi status tidak diizinkan untuk peran atau status ini.', 'error');
    return false;
  }
  const original = JSON.parse(JSON.stringify(shipment));
  if (targetStatus === 'rejected' && !String(data.reason || '').trim()) {
    notify('Alasan penolakan wajib diisi.', 'error');
    return false;
  }
  if (targetStatus === 'delivery_failed' && !String(data.reason || '').trim()) {
    notify('Alasan gagal dikirim wajib diisi.', 'error');
    return false;
  }
  if (targetStatus === 'delivered' && !String(data.recipientName || '').trim()) {
    notify('Nama penerima wajib diisi.', 'error');
    return false;
  }
  if (targetStatus === 'pickup_assigned') {
    const courier = Store.getUser(data.courierUid);
    if (!courier || courier.role !== 'courier' || !courier.active) {
      notify('Pilih akun kurir aktif sebelum menetapkan tugas.', 'error');
      return false;
    }
    shipment.assignedCourierUid = courier.uid;
  }
  if (targetStatus === 'out_for_delivery' && role === 'admin' && shipment.status === 'delivery_failed' && data.courierUid) {
    const courier = Store.getUser(data.courierUid);
    if (!courier || courier.role !== 'courier' || !courier.active) {
      notify('Pilih akun kurir aktif sebelum menjadwalkan ulang.', 'error');
      return false;
    }
    shipment.assignedCourierUid = courier.uid;
  }
  if (targetStatus === 'out_for_delivery' && !shipment.assignedCourierUid) {
    notify('Tugas belum memiliki kurir aktif.', 'error');
    return false;
  }
  const note = String(data.note || '').trim();
  const reason = String(data.reason || '').trim();
  const finalNote = targetStatus === 'rejected' ? reason : targetStatus === 'delivery_failed' ? reason : note;
  const event = {
    id: generateId('evt'),
    status: targetStatus,
    label: statusLabel(targetStatus),
    note: finalNote,
    locationLabel: String(data.locationLabel || '').trim(),
    actorUid: session.uid,
    actorRole: role,
    createdAt: new Date().toISOString(),
  };
  if (targetStatus === 'delivery_failed') event.reason = reason;
  if (targetStatus === 'delivery_failed') shipment.failureReason = reason;
  if (['pickup_assigned', 'out_for_delivery'].includes(targetStatus)) delete shipment.failureReason;
  if (targetStatus === 'delivered') {
    event.recipientName = String(data.recipientName).trim();
    shipment.recipientName = event.recipientName;
    shipment.deliveredAt = event.createdAt;
  }
  if (targetStatus === 'rejected') shipment.rejectionReason = reason;
  if (targetStatus === 'confirmed') shipment.confirmedAt = event.createdAt;
  shipment.status = targetStatus;
  shipment.lastEventId = event.id;
  shipment.events = [...(shipment.events || []), event];
  shipment.updatedAt = Date.now();
  try {
    if (sessionMode === 'firebase') {
      await FirebaseService.saveShipmentTransition(shipment, event);
      Store.replaceRemoteShipment(shipment);
    } else {
      Store.saveShipment(shipment);
    }
  } catch (error) {
    if (sessionMode === 'firebase') Store.replaceRemoteShipment(original);
    notify(friendlyFirebaseError(error), 'error');
    return false;
  }
  const detailPath = role === 'customer' ? `/customer/shipments/${shipment.id}` : role === 'courier' ? `/courier/tasks/${shipment.id}` : `/admin/shipments/${shipment.id}`;
  navigate(detailPath);
  notify(`Status diperbarui menjadi “${statusLabel(targetStatus)}”.`);
  return true;
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const data = captureForm(form);
  if (form.id === 'login-form') {
    event.preventDefault();
    loginError = '';
    if (data.authMode === 'firebase') {
      if (!FirebaseService) { loginError = firebaseInitError || 'Firebase belum tersedia.'; render(); return; }
      sessionMode = 'firebase';
      localStorage.setItem('shipflow_auth_mode_v1', 'firebase');
      Store.setRemoteMode(false);
      manualFirebaseAuth = true;
      try {
        const user = await FirebaseService.signIn(data.email, data.password);
        manualFirebaseAuth = false;
        session = await activateFirebaseUser(user);
        navigate(roleHome(session.role));
        notify('Berhasil masuk ke Firebase SHIPFLOW.');
      } catch (error) {
        manualFirebaseAuth = false;
        loginError = friendlyFirebaseError(error);
        if (FirebaseService.currentAuthUser()) { try { await FirebaseService.signOut(); } catch { /* keep the visible login error */ } }
        sessionMode = 'demo';
        localStorage.setItem('shipflow_auth_mode_v1', 'demo');
        remoteSession = null;
        Store.setRemoteMode(false);
        render();
      }
      return;
    }
    await useDemoMode();
    const result = await Store.signIn(data.email, data.password);
    if (!result.ok) { loginError = result.error; render(); return; }
    sessionMode = 'demo';
    localStorage.setItem('shipflow_auth_mode_v1', 'demo');
    session = result.user;
    navigate(roleHome(session.role));
    return;
  }
  if (form.id === 'register-form') {
    event.preventDefault();
    registerError = '';
    if (data.authMode === 'firebase') {
      if (!FirebaseService) { registerError = firebaseInitError || 'Firebase belum tersedia.'; render(); return; }
      sessionMode = 'firebase';
      localStorage.setItem('shipflow_auth_mode_v1', 'firebase');
      manualFirebaseAuth = true;
      try {
        const user = await FirebaseService.registerCustomer(data);
        manualFirebaseAuth = false;
        session = await activateFirebaseUser(user);
        draft = {};
        navigate('/customer/dashboard');
        notify('Akun Firebase pelanggan berhasil dibuat.');
      } catch (error) {
        manualFirebaseAuth = false;
        registerError = friendlyFirebaseError(error);
        if (FirebaseService.currentAuthUser()) { try { await FirebaseService.signOut(); } catch { /* keep the visible registration error */ } }
        sessionMode = 'demo';
        localStorage.setItem('shipflow_auth_mode_v1', 'demo');
        remoteSession = null;
        Store.setRemoteMode(false);
        render();
      }
      return;
    }
    await useDemoMode();
    const result = await Store.registerCustomer(data);
    if (!result.ok) { registerError = result.error; render(); return; }
    session = result.user;
    draft = {};
    navigate('/customer/dashboard');
    notify('Akun demo pelanggan berhasil dibuat.');
    return;
  }
  if (form.id === 'track-form' || form.id === 'quick-track') {
    event.preventDefault();
    navigate(`/track?resi=${encodeURIComponent(data.resi.trim())}`);
    return;
  }
  if (form.id === 'wizard-step-1') {
    event.preventDefault();
    draft = { ...draft, ...data };
    wizardStep = 2;
    render();
    return;
  }
  if (form.id === 'wizard-step-2') {
    event.preventDefault();
    const dimensionValues = [data.lengthCm, data.widthCm, data.heightCm].map((value) => String(value || '').trim());
    const filledDimensions = dimensionValues.filter(Boolean).length;
    if (filledDimensions !== 0 && filledDimensions !== 3) {
      notify('Isi ketiga dimensi paket atau kosongkan semuanya.', 'error');
      return;
    }
    if (Number(data.actualWeightKg) <= 0 || Number(data.actualWeightKg) > 1000 || Number(data.pieces) < 1 || !Number.isInteger(Number(data.pieces))) {
      notify('Periksa kembali berat dan jumlah koli.', 'error');
      return;
    }
    if (filledDimensions && dimensionValues.some((value) => Number(value) <= 0)) {
      notify('Dimensi paket harus lebih besar dari nol.', 'error');
      return;
    }
    draft = { ...draft, ...data, actualWeightKg: Number(data.actualWeightKg), pieces: Number(data.pieces), lengthCm: Number(data.lengthCm) || 0, widthCm: Number(data.widthCm) || 0, heightCm: Number(data.heightCm) || 0 };
    wizardStep = 3;
    render();
    return;
  }
  if (form.id === 'wizard-step-3') {
    event.preventDefault();
    const quote = calculateQuote(draft);
    const shipmentData = {
      ownerUid: session.uid,
      status: 'pending_review',
      serviceLevel: draft.serviceLevel,
      origin: { city: draft.originCity, address: draft.originAddress.trim(), contactName: draft.originContact.trim(), phone: draft.originPhone.trim() },
      destination: { city: draft.destinationCity, address: draft.destinationAddress.trim(), contactName: draft.destinationContact.trim(), phone: draft.destinationPhone.trim() },
      package: { description: draft.description.trim(), category: draft.category, actualWeightKg: Number(draft.actualWeightKg), pieces: Number(draft.pieces), lengthCm: Number(draft.lengthCm) || 0, widthCm: Number(draft.widthCm) || 0, heightCm: Number(draft.heightCm) || 0, instructions: String(draft.instructions || '').trim() },
      quote: { billableWeightKg: quote.billableWeightKg, estimatedAmountIdr: quote.amountIdr, currency: 'IDR', volumetricWeightKg: quote.volumetricWeightKg, divisor: 4000 },
      assignedCourierUid: null,
    };
    let shipment;
    try {
      if (sessionMode === 'firebase') {
        shipment = await FirebaseService.createShipment(shipmentData);
        Store.replaceRemoteShipment(shipment);
      } else {
        shipment = Store.createShipment(shipmentData);
      }
    } catch (error) {
      notify(friendlyFirebaseError(error), 'error');
      return;
    }
    draft = {};
    wizardStep = 1;
    navigate(`/customer/shipments/${shipment.id}`);
    notify(`Permintaan tersimpan. Nomor resi ${shipment.trackingNumber}.`);
    return;
  }
  if (form.id === 'admin-filter-form') {
    event.preventDefault();
    adminFilters = { query: data.query || '', status: data.status || 'all' };
    render();
    return;
  }
  if (form.id === 'report-filter-form') {
    event.preventDefault();
    if (data.from && data.to && data.from > data.to) { notify('Tanggal awal harus sama dengan atau lebih awal dari tanggal akhir.', 'error'); return; }
    reportFilters = { from: data.from || '', to: data.to || '', status: data.status || 'all' };
    render();
    return;
  }
  if (form.id === 'profile-form') {
    event.preventDefault();
    if (!String(data.displayName || '').trim() || !String(data.phone || '').trim()) { notify('Nama dan nomor telepon wajib diisi.', 'error'); return; }
    try {
      if (sessionMode === 'firebase') {
        session = await FirebaseService.updateProfile(session, data);
        remoteSession = session;
        Store.replaceRemoteUser(session);
      } else {
        Store.updateProfile(session.uid, data);
        session = Store.getCurrentUser();
      }
      render();
      notify(sessionMode === 'firebase' ? 'Profil Firebase diperbarui.' : 'Profil demo diperbarui.');
    } catch (error) {
      notify(friendlyFirebaseError(error), 'error');
    }
    return;
  }
  if (form.id === 'reject-form') {
    event.preventDefault();
    const shipment = Store.getShipment(form.dataset.id);
    await transitionShipment(shipment, 'rejected', 'admin', data);
    return;
  }
  if (form.id === 'assignment-form') {
    event.preventDefault();
    const shipment = Store.getShipment(form.dataset.id);
    await transitionShipment(shipment, 'pickup_assigned', 'admin', data);
    return;
  }
  if (form.id === 'retry-form') {
    event.preventDefault();
    const shipment = Store.getShipment(form.dataset.id);
    await transitionShipment(shipment, data.targetStatus, 'admin', data);
    return;
  }
  if (form.id === 'status-form') {
    event.preventDefault();
    const shipment = Store.getShipment(form.dataset.id);
    const role = session.role;
    await transitionShipment(shipment, data.targetStatus, role, data);
  }
}

function exportCsv() {
  const rows = [['Nomor resi', 'Kota asal', 'Kota tujuan', 'Status', 'Tanggal dibuat', 'Estimasi IDR']];
  const shipments = session?.role === 'admin' ? filterReportShipments(Store.getShipments()) : Store.getShipments();
  shipments.forEach((shipment) => rows.push([
    shipment.trackingNumber, shipment.origin.city, shipment.destination.city,
    statusLabel(shipment.status), new Date(shipment.createdAt).toISOString(), String(shipment.quote.estimatedAmountIdr || 0),
  ]));
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `shipflow-laporan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  notify('CSV laporan berhasil dibuat.');
}

app.addEventListener('submit', (event) => { handleSubmit(event); });
app.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
    if (event.target.form?.id?.startsWith('wizard-step-') && event.target.name) draft[event.target.name] = event.target.value;
  }
});
app.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    mobileMenuOpen = false;
    navigate(nav.dataset.nav);
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'demo-login') {
    const email = ({ customer: 'customer.demo@shipflow.test', admin: 'admin.demo@shipflow.test', courier: 'courier.demo@shipflow.test' })[button.dataset.role];
    await useDemoMode();
    const result = await Store.signIn(email, 'demo123');
    if (result.ok) { session = result.user; loginError = ''; firebaseLoginError = ''; navigate(roleHome(session.role)); }
  } else if (action === 'logout') {
    if (sessionMode === 'firebase') await useDemoMode();
    Store.signOut(); session = null; toast = null; navigate('/');
  } else if (action === 'mobile-menu') {
    mobileMenuOpen = !mobileMenuOpen; render();
  } else if (action === 'wizard-back') {
    wizardStep = Math.max(1, wizardStep - 1); render();
  } else if (action === 'approve-shipment') {
    const shipment = Store.getShipment(button.dataset.id);
    await transitionShipment(shipment, 'confirmed', 'admin', { note: 'Data rute, kontak, paket, dan estimasi telah diperiksa operator.' });
  } else if (action === 'cancel-shipment') {
    const shipment = Store.getShipment(button.dataset.id);
    if (shipment && window.confirm(`Batalkan pesanan ${shipment.trackingNumber}?`)) await transitionShipment(shipment, 'cancelled', 'customer', { note: 'Pesanan dibatalkan oleh pelanggan sebelum konfirmasi.' });
  } else if (action === 'print') {
    window.print();
  } else if (action === 'export-csv') {
    exportCsv();
  }
});

app.addEventListener('change', (event) => {
  if (event.target.id === 'status-target') {
    const form = event.target.form;
    const fields = form?.querySelector('#conditional-status-fields');
    if (fields) fields.innerHTML = conditionalStatusFields(event.target.value);
  }
});

window.addEventListener('hashchange', () => { mobileMenuOpen = false; render(); });
if (FirebaseService) {
  FirebaseService.observeAuth(async (user) => {
    if (manualFirebaseAuth || sessionMode !== 'firebase') return;
    if (!user) {
      remoteSession = null;
      stopRemoteWatch();
      stopRemoteWatch = () => {};
      Store.setRemoteMode(false);
      Store.setRemoteData({ users: [], shipments: [] });
      sessionMode = 'demo';
      localStorage.setItem('shipflow_auth_mode_v1', 'demo');
      render();
      return;
    }
    try {
      await activateFirebaseUser(user);
      render();
    } catch (error) {
      firebaseLoginError = friendlyFirebaseError(error);
      remoteSession = null;
      Store.setRemoteMode(false);
      render();
    }
  });
}
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
