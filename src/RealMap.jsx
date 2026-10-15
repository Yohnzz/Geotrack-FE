import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Circle, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { validCoord } from './services/geo.js';

// divIcon dipakai agar tidak bergantung pada file gambar marker bawaan Leaflet (bermasalah di Vite)
const pin = online => L.divIcon({
  className: '', iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<div style="width:30px;height:30px;border-radius:50%;background:${online ? '#2563eb' : '#94a3b8'};border:3px solid #fff;box-shadow:0 2px 8px #0f172a55;display:grid;place-items:center"><div style="width:8px;height:8px;background:#fff;border-radius:50%"></div></div>`
});
const ICONS = { on: pin(true), off: pin(false) };
const MAX_PERMANENT_LABELS = 30; // armada rental hingga puluhan unit tetap menampilkan label alias permanent

function Controller({ points, fitKey, follow, route, trace, traceKey, selLat, selLng, me, fitAll, focusKey, fLat, fLng }) {
  const map = useMap();
  useEffect(() => { // tombol "Lihat semua": paskan peta ke seluruh marker
    if (!fitAll) return;
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAll]);
  useEffect(() => { // pusatkan ke satu device yang dipilih
    if (focusKey && fLat != null) map.flyTo([fLat, fLng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  useEffect(() => { // sesuaikan tampilan saat daftar device berubah
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  useEffect(() => { // tampilkan seluruh titik riwayat saat daftar titik berubah
    if (trace.length > 1) map.fitBounds(trace, { padding: [40, 40], maxZoom: 17 });
    else if (trace.length === 1) map.setView(trace[0], 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceKey]);
  useEffect(() => { if (selLat != null) map.flyTo([selLat, selLng], Math.max(map.getZoom(), 17), { duration: 0.6 }); }, [selLat, selLng, map]);
  useEffect(() => { // lokasi pengguna terdeteksi -> tampilkan bersama posisi device
    if (!me) return;
    const all = [...points, me];
    if (all.length > 1) map.fitBounds(all, { padding: [50, 50], maxZoom: 16 });
    else map.setView(me, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.[0], me?.[1]]);
  const followPoint = route.length ? route[route.length - 1] : points[0];
  const followLat = followPoint?.[0] ?? null, followLng = followPoint?.[1] ?? null;
  useEffect(() => {
    if (follow && followLat != null && followLng != null) map.panTo([followLat, followLng]);
  }, [follow, followLat, followLng, map]);
  return null;
}

// devices: [{id,name,lat,lng,online,battery}] · route: [[lat,lng],...] · follow: ikuti titik terbaru
// points: titik riwayat [{id,n,lat,lng,at}] urut dari terlama · selected: id titik terpilih · onSelect(id)
// me: lokasi pengguna {lat,lng,acc}
// fitAll: angka yang dinaikkan untuk memaksa peta menampilkan semua marker · focus: { id, n } pusatkan ke device id
export default function RealMap({ devices = [], route = [], follow = false, points = [], selected = null, onSelect, me = null, onDeviceClick = null, labels = true, fitAll = 0, focus = null }) {
  const withPos = devices.filter(d => validCoord(d.lat, d.lng)); // koordinat tidak valid tidak dibuatkan marker
  const many = withPos.length > MAX_PERMANENT_LABELS;
  const fd = focus ? withPos.find(d => d.id === focus.id) : null;
  const pts = withPos.map(d => [d.lat, d.lng]);
  const trace = points.map(p => [p.lat, p.lng]);
  const sel = points.find(p => p.id === selected);
  const last = points.length - 1;
  return <MapContainer center={pts[0] || [-2.5, 118]} zoom={pts[0] ? 13 : 5} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
    <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 4 }} />}
    {route.length > 0 && <CircleMarker center={route[route.length - 1]} radius={7}
      pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
      <Tooltip direction="top" offset={[0, -8]}>Posisi GPS saat ini</Tooltip></CircleMarker>}
    {trace.length > 1 && <Polyline positions={trace} pathOptions={{ color: '#60a5fa', weight: 3, opacity: 0.8 }} />}
    {points.map((p, i) => {
      const edge = i === 0 ? '#16a34a' : i === last ? '#ea580c' : '#2563eb';
      return <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={i === 0 || i === last ? 7 : 5}
        pathOptions={{ color: '#fff', weight: 2, fillColor: edge, fillOpacity: 1 }} eventHandlers={{ click: () => onSelect?.(p.id) }} />;
    })}
    {sel && <CircleMarker key={'sel' + sel.id} center={[sel.lat, sel.lng]} radius={11} pathOptions={{ color: '#f59e0b', weight: 3, fillColor: '#fde68a', fillOpacity: 0.9 }}>
      <Tooltip permanent direction="top" offset={[0, -10]}>Titik {sel.n} · {sel.at}</Tooltip></CircleMarker>}
    {withPos.map(d => {
      const aliasLabel = ((d.alias || d.label || d.name || '').trim()).slice(0, 10);
      return <Marker key={`${d.id}:${many ? 'h' : 'p'}`} position={[d.lat, d.lng]} icon={d.online ? ICONS.on : ICONS.off} eventHandlers={onDeviceClick ? { click: () => onDeviceClick(d.id) } : undefined}>
        {labels && <Tooltip permanent={!many} direction="top" offset={[0, -16]} className="vehicle-tip">{aliasLabel}</Tooltip>}
        {!onDeviceClick && <Popup><b>{aliasLabel}</b><br />{d.online ? 'Online' : 'Offline · lokasi terakhir'} · Baterai {d.battery != null ? `${d.battery}%` : '—'}</Popup>}</Marker>;
    })}
    {me && <>
      {me.acc > 0 && <Circle center={[me.lat, me.lng]} radius={me.acc} pathOptions={{ color: '#7c3aed', weight: 1, fillColor: '#8b5cf6', fillOpacity: 0.12 }} />}
      <CircleMarker center={[me.lat, me.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#7c3aed', fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -8]}>Lokasi Anda (±{me.acc} m)</Tooltip></CircleMarker>
    </>}
    <Controller points={pts} fitKey={withPos.map(d => d.id).join(',')} follow={follow} route={route}
      trace={trace} traceKey={points.length ? `${points[0].id}:${points[last].id}:${points.length}` : ''}
      selLat={sel?.lat ?? null} selLng={sel?.lng ?? null} me={me ? [me.lat, me.lng] : null}
      fitAll={fitAll} focusKey={focus?.n ?? 0} fLat={fd?.lat ?? null} fLng={fd?.lng ?? null} />
  </MapContainer>;
}