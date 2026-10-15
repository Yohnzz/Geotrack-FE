import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapPin, LocateFixed, ExternalLink, Download, Printer, RefreshCw, Pencil, Trash2,
  CircleCheck, TriangleAlert, CircleX, Loader, LayoutDashboard, BatteryMedium, Wifi, Map as MapIcon,
  ReceiptText, Wallet, CalendarDays, Users, Navigation, Route
} from 'lucide-react';
import { useStore } from '../store.jsx';
import { supabase } from '../services/supabase.js';
import {
  ago, coord, downloadCSV, fmtDateTime, fmtTime, haversineKm, mapsUrl, routeUrl, rupiah, useMyLocation, usePlace
} from '../services/gpsService.js';
import { Badge, Button, Empty, Field, MapPanel, Modal, Stat, Table, Tabs } from '../ui.jsx';

const Head = ({ title, sub, action }) => <div className="panel-heading"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{action}</div>;
const jarak = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
const placeText = p => (p.loading ? 'Mendeteksi nama lokasi…' : p.text || (p.failed ? 'Nama lokasi tidak terdeteksi' : '—'));

// =====================================================================
// LOKASI: peta · titik per titik · (tab tambahan, mis. riwayat jalur)
// =====================================================================
export function LocationPage({ devices, extra = [], tab }) {
  const [i, setI] = useState(0);
  if (!devices.length) return <Empty title="Belum ada device" text="Device muncul di sini setelah dihubungkan oleh administrator." />;
  const d = devices[Math.min(i, devices.length - 1)];
  const map = <MapTab key={d.id} d={d} />;
  return <>
    <div className="location-summary"><div><MapPin size={15} /> Perangkat yang dipantau</div>
      <select value={Math.min(i, devices.length - 1)} onChange={e => setI(+e.target.value)}>{devices.map((m, n) => <option key={m.id} value={n}>{m.label || m.name}{m.code ? ` (${m.code})` : ''}</option>)}</select></div>
    {extra.length === 0 ? map : <Tabs initial={tab} tabs={[
      { id: 'peta', label: 'Peta Lokasi', icon: MapPin, node: map },
      ...extra.map(x => ({ id: x.id, label: x.label, icon: x.icon, node: x.render(d) })),
    ]} />}
  </>;
}

function MapTab({ d }) {
  const { fetchPoints } = useStore();
  const me = useMyLocation();
  const place = usePlace(d.lat, d.lng), myPlace = usePlace(me.pos?.lat, me.pos?.lng);
  const dist = me.pos && d.lat != null ? haversineKm([me.pos.lat, me.pos.lng], [d.lat, d.lng]) : null;
  const [points, setPoints] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchPoints(d.id, null, 300).then(({ data }) => {
      if (!alive) return;
      setPoints((data || []).slice().reverse().map((p, i) => ({
        id: p.id, n: i + 1, lat: p.latitude, lng: p.longitude, at: fmtTime(p.recorded_at)
      })));
    });
    return () => { alive = false; };
  }, [d.id, d.lat, d.lng, fetchPoints]);
  return <div className="location-layout">
    <section className="panel location-map-card"><MapPanel large devices={[d]} points={points} me={me.pos} />
      <div className="map-legend"><span><i className="legend-green" /> Titik awal</span><span><i className="legend-blue" /> Jalur device</span><span><i className="legend-orange" /> Titik terbaru</span><span><i className="legend-me" /> Lokasi Anda</span></div></section>
    <section className="panel location-info"><Head title="Informasi Device" sub={d.label || d.name} />
      <div className="location-kpi"><small>Baterai</small><strong>{d.battery ?? '—'}<small> %</small></strong></div>
      {[['Koordinat', coord(d.lat, d.lng)], ['Nama lokasi', placeText(place)], ['GPS', d.gps], ['Koneksi', d.online ? 'Online' : 'Offline'], ['Update', d.updated]].map(([k, v]) => <div className="info-line" key={k}>{k}<b>{v || '—'}</b></div>)}
      {d.lat != null && <div className="loc-actions"><a className="btn btn-outline btn-small" href={mapsUrl(d.lat, d.lng)} target="_blank" rel="noreferrer"><ExternalLink size={13} /><span>Buka di Google Maps</span></a></div>}
      <div className="me-box">
        <div className="me-box-head"><b>Lokasi Anda</b><small>Deteksi lewat GPS / Wi-Fi browser</small></div>
        <button type="button" className="btn btn-outline btn-small" disabled={me.busy} onClick={me.locate}><LocateFixed size={13} /><span>{me.busy ? 'Mendeteksi…' : me.pos ? 'Deteksi ulang' : 'Deteksi lokasi saya'}</span></button>
        {me.err && <p className="me-error">{me.err}</p>}
        {me.pos && <div className="me-result">
          <div className="info-line">Koordinat<b>{coord(me.pos.lat, me.pos.lng)}</b></div>
          <div className="info-line">Nama lokasi<b>{placeText(myPlace)}</b></div>
          <div className="info-line">Akurasi<b>±{me.pos.acc} m</b></div>
          {dist != null && <div className="info-line">Jarak ke device<b>{jarak(dist * 1000)}</b></div>}
          {d.lat != null && <a className="btn btn-outline btn-small" href={routeUrl(d.lat, d.lng)} target="_blank" rel="noreferrer"><Navigation size={13} /><span>Rute ke device</span></a>}
        </div>}
      </div>
    </section></div>;
}

const RANGES = [['1 jam terakhir', 3600e3], ['6 jam terakhir', 6 * 3600e3], ['24 jam terakhir', 24 * 3600e3], ['7 hari terakhir', 7 * 24 * 3600e3], ['30 hari terakhir', 30 * 24 * 3600e3], ['Semua (maks. 500 titik)', null]];

export function PointsTab({ d }) {
  const { fetchPoints } = useStore();
  const [range, setRange] = useState(2), [sel, setSel] = useState(null), [tick, setTick] = useState(0);
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  useEffect(() => {
    let alive = true;
    fetchPoints(d.id, RANGES[range][1], 500).then(({ data, error }) => {
      if (alive) setState({ rows: (data || []).slice().reverse(), loading: false, error: error ? error.message : '' });
    });
    return () => { alive = false; };
  }, [d.id, d.lat, d.lng, range, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const pts = useMemo(() => state.rows.map((r, i, a) => ({
    id: r.id, n: i + 1, lat: r.latitude, lng: r.longitude, time: r.recorded_at, at: fmtTime(r.recorded_at),
    speed: r.speed, sat: r.satellites, hdop: r.accuracy, bat: r.battery, sig: r.signal,
    step: i ? haversineKm([a[i - 1].latitude, a[i - 1].longitude], [r.latitude, r.longitude]) * 1000 : 0,
  })), [state.rows]);
  const total = pts.reduce((s, p) => s + p.step, 0);
  const span = pts.length > 1 ? new Date(pts[pts.length - 1].time) - new Date(pts[0].time) : 0;
  const top = pts.reduce((m, p) => Math.max(m, Number(p.speed) || 0), 0);
  const active = pts.find(p => p.id === sel) || pts[pts.length - 1];
  const place = usePlace(active?.lat, active?.lng);
  const dur = span < 60000 ? '—' : span < 3600000 ? `${Math.round(span / 60000)} menit` : `${(span / 3600000).toFixed(1)} jam`;
  const exportCsv = () => downloadCSV(`titik-${d.code || d.name}.csv`,
    ['No', 'Waktu', 'Latitude', 'Longitude', 'Kecepatan (km/j)', 'Estimasi akurasi (m)', 'Satelit', 'Baterai (%)', 'Sinyal (dBm)', 'Jarak dari titik sebelumnya (m)'],
    pts.map(p => [p.n, fmtDateTime(p.time), p.lat, p.lng, p.speed, p.hdop, p.sat, p.bat, p.sig, Math.round(p.step)]));

  return <>
    <div className="toolbar"><div className="toolbar-left">
      <select value={range} onChange={e => { setState(s => ({ ...s, loading: true })); setRange(+e.target.value); }}>{RANGES.map(([l], n) => <option key={l} value={n}>{l}</option>)}</select>
      <Button variant="outline" small icon={RefreshCw} onClick={() => { setState(s => ({ ...s, loading: true })); setTick(t => t + 1); }}>Segarkan</Button></div>
      <Button variant="outline" small icon={Download} onClick={exportCsv}>Unduh CSV</Button></div>
    <div className="stats-strip"><span>Jumlah titik <b>{pts.length}</b></span><span>Total jarak <b>{jarak(total)}</b></span><span>Rentang waktu <b>{dur}</b></span><span>Kecepatan maks. <b>{top.toFixed(1)} km/j</b></span></div>
    {state.error && <div className="assign-info" style={{ marginBottom: 14 }}>Gagal memuat titik: {state.error}</div>}
    {!state.loading && !pts.length && !state.error
      ? <Empty title="Belum ada titik lokasi" text="Tidak ada data GPS pada rentang waktu ini. Coba perluas rentang atau tunggu device mengirim data." />
      : <div className="location-layout">
        <section className="panel location-map-card"><MapPanel large devices={[d]} points={pts} selected={sel} onSelect={setSel} />
          <div className="map-legend"><span><i className="legend-green" /> Titik awal</span><span><i className="legend-blue" /> Titik perjalanan</span><span><i className="legend-orange" /> Titik terbaru</span><span><i className="legend-line" /> Jalur</span></div></section>
        <section className="panel location-info"><Head title="Titik Lokasi" sub={state.loading ? 'Memuat…' : active ? `Titik ${active.n} dari ${pts.length} dipilih` : '—'} />
          {active && <div className="pt-detail">
            {[['Waktu', fmtDateTime(active.time)], ['Koordinat', coord(active.lat, active.lng)], ['Nama lokasi', placeText(place)], ['Kecepatan', active.speed != null ? `${Number(active.speed).toFixed(1)} km/j` : '—'], ['Satelit', active.sat ?? '—'], ['Estimasi akurasi', active.hdop != null ? `±${Number(active.hdop).toFixed(1)} m` : '—'], ['Baterai', active.bat != null ? `${Math.round(active.bat)}%` : '—'], ['Sinyal Wi-Fi', active.sig != null ? `${active.sig} dBm` : '—']].map(([k, v]) => <div className="info-line" key={k}>{k}<b>{v}</b></div>)}
            <a className="btn btn-outline btn-small" href={mapsUrl(active.lat, active.lng)} target="_blank" rel="noreferrer"><ExternalLink size={13} /><span>Buka di Google Maps</span></a>
          </div>}
          <div className="pt-list">{[...pts].reverse().map(p => <button type="button" key={p.id} className={`pt-row ${active?.id === p.id ? 'sel' : ''}`} onClick={() => setSel(p.id)}>
            <span className="pt-n">{p.n}</span>
            <span className="pt-main"><b>{fmtDateTime(p.time)}</b><small>{coord(p.lat, p.lng)}</small></span>
            <span className="pt-side">{p.speed != null ? `${Number(p.speed).toFixed(1)} km/j` : '—'}<br />{p.n > 1 ? `+${jarak(p.step)}` : 'Titik awal'}</span></button>)}</div>
        </section></div>}
  </>;
}

// Ringkasan perjalanan (tab "Riwayat Jalur" di halaman Lokasi user)
export function TrackTab({ d, runs, mode }) {
  return <>
    <section className="panel location-map-card" style={{ marginBottom: 16 }}><MapPanel large devices={[d]} route={d.trail} /></section>
    <section className="panel"><Head title="Perjalanan Terakhir" sub="Ringkasan dari device Anda" />
      {runs.length === 0 && <Empty title={mode === 'Running' ? 'Belum ada aktivitas' : 'Jalur ditampilkan di peta'} text={mode === 'Running' ? 'Rekam lari dari menu Running.' : 'Jalur dibentuk dari data GPS yang dikirim device Anda.'} />}
      {runs.slice(0, 5).map(r => <div className="trip-row" key={r.id}><div className="trip-icon"><Route size={16} /></div><div className="trip-copy"><b>{r.note || 'Running'}</b><small>{r.date}</small></div><div className="trip-metric"><b>{r.distance} km</b><small>{r.duration}</small></div></div>)}
    </section></>;
}

// =====================================================================
// CEK FUNGSIONAL: dashboard · baterai · koneksi · maps
// =====================================================================
const META = [['dashboard', 'Dashboard', LayoutDashboard], ['baterai', 'Baterai', BatteryMedium], ['koneksi', 'Koneksi', Wifi], ['maps', 'Maps', MapIcon]];
const ICON = { ok: CircleCheck, warn: TriangleAlert, fail: CircleX, run: Loader };
const LABEL = { ok: 'Baik', warn: 'Perlu perhatian', fail: 'Bermasalah', run: 'Memeriksa' };
const C = (status, msg) => ({ status, msg });
const worst = cs => (cs.some(c => c.status === 'fail') ? 'fail' : cs.some(c => c.status === 'warn') ? 'warn' : 'ok');

const testTiles = () => new Promise(res => { // apakah server peta OpenStreetMap bisa dijangkau dari browser ini
  const im = new Image(), t = setTimeout(() => res(false), 8000);
  im.onload = () => { clearTimeout(t); res(true); };
  im.onerror = () => { clearTimeout(t); res(false); };
  im.src = `https://tile.openstreetmap.org/2/2/1.png?t=${Date.now()}`;
});
const interval = s => (s < 90 ? `${Math.round(s)} dtk` : `${Math.round(s / 60)} menit`);

async function checkDevice(d, isLive, tilesOk) {
  const t0 = performance.now();
  const q = await supabase.from('gps_data').select('latitude,longitude,battery,signal,satellites,accuracy,recorded_at')
    .eq('device_id', d.id).order('recorded_at', { ascending: false }).limit(30);
  const ms = Math.round(performance.now() - t0), rows = q.data || [];
  const hb = await supabase.from('device_heartbeats').select('last_seen').eq('device_id', d.id).maybeSingle();

  // Dashboard: database terbaca + realtime tersambung + data masuk
  const live = isLive();
  const dashboard = q.error ? C('fail', `Database tidak dapat dibaca: ${q.error.message}`)
    : !rows.length ? C('warn', `Database merespons ${ms} ms, tetapi belum ada data GPS dari device ini.`)
      : !live ? C('warn', `Database merespons ${ms} ms, tetapi koneksi realtime belum tersambung — data baru butuh muat ulang halaman.`)
        : C('ok', `Data terbaca (${rows.length} titik terakhir), database ${ms} ms, realtime aktif.`);

  // Baterai: level + tren penurunan dari titik terakhir
  let baterai;
  if (d.battery == null) baterai = C('warn', 'Belum ada data baterai dari device. Pastikan sensor baterai terpasang di firmware.');
  else {
    const withBat = rows.filter(r => r.battery != null), a = withBat[0], b = withBat[withBat.length - 1];
    const hours = a && b ? (new Date(a.recorded_at) - new Date(b.recorded_at)) / 3.6e6 : 0;
    const rate = hours >= 1 / 6 ? (b.battery - a.battery) / hours : null; // %/jam, positif = menurun
    const trend = rate == null ? '' : rate > 0.5 ? ` Turun ±${rate.toFixed(1)}%/jam, perkiraan habis ±${(d.battery / rate).toFixed(1)} jam.` : rate < -0.5 ? ' Sedang mengisi daya.' : ' Level stabil.';
    baterai = C(d.battery < 20 ? 'fail' : d.battery < 40 ? 'warn' : 'ok', `Baterai ${d.battery}%${d.battery < 20 ? ' — rendah, segera isi daya.' : '.'}${trend}`);
  }

  // Koneksi: data terakhir (GPS atau heartbeat) + kekuatan sinyal + interval kirim
  const seen = Math.max(rows[0] ? +new Date(rows[0].recorded_at) : 0, hb.data?.last_seen ? +new Date(hb.data.last_seen) : 0);
  const age = Date.now() - seen;
  const gaps = rows.slice(0, -1).map((r, i) => (new Date(r.recorded_at) - new Date(rows[i + 1].recorded_at)) / 1000).filter(g => g > 0).sort((x, y) => x - y);
  const every = gaps.length ? ` Mengirim tiap ±${interval(gaps[Math.floor(gaps.length / 2)])}.` : '';
  const rssi = d.signal, sig = rssi == null ? '' : ` Sinyal Wi-Fi ${rssi} dBm (${rssi >= -70 ? 'kuat' : rssi >= -85 ? 'cukup' : 'lemah'}).`;
  let koneksi;
  if (!seen) koneksi = C('fail', 'Device belum pernah mengirim data. Periksa kode & kunci di firmware ESP32.');
  else if (age < 120000) koneksi = C(rssi != null && rssi < -85 ? 'warn' : 'ok', `Online — data terakhir ${ago(age).toLowerCase()}.${sig}${every}`);
  else if (age < 600000) koneksi = C('warn', `Terputus sementara — data terakhir ${ago(age).toLowerCase()}.${sig}`);
  else koneksi = C('fail', `Offline — data terakhir ${ago(age).toLowerCase()}. Periksa daya dan Wi-Fi device.`);

  // Maps: server peta + validitas koordinat + kualitas fix GPS
  const has = d.lat != null && d.lng != null;
  const valid = has && Math.abs(d.lat) <= 90 && Math.abs(d.lng) <= 180 && !(d.lat === 0 && d.lng === 0);
  let maps;
  if (!tilesOk) maps = C('fail', 'Peta OpenStreetMap tidak dapat dimuat. Periksa koneksi internet atau firewall.');
  else if (!has) maps = C('warn', 'Peta siap dimuat, tetapi device belum mengirim posisi.');
  else if (!valid) maps = C('fail', `Koordinat tidak valid (${coord(d.lat, d.lng)}). Biasanya GPS belum mendapat fix.`);
  else if (d.satellites != null && d.satellites < 4) maps = C('warn', `Peta dimuat, tetapi satelit hanya ${d.satellites} (kurang dari 4) — posisi kurang akurat.`);
  else {
    const hd = rows[0]?.accuracy != null ? Number(rows[0].accuracy) : null;
    maps = hd != null && hd > 15 ? C('warn', `Peta dimuat, posisi ${coord(d.lat, d.lng)}, tetapi estimasi akurasi ±${hd.toFixed(1)} m masih tinggi — bawa device ke area terbuka.`)
      : C('ok', `Peta dimuat, posisi ${coord(d.lat, d.lng)}${d.satellites != null ? `, ${d.satellites} satelit` : ''}.`);
  }
  return { dashboard, baterai, koneksi, maps };
}

export function FunctionalCheck({ devices }) {
  const { live } = useStore();
  const [res, setRes] = useState({}), [busy, setBusy] = useState(true), [at, setAt] = useState(null);
  const list = useRef(devices), liveRef = useRef(live);
  useEffect(() => { list.current = devices; liveRef.current = live; });
  const key = devices.map(d => d.id).join(',');
  const run = useCallback(async () => {
    setBusy(true);
    const tiles = await testTiles(), out = {};
    await Promise.all(list.current.map(async d => {
      try { out[d.id] = await checkDevice(d, () => liveRef.current, tiles); }
      catch (e) { out[d.id] = Object.fromEntries(META.map(([k]) => [k, C('fail', `Pengecekan gagal: ${e.message}`)])); }
    }));
    setRes(out); setAt(Date.now()); setBusy(false);
  }, []);
  useEffect(() => { run(); }, [key, run]);

  if (!devices.length) return <Empty title="Belum ada device" text="Tidak ada perangkat yang bisa diperiksa." />;
  const all = devices.flatMap(d => (res[d.id] ? Object.values(res[d.id]) : []));
  const n = s => all.filter(c => c.status === s).length;
  return <>
    <section className="panel check-top">
      <div className="check-counts"><span><i className="dot green-dot" /> Baik <b>{n('ok')}</b></span><span><i className="dot orange-dot" /> Perlu perhatian <b>{n('warn')}</b></span><span><i className="dot red-dot" /> Bermasalah <b>{n('fail')}</b></span></div>
      <small>{busy ? 'Sedang memeriksa…' : at ? `Diperiksa ${fmtTime(at)}` : ''}</small>
      <button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={run}><RefreshCw size={13} className={busy ? 'spin' : ''} /><span>Jalankan ulang</span></button>
    </section>
    <div className="check-grid">{devices.map(d => {
      const r = res[d.id], overall = r ? worst(Object.values(r)) : 'run';
      return <section className="panel check-card" key={d.id}>
        <Head title={d.label || d.name} sub={d.code} action={<Badge tone={overall === 'ok' ? 'green' : overall === 'warn' ? 'orange' : overall === 'fail' ? 'red' : 'gray'}>{LABEL[overall]}</Badge>} />
        {META.map(([k, label, Icon]) => {
          const c = r?.[k] || C('run', 'Memeriksa…'), St = ICON[c.status];
          return <div className={`check-row check-${c.status}`} key={k}>
            <span className="check-ico"><St size={16} className={c.status === 'run' ? 'spin' : ''} /></span>
            <div><b><Icon size={13} /> {label}<em>{LABEL[c.status]}</em></b><p>{c.msg}</p></div></div>;
        })}
      </section>;
    })}</div>
  </>;
}

// =====================================================================
// LAPORAN PEMBELIAN ALAT
// =====================================================================
const SetupHint = () => <div className="assign-info" style={{ marginBottom: 16 }}>Tabel laporan pembelian belum dibuat. Jalankan file <b>supabase/laporan_pembelian.sql</b> di Supabase &gt; SQL Editor, lalu muat ulang halaman ini.</div>;

export function AdminPurchases() {
  const { db, purchasesReady, savePurchase, deletePurchase, askConfirm } = useStore();
  const [q, setQ] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [mode, setMode] = useState(''), [f, setF] = useState(null);
  const modeOf = p => db.users.find(u => u.id === p.buyerId)?.mode || '—';
  const rows = db.purchases.filter(p => (!q || `${p.deviceName} ${p.deviceCode} ${p.buyerName}`.toLowerCase().includes(q.toLowerCase()))
    && (!from || p.date >= from) && (!to || p.date <= to) && (!mode || modeOf(p) === mode));
  const active = rows.filter(p => p.status === 'Aktif');
  const sum = rows.reduce((s, p) => s + p.price, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthSum = rows.filter(p => p.date.startsWith(thisMonth)).reduce((s, p) => s + p.price, 0);
  const buyers = new Set(rows.map(p => p.buyerId || p.buyerName)).size;
  const fmtD = t => new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const exportCsv = () => downloadCSV(`laporan-pembelian-${new Date().toISOString().slice(0, 10)}.csv`,
    ['No', 'Tanggal', 'Kode Device', 'Nama Device', 'Pembeli', 'Mode', 'Harga (Rp)', 'Pembayaran', 'Status', 'Catatan'],
    rows.map((p, i) => [i + 1, p.date, p.deviceCode, p.deviceName, p.buyerName, modeOf(p), p.price, p.method, p.status, p.note]));
  return <>
    {!purchasesReady && <SetupHint />}
    <div className="print-only print-head"><h2>Laporan Pembelian Alat GeoTrack</h2><p>Dicetak {fmtDateTime(Date.now())}{from || to ? ` · Periode ${from || '…'} s/d ${to || '…'}` : ''}</p></div>
    <div className="stats-grid">
      <Stat icon={ReceiptText} label="Total Transaksi" value={rows.length} detail={`${active.length} aktif · ${rows.length - active.length} dilepas`} />
      <Stat icon={Wallet} label="Total Nilai" value={rupiah(sum)} detail="Sesuai filter" tone="green" />
      <Stat icon={CalendarDays} label="Bulan Ini" value={rupiah(monthSum)} detail="Transaksi bulan berjalan" tone="violet" />
      <Stat icon={Users} label="Jumlah Pembeli" value={buyers} detail="Pembeli unik" tone="orange" />
    </div>
    <div className="toolbar no-print"><div className="toolbar-left">
      <label className="search-field"><input placeholder="Cari device atau pembeli" value={q} onChange={e => setQ(e.target.value)} /></label>
      <input type="date" className="date-input" aria-label="Dari tanggal" value={from} onChange={e => setFrom(e.target.value)} />
      <input type="date" className="date-input" aria-label="Sampai tanggal" value={to} onChange={e => setTo(e.target.value)} />
      <select value={mode} onChange={e => setMode(e.target.value)}><option value="">Semua mode</option><option>Running</option><option>Rental</option></select></div>
      <div className="toolbar-left"><Button variant="outline" icon={Download} onClick={exportCsv}>Unduh CSV</Button><Button variant="outline" icon={Printer} onClick={() => window.print()}>Cetak</Button></div></div>
    {rows.length === 0 ? <Empty title="Belum ada pembelian" text={db.purchases.length ? 'Tidak ada transaksi yang cocok dengan filter.' : 'Pembelian tercatat otomatis saat Anda menghubungkan device ke user di menu Jual / Hubungkan Device.'} />
      : <Table head={['NO', 'TANGGAL', 'DEVICE', 'PEMBELI', 'MODE', 'HARGA', 'PEMBAYARAN', 'STATUS', '']}>
        {rows.map((p, i) => <tr key={p.id}><td>{i + 1}</td><td>{fmtD(p.date)}</td>
          <td><div className="table-primary"><span><b>{p.deviceName}</b><small>{p.deviceCode}</small></span></div></td>
          <td><b>{p.buyerName}</b></td><td>{modeOf(p)}</td><td><b>{rupiah(p.price)}</b></td><td>{p.method}</td>
          <td><Badge tone={p.status === 'Aktif' ? 'green' : 'gray'}>{p.status}</Badge></td>
          <td className="no-print"><button className="row-action" title="Edit" onClick={() => setF({ ...p })}><Pencil size={15} /></button>
            <button className="row-action" title="Hapus" onClick={() => askConfirm({ title: 'Hapus catatan pembelian?', text: `Hapus catatan ${p.deviceName} oleh ${p.buyerName}?`, confirmText: 'Hapus catatan', danger: true, onConfirm: () => deletePurchase(p.id) })}><Trash2 size={15} /></button></td></tr>)}
      </Table>}
    {rows.length > 0 && <div className="report-total"><span>Total {rows.length} transaksi</span><b>{rupiah(sum)}</b></div>}
    {f && <Modal title="Edit Catatan Pembelian" onClose={() => setF(null)}>
      <form className="modal-form" onSubmit={async e => { e.preventDefault(); if (await savePurchase(f)) setF(null); }}>
        <div className="assign-info">{f.deviceName} ({f.deviceCode}) · pembeli {f.buyerName}</div>
        <Field label="Tanggal pembelian"><input required type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Harga (Rp)"><input required type="number" min="0" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Metode pembayaran"><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Lainnya</option></select></Field>
        <Field label="Catatan"><textarea rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
        <div className="modal-actions"><Button variant="outline" onClick={() => setF(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form></Modal>}
  </>;
}

// Bukti pembelian milik user sendiri (tab "Pembelian" di halaman Device Saya)
export function MyPurchases() {
  const { db, me, purchasesReady } = useStore();
  const rows = db.purchases.filter(p => p.buyerId === me.id);
  const fmtD = t => new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  if (!purchasesReady) return <Empty title="Belum tersedia" text="Riwayat pembelian akan tampil setelah administrator mengaktifkan laporan pembelian." />;
  if (!rows.length) return <Empty title="Belum ada catatan pembelian" text="Pembelian device Anda akan tercatat di sini setelah administrator menghubungkan device ke akun Anda." />;
  return <>
    <div className="print-only print-head"><h2>Bukti Pembelian GeoTrack</h2><p>{me.name} · dicetak {fmtDateTime(Date.now())}</p></div>
    <div className="toolbar no-print"><div className="stats-strip" style={{ margin: 0 }}><span>Total pembelian <b>{rows.length}</b></span><span>Total nilai <b>{rupiah(rows.reduce((s, p) => s + p.price, 0))}</b></span></div>
      <Button variant="outline" icon={Printer} onClick={() => window.print()}>Cetak</Button></div>
    <Table head={['DEVICE', 'TANGGAL', 'HARGA', 'PEMBAYARAN', 'STATUS', 'CATATAN']}>
      {rows.map(p => <tr key={p.id}><td><div className="table-primary"><span><b>{p.deviceName}</b><small>{p.deviceCode}</small></span></div></td><td>{fmtD(p.date)}</td><td><b>{rupiah(p.price)}</b></td><td>{p.method}</td>
        <td><Badge tone={p.status === 'Aktif' ? 'green' : 'gray'}>{p.status}</Badge></td><td>{p.note || '—'}</td></tr>)}
    </Table></>;
}