import { useState, useEffect, Component } from 'react';
import { LayoutDashboard, Smartphone, Package, History, Footprints, MapPin, MessageSquare, Users, Link2, LogOut, Menu, Navigation, X, ArrowRight, Bell, ShieldCheck, Wifi, WifiOff, Radio, CarFront, ReceiptText, MapPinned, LifeBuoy, Eye, EyeOff, Cpu } from 'lucide-react';
import { configured } from './services/supabase.js';
import logoGeoTrack from './assets/images/logo-geotrack.png';
import './App.css';
import { StoreProvider, useStore } from './store.jsx';
import { Button, ConfirmModal } from './ui.jsx';
import * as A from './pages/admin.jsx';
import * as U from './pages/user.jsx';
import * as F from './pages/features.jsx';

// [label, ikon, komponen, grup sidebar, subjudul]
const adminPages = {
  dashboard: ['Dashboard', LayoutDashboard, A.AdminDashboard, 'MANAJEMEN', 'Pantau perangkat dan aktivitas GeoTrack'],
  users: ['Manajemen User', Users, A.AdminUsers, 'MANAJEMEN', 'Kelola akun dan mode pengguna'],
  devices: ['Manajemen Device', Smartphone, A.AdminDevices, 'MANAJEMEN', 'Kelola stok dan status penjualan'],
  assign: ['Jual / Hubungkan Device', Link2, A.AdminAssign, 'MANAJEMEN', 'Pasangkan device ke user dan catat pembeliannya'],
  purchases: ['Laporan Pembelian', ReceiptText, F.AdminPurchases, 'LAPORAN', 'Rekap penjualan alat GPS ke user'],
  tracking: ['Lokasi & Titik', MapPinned, A.AdminLocation, 'LAPORAN', 'Peta dan titik per titik semua device'],
  tickets: ['Pengaduan User', MessageSquare, A.AdminTickets, 'OPERASIONAL', 'Tinjau dan tanggapi pengaduan'],
  history: ['History Aktivitas', History, A.AdminHistory, 'OPERASIONAL', 'Catatan aktivitas sistem'],
  notifications: ['Notifikasi', Bell, U.Notifications, 'NOTIFIKASI', 'Pemberitahuan device dan aktivitas user'],
};
// Menu user sengaja ringkas; fitur lain dijadikan tab di dalam halamannya.
const userPages = mode => ({
  dashboard: ['Dashboard', LayoutDashboard, U.UserDashboard, 'MENU',
    mode === 'Rental' ? 'Pantau lokasi kendaraan Anda secara real-time' : 'Ringkasan aktivitas Anda'],
  ...(mode === 'Rental'
    ? {} // Rental: dashboard, device, debug, bantuan
    : { running: ['Running', Footprints, U.RunningPage, 'MENU', 'Rekam aktivitas lari dan lihat riwayatnya'],
        location: ['Lokasi', MapPin, U.UserLocation, 'MENU', 'Peta, titik per titik, dan riwayat jalur'] }),
  device: ['Device Saya', Smartphone, U.UserDevice, 'MENU', 'Lihat, temukan, dan kelola perangkat Anda'],
  debug: ['Debug GioT', Cpu, U.DebugPage, 'MENU', 'Diagnostik langsung & pengaturan WiFi GioT'],
  help: ['Bantuan', LifeBuoy, U.Help, 'MENU', 'Kirim pengaduan dan lihat notifikasi'],
  notifications: ['Notifikasi', Bell, U.Notifications, 'NOTIFIKASI', 'Pemberitahuan device dan pengaduan'],
});
const pagesFor = me => (!me || me.role !== 'admin' ? userPages(me?.mode || 'Rental') : adminPages);

function Login() {
  const { login } = useStore();
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [showPw, setShowPw] = useState(false);
  return <div className="login-screen">
    <div className="login-art">
      <div className="brand brand-light"><div className="brand-mark brand-mark-img"><img src={logoGeoTrack} alt="GeoTrack" /></div><div><b>GeoTrack</b><small>GPS Monitoring System</small></div></div>
      <div className="login-art-copy"><span className="eyebrow">SMART GPS MONITORING</span><h1>Setiap perjalanan,<br /><em>lebih terpantau.</em></h1>
        <p>Pantau perangkat, jelajahi riwayat perjalanan, dan kelola aktivitas GPS dalam satu dashboard.</p>
        <div className="login-foot"><span><ShieldCheck size={15} /> Pemantauan terpusat</span><span><Wifi size={15} /> Data perangkat</span></div></div>
    </div>
    <div className="login-side"><form className="login-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(await login(email, pw)); setBusy(false); }}>
      <div className="brand brand-dark"><div className="brand-mark brand-mark-img"><img src={logoGeoTrack} alt="GeoTrack" /></div><div><b>GeoTrack</b><small>GPS Monitoring System</small></div></div>
      <div className="login-heading"><h2>Selamat datang</h2><p>Masuk dengan akun dari administrator. Tampilan menyesuaikan mode akun Anda.</p></div>
      <label>Email atau username<input required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@email.com" /></label>
      <label>Password<div style={{ position: 'relative' }}>
        <input required type={showPw ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Masukkan password" style={{ width: '100%', paddingRight: 44, boxSizing: 'border-box' }} />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'} title={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', width: 30, height: 30, padding: 0, border: 0, borderRadius: 6, background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
      {err && <p style={{ color: '#dc2626', fontSize: 11, margin: 0 }}>{err}</p>}
      <Button type="submit"><span className="login-button-content">{busy ? 'Memeriksa…' : 'Masuk ke GeoTrack'} <ArrowRight size={16} /></span></Button>
    </form></div></div>;
}

const getInitials = (user) => {
  const name = user?.name || user?.username || user?.email || 'GT';
  return name.trim().slice(0, 2).toUpperCase();
};

// Modal profil akun untuk user saat mengetuk avatar di header mobile
function ProfileModal({ me, onClose, onLogout, go }) {
  const initials = getInitials(me);
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-compact profile-sheet">
        <div className="modal-head">
          <div><h3>Akun Saya</h3><p>Informasi Pengguna</p></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="profile-sheet-body">
          <div className="profile-sheet-avatar">{initials}</div>
          <h4>{me?.name || 'Pengguna'}</h4>
          <p className="profile-sheet-email">{me?.email || ''}</p>
          <div className="profile-sheet-pill">
            <span className={`badge badge-${me?.mode === 'Running' ? 'green' : 'blue'}`}>
              <i /> Mode {me?.mode || 'Rental'}
            </span>
          </div>
          <div className="profile-sheet-actions">
            <Button variant="outline" small icon={LifeBuoy} onClick={() => { onClose(); go('help'); }}>Pusat Bantuan & Pengaduan</Button>
            <Button variant="danger" small icon={LogOut} onClick={() => { onClose(); onLogout(); }}>Keluar dari Akun</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SplashScreen({ title = 'GeoTrack', message = 'Menghubungkan ke satelit GPS…', error = '', action = null }) {
  return (
    <div className="mobile-splash">
      <div className="splash-ambient-glow" />
      <div className="splash-card">
        <div className="splash-logo-container">
          <div className="splash-pulse" />
          <div className="splash-logo">
            <img src={logoGeoTrack} alt="GeoTrack Logo" className="splash-logo-img" />
          </div>
        </div>
        <h1 className="splash-brand-title">{title}</h1>
        <span className="splash-pill">GPS IOT MONITORING</span>
        <p className="splash-message">{error || message}</p>
        {!error ? (
          <div className="splash-loader-bar">
            <div className="splash-loader-progress" />
          </div>
        ) : (
          <div className="splash-action-wrap">{action}</div>
        )}
        <div className="splash-footer-note">Smart IoT Fleet Tracker · Mobile Edition</div>
      </div>
    </div>
  );
}

function Shell({ me }) {
  const { logout, live, confirm, askConfirm, dismissConfirm, resolveConfirm, hasInternet } = useStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [open, setOpen] = useState(false);

  const isUser = me?.role === 'user';
  const pages = pagesFor(me);

  const [page, setPage] = useState(() => {
    if (!hasInternet) return 'debug';
    if (!isUser || me?.mode !== 'Running') return 'dashboard';
    try {
      const session = JSON.parse(localStorage.getItem(`geotrack:running:${me?.id}`) || 'null');
      return session?.state === 'run' ? 'running' : 'dashboard';
    } catch (e) {
      console.error('Gagal memeriksa sesi running yang tersimpan:', e);
      return 'dashboard';
    }
  });
  const [tab, setTab] = useState(() => (page === 'running' ? 'rekam' : null));
  const cur = pages[page] ? page : 'dashboard';

  // Otomatis arahkan ke debug jika offline saat membuka aplikasi atau saat internet putus
  useEffect(() => {
    if (isUser && !hasInternet && cur !== 'debug') {
      setPage('debug');
    }
  }, [isUser, hasInternet, cur]);

  const [title, , Page, , sub] = pages[cur] || adminPages.dashboard;
  const groups = Object.entries(pages).reduce((g, [id, v]) => ((g[v[3]] ||= []).push([id, v]), g), {});

  // Kunci navigasi: Jika offline, user hanya boleh mengakses menu Debug
  const go = (id, t = null) => {
    if (isUser && !hasInternet && id !== 'debug') return;
    setPage(id);
    setTab(t);
    setOpen(false);
  };

  const ModeIcon = me?.mode === 'Running' ? Footprints : CarFront;
  const initials = getInitials(me);

  const handleLogout = () => {
    askConfirm({
      title: 'Keluar dari akun?',
      text: 'Anda akan keluar dari GeoTrack pada perangkat ini.',
      confirmText: 'Keluar',
      danger: true,
      onConfirm: logout
    });
  };

  return <div className={`app-shell ${me?.mode === 'Running' ? 'theme-running' : 'theme-rental'} ${isUser ? 'user-app-mode' : 'admin-web-mode'} ${!hasInternet ? 'app-offline-mode' : ''}`}>
    {/* Sidebar untuk Desktop (Admin & User) / Mobile Drawer (Admin saja) */}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-mark brand-mark-img"><img src={logoGeoTrack} alt="GeoTrack" /></div>
        <div><b>GeoTrack</b><small>{me?.role === 'admin' ? 'Administrator Panel' : 'GPS Monitoring System'}</small></div>
        <button className="close-mobile" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      {isUser && <div className="workspace-switch"><div className="workspace-icon"><ModeIcon size={16} /></div><div><b>Mode {me?.mode || 'Rental'}</b><small>Diatur oleh administrator</small></div></div>}
      <nav className="side-nav">{Object.entries(groups).map(([g, items]) => <div key={g}>{Object.keys(groups).length > 1 && <div className="nav-section">{g}</div>}
        {items.map(([id, [label, Icon]]) => {
          const isDebug = id === 'debug';
          const disabled = isUser && !hasInternet && !isDebug;
          return (
            <button
              key={id}
              className={`nav-item ${cur === id ? 'active' : ''} ${disabled ? 'nav-item-disabled' : ''} ${isUser && !hasInternet && isDebug ? 'nav-debug-glow' : ''}`}
              onClick={() => {
                if (disabled) return;
                go(id);
              }}
              disabled={disabled}
              title={disabled ? 'Perlu koneksi internet' : label}
            >
              <Icon size={18} />
              <span>{label}</span>
              {disabled && <span className="offline-lock-tag">Offline</span>}
            </button>
          );
        })}</div>)}</nav>
      <div className="sidebar-bottom"><div className="profile-row"><div className="avatar">{initials}</div>
        <div className="profile-text"><b>{me?.name || 'User'}</b><small>{me?.email || ''}</small></div><button title="Keluar" onClick={handleLogout}><LogOut size={17} /></button></div></div>
    </aside>

    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Tutup menu" />}

    <div className="main-column">
      <header className="topbar">
        {/* Tombol hamburger hanya untuk admin di layar kecil. Untuk user, navigasi ada di Homebar bawah */}
        {!isUser ? (
          <button className="menu-toggle" onClick={() => setOpen(true)} title="Buka menu"><Menu size={21} /></button>
        ) : (
          <div className="mobile-app-header-brand">
            <div className="brand-mark-mini brand-mark-img"><img src={logoGeoTrack} alt="GeoTrack" /></div>
            <span>GeoTrack</span>
          </div>
        )}
        <div className="top-title"><h1>{title}</h1><p>{sub}</p></div>
        <div className="top-actions">
          {!hasInternet ? (
            <div className="connection-pill offline-pill">
              <span className="offline-dot" /> Mode Offline (GioT)
            </div>
          ) : (
            <div className="connection-pill"><span /> {live ? 'Realtime' : 'Menghubungkan…'}</div>
          )}
          {isUser && (
            <button
              className={`icon-button notification-button ${!hasInternet ? 'disabled-action' : ''}`}
              onClick={() => { if (hasInternet) go('help', 'notif'); }}
              disabled={!hasInternet}
              title={!hasInternet ? 'Perlu internet' : 'Notifikasi'}
            >
              <Bell size={18} />
              <i />
            </button>
          )}
          <button type="button" className="top-avatar-btn" onClick={() => (isUser ? setProfileOpen(true) : handleLogout())} title={isUser ? 'Profil Saya' : 'Keluar'}>
            <div className="top-avatar">{initials}</div>
          </button>
        </div>
      </header>

      {/* Banner informasi jika user sedang offline */}
      {!hasInternet && isUser && (
        <div className="offline-banner-alert">
          <WifiOff size={16} />
          <span>
            <b>Mode Offline Aktif:</b> Tidak ada koneksi internet. Anda hanya dapat menggunakan menu <b>Debug GioT</b> untuk terhubung ke alat GioT. Fitur lain dinonaktifkan sementara.
          </span>
        </div>
      )}

      <main className="page-content"><Page key={`${cur}:${tab || ''}`} go={go} tab={tab} /></main>

      {/* Bottom Homebar khusus User (Mobile App Experience) */}
      {isUser && (
        <nav className="mobile-homebar" aria-label="Navigasi Utama">
          {Object.entries(pages).map(([id, [label, Icon]]) => {
            const active = cur === id;
            const isDebug = id === 'debug';
            const disabled = !hasInternet && !isDebug;

            return (
              <button
                key={id}
                type="button"
                className={`homebar-item ${active ? 'active' : ''} ${disabled ? 'homebar-item-disabled' : ''} ${!hasInternet && isDebug ? 'homebar-debug-glow' : ''}`}
                onClick={() => {
                  if (disabled) return;
                  go(id);
                }}
                disabled={disabled}
                title={disabled ? 'Perlu koneksi internet' : label}
              >
                <div className="homebar-icon-wrap">
                  <Icon size={21} />
                </div>
                <span className="homebar-label">{id === 'dashboard' && me?.mode === 'Rental' ? 'Armada' : isDebug ? 'Debug' : label}</span>
                {!hasInternet && isDebug && <span className="homebar-debug-beacon" />}
              </button>
            );
          })}
        </nav>
      )}

      {profileOpen && <ProfileModal me={me} onClose={() => setProfileOpen(false)} onLogout={handleLogout} go={go} />}
      {confirm && <ConfirmModal {...confirm} onClose={dismissConfirm} onConfirm={resolveConfirm} />}
      {!isUser && <footer className="app-footer"><span>© 2026 GeoTrack</span><button onClick={() => go('tickets')}>Pusat bantuan</button></footer>}
    </div>
  </div>;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL UI ERROR caught by ErrorBoundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0b1120',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '100%'
          }}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#f87171' }}>Terjadi Kendala Tampilan</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
              Aplikasi mengalami kendala saat merender halaman. Silakan muat ulang.
            </p>
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#fca5a5',
              marginBottom: 16,
              textAlign: 'left',
              wordBreak: 'break-all'
            }}>
              {String(this.state.error?.message || this.state.error || 'Unknown error')}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { me, logout, status, error, notice, dismissNotice } = useStore();
  const [initialLoading, setInitialLoading] = useState(true);

  // Splash screen singkat saat membuka aplikasi agar terasa seperti app native
  useEffect(() => {
    const t = setTimeout(() => setInitialLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  if (status === 'loading' || initialLoading) {
    return <SplashScreen message="Memuat GeoTrack…" />;
  }

  if (status === 'error') {
    return (
      <SplashScreen
        title="GeoTrack Bermasalah"
        error={error}
        action={<Button onClick={logout}>Keluar</Button>}
      />
    );
  }

  if (!me) {
    return (
      <>
        <Login />
        {notice && (
          <div
            className={`toast toast-${notice.type}`}
            key={notice.k}
            role="status"
            onClick={dismissNotice}
          >
            {notice.text}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Shell key={`${me.id}:${me.mode || ''}`} me={me} />
      {notice && (
        <div
          className={`toast toast-${notice.type}`}
          key={notice.k}
          role="status"
          onClick={dismissNotice}
        >
          {notice.text}
        </div>
      )}
    </>
  );
}

export default function App() {
  if (!configured) return <SplashScreen title="GeoTrack" error="Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di file .env lalu jalankan ulang npm run dev." />;
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </ErrorBoundary>
  );
}