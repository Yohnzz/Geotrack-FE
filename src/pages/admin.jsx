import { useEffect, useState } from 'react';
import { Users, Smartphone, Package, MessageSquare, Plus, Pencil, Trash2, Link2, Unlink, KeyRound, CircleCheck, Copy, Check, Info, Eye } from 'lucide-react';
import { LocationPage } from './features.jsx';
import { useStore } from '../store.jsx';
import { Badge, Button, Stat, Panel, Modal, Field, Table, Empty, MapPanel } from '../ui.jsx';
import { useLivePositions } from '../services/gpsService.js';

const modeTone = m => (m === 'Rental' ? 'violet' : 'green');
const autoDeviceCode = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const value = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xffffffff);
  return `GT-${stamp}-${value.toString(16).toUpperCase().padStart(8, '0')}`;
};

export function AdminDashboard() {
  const { db, me } = useStore();
  const sold = db.devices.filter(d => d.sale === 'Terjual').length;
  const live = useLivePositions(db.devices);
  const low = db.devices.filter(d => d.battery != null && d.battery < 20);
  const people = db.users.filter(u => u.role === 'user');
  return <>
    <div className="page-welcome"><div><div className="eyebrow">ADMIN OVERVIEW</div><h2>Selamat datang, {me.name} <span>👋</span></h2><p>Pantau user, perangkat, dan penjualan GeoTrack.</p></div></div>
    <div className="stats-grid">
      <Stat icon={Users} label="Total User" value={people.length} detail={`${people.filter(u => u.mode === 'Rental').length} Rental · ${people.filter(u => u.mode === 'Running').length} Running`} />
      <Stat icon={Smartphone} label="Total Device" value={db.devices.length} detail={`${sold} terjual · ${db.devices.filter(d => d.online).length} online`} tone="violet" />
      <Stat icon={Package} label="Device Tersedia" value={db.devices.length - sold} detail="Siap dijual" tone="green" />
      <Stat icon={MessageSquare} label="Pengaduan Aktif" value={db.tickets.filter(t => t.status !== 'Selesai').length} detail="Perlu ditinjau" tone="orange" />
    </div>
    <Panel title="Lokasi Semua Perangkat" sub="Posisi terakhir dari data GPS"><MapPanel devices={live} /></Panel>
    <Panel title="Baterai Rendah" sub="Device dengan baterai di bawah 20%">
      {low.map(d => <div key={d.id} className="activity-row"><b>{d.name}</b><Badge tone="red">{d.battery}%</Badge></div>)}
      {low.length === 0 && <Empty title="Aman" text="Tidak ada device baterai rendah." />}
    </Panel>
  </>;
}

export function AdminUsers() {
  const { db, me, saveUser, deleteUser, askConfirm } = useStore();
  const [f, setF] = useState(null);
  const blank = { name: '', username: '', email: '', password: '', phone: '', role: 'user', mode: 'Running' };
  const submit = async e => { e.preventDefault(); if (await saveUser(f)) setF(null); };
  return <>
    <div className="toolbar"><div /><Button icon={Plus} onClick={() => setF(blank)}>Tambah User</Button></div>
    {db.users.length === 0 ? <Empty title="Belum ada user" text="Tambahkan user pertama." /> :
      <Table head={['NAMA', 'EMAIL', 'ROLE / MODE', 'DEVICE', '']}>
        {db.users.map(u => <tr key={u.id}><td><div className="table-primary"><span className="user-table-avatar">{u.name.slice(0, 2).toUpperCase()}</span><span><b>{u.name}</b><small>@{u.username}{u.phone ? ` · ${u.phone}` : ''}</small></span></div></td><td>{u.email}</td>
          <td>{u.role === 'admin' ? <Badge tone="blue">Admin</Badge> : <Badge tone={modeTone(u.mode)}>{u.mode}</Badge>}</td>
          <td>{db.devices.filter(d => d.ownerId === u.id).map(d => d.name).join(', ') || '—'}</td>
          <td><button className="row-action" onClick={() => setF({ ...u, password: '' })}><Pencil size={15} /></button>
            {u.id !== me.id && <button className="row-action" onClick={() => askConfirm({ title: 'Hapus user?', text: `Hapus ${u.name}? Listing, riwayat running, dan akses loginnya ikut terhapus.`, confirmText: 'Hapus user', danger: true, onConfirm: () => deleteUser(u.id) })}><Trash2 size={15} /></button>}</td></tr>)}
      </Table>}
    {f && <Modal title={f.id ? 'Edit User' : 'Tambah User'} onClose={() => setF(null)}>
      <form className="modal-form" onSubmit={submit}>
        <Field label="Nama lengkap"><input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Username"><input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" title="Huruf, angka, titik, atau underscore" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="Email"><input required type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={f.id ? 'Password baru (kosongkan jika tidak diubah)' : 'Password (min. 6 karakter)'}><input type="text" autoComplete="new-password" required={!f.id} minLength={f.password ? 6 : undefined} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Telepon"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Role"><select value={f.role} disabled={f.id === me.id} onChange={e => setF({ ...f, role: e.target.value })}><option value="user">User</option><option value="admin">Admin</option></select></Field>
        {f.role === 'user' && <Field label="Mode akun"><select value={f.mode || 'Running'} onChange={e => setF({ ...f, mode: e.target.value })}><option value="Running">Running — pelacak lari</option><option value="Rental">Rental — menyewakan alat GPS</option></select></Field>}
        <div className="modal-actions"><Button variant="outline" onClick={() => setF(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form></Modal>}
  </>;
}

function KeyBox({ id }) {
  const { deviceKey } = useStore();
  const [k, setK] = useState('');
  useEffect(() => { deviceKey(id).then(setK); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="assign-info" style={{ wordBreak: 'break-all' }}><KeyRound size={13} style={{ verticalAlign: -2 }} /> Kunci ESP32 (rahasia): <b>{k || '…'}</b></div>;
}

export function AdminDevices() {
  const { db, saveDevice, deleteDevice, deviceKey, askConfirm } = useStore();
  const [f, setF] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState('');
  const owner = id => db.users.find(u => u.id === id)?.name || '—';
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(''); }
  };
  const showEspConfig = async d => {
    const key = await deviceKey(d.id);
    setCopied('');
    setCreated({ code: d.code, key: key || '' });
  };
  const submit = async e => {
    e.preventDefault();
    const result = await saveDevice(f);
    if (!result) return;
    if (f.id) { setF(null); return; }
    const key = await deviceKey(result.id);
    setF(null);
    setCreated({ code: result.device_code, key: key || '' });
  };
  return <>
    <div className="toolbar"><div /><Button icon={Plus} onClick={() => setF({ code: autoDeviceCode(), name: '', notes: '' })}>Tambah Device</Button></div>
    {db.devices.length === 0 ? <Empty title="Belum ada device" text="Tambahkan device, lalu isi kode dan kuncinya di firmware ESP32." /> :
      <Table head={['DEVICE', 'PEMILIK', 'KONEKSI', 'BATERAI', 'PENJUALAN', '']}>
        {db.devices.map(d => <tr key={d.id}><td><div className="table-primary"><span className="table-device-icon"><Smartphone size={17} /></span><span><b>{d.name}</b><small>{d.code}</small></span></div></td><td>{owner(d.ownerId)}</td>
          <td><Badge tone={d.online ? 'green' : 'red'}>{d.online ? 'Online' : 'Offline'}</Badge></td><td>{d.battery != null ? `${d.battery}%` : '—'}</td>
          <td><Badge tone={d.sale === 'Terjual' ? 'blue' : 'gray'}>{d.sale}</Badge></td>
          <td><button className="row-action" title="Lihat konfigurasi ESP32" onClick={() => showEspConfig(d)}><Eye size={15} /></button>
            <button className="row-action" title="Edit device" onClick={() => setF({ ...d })}><Pencil size={15} /></button>
            <button className="row-action" onClick={() => askConfirm({ title: 'Hapus device?', text: `Hapus ${d.name}? Seluruh data GPS-nya ikut terhapus.`, confirmText: 'Hapus device', danger: true, onConfirm: () => deleteDevice(d.id) })}><Trash2 size={15} /></button></td></tr>)}
      </Table>}
    {f && <Modal title={f.id ? 'Edit Device' : 'Tambah Device'} onClose={() => setF(null)}>
      <form className="modal-form" onSubmit={submit}>
        <Field label="Nama"><input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Catatan (opsional)"><textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        {f.id && <KeyBox id={f.id} />}
        <div className="modal-actions"><Button variant="outline" onClick={() => setF(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form></Modal>}
    {created && <Modal title="Device berhasil ditambahkan" onClose={() => { setCreated(null); setCopied(''); }}>
      <div className="device-created">
        <div className="device-created-title"><CircleCheck size={27} /><div><b>ID device siap dipakai</b><small>Salin konfigurasi ini ke ESP32 Anda.</small></div></div>
        <div className="device-id-box"><small>ID DEVICE</small><strong>{created.code}</strong></div>
        <div className="assign-info"><Info size={14} /> ID dan kunci harus sama persis dengan konfigurasi firmware agar ESP32 dapat mengirim titik GPS.</div>
        <div className="firmware-box"><small>Arduino — config.h</small><code>{`#define DEVICE_CODE "${created.code}"\n#define DEVICE_KEY "${created.key || 'ambil dari Edit Device'}"`}</code><small>MicroPython — boot.py</small><code>{`DEVICE_CODE = "${created.code}"\nDEVICE_KEY = "${created.key || 'ambil dari Edit Device'}"`}</code></div>
        <div className="modal-actions"><Button variant="outline" icon={copied === 'id' ? Check : Copy} onClick={() => copy(created.code, 'id')}>{copied === 'id' ? 'ID tersalin' : 'Salin ID'}</Button><Button icon={copied === 'config' ? Check : Copy} onClick={() => copy(`#define DEVICE_CODE "${created.code}"\n#define DEVICE_KEY "${created.key}"`, 'config')}>{copied === 'config' ? 'Konfigurasi tersalin' : 'Salin config.h'}</Button></div>
      </div>
    </Modal>}
  </>;
}

export function AdminAssign() {
  const { db, assign, askConfirm } = useStore();
  const blank = { deviceId: '', userId: '', price: '', date: new Date().toISOString().slice(0, 10), method: 'Transfer', note: '' };
  const [f, setF] = useState(blank);
  const free = db.devices.filter(d => d.sale === 'Tersedia');
  const users = db.users.filter(u => u.role === 'user');
  const sold = db.devices.filter(d => d.ownerId);
  const picked = users.find(u => u.id === f.userId);
  return <>
    <div className="assign-intro panel"><div className="assign-intro-icon"><Link2 size={20} /></div><div><h3>Jual & hubungkan device ke user</h3><p>Mode (Running/Rental) ditentukan saat akun dibuat. Device yang dihubungkan akan muncul di dashboard user tersebut.</p></div></div>
    <div className="assign-grid">
      <section className="panel assign-form-panel"><div className="panel-heading"><div><h3>Form penjualan</h3><p>Hanya device berstatus tersedia</p></div></div>
        <form className="modal-form" style={{ padding: '0 18px' }} onSubmit={async e => { e.preventDefault(); if (await assign(f.deviceId, f.userId, f)) setF(blank); }}>
          <Field label="Device"><select required value={f.deviceId} onChange={e => setF({ ...f, deviceId: e.target.value })}><option value="">Pilih device</option>{free.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}</select></Field>
          <Field label="User pembeli"><select required value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })}><option value="">Pilih user</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.mode}</option>)}</select></Field>
          {picked && <div className="assign-info">Akun ini bermode <b>{picked.mode}</b>. {picked.mode === 'Rental' ? 'Device bisa disewakan ke orang lain.' : 'Device dipakai untuk merekam lari.'}</div>}
          <Field label="Harga pembelian (Rp)"><input required type="number" min="0" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} placeholder="0" /></Field>
          <Field label="Tanggal pembelian"><input required type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Metode pembayaran"><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Lainnya</option></select></Field>
          <Field label="Catatan (opsional)"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
          <Button type="submit" icon={Link2}>Hubungkan Device</Button>
        </form></section>
      <section className="panel"><div className="panel-heading"><div><h3>Sudah terhubung</h3><p>{sold.length} device</p></div></div>
        {sold.length === 0 && <Empty title="Belum ada" text="Belum ada device yang dihubungkan." />}
        {sold.map(d => { const u = db.users.find(x => x.id === d.ownerId); return <div className="assigned-row" key={d.id}><span className="table-device-icon"><Smartphone size={17} /></span><div><b>{d.name}</b><small>{u?.name}</small></div><Badge tone={u?.mode === 'Rental' ? 'blue' : 'green'}>{u?.mode}</Badge>
          <button className="row-action" title="Lepas device" onClick={() => askConfirm({ title: 'Lepas device?', text: `Lepas ${d.name} dari ${u?.name}? Listing sewanya ikut dihapus.`, confirmText: 'Lepas device', danger: true, onConfirm: () => assign(d.id, null) })}><Unlink size={15} /></button></div>; })}
      </section>
    </div></>;
}

export function AdminTickets() {
  const { db, replyTicket } = useStore();
  const [t, setT] = useState(null);
  const name = id => db.users.find(u => u.id === id)?.name || '—';
  return <>
    {db.tickets.length === 0 ? <Empty title="Belum ada pengaduan" text="Pengaduan dari user tampil di sini." /> :
      <Table head={['ID', 'USER', 'JUDUL', 'STATUS', '']}>
        {db.tickets.map(x => <tr key={x.id}><td>{x.code}</td><td>{name(x.userId)}</td><td>{x.title}</td>
          <td><Badge tone={x.status === 'Selesai' ? 'green' : x.status === 'Diproses' ? 'blue' : 'orange'}>{x.status}</Badge></td>
          <td><Button small variant="outline" onClick={() => setT({ ...x })}>Tanggapi</Button></td></tr>)}
      </Table>}
    {t && <Modal title={t.title} onClose={() => setT(null)}>
      <form className="modal-form" onSubmit={async e => { e.preventDefault(); if (await replyTicket(t.id, t.reply, t.status)) setT(null); }}>
        <p>{t.detail}</p>
        <Field label="Tanggapan"><textarea rows={3} value={t.reply} onChange={e => setT({ ...t, reply: e.target.value })} /></Field>
        <Field label="Status"><select value={t.status} onChange={e => setT({ ...t, status: e.target.value })}><option>Baru</option><option>Diproses</option><option>Selesai</option></select></Field>
        <div className="modal-actions"><Button variant="outline" onClick={() => setT(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form></Modal>}
  </>;
}

export function AdminHistory() {
  const { db } = useStore();
  return <Panel title="History Aktivitas" sub="Semua perubahan tercatat">
    {db.logs.length === 0 && <Empty title="Belum ada aktivitas" text="Perubahan data akan tercatat di sini." />}
    {db.logs.map(l => <div className="activity-row" key={l.id}><div className="activity-copy"><b>{l.text}</b><small>{l.at}</small></div></div>)}
  </Panel>;
}

export function AdminLocation({ tab }) {
  const { db } = useStore();
  return <LocationPage devices={db.devices} tab={tab} />;
}
