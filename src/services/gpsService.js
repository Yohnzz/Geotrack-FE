import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store.jsx';

// Posisi dan baterai dibaca dari gps_data; status online berasal dari heartbeat lewat store.
// Hook ini hanya menambahkan jejak (trail) tiap device.
export function useLivePositions(devices) {
  const { trails } = useStore();
  return devices.map(d => ({ ...d, trail: trails[d.id] || [] }));
}

export const haversineKm = ([a, b], [c, d]) => {
  const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
export const pathKm = pts => pts.reduce((s, p, i) => i ? s + haversineKm(pts[i - 1], p) : 0, 0);

// ---------- format & utilitas ----------
export const ago = ms => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Baru saja';
  if (m < 60) return `${m} menit lalu`;
  if (m < 1440) return `${Math.floor(m / 60)} jam lalu`;
  return `${Math.floor(m / 1440)} hari lalu`;
};
export const fmtDateTime = t => new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const fmtTime = t => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const rupiah = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
export const coord = (lat, lng) => (lat != null && lng != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : '—');
export const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const routeUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function downloadCSV(filename, head, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\ufeff' + [head, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- deteksi nama lokasi (reverse geocoding, OpenStreetMap Nominatim) ----------
// Koordinat dibulatkan ±10 m sebagai kunci cache, permintaan diberi jeda 1,1 detik sesuai kebijakan Nominatim.
const STORE_KEY = 'geotrack:places';
const memory = new Map();
let lastCall = 0;
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } };
const writeStore = (k, v) => {
  try {
    const all = readStore(), keys = Object.keys(all);
    if (keys.length > 400) keys.slice(0, 100).forEach(x => delete all[x]);
    all[k] = v;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch { /* penyimpanan penuh / dinonaktifkan: abaikan */ }
};
const placeKey = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
const shortName = j => {
  const a = j.address || {};
  const parts = [a.road || a.pedestrian || a.footway || a.neighbourhood || a.amenity, a.suburb || a.village || a.hamlet, a.city || a.town || a.municipality || a.county];
  const out = [...new Set(parts.filter(Boolean))].join(', ');
  return out || j.display_name || '';
};

export function reverseGeocode(lat, lng) {
  const k = placeKey(lat, lng);
  if (memory.has(k)) return memory.get(k);
  const saved = readStore()[k];
  if (saved) { const p = Promise.resolve(saved); memory.set(k, p); return p; }
  const p = (async () => {
    const wait = Math.max(0, lastCall + 1100 - Date.now());
    lastCall = Date.now() + wait;
    if (wait) await new Promise(r => setTimeout(r, wait));
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=id&lat=${lat}&lon=${lng}`);
    if (!res.ok) throw new Error('Layanan nama lokasi tidak merespons');
    const j = await res.json();
    if (j.error) throw new Error('Nama lokasi tidak ditemukan');
    const v = { name: shortName(j), full: j.display_name || '' };
    writeStore(k, v);
    return v;
  })().catch(e => { memory.delete(k); throw e; });
  memory.set(k, p);
  return p;
}

// Hook: nama tempat untuk sebuah koordinat -> { text, full, loading, failed }
export function usePlace(lat, lng) {
  const k = lat == null || lng == null ? '' : placeKey(lat, lng);
  const [s, setS] = useState({ k: '', text: '', full: '', failed: false });
  useEffect(() => {
    if (!k) return undefined;
    let alive = true;
    const [a, b] = k.split(',').map(Number);
    reverseGeocode(a, b)
      .then(r => alive && setS({ k, text: r.name, full: r.full, failed: false }))
      .catch(() => alive && setS({ k, text: '', full: '', failed: true }));
    return () => { alive = false; };
  }, [k]);
  if (!k) return { text: '', full: '', loading: false, failed: false };
  return s.k === k ? { ...s, loading: false } : { text: '', full: '', loading: true, failed: false };
}

// ---------- deteksi lokasi pengguna lewat GPS/Wi-Fi browser ----------
export function useMyLocation() {
  const [pos, setPos] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const locate = useCallback(() => {
    if (!window.isSecureContext) return setErr('Deteksi lokasi butuh koneksi HTTPS (atau localhost).');
    if (!('geolocation' in navigator)) return setErr('Browser ini tidak mendukung deteksi lokasi.');
    setBusy(true);
    setErr('');
    navigator.geolocation.getCurrentPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: Date.now() }); setBusy(false); },
      e => {
        setErr(e.code === 1 ? 'Izin lokasi ditolak. Izinkan akses lokasi di pengaturan browser.' : e.code === 2 ? 'Lokasi perangkat tidak tersedia saat ini.' : 'Deteksi lokasi melewati batas waktu, coba lagi.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);
  return { pos, err, busy, locate };
}
