import { useState } from 'react';
import RealMap from './RealMap.jsx';
import { X, Database, CarFront, Bike, Footprints, CircleCheck, TriangleAlert } from 'lucide-react';
export const Badge = ({ children, tone = 'gray' }) => <span className={`badge badge-${tone}`}><i />{children}</span>;
export const Button = ({ children, variant = 'primary', icon: I, onClick, type = 'button', small, disabled = false }) =>
  <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${small ? 'btn-small' : ''}`}>{I && <I size={15} />}<span>{children}</span></button>;
export const Stat = ({ icon: I, label, value, detail, tone = 'blue' }) =>
  <div className="stat-card"><div className={`stat-icon stat-${tone}`}><I size={19} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>;
export const Empty = ({ title, text }) => <div className="empty-state"><div className="empty-icon"><Database size={23} /></div><h3>{title}</h3><p>{text}</p></div>;
export const Panel = ({ title, sub, action, children }) =>
  <section className="panel section-spaced"><div className="panel-heading"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
export const Modal = ({ title, onClose, children, compact = false, wide = false }) =>
  <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className={`modal-card ${compact ? 'modal-compact' : ''} ${wide ? 'modal-wide' : ''}`}>
    <div className="modal-head"><div><h3>{title}</h3><p>GeoTrack</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
export const Field = ({ label, children }) => <label>{label}{children}</label>;
export const ConfirmModal = ({ title = 'Konfirmasi tindakan', text, confirmText = 'Lanjutkan', onClose, onConfirm, danger = false }) =>
  <Modal title={title} onClose={onClose} compact><div className="confirm-modal"><TriangleAlert size={30} /><p>{text}</p><div className="modal-actions"><Button variant="outline" onClick={onClose}>Batal</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmText}</Button></div></div></Modal>;
export const SuccessModal = ({ text, onClose }) =>
  <Modal title="Berhasil" onClose={onClose} compact><div className="confirm-modal success-modal"><CircleCheck size={34} /><p>{text}</p><div className="modal-actions"><Button onClick={onClose}>Tutup</Button></div></div></Modal>;
export const Table = ({ head, children }) =>
  <section className="panel table-panel"><div className="table-wrap"><table><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>;
// Banner khusus mode: Rental = biru + kendaraan, Running = hijau + pelari
export const ModeBanner = ({ mode, title, text }) => (
  <div className="mode-card" style={{ marginBottom: 18, cursor: 'default' }}>
    <div className={`mode-card-art ${mode === 'Rental' ? 'rental-art' : 'running-art'}`}>
      {mode === 'Rental' ? <><CarFront size={46} /><Bike size={38} /></> : <Footprints size={56} />}
    </div>
    <div className="mode-card-body"><div className="mode-title"><h3>{title}</h3><Badge tone={mode === 'Rental' ? 'blue' : 'green'}>Mode {mode}</Badge></div><p>{text}</p></div>
  </div>
);

export const MapPanel = ({ large, ...mapProps }) => (
  <div className={`map-panel ${large ? 'map-large' : ''}`}><RealMap {...mapProps} /></div>
);

// Tab dalam satu halaman. tabs: [{ id, label, icon, badge, node }] · initial: id tab yang dibuka lebih dulu
export function Tabs({ tabs, initial }) {
  const [t, setT] = useState(tabs.some(x => x.id === initial) ? initial : tabs[0].id);
  const cur = tabs.find(x => x.id === t) || tabs[0];
  return <>
    <div className="tabs" role="tablist">{tabs.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === cur.id} className={`tab ${x.id === cur.id ? 'active' : ''}`} onClick={() => setT(x.id)}>
      {x.icon && <x.icon size={15} />}<span>{x.label}</span>{x.badge > 0 && <i className="tab-badge">{x.badge}</i>}</button>)}</div>
    {cur.node}
  </>;
}