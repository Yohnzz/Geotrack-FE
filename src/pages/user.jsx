import { useEffect, useState } from 'react';
import { Smartphone, Route, Navigation, BatteryMedium, Pencil, Check, Play, Pause, Square, CalendarDays, Wifi, Footprints, Clock3, Send, ShieldCheck, Bell, History, LocateFixed, ExternalLink, MapPinOff, MapPin } from 'lucide-react';
import { useStore } from '../store.jsx';
import { useLivePositions, pathKm, usePlace, useMyLocation, haversineKm, coord, mapsUrl, routeUrl, fmtDateTime } from '../services/gpsService.js';
import { hasPos, validCoord } from '../services/geo.js';
import { Badge, Button, Stat, Modal, Field, Table, Empty, MapPanel, ModeBanner, Tabs } from '../ui.jsx';
import { LocationPage, TrackTab } from './features.jsx';

// Semua device milik akun (bisa lebih dari satu), diurutkan menurut nama tampilan (alias) secara natural: Avanza 2 < Avanza 10.
const byLabel = (a, b) => a.label.localeCompare(b.label, 'id', { numeric: true });
const useMine = () => { const s = useStore(); return { ...s, mine: s.db.devices.filter(d => d.ownerId === s.me.id).sort(byLabel) }; };
const today = () => new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const bat = d => (d?.battery != null ? `${d.battery}%` : '—');
const hms = s => [s / 3600, (s % 3600) / 60, s % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':');
const secs = t => t.split(':').reduce((a, n) => a * 60 + Number(n), 0);
const Welcome = ({ me, text }) => <div className="page-welcome"><div><div className="eyebrow">{`MODE ${me.mode.toUpperCase()}`}</div><h2>Halo, {me.name} <span>👋</span></h2><p>{text}</p></div><div className="date-chip"><CalendarDays size={15} /> {today()}</div></div>;
const Head = ({ title, sub, action }) => <div className="panel-heading"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{action}</div>;

// Nama tempat (reverse geocoding) untuk satu device; dipakai per baris daftar.
const DevicePlace = ({ d }) => {
  const ok = hasPos(d);
  const p = usePlace(ok ? d.lat : null, ok ? d.lng : null);
  if (!ok) return 'Lokasi belum tersedia';
  return p.text || (p.loading ? 'Mencari nama lokasi…' : coord(d.lat, d.lng));
};

export function UserDashboard({ go }) {
  const { me, mine: mineRaw, db } = useMine();
  const mine = useLivePositions(mineRaw);
  const [view, setView] = useState(null), [edit, setEdit] = useState(null), [focus, setFocus] = useState(null), [fitN, setFitN] = useState(0);
  const place = usePlace(mine[0]?.lat, mine[0]?.lng);
  const rental = me.mode === 'Rental';
  const onlineN = mine.filter(d => d.online).length, located = mine.filter(hasPos).length;
  const offlineN = mine.length - onlineN;
  const lowBat = mine.filter(d => d.battery != null && d.battery < 20).length;
  const listings = db.listings.filter(l => l.ownerId === me.id);
  const runs = db.runs.filter(r => r.userId === me.id), km = runs.reduce((a, r) => a + Number(r.distance), 0);
  const stats = rental
    ? [[Smartphone, 'Total Device', mine.length, 'Kendaraan terpantau', 'blue'], [Wifi, 'Online', onlineN, 'Terhubung saat ini', 'green'], [Smartphone, 'Offline', offlineN, offlineN ? 'Perlu dicek' : 'Semua terhubung', offlineN ? 'red' : 'green'], [BatteryMedium, 'Baterai Rendah', lowBat, lowBat ? 'Di bawah 20%' : 'Semua aman', lowBat ? 'orange' : 'green']]
    : [[Smartphone, 'Device Saya', mine.length, 'Dipakai sendiri', 'blue'], [Footprints, 'Sesi Running', runs.length, 'Total aktivitas', 'violet'], [Navigation, 'Total Jarak', `${km.toFixed(1)} km`, 'Semua sesi', 'green'], [BatteryMedium, 'Baterai', bat(mine[0]), 'Device utama', 'orange']];
  const mapSub = !mine.length ? 'Belum ada device' : rental ? `${located} dari ${mine.length} device tampil di peta` : (place.text || mine[0].location || 'Menunggu data GPS');
  const pick = id => setView(id);
  const center = id => { setView(null); setFocus({ id, n: Date.now() }); }; // tutup modal lalu pusatkan peta dashboard
  return <>
    <Welcome me={me} text={rental ? 'Pantau lokasi semua kendaraan Anda secara real-time dari satu dashboard.' : 'Pantau aktivitas lari dan perangkat pribadi Anda.'} />
    <div className="stats-grid">{stats.map(([I, l, v, d, t]) => <Stat key={l} icon={I} label={l} value={v} detail={d} tone={t} />)}</div>
    <div className={rental ? 'rental-dashboard-grid' : 'dashboard-grid'}>
      <section className={`panel map-overview ${rental ? 'map-hero' : ''}`}>
        <Head title={rental ? 'Peta Kendaraan' : 'Lokasi Device Saya'} sub={mapSub} action={<div className="head-actions">{located > 1 && <Button variant="outline" small onClick={() => setFitN(n => n + 1)}>Lihat semua</Button>}</div>} />
        <MapPanel devices={mine} onDeviceClick={pick} focus={focus} fitAll={fitN} />
        {mine.length > 0 && <div className="map-legend"><span><i className="legend-blue" />Online</span><span><i className="legend-grey" />Offline (lokasi terakhir)</span>{located < mine.length && <span>{mine.length - located} device belum punya lokasi valid</span>}</div>}
      </section>
      <section className="panel device-status-panel"><Head title={rental ? 'Daftar Kendaraan' : 'Status Device'} sub={`${mine.length} device · ${onlineN} online`} action={rental && <Button variant="outline" small onClick={() => go('device')}>Kelola Device</Button>} />
        {mine.length === 0 && <Empty title="Belum ada device" text="Menunggu admin menghubungkan device." />}
        <div className="device-status-list">
          {mine.map(d => <div className="device-status-row" key={d.id}>
            <div className="device-status-icon"><Smartphone size={17} /></div>
            <div className="device-status-info"><b>{d.label}</b>
              <small className="dev-code">{d.code}{d.alias ? ` · ${d.name}` : ''}</small>
              {d.notes && <small className="dev-desc">{d.notes}</small>}
              <button type="button" className="loc-link" onClick={() => pick(d.id)}><MapPin size={11} /><span><DevicePlace d={d} /></span></button>
              <div className="device-meta"><span><BatteryMedium size={12} />{bat(d)}</span><span><Navigation size={12} />{d.gps}</span>{d.updated && <span className={d.online ? '' : 'meta-stale'}><Clock3 size={12} />{d.online ? 'Update' : 'Terakhir'} {d.updated}</span>}</div>
              <div className="device-actions"><Button small icon={MapPin} onClick={() => pick(d.id)}>Lihat Lokasi</Button><Button small variant="outline" icon={Pencil} onClick={() => setEdit(d.id)}>Edit Alias</Button></div></div>
            <Badge tone={d.online ? 'green' : 'red'}>{d.online ? 'Online' : 'Offline'}</Badge></div>)}
        </div>
      </section>
    </div>
    {view && <DeviceLocationModal key={view} deviceId={view} onClose={() => setView(null)} onCenter={center} onEdit={id => { setView(null); setEdit(id); }} />}
    {edit && <EditIdentityModal key={edit} deviceId={edit} onClose={() => setEdit(null)} />}</>;
}

// Modal lokasi & informasi satu device. Data selalu dicari ulang dari deviceId, jadi tidak pernah tertukar antar-device.
function DeviceLocationModal({ deviceId, onClose, title, onCenter, onEdit }) {
  const { mine: raw } = useMine();
  const d = useLivePositions(raw).find(x => x.id === deviceId);
  const me = useMyLocation();
  const has = hasPos(d);
  const place = usePlace(has ? d.lat : null, has ? d.lng : null);
  useEffect(() => { if (has) me.locate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (!d) return null;
  const km = me.pos && has ? haversineKm([me.pos.lat, me.pos.lng], [d.lat, d.lng]) : null;
  const jarak = km == null ? '—' : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
  const rows = [
    ['Status', <Badge key="s" tone={d.online ? 'green' : 'red'}>{d.online ? 'Online' : 'Offline'}</Badge>],
    ['Diperbarui', d.seenAt ? `${fmtDateTime(d.seenAt)} (${d.updated})` : '—'],
    ['Lokasi', has ? (place.text || (place.loading ? 'Mencari nama lokasi…' : '—')) : '—'],
    ['Latitude', has ? Number(d.lat).toFixed(6) : '—'],
    ['Longitude', has ? Number(d.lng).toFixed(6) : '—'],
    ['Jarak dari Anda', has ? (me.busy ? 'Mendeteksi…' : jarak) : '—'],
    ['Baterai', bat(d)],
    ['GPS', d.gps],
    ['Satelit', d.satellites ?? '—'],
    ['Kecepatan', d.speed != null ? `${Number(d.speed).toFixed(1)} km/j` : '—'],
    ['Sinyal Wi-Fi', d.signal != null ? `${d.signal} dBm` : '—'],
    ['Nama alias', d.alias || '—'],
    ['Nama resmi', d.name],
    ['Kode device', d.code],
  ];
  return <Modal title={title || d.label} onClose={onClose} wide><div className="find-body">
    {d.notes && <p className="modal-note"><b>Deskripsi:</b> {d.notes}</p>}
    {!has ? <div className="find-empty"><MapPinOff size={30} /><b>Lokasi belum tersedia</b><span>Device belum mengirim koordinat GPS yang valid. Pastikan device menyala, mendapat sinyal GPS, dan terhubung ke Wi-Fi.</span></div> : <>
      <div className="find-map"><MapPanel devices={[d]} me={me.pos} /></div>
      <div className="find-info">{rows.map(([k, v]) => <div className="info-line" key={k}>{k}<b>{v}</b></div>)}</div>
      {!d.online && <p className="modal-note">Device sedang offline. Peta menampilkan lokasi terakhir yang tercatat{d.seenAt ? ` (${fmtDateTime(d.seenAt)})` : ''}, bukan posisi real-time.</p>}
      {me.err && <p className="modal-note">{me.err}</p>}</>}
    <div className="find-actions">
      {onEdit && <Button variant="outline" small icon={Pencil} onClick={() => onEdit(d.id)}>Edit Identitas</Button>}
      {has && onCenter && <Button variant="outline" small icon={MapPin} onClick={() => onCenter(d.id)}>Pusatkan di peta</Button>}
      {has && <Button variant="outline" small icon={LocateFixed} onClick={me.locate}>{me.busy ? 'Mendeteksi…' : 'Deteksi lokasi saya'}</Button>}
      {has && <a className="btn btn-outline btn-small" href={mapsUrl(d.lat, d.lng)} target="_blank" rel="noreferrer"><ExternalLink size={13} /><span>Buka di Google Maps</span></a>}
      {has && <a className="btn btn-small" href={routeUrl(d.lat, d.lng)} target="_blank" rel="noreferrer"><Navigation size={13} /><span>Rute ke device</span></a>}
      <Button variant="outline" small onClick={onClose}>Tutup</Button>
    </div>
  </div></Modal>;
}

// Form Edit Alias: alias singkat (maks 10 karakter, tampil di marker peta) + deskripsi. RLS: hanya pemilik.
function EditIdentityModal({ deviceId, onClose }) {
  const { mine, saveOwnDevice } = useMine();
  const d = mine.find(x => x.id === deviceId);
  const [f, setF] = useState(() => ({ alias: d?.alias || '', notes: d?.notes || '' }));
  const [saving, setSaving] = useState(false), [err, setErr] = useState('');
  if (!d) return null;
  const alias = f.alias.trim();
  const dup = alias && mine.some(x => x.id !== d.id && x.label.toLowerCase() === alias.toLowerCase());
  const submit = async e => {
    e.preventDefault();
    if (alias.length > 10) return setErr('Nama alias maksimal 10 karakter.');
    if (f.notes.length > 200) return setErr('Deskripsi maksimal 200 karakter.');
    setErr('');
    setSaving(true);
    const ok = await saveOwnDevice(d.id, { alias, notes: f.notes.trim() });
    setSaving(false);
    if (ok) onClose();
    else setErr('Perubahan belum tersimpan. Jika pesan error menyebut kolom "alias", jalankan supabase/device_alias.sql di Supabase.');
  };
  return <Modal title="Edit Alias Device" onClose={saving ? () => { } : onClose}><form className="modal-form" onSubmit={submit}>
    <Field label="Nama resmi (diatur admin)"><input disabled value={d.name} /></Field>
    <Field label="Kode device"><input disabled value={d.code} /></Field>
    <Field label="Nama alias (maks 10 karakter)"><input autoFocus maxLength={10} value={f.alias} placeholder="mis. Avanza 01" onChange={e => setF({ ...f, alias: e.target.value })} /></Field>
    {dup && <p className="modal-note">Alias ini sama dengan kendaraan lain milik Anda. Tetap bisa disimpan, tetapi sulit dibedakan.</p>}
    <Field label="Deskripsi (opsional)"><textarea rows={3} maxLength={200} value={f.notes} placeholder="mis. Toyota Avanza putih untuk cabang Malang" onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
    <p className="modal-note">Alias tampil di marker peta dan daftar device. Maks 10 karakter agar terbaca di peta. Kosongkan untuk memakai nama resmi.</p>
    {err && <p className="form-error">{err}</p>}
    <div className="modal-actions"><Button variant="outline" disabled={saving} onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div></form></Modal>;
}

export function UserDevices() {
  const { mine } = useMine();
  const [edit, setEdit] = useState(null), [find, setFind] = useState(null);
  const findDev = mine.find(d => d.id === find);
  return <>
    {mine.length === 0 && <Empty title="Belum ada device" text="Device dihubungkan oleh administrator setelah pembelian." />}
    {mine.map(d => <div className="device-hero panel" key={d.id} style={{ marginBottom: 14 }}><div className="device-hero-icon"><Smartphone size={28} /></div>
      <div className="device-hero-info">
        <div className="title-with-badge">
          <h2>{d.label}</h2>
          <Badge tone={d.online ? 'green' : 'red'}>{d.online ? 'Online' : 'Offline'}</Badge>
        </div>
        <p>{d.code}{d.alias ? ` · ${d.name}` : ''} · GPS Tracker · Terhubung ke akun Anda</p>
        {d.notes && <p className="device-desc">{d.notes}</p>}
        <div className="hero-meta"><span><Wifi size={14} /> {d.online ? 'Terhubung' : 'Terputus'}</span><span><Navigation size={14} /> GPS {d.gps}</span><span><BatteryMedium size={14} /> Baterai {bat(d)}</span></div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={LocateFixed} onClick={() => setFind(d.id)}>Temukan Alat Saya</Button>
        <Button variant="outline" icon={Pencil} onClick={() => setEdit(d.id)}>Edit Alias</Button>
      </div></div>)}
    {findDev && <DeviceLocationModal key={find} deviceId={find} title={`Temukan ${findDev.label}`} onClose={() => setFind(null)} onEdit={id => { setFind(null); setEdit(id); }} />}
    {edit && <EditIdentityModal key={edit} deviceId={edit} onClose={() => setEdit(null)} />}
  </>;
}

// Halaman Lokasi: satu peta perjalanan dan riwayat jalur.
export function UserLocation({ tab }) {
  const { me, mine: raw, db } = useMine();
  const mine = useLivePositions(raw);
  const runs = me.mode === 'Running' ? db.runs.filter(r => r.userId === me.id) : [];
  return <LocationPage devices={mine} tab={tab} extra={[{ id: 'jalur', label: 'Riwayat Jalur', icon: Route, render: d => <TrackTab d={d} runs={runs} mode={me.mode} /> }]} />;
}

// Halaman Device Saya: langsung menampilkan perangkat (tab Pembelian dihapus)
export function UserDevice() {
  return <UserDevices />;
}

// Komponen listing/sewa (Rental, RentalHistory) dihapus. User Rental sekarang fokus
// pada pelacakan lokasi kendaraan lewat Dashboard (peta besar) dan halaman Device Saya.

// ================= MODE RUNNING (hijau, metrik & kontrol lari) =================
export function Running() {
  const { me, mine: raw, saveRun } = useMine();
  const mine = useLivePositions(raw), dev = mine[0];
  const storageKey = `geotrack:running:${me.id}`;
  const [session, setSession] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && ['run', 'pause'].includes(saved.state) && Array.isArray(saved.track)
        && saved.track.every(point => Array.isArray(point) && validCoord(point[0], point[1]))
        && Number.isFinite(saved.elapsedMs) && typeof saved.startedAt === 'string'
        && (saved.state !== 'run' || Number.isFinite(saved.runningSince))) return saved;
      return null;
    } catch (error) {
      console.error('Gagal memulihkan sesi running:', error);
      return null;
    }
  });
  const [now, setNow] = useState(0), [gpsStatus, setGpsStatus] = useState('Mencari GPS'), [gpsError, setGpsError] = useState('');
  const state = session?.state || 'idle', track = session?.track || [];
  const currentTime = now || session?.runningSince || 0;
  const sec = Math.floor(((session?.elapsedMs || 0) + (state === 'run' ? currentTime - session.runningSince : 0)) / 1000);
  const km = session?.finishKm ?? null;
  const dist = pathKm(track), paceMin = dist > 0.01 ? sec / 60 / dist : null;
  const locationSetupError = !window.isSecureContext
    ? 'GPS browser hanya bisa digunakan lewat HTTPS atau localhost.'
    : !navigator.geolocation
      ? 'Browser ini tidak mendukung GPS.'
      : '';

  useEffect(() => {
    try {
      if (session) localStorage.setItem(storageKey, JSON.stringify(session));
      else localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Gagal menyimpan sesi running:', error);
    }
  }, [session, storageKey]);

  useEffect(() => {
    if (state !== 'run') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== 'run' || locationSetupError) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!validCoord(coords.latitude, coords.longitude)) return;
        if (coords.accuracy > 100) {
          setGpsStatus('Mencari sinyal');
          return;
        }
        setGpsStatus('GPS aktif');
        setGpsError('');
        const point = [coords.latitude, coords.longitude];
        setSession(current => {
          if (!current || current.state !== 'run') return current;
          const previous = current.track[current.track.length - 1];
          if (previous && haversineKm(previous, point) < Math.max(0.005, coords.accuracy / 2000)) return current;
          return { ...current, track: [...current.track, point] };
        });
      },
      error => {
        setGpsStatus('GPS bermasalah');
        setGpsError(error.code === 1
          ? 'Izin lokasi ditolak. Izinkan akses lokasi untuk GeoTrack di pengaturan browser.'
          : error.code === 2
            ? 'Lokasi tidak tersedia. Pastikan GPS perangkat aktif dan coba di area terbuka.'
            : 'GPS belum merespons. Pastikan izin lokasi aktif dan coba lagi.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [state, locationSetupError]);

  const begin = () => {
    const timestamp = Date.now();
    setNow(timestamp);
    setGpsStatus(locationSetupError ? 'GPS tidak tersedia' : 'Mencari GPS');
    setGpsError('');
    if (session) {
      setSession({ ...session, state: 'run', runningSince: timestamp, finishKm: null });
      return;
    }
    setSession({ state: 'run', elapsedMs: 0, runningSince: timestamp, startedAt: new Date(timestamp).toISOString(), track: [], finishKm: null });
  };
  const pause = () => {
    const timestamp = Date.now();
    setNow(timestamp);
    setSession(current => current && ({
      ...current,
      state: 'pause',
      elapsedMs: current.elapsedMs + Math.max(0, timestamp - current.runningSince),
      runningSince: null
    }));
  };
  const finish = () => {
    const timestamp = Date.now();
    setNow(timestamp);
    setSession(current => current && ({
      ...current,
      state: 'pause',
      elapsedMs: current.elapsedMs + Math.max(0, timestamp - current.runningSince),
      runningSince: null,
      finishKm: dist.toFixed(2)
    }));
  };
  return <>
    <ModeBanner mode="Running" title="Running Tracker" text="Rekam lari memakai GPS browser. Sesi aktif tetap tersimpan jika halaman dimuat ulang." />
    <section className="panel mode-workspace"><Head title="Sesi Lari" sub={mine[0] ? mine[0].label : 'Belum ada device'} action={<Badge tone={state === 'run' ? 'green' : state === 'pause' ? 'orange' : 'gray'}>{state === 'run' ? 'Merekam' : state === 'pause' ? 'Dijeda' : 'Siap'}</Badge>} />
      <div className="running-controls">
        <div className="running-metric"><small>DURASI</small><strong>{hms(sec)}</strong></div>
        <div className="running-metric"><small>JARAK</small><strong>{dist.toFixed(2)}<small> km</small></strong></div>
        <div className="running-metric"><small>PACE</small><strong>{paceMin ? `${Math.floor(paceMin)}:${String(Math.round((paceMin % 1) * 60) % 60).padStart(2, '0')}` : '—'}<small> /km</small></strong></div>
        <div className="running-metric"><small>GPS</small><strong className="gps-ready"><span /> {state === 'run' ? (locationSetupError ? 'GPS tidak tersedia' : gpsStatus) : state === 'pause' ? 'Dijeda' : 'Siap'}</strong></div>
      </div>
      {(locationSetupError || gpsError) && <p className="running-gps-error" role="status">{locationSetupError || gpsError}</p>}
      <div className="running-map"><MapPanel devices={dev ? [dev] : []} route={track} follow={state === 'run'} /></div>
      <div className="running-actions">
        {state !== 'run' ? <Button icon={Play} onClick={begin}>{state === 'pause' ? 'Lanjutkan' : 'Mulai'}</Button> : <Button variant="outline" icon={Pause} onClick={pause}>Jeda</Button>}
        {state !== 'idle' && <Button variant="danger" icon={Square} onClick={finish}>Selesai</Button>}
      </div></section>
    {km !== null && <Modal title="Simpan Aktivitas" onClose={() => setSession(current => current && ({ ...current, finishKm: null }))}><form className="modal-form" onSubmit={async e => { e.preventDefault(); if (await saveRun({ deviceId: dev?.id, distance: km, seconds: sec, route: track, startedAt: session.startedAt })) { setSession(null); } }}>
      <Field label={`Jarak (km, dari GPS · bisa dikoreksi) · durasi ${hms(sec)}`}><input required type="number" step="0.01" min="0" value={km} onChange={e => setSession(current => current && ({ ...current, finishKm: e.target.value }))} /></Field>
      <div className="modal-actions"><Button variant="outline" onClick={() => setSession(current => current && ({ ...current, finishKm: null }))}>Batal</Button><Button type="submit">Simpan</Button></div></form></Modal>}
  </>;
}

export function RunningHistory() {
  const { db, me, saveRun, deleteRun, askConfirm } = useStore();
  const [f, setF] = useState(null);
  const rows = db.runs.filter(r => r.userId === me.id), km = rows.reduce((a, r) => a + Number(r.distance), 0);
  const pace = r => { const m = secs(r.duration) / 60 / Math.max(Number(r.distance), 0.01); return `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} /km`; };
  return <>
    <div className="stats-strip"><span>Total sesi <b>{rows.length}</b></span><span>Total jarak <b>{km.toFixed(2)} km</b></span></div>
    {rows.length === 0 ? <Empty title="Belum ada riwayat running" text="Mulai aktivitas dari menu Running." /> :
      <section className="panel mode-workspace"><Head title="Aktivitas Saya" /><div className="vehicle-grid">{rows.map(r => <div className="vehicle-card" key={r.id}><div className="vehicle-icon bike"><Footprints size={20} /></div>
        <div><b>{r.distance} km · {r.duration}</b><small>{r.date} · Pace {pace(r)}</small></div><Badge tone="green">Selesai</Badge>
        <p>{r.note || 'Tanpa catatan'}</p>
        <div style={{ gridColumn: '1/4', display: 'flex', gap: 8 }}><Button small variant="outline" icon={Pencil} onClick={() => setF(r)}>Catatan</Button><Button small variant="danger" icon={Trash2} onClick={() => askConfirm({ title: 'Hapus aktivitas?', text: 'Riwayat aktivitas lari ini akan dihapus permanen.', confirmText: 'Hapus aktivitas', danger: true, onConfirm: () => deleteRun(r.id) })}>Hapus</Button></div></div>)}</div></section>}
    {f && <Modal title="Catatan Aktivitas" onClose={() => setF(null)}><form className="modal-form" onSubmit={async e => { e.preventDefault(); if (await saveRun(f)) setF(null); }}>
      <Field label="Catatan"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
      <div className="modal-actions"><Button variant="outline" onClick={() => setF(null)}>Batal</Button><Button type="submit">Simpan</Button></div></form></Modal>}
  </>;
}

export function Service() {
  const { db, me, sendTicket } = useStore();
  const [f, setF] = useState({ category: 'Baterai', title: '', detail: '' });
  const mine = db.tickets.filter(t => t.userId === me.id);
  return <div className="service-layout"><div>
    <section className="panel service-form-panel" style={{ marginBottom: 16 }}><Head title="Kirim Pengaduan" sub="Admin akan menanggapi secepatnya" />
      <form className="form-grid" onSubmit={async e => { e.preventDefault(); if (await sendTicket(f)) setF({ ...f, title: '', detail: '' }); }}>
        <label>Kategori<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}><option>Baterai</option><option>GPS</option><option>Website</option><option>Lainnya</option></select></label>
        <label>Judul<input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="full-field" style={{ gridColumn: '1/-1' }}>Detail<textarea required rows={4} value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} /></label>
        <div className="form-submit" style={{ gridColumn: '1/-1' }}><Button type="submit" icon={Send}>Kirim</Button></div></form></section>
    <section className="panel"><Head title="Riwayat Pengaduan" />
      {mine.map(t => <div className="activity-row" key={t.id}><div className="activity-copy"><b>{t.title}</b><small>{t.reply ? `Admin: ${t.reply}` : 'Belum ditanggapi'}</small></div><Badge tone={t.status === 'Selesai' ? 'green' : t.status === 'Diproses' ? 'blue' : 'orange'}>{t.status}</Badge></div>)}</section></div>
    <aside className="panel service-info-panel"><div className="support-illustration"><Bell size={26} /><span><Check size={13} /></span></div><h3>Pusat Bantuan</h3><p>Laporkan kendala baterai, GPS, atau tampilan website.</p>
      <div className="support-stat">Total pengaduan <b>{mine.length}</b></div><div className="support-stat">Sudah selesai <b>{mine.filter(t => t.status === 'Selesai').length}</b></div></aside></div>;
}

export function Notifications() {
  const { db, me } = useStore();
  const admin = me.role === 'admin';
  const mineIds = db.devices.filter(d => d.ownerId === me.id).map(d => d.id);
  const usersById = new Map(db.users.map(user => [user.id, user]));
  const items = [
    ...db.devices.filter(d => d.battery != null && d.battery < 20 && (admin || mineIds.includes(d.id))).map(d => ({
      k: 'b' + d.id, tone: 'red', icon: BatteryMedium, t: 'Baterai rendah',
      p: `${d.label} tersisa ${d.battery}%.`, mode: admin ? usersById.get(d.ownerId)?.mode : null,
    })),
    ...(admin ? db.tickets.filter(t => t.status === 'Baru').map(t => ({
      k: t.id, tone: 'orange', icon: Bell, t: 'Pengaduan baru', p: t.title,
      mode: usersById.get(t.userId)?.mode,
    }))
      : db.tickets.filter(t => t.userId === me.id && t.reply).map(t => ({ k: t.id, tone: 'blue', icon: ShieldCheck, t: 'Pengaduan ditanggapi', p: t.reply }))),
  ];
  return <><div className="notification-head"><div><h2>Notifikasi</h2><p>{items.length} pemberitahuan</p></div></div>
    <div className="notification-list">{items.length === 0 && <Empty title="Tidak ada notifikasi" text="Semua aman." />}
      {items.map(n => <div className="notification-item unread" key={n.k}><div className={`notification-icon ${n.tone}`}><n.icon size={18} /></div><div className="notification-copy"><b>{n.t}</b>{n.mode && <small>Mode {n.mode}</small>}<p>{n.p}</p></div></div>)}</div></>;
}

// ================= HALAMAN GABUNGAN (agar sidebar ringkas) =================
export const RunningPage = ({ tab }) => <Tabs initial={tab} tabs={[
  { id: 'rekam', label: 'Rekam Lari', icon: Play, node: <Running /> },
  { id: 'riwayat', label: 'Riwayat', icon: History, node: <RunningHistory /> },
]} />;

export const Help = () => <Service />;