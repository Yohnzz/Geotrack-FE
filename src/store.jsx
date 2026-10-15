import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { supabase } from './services/supabase.js';

// Semua data berasal dari Supabase. Hak akses dijaga oleh Row Level Security di database:
// - admin: semua data · user: hanya data miliknya · mode (Rental/Running) diatur admin.
const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const ONLINE_MS = 2 * 60 * 1000; // device online jika heartbeat diterima < 2 menit lalu
const EMPTY = {
  users: [],
  devices: [],
  latest: {},
  listings: [],
  requests: [],
  runs: [],
  tickets: [],
  logs: [],
  purchases: []
};
const hms = s =>
  [s / 3600, (s % 3600) / 60, s % 60]
    .map(n => String(Math.floor(n)).padStart(2, '0'))
    .join(':');
const ago = ms => {
  const m = Math.floor(ms / 60000);
  return m < 1
    ? 'Baru saja'
    : m < 60
      ? `${m} menit lalu`
      : m < 1440
        ? `${Math.floor(m / 60)} jam lalu`
        : `${Math.floor(m / 1440)} hari lalu`;
};
const fmtDate = t =>
  new Date(t).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export function StoreProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = memeriksa sesi
  const [raw, setRaw] = useState(EMPTY),
    [trails, setTrails] = useState({});
  const [status, setStatus] = useState('loading'),
    [error, setError] = useState('');
  const [live, setLive] = useState(false),
    [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const meRef = useRef(null);
  const purchasesOk = useRef(false); // tabel purchases ada (supabase/laporan_pembelian.sql sudah dijalankan)
  const [purchasesReady, setPurchasesReady] = useState(false);

  const toast = useCallback(
    (text, type = 'error') => setNotice({ text, type, k: Date.now() }),
    []
  );
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // ---------- sesi ----------
  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      console.log('GEO: mulai cek session');

      try {
        const { data, error } = await supabase.auth.getSession();

        console.log('GEO: hasil getSession', { data, error });

        if (error) throw error;

        if (mounted) {
          setSession(data.session ?? null);
          console.log(
            'GEO: session selesai',
            data.session ? 'ADA SESSION' : 'TIDAK ADA SESSION'
          );
        }
      } catch (e) {
        console.error('GEO: getSession ERROR', e);

        if (mounted) {
          setSession(null);
          setError(e.message || 'Gagal menghubungkan ke Supabase');
        }
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('GEO: auth berubah', _event, newSession);
      if (mounted) {
        setSession(newSession);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---------- muat data ----------
  const load = useCallback(async (uid) => {
    console.log('GEO: mulai load data', uid);

    const prof = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    console.log('GEO: profiles selesai', prof);

    if (prof.error) throw prof.error;
    if (!prof.data) {
      throw new Error('Akun ini belum memiliki profil. Hubungi administrator.');
    }

    console.log('GEO: profil ditemukan', prof.data);

    const admin = prof.data.role === 'admin';
    meRef.current = prof.data;
    const q = (t, col, asc = false) =>
      supabase.from(t).select('*').order(col, { ascending: asc });
    const r = await Promise.all([
      q('profiles', 'created_at', true),
      q('devices', 'device_code', true),
      supabase.from('device_latest').select('*'),
      q('listings', 'created_at'),
      q('rental_requests', 'created_at'),
      q('runs', 'started_at'),
      q('tickets', 'created_at'),
      admin ? q('activity_logs', 'created_at').limit(200) : Promise.resolve({ data: [] }),
    ]);
    const bad = r.find(x => x.error);
    if (bad) throw bad.error;
    const [users, devices, latest, listings, requests, runs, tickets, logs] =
      r.map(x => x.data);

    // laporan pembelian bersifat opsional: bila tabel belum dibuat, aplikasi tetap berjalan
    const pur = await supabase
      .from('purchases')
      .select('*')
      .order('purchased_at', { ascending: false })
      .order('created_at', { ascending: false });
    purchasesOk.current = !pur.error;
    setPurchasesReady(!pur.error);

    setRaw({
      users,
      devices,
      latest: Object.fromEntries(latest.map(l => [l.device_id, l])),
      listings,
      requests,
      runs,
      tickets,
      logs,
      purchases: pur.data || []
    });
    if (!admin && devices.length) {
      // jejak GPS terbaru untuk peta (hanya device milik user)
      const g = await supabase
        .from('gps_data')
        .select('device_id,latitude,longitude')
        .in(
          'device_id',
          devices.map(d => d.id)
        )
        .order('recorded_at', { ascending: false })
        .limit(1000);
      const t = {};
      (g.data || []).forEach(p => {
        (t[p.device_id] ||= []).unshift([p.latitude, p.longitude]);
      });
      setTrails(
        Object.fromEntries(
          Object.entries(t).map(([k, v]) => [k, v.slice(-300)])
        )
      );
    } else setTrails({});
    setStatus('ready');
    setError('');
  }, []);

  const reload = useCallback(async () => {
    if (!session?.user) return false;

    try {
      await load(session.user.id);
      return true;
    } catch (e) {
      console.error('Gagal reload:', e);
      toast(e.message || 'Gagal memuat data');
      return false;
    }
  }, [session, load, toast]);

  useEffect(() => {
    if (session === undefined) return;

    if (!session) {
      meRef.current = null;
      setRaw(EMPTY);
      setTrails({});
      setStatus('out');
      return;
    }

    setStatus('loading');
    setError('');

    load(session.user.id)
      .then(() => {
        setStatus('ready');
      })
      .catch(e => {
        console.error('Gagal memuat GeoTrack:', e);
        setError(e.message || 'Gagal memuat data');
        setStatus('error');
      });
  }, [session, load]);

  // ---------- realtime ----------
  useEffect(() => {
    if (status !== 'ready' || !session) return;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => load(session.user.id).catch(() => { }),
        400
      );
    };
    const ch = supabase.channel('geotrack-' + session.user.id);
    ['profiles', 'devices', 'listings', 'rental_requests', 'runs', 'tickets', 'activity_logs', ...(purchasesOk.current ? ['purchases'] : [])]
      .forEach(table =>
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
      );
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'device_heartbeats' }, refresh);
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_data' }, ({ new: p }) => {
      setRaw(s => {
        const o = s.latest[p.device_id];
        return !o || new Date(p.recorded_at) >= new Date(o.recorded_at)
          ? { ...s, latest: { ...s.latest, [p.device_id]: p } }
          : s;
      });
      setTrails(t =>
        meRef.current?.role === 'admin'
          ? t
          : {
            ...t,
            [p.device_id]: [
              ...(t[p.device_id] || []),
              [p.latitude, p.longitude]
            ].slice(-300)
          }
      );
    });
    ch.subscribe(st => setLive(st === 'SUBSCRIBED'));
    return () => {
      clearTimeout(timer);
      setLive(false);
      supabase.removeChannel(ch);
    };
  }, [status, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- data turunan untuk UI ----------
  const db = useMemo(
    () => ({
      users: raw.users.map(p => ({
        id: p.id,
        name: p.full_name,
        username: p.username,
        email: p.email,
        phone: p.phone || '',
        role: p.role,
        mode: p.mode
      })),
      devices: raw.devices.map(d => {
        const l = raw.latest[d.id];
        const seen = l ? new Date(l.recorded_at).getTime() : null;
        return {
          id: d.id,
          code: d.device_code,
          name: d.name,
          alias: d.alias || '',
          label: (d.alias || '').trim() || d.name,
          notes: d.notes || '',
          ownerId: d.owner_id,
          sale: d.sale_status,
          lat: l?.latitude ?? null,
          lng: l?.longitude ?? null,
          speed: l?.speed ?? null,
          satellites: l?.satellites ?? null,
          battery: l?.battery != null ? Math.round(Number(l.battery)) : null,
          signal: l?.signal ?? null,
          seenAt: seen,
          online: seen != null && now - seen < ONLINE_MS,
          gps:
            !l
              ? 'Belum ada data'
              : l.satellites != null && l.satellites < 4
                ? 'Lemah'
                : 'Aktif',
          location: l ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}` : '',
          updated: seen ? ago(now - seen) : ''
        };
      }),
      listings: raw.listings.map(l => ({
        id: l.id,
        ownerId: l.owner_id,
        deviceId: l.device_id,
        title: l.title,
        description: l.description || '',
        price: l.price_per_day,
        contactPhone: l.contact_phone || '',
        pickup: l.pickup_location || '',
        status: l.status
      })),
      requests: raw.requests.map(r => ({
        id: r.id,
        listingId: r.listing_id,
        renterName: r.renter_name,
        renterPhone: r.renter_phone,
        startDate: r.start_date,
        days: r.days,
        note: r.note || '',
        status: r.status,
        createdAt: r.created_at
      })),
      runs: raw.runs.map(r => ({
        id: r.id,
        userId: r.user_id,
        deviceId: r.device_id,
        date: fmtDate(r.started_at),
        startedAt: r.started_at,
        distance: Number(r.distance_km),
        duration: hms(r.duration_seconds),
        seconds: r.duration_seconds,
        note: r.note || '',
        route: r.route
      })),
      tickets: raw.tickets.map(t => ({
        id: t.id,
        code: t.id.slice(0, 6).toUpperCase(),
        userId: t.user_id,
        category: t.category,
        title: t.title,
        detail: t.detail,
        status: t.status,
        reply: t.reply || '',
        createdAt: t.created_at
      })),
      logs: raw.logs.map(l => ({
        id: l.id,
        at: new Date(l.created_at).toLocaleString('id-ID'),
        text: `${l.actor_name || 'Sistem'}: ${l.text}`
      })),
      purchases: raw.purchases.map(p => ({
        id: p.id,
        deviceId: p.device_id,
        deviceCode: p.device_code,
        deviceName: p.device_name,
        buyerId: p.buyer_id,
        buyerName: p.buyer_name,
        price: Number(p.price) || 0,
        date: p.purchased_at,
        method: p.payment_method,
        note: p.note || '',
        status: p.status,
        createdAt: p.created_at
      })),
    }),
    [raw, now]
  );

  const me = useMemo(() => {
    const p =
      meRef.current && raw.users.find(u => u.id === meRef.current.id);
    return p ? db.users.find(u => u.id === p.id) : null;
  }, [raw.users, db.users, status]); // mode dibaca dari data terbaru

  // ---------- aksi ----------
  const act = async (fn, ok) => {
    // jalankan perubahan; tampilkan pesan jika gagal
    try {
      const { error: e } = await fn();
      if (e) throw e;
      if (ok) toast(ok, 'ok');
      await reload();
      return true;
    } catch (e) {
      toast(e.message || 'Terjadi kesalahan');
      return false;
    }
  };
  const log = text =>
    supabase
      .from('activity_logs')
      .insert({
        actor_id: meRef.current?.id,
        actor_name: meRef.current?.full_name,
        text
      })
      .then(() => { });
  const nz = v => (v === '' || v == null ? null : v);

  const a = {
    login: async (identifier, password) => {
      let email = identifier.trim();
      if (!email.includes('@')) {
        const r = await supabase.rpc('login_email', {
          p_identifier: email
        });
        email = r.data || '';
      }
      if (!email) return 'Username/email atau password salah';
      const { error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (!e) toast('Login berhasil. Selamat datang di GeoTrack.', 'ok');
      return e ? 'Username/email atau password salah' : '';
    },
    logout: async () => {
      const { error: e } = await supabase.auth.signOut();
      if (e) { toast(e.message); return false; }
      toast('Anda berhasil keluar dari GeoTrack.', 'ok');
      return true;
    },

    // ---- ADMIN ----
    saveUser: async u => {
      const ok = await act(() => u.id
        ? supabase.rpc('admin_update_user', {
          p_id: u.id,
          p_email: u.email,
          p_password: u.password || null,
          p_username: u.username,
          p_full_name: u.name,
          p_phone: u.phone,
          p_role: u.role,
          p_mode: u.role === 'admin' ? null : u.mode
        })
        : supabase.rpc('admin_create_user', {
          p_email: u.email,
          p_password: u.password,
          p_username: u.username,
          p_full_name: u.name,
          p_phone: u.phone,
          p_role: u.role,
          p_mode: u.role === 'admin' ? null : u.mode
        }), u.id ? 'User diperbarui' : 'User dibuat. Sudah bisa login.');
      if (ok)
        log(
          `${u.id ? 'ubah' : 'tambah'} user ${u.name} (${u.role === 'admin' ? 'admin' : 'mode ' + u.mode})`
        );
      return ok;
    },
    deleteUser: async id => {
      const n = db.users.find(x => x.id === id)?.name;
      const ok = await act(
        () => supabase.rpc('admin_delete_user', { p_id: id }),
        'User dihapus'
      );
      if (ok) log(`hapus user ${n}`);
      return ok;
    },
    saveDevice: async d => {
      let created = null;
      const ok = await act(async () => {
        if (d.id) return supabase
          .from('devices')
          .update({ name: d.name, notes: nz(d.notes) })
          .eq('id', d.id);
        const r = await supabase
          .from('devices')
          .insert({
            device_code: d.code.trim(),
            name: d.name,
            notes: nz(d.notes)
          })
          .select('id, device_code')
          .single();
        if (!r.error) created = r.data;
        return r;
      }, 'Device disimpan');
      if (ok) log(`simpan device ${d.name}`);
      return ok ? (created || true) : false;
    },
    deleteDevice: async id => {
      const n = db.devices.find(x => x.id === id)?.name;
      const ok = await act(
        () => supabase.from('devices').delete().eq('id', id),
        'Device dihapus'
      );
      if (ok) log(`hapus device ${n}`);
      return ok;
    },
    deviceKey: async id => {
      const { data } = await supabase
        .from('device_secrets')
        .select('device_key')
        .eq('device_id', id)
        .maybeSingle();
      return data?.device_key || '';
    },
    assign: async (deviceId, userId, info = {}) => {
      // userId null = lepas device (kembali Tersedia). info = data pembelian {price,date,method,note}
      const dev = db.devices.find(d => d.id === deviceId);
      const buyer = db.users.find(u => u.id === userId);
      const ok = await act(
        () =>
          supabase
            .from('devices')
            .update({
              owner_id: userId,
              sale_status: userId ? 'Terjual' : 'Tersedia'
            })
            .eq('id', deviceId),
        userId ? 'Device dihubungkan' : 'Device dilepas'
      );
      if (!ok) return false;
      log(
        userId
          ? `device ${dev?.name} dijual ke ${buyer?.name}`
          : `device ${dev?.name} dilepas`
      );
      if (purchasesOk.current) { // catat ke laporan pembelian
        const r = userId
          ? await supabase.from('purchases').insert({
            device_id: deviceId,
            device_code: dev?.code || '',
            device_name: dev?.name || '',
            buyer_id: userId,
            buyer_name: buyer?.name || '',
            price: Number(info.price) || 0,
            purchased_at: info.date || new Date().toISOString().slice(0, 10),
            payment_method: info.method || 'Transfer',
            note: nz(info.note)
          })
          : await supabase.from('purchases').update({ status: 'Dilepas' }).eq('device_id', deviceId).eq('status', 'Aktif');
        if (r.error) toast('Device tersimpan, tetapi laporan pembelian gagal dicatat: ' + r.error.message);
        else await reload();
      }
      return true;
    },
    savePurchase: async p => {
      const ok = await act(
        () =>
          supabase
            .from('purchases')
            .update({
              price: Number(p.price) || 0,
              purchased_at: p.date,
              payment_method: p.method,
              note: nz(p.note)
            })
            .eq('id', p.id),
        'Laporan pembelian diperbarui'
      );
      if (ok) log(`ubah laporan pembelian ${p.deviceName}`);
      return ok;
    },
    deletePurchase: async id => {
      const n = db.purchases.find(x => x.id === id)?.deviceName;
      const ok = await act(
        () => supabase.from('purchases').delete().eq('id', id),
        'Catatan pembelian dihapus'
      );
      if (ok) log(`hapus catatan pembelian ${n}`);
      return ok;
    },
    // titik GPS satu device (terbaru lebih dulu). sinceMs = batas waktu ke belakang, null = tanpa batas
    fetchPoints: async (deviceId, sinceMs = null, limit = 500) => {
      let q = supabase
        .from('gps_data')
        .select('id,latitude,longitude,speed,accuracy,satellites,battery,signal,recorded_at')
        .eq('device_id', deviceId)
        .order('recorded_at', { ascending: false })
        .limit(limit);
      if (sinceMs) q = q.gte('recorded_at', new Date(Date.now() - sinceMs).toISOString());
      return q;
    },
    replyTicket: async (id, reply, st) => {
      const ok = await act(
        () =>
          supabase
            .from('tickets')
            .update({ reply: nz(reply), status: st })
            .eq('id', id),
        'Tanggapan disimpan'
      );
      if (ok) log(`tanggapi pengaduan ${id.slice(0, 6).toUpperCase()}`);
      return ok;
    },

    // ---- USER (RLS memastikan hanya data milik sendiri) ----
    saveOwnDevice: (id, v) =>
      act(
        () =>
          supabase
            .from('devices')
            .update({ alias: nz((v.alias || '').trim()), notes: nz(v.notes) })
            .eq('id', id),
        'Device diperbarui'
      ),
    saveListing: async x => {
      const body = {
        title: x.title,
        description: nz(x.description),
        price_per_day: Number(x.price),
        contact_phone: nz(x.contactPhone),
        pickup_location: nz(x.pickup),
        status: x.status || 'Tersedia'
      };
      const ok = await act(
        () =>
          x.id
            ? supabase.from('listings').update(body).eq('id', x.id)
            : supabase
              .from('listings')
              .insert({
                ...body,
                device_id: x.deviceId,
                owner_id: meRef.current.id
              }),
        'Listing disimpan'
      );
      if (ok) log(`simpan listing ${x.title}`);
      return ok;
    },
    deleteListing: async id => {
      const ok = await act(
        () => supabase.from('listings').delete().eq('id', id),
        'Listing dihapus'
      );
      if (ok) log('hapus listing');
      return ok;
    },
    decideRequest: async (id, st) => {
      const ok = await act(
        () => supabase.from('rental_requests').update({ status: st }).eq('id', id),
        `Permintaan ${st.toLowerCase()}`
      );
      if (ok) log(`${st} permintaan sewa`);
      return ok;
    },
    saveRun: r =>
      act(
        () =>
          r.id
            ? supabase.from('runs').update({ note: nz(r.note) }).eq('id', r.id)
            : supabase
              .from('runs')
              .insert({
                user_id: meRef.current.id,
                device_id: nz(r.deviceId),
                distance_km: Number(r.distance),
                duration_seconds: r.seconds,
                note: nz(r.note),
                route: r.route || [],
                started_at: r.startedAt
              }),
        'Aktivitas disimpan'
      ),
    deleteRun: id =>
      act(
        () => supabase.from('runs').delete().eq('id', id),
        'Aktivitas dihapus'
      ),
    sendTicket: t =>
      act(
        () =>
          supabase.from('tickets').insert({
            user_id: meRef.current.id,
            category: t.category,
            title: t.title,
            detail: t.detail
          }),
        'Pengaduan terkirim'
      ),
  };

  return <Ctx.Provider
    value={{
      db, me, status, error, live, notice, confirm, trails, purchasesReady,
      dismissNotice: () => setNotice(null),
      askConfirm: data => setConfirm(data),
      dismissConfirm: () => setConfirm(null),
      resolveConfirm: async () => { const fn = confirm?.onConfirm; setConfirm(null); if (fn) await fn(); },
      ...a
    }}
  >{children}</Ctx.Provider>;
}