import { useState } from 'react';
import { LayoutDashboard, Smartphone, History, Footprints, MapPin, MessageSquare, Users, Link2, LogOut, Menu, X, ArrowRight, Bell, ShieldCheck, Wifi, CarFront, ReceiptText, MapPinned, LifeBuoy, Eye, EyeOff } from 'lucide-react';
import { configured } from './services/supabase.js';
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
    ? {} // Rental: cukup dashboard (peta besar), device, bantuan
    : { running: ['Running', Footprints, U.RunningPage, 'MENU', 'Rekam aktivitas lari dan lihat riwayatnya'],
        location: ['Lokasi', MapPin, U.UserLocation, 'MENU', 'Peta, titik per titik, dan riwayat jalur'] }),
  device: ['Device Saya', Smartphone, U.UserDevice, 'MENU', 'Lihat, temukan, dan kelola perangkat Anda'],
  help: ['Bantuan', LifeBuoy, U.Help, 'MENU', 'Kirim pengaduan dan lihat notifikasi'],
  notifications: ['Notifikasi', Bell, U.Notifications, 'NOTIFIKASI', 'Pemberitahuan device dan pengaduan'],
});
const pagesFor = me => me.role === 'admin' ? adminPages : userPages(me.mode);

function Login() {
  const { login } = useStore();
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [showPw, setShowPw] = useState(false);
  return <div className="login-screen">
    <div className="login-art">
      <div className="brand brand-light"><div className="brand-mark"><img src="/geotrack-logo.png" alt="" /></div><div><b>GeoTrack</b><small>GPS Monitoring System</small></div></div>
      <div className="login-art-copy"><span className="eyebrow">SMART GPS MONITORING</span><h1>Setiap perjalanan,<br /><em>lebih terpantau.</em></h1>
        <p>Pantau perangkat, jelajahi riwayat perjalanan, dan kelola aktivitas GPS dalam satu dashboard.</p>
        <div className="login-foot"><span><ShieldCheck size={15} /> Pemantauan terpusat</span><span><Wifi size={15} /> Data perangkat</span></div></div>
    </div>
    <div className="login-side"><form className="login-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(await login(email, pw)); setBusy(false); }}>
      <div className="brand brand-dark"><div className="brand-mark"><img src="/geotrack-logo.png" alt="" /></div><div><b>GeoTrack</b><small>GPS Monitoring System</small></div></div>
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

function Splash({ title, text, action }) {
  return <div className="splash"><div className="brand-mark"><img src="/geotrack-logo.png" alt="" /></div><h2>{title}</h2>{text && <p>{text}</p>}{action}</div>;
}

function Shell() {
  const { me, logout, status, error, live, confirm, askConfirm, dismissConfirm, resolveConfirm } = useStore();
  const [page, setPage] = useState(() => {
    if (me?.role !== 'user' || me.mode !== 'Running') return 'dashboard';
    try {
      const session = JSON.parse(localStorage.getItem(`geotrack:running:${me.id}`) || 'null');
      return session?.state === 'run' ? 'running' : 'dashboard';
    } catch (e) {
      console.error('Gagal memeriksa sesi running yang tersimpan:', e);
      return 'dashboard';
    }
  });
  const [tab, setTab] = useState(() => page === 'running' ? 'rekam' : null), [open, setOpen] = useState(false);
  if (status === 'loading') return <Splash title="Memuat GeoTrack…" />;
  if (status === 'error') return <Splash title="Gagal memuat data" text={error} action={<Button onClick={logout}>Keluar</Button>} />;
  if (!me) return <Login />;
  const pages = pagesFor(me), cur = pages[page] ? page : 'dashboard';
  const [title, , Page, , sub] = pages[cur];
  const groups = Object.entries(pages).reduce((g, [id, v]) => {
    if (id !== 'notifications') (g[v[3]] ||= []).push([id, v]);
    return g;
  }, {});
  const go = (id, t = null) => { setPage(id); setTab(t); setOpen(false); }; // t = tab yang dibuka di halaman tujuan
  const ModeIcon = me.mode === 'Rental' ? CarFront : Footprints;
  return <div className={`app-shell ${me.mode === 'Running' ? 'theme-running' : 'theme-rental'}`}>
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-mark"><img src="/geotrack-logo.png" alt="" /></div><div><b>GeoTrack</b><small>{me.role === 'admin' ? 'Administrator Panel' : 'GPS Monitoring System'}</small></div>
        <button className="close-mobile" onClick={() => setOpen(false)}><X size={18} /></button></div>
      {me.role === 'user' && <div className="workspace-switch"><div className="workspace-icon"><ModeIcon size={16} /></div><div><b>Mode {me.mode}</b><small>Diatur oleh administrator</small></div></div>}
      <nav className="side-nav">{Object.entries(groups).map(([g, items]) => <div key={g}>{Object.keys(groups).length > 1 && <div className="nav-section">{g}</div>}
        {items.map(([id, [label, Icon]]) => <button key={id} className={`nav-item ${cur === id ? 'active' : ''}`} onClick={() => go(id)}><Icon size={18} /><span>{label}</span></button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="profile-row"><div className="avatar">{me.name.slice(0, 2).toUpperCase()}</div>
        <div className="profile-text"><b>{me.name}</b><small>{me.email}</small></div><button title="Keluar" onClick={() => askConfirm({ title: 'Keluar dari akun?', text: 'Anda akan keluar dari GeoTrack pada perangkat ini.', confirmText: 'Keluar', onConfirm: logout })}><LogOut size={17} /></button></div></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Tutup menu" />}
    <div className="main-column">
      <header className="topbar"><button className="menu-toggle" onClick={() => setOpen(true)}><Menu size={21} /></button>
        <div className="top-title"><h1>{title}</h1><p>{sub}</p></div>
        <div className="top-actions"><div className="connection-pill"><span /> {live ? 'Realtime aktif' : 'Menghubungkan…'}</div>
          <button className="icon-button notification-button" aria-label="Buka notifikasi" title="Notifikasi" onClick={() => go('notifications')}><Bell size={18} /><i /></button><div className="top-avatar">{me.name.slice(0, 2).toUpperCase()}</div></div></header>
      <main className="page-content"><Page key={`${cur}:${tab || ''}`} go={go} tab={tab} /></main>
      {confirm && <ConfirmModal {...confirm} onClose={dismissConfirm} onConfirm={resolveConfirm} />}
      <footer className="app-footer"><span>© 2026 GeoTrack</span><button onClick={() => (me.role === 'admin' ? go('tickets') : go('help'))}>Pusat bantuan</button></footer>
    </div></div>;
}

function AppContent() {
  const { me, notice, dismissNotice } = useStore();
  return <>
    <Shell key={`${me?.id || 'anonymous'}:${me?.mode || ''}`} />
    {notice && <div className={`toast toast-${notice.type}`} key={notice.k} role="status" onClick={dismissNotice}>{notice.text}</div>}
  </>;
}

export default function App() {
  if (!configured) return <Splash title="Supabase belum dikonfigurasi" text="Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di file .env (lihat .env.example), lalu jalankan ulang npm run dev." />;
  return <StoreProvider><AppContent /></StoreProvider>;
}