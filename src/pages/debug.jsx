import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cpu, Radio, Wifi, WifiOff, Navigation, RefreshCw, TriangleAlert, Terminal,
  Settings, Power, Eye, EyeOff, Zap, CheckCircle2, XCircle, Info,
  Smartphone, ShieldCheck, BatteryMedium, ArrowRight, RotateCcw,
  Search, Lock, Check, ChevronDown, SignalHigh, SignalMedium, ExternalLink,
  HardDrive, Cloud, MapPin
} from 'lucide-react';
import { Badge, Button, ConfirmModal } from '../ui.jsx';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Network } from '@capacitor/network';

// Daftarkan plugin native Android WifiHelper
const WifiHelper = registerPlugin('WifiHelper');

// Status WiFi GioT teks mapping
const ST_MAP = {
  1000: 'Idle',
  1001: 'Sedang menyambung',
  1010: 'Tersambung, dapat IP',
  200: 'Beacon timeout',
  201: 'SSID tidak ditemukan',
  202: 'Password salah',
  203: 'Gagal asosiasi',
  204: 'Handshake timeout'
};

const GS_MAP = {
  NO_DATA: 'Tidak ada data',
  NO_FIX: 'Hidup, belum fix',
  FIX: 'Fix'
};

// Target IP GioT & IP Valid Client Smartphone
const ESP_TARGET_IP = '192.168.4.2';
const ESP_HOST_URL = 'http://192.168.4.2';

export function DebugPage() {
  const STORAGE_CONN_FLAG = 'geotrack:esp_is_connected';
  const STORAGE_HISTORY = 'geotrack:last_esp_conn';

  // Status koneksi aktif (jika sebelumnya sudah terhubung, langsung masuk)
  const [connected, setConnected] = useState(() => {
    return localStorage.getItem(STORAGE_CONN_FLAG) === 'true';
  });

  // State Deteksi GioT
  const [espHost, setEspHost] = useState(ESP_HOST_URL);
  const [phoneIp, setPhoneIp] = useState(null);
  const [isEspDetected, setIsEspDetected] = useState(false);
  const [checkingNetwork, setCheckingNetwork] = useState(false);

  // Status koneksi & handshake
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState('');

  // Data telemetri & log real-time dari GioT
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logN, setLogN] = useState(0);
  const [pauseLog, setPauseLog] = useState(false);
  const [wifiList, setWifiList] = useState([]);
  const [scanningWifi, setScanningWifi] = useState(false);

  // Form Atur WiFi Tujuan (Station GioT)
  const [targetSsid, setTargetSsid] = useState('');
  const [targetPass, setTargetPass] = useState('');
  const [showTargetPass, setShowTargetPass] = useState(false);
  const [saveMsg, setSaveMsg] = useState({ text: '', type: '' });
  const [savingWifi, setSavingWifi] = useState(false);

  // Status aksi
  const [testingGps, setTestingGps] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showConfirmResetSd, setShowConfirmResetSd] = useState(false);
  const [resettingSd, setResettingSd] = useState(false);
  const [sdMsg, setSdMsg] = useState({ text: '', type: '' });
  const [connLossCount, setConnLossCount] = useState(0);
  const logPreRef = useRef(null);

  // Buka Pengaturan Wi-Fi HP (Intent Native di Android)
  const handleOpenWifiSettings = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await WifiHelper.openWifiSettings();
      } else {
        alert('Silakan aktifkan Wi-Fi di perangkat Anda dan sambungkan ke Hotspot GioT (192.168.4.2).');
      }
    } catch (err) {
      console.warn('Gagal buka pengaturan Wi-Fi:', err);
    }
  };

  // Helper komunikasi ke GioT dengan bypass routing seluler via native WifiHelper
  const requestEsp = useCallback(async (path, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    // Kandidat host: prioritaskan espHost, lalu 192.168.4.2, lalu 192.168.4.1
    const candidateHosts = [espHost, 'http://192.168.4.2', 'http://192.168.4.1']
      .filter((v, i, a) => v && a.indexOf(v) === i);

    // 1. Coba melalui native Android WifiHelper (memaksa socket lewat hardware Wi-Fi)
    if (Capacitor.isNativePlatform()) {
      for (const host of candidateHosts) {
        try {
          const res = await WifiHelper.fetchWifi({
            url: `${host}${path}`,
            method,
            body,
            timeout: options.timeout || 3000
          });
          if (res && res.ok) {
            setEspHost(host);
            let parsed = null;
            try { parsed = JSON.parse(res.data); } catch { parsed = res.data; }
            return { ok: true, data: parsed, host };
          }
        } catch {}
      }
    }

    // 2. Fallback via browser fetch biasa
    for (const host of candidateHosts) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), options.timeout || 2500);
        const res = await fetch(`${host}${path}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body || undefined,
          signal: ctrl.signal,
          cache: 'no-store'
        });
        clearTimeout(t);
        if (res.ok) {
          const parsed = await res.json();
          setEspHost(host);
          return { ok: true, data: parsed, host };
        }
      } catch {}
    }

    return { ok: false };
  }, [espHost]);

  // Deteksi Real-Time Sambungan GioT
  const refreshPhoneWifiState = useCallback(async () => {
    setCheckingNetwork(true);

    try {
      let detectedIp = null;
      let isEsp = false;

      // 1. Ambil IP lokal HP dan Gateway dari native WifiHelper
      if (Capacitor.isNativePlatform()) {
        try {
          const res = await WifiHelper.getWifiIp();
          if (res && (res.ip || res.gateway)) {
            detectedIp = res.ip || res.gateway;
            isEsp = res.isGioT || res.isEsp32 || (res.ip && res.ip.startsWith('192.168.4.')) || (res.gateway && res.gateway.startsWith('192.168.4.'));
          }
        } catch {}
      }

      // 2. Request status ke GioT (menggunakan socket Wi-Fi native)
      const res = await requestEsp('/api/status');
      if (res.ok && res.data) {
        isEsp = true;
        if (!detectedIp) detectedIp = res.host.replace('http://', '');

        if (!connected) {
          setStatus(res.data);
          setConnected(true);
          localStorage.setItem(STORAGE_CONN_FLAG, 'true');
          const connData = {
            ssid: res.data.ap || 'GeoTrack-GioT',
            ip: detectedIp || '192.168.4.2',
            time: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          };
          localStorage.setItem(STORAGE_HISTORY, JSON.stringify(connData));
        }
      }

      setPhoneIp(detectedIp);
      setIsEspDetected(isEsp);
      return { detectedIp, isEsp, espStatusData: res.data };
    } catch (err) {
      console.warn('Error refresh network state:', err);
    } finally {
      setCheckingNetwork(false);
    }
  }, [connected, requestEsp]);

  // Listener perubahan jaringan & polling otomatis
  useEffect(() => {
    refreshPhoneWifiState();

    const listenerPromise = Network.addListener('networkStatusChange', () => {
      refreshPhoneWifiState();
    });

    const interval = setInterval(() => {
      refreshPhoneWifiState();
    }, 3000);

    return () => {
      clearInterval(interval);
      listenerPromise.then(handler => handler.remove()).catch(() => {});
    };
  }, [refreshPhoneWifiState]);

  // Handle Hubungkan ke Alat (Cek Langsung ke GioT)
  const handleConnect = async (e) => {
    if (e) e.preventDefault();
    setConnError('');
    setConnecting(true);

    try {
      // Pastikan Android process ter-bind ke Wi-Fi
      if (Capacitor.isNativePlatform()) {
        try { await WifiHelper.bindToWifi(); } catch {}
      }

      const res = await requestEsp('/api/status', { timeout: 3500 });
      if (!res.ok || !res.data) {
        throw new Error('Status GioT tidak merespons');
      }

      const connData = {
        ssid: res.data.ap || 'GeoTrack-GioT',
        ip: phoneIp || res.host.replace('http://', ''),
        time: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      };
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(connData));
      localStorage.setItem(STORAGE_CONN_FLAG, 'true');

      setStatus(res.data);
      setConnected(true);
      setIsEspDetected(true);
      setConnLossCount(0);
    } catch (err) {
      console.warn('Gagal handshake ke GioT:', err);
      setConnError('Tidak dapat terhubung ke GioT (192.168.4.2). Pastikan Wi-Fi HP sudah tersambung ke Hotspot GioT.');
    } finally {
      setConnecting(false);
    }
  };

  // Putus koneksi debug (kembali ke form awal dan hapus auto-connect)
  const disconnect = () => {
    localStorage.setItem(STORAGE_CONN_FLAG, 'false');
    setConnected(false);
    setIsEspDetected(false);
    setStatus(null);
    setLogs([]);
    setLogN(0);
    setConnLossCount(0);
    setSdMsg({ text: '', type: '' });
    setShowConfirmResetSd(false);
    setResettingSd(false);
    if (Capacitor.isNativePlatform()) {
      try { WifiHelper.unbindNetwork(); } catch {}
    }
  };

  // Polling Status & Log setiap 2.5 detik saat terhubung ke GioT
  useEffect(() => {
    if (!connected) return;

    let isMounted = true;

    const pollEsp = async () => {
      // 1. Fetch Status Telemetri
      const r = await requestEsp('/api/status', { timeout: 2000 });
      if (r.ok && isMounted && r.data) {
        setStatus(r.data);
        setConnLossCount(0);
      } else if (isMounted) {
        setConnLossCount(prev => prev + 1);
      }

      // 2. Fetch Log Serial GioT
      if (!pauseLog && isMounted) {
        const rLog = await requestEsp(`/api/log?from=${logN}`, { timeout: 2000 });
        if (rLog.ok && isMounted && rLog.data) {
          const dataLog = rLog.data;
          if (dataLog.n < logN) {
            setLogN(0);
            setLogs([]);
          } else if (dataLog.l && dataLog.l.length > 0) {
            setLogs(prev => {
              const updated = [...prev, ...dataLog.l];
              return updated.slice(-300);
            });
            setLogN(dataLog.n);
          }
        }
      }
    };

    pollEsp();
    const interval = setInterval(pollEsp, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [connected, logN, pauseLog, requestEsp]);

  // Auto scroll log ke paling bawah saat ada baris baru
  useEffect(() => {
    if (logPreRef.current && !pauseLog) {
      logPreRef.current.scrollTop = logPreRef.current.scrollHeight;
    }
  }, [logs, pauseLog]);

  // Scan WiFi di sekitar GioT (Station Mode)
  const scanWifiNetworks = async () => {
    setScanningWifi(true);
    setSaveMsg({ text: 'Mencari sinyal Wi-Fi di sekitar alat (bisa perlu ~3-6 detik)...', type: 'in' });

    try {
      const res = await requestEsp('/api/scan?new=1', { timeout: 12000 });
      if (!res.ok || !res.data) throw new Error('Gagal scan');
      const list = Array.isArray(res.data) ? res.data : [];
      setWifiList(list);
      if (list.length > 0) {
        setSaveMsg({ text: `Ditemukan ${list.length} jaringan Wi-Fi di sekitar alat. Silakan pilih di menu pilihan.`, type: 'ok' });
      } else {
        setSaveMsg({ text: 'Tidak ada sinyal Wi-Fi yang terdeteksi di sekitar alat.', type: 'in' });
      }
    } catch {
      setSaveMsg({ text: 'Gagal mencari Wi-Fi. Pastikan alat terjangkau dan HP tersambung ke Hotspot GioT.', type: 'er' });
    } finally {
      setScanningWifi(false);
    }
  };

  // Simpan kredensial WiFi ke GioT
  const handleSaveWifi = async (e) => {
    e.preventDefault();
    if (!targetSsid.trim()) {
      setSaveMsg({ text: 'Pilih atau ketik Nama WiFi (SSID).', type: 'er' });
      return;
    }
    if (targetPass && (targetPass.length < 8 || targetPass.length > 63)) {
      setSaveMsg({ text: 'Password WiFi minimal 8 karakter (atau kosong jika open network).', type: 'er' });
      return;
    }

    setSavingWifi(true);
    setSaveMsg({ text: 'Mengirim konfigurasi ke GioT...', type: 'in' });

    try {
      const res = await requestEsp('/api/save', {
        method: 'POST',
        body: { ssid: targetSsid.trim(), pass: targetPass },
        timeout: 8000
      });
      if (res.ok && res.data && (res.data.ok === 1 || res.data.ok === true)) {
        setSaveMsg({ text: `Kredensial tersimpan! GioT sedang mencoba menyambung ke "${targetSsid.trim()}"...`, type: 'ok' });
        setTargetPass('');
      } else {
        const errMsg = (res.data && res.data.err) ? res.data.err : 'Gagal menyimpan ke GioT.';
        setSaveMsg({ text: errMsg, type: 'er' });
      }
    } catch {
      setSaveMsg({ text: 'Gagal mengirim ke GioT. Periksa kembali sambungan Wi-Fi HP ke hotspot alat.', type: 'er' });
    } finally {
      setSavingWifi(false);
    }
  };

  // Mulai Uji Coba GPS (30 Detik)
  const handleTestGps = async () => {
    if (!confirm('Tes GPS akan menjeda pembacaan normal selama ~30 detik untuk memeriksa pin RX/TX dan baudrate. Lanjutkan?')) {
      return;
    }

    setTestingGps(true);
    try {
      const res = await requestEsp('/api/gpstest', { method: 'POST', timeout: 5000 });
      if (res.ok) {
        setSaveMsg({ text: 'Uji coba GPS dimulai. Pantau log GioT di kartu bawah.', type: 'in' });
      } else {
        setSaveMsg({ text: 'Gagal memulai tes GPS pada alat.', type: 'er' });
      }
    } catch {
      setSaveMsg({ text: 'Gagal menghubungi GioT.', type: 'er' });
    } finally {
      setTestingGps(false);
    }
  };

  // Reset / Reboot GioT
  const handleResetEsp = async () => {
    if (!confirm('GioT akan dimuat ulang (reboot). Hotspot akan terputus ~15 detik. Lanjutkan restart?')) {
      return;
    }

    setResetting(true);
    try {
      await requestEsp('/api/reset', { method: 'POST', timeout: 4000 });
    } catch {
      // ignore
    } finally {
      setResetting(false);
      disconnect();
    }
  };

  // Reset / Flash SD Card (FAT Format)
  const handleResetSd = async () => {
    setResettingSd(true);
    setSdMsg({ text: 'Sedang memformat FAT & merefresh MicroSD (proses ~3-8 detik)...', type: 'in' });

    try {
      const res = await requestEsp('/api/resetsd', { method: 'POST', timeout: 15000 });
      if (res.ok && res.data && (res.data.ok === 1 || res.data.ok === true)) {
        setSdMsg({ text: res.data.msg || 'SD Card berhasil di-flash (FAT) dan siap digunakan!', type: 'ok' });
        setShowConfirmResetSd(false);
        const r = await requestEsp('/api/status', { timeout: 3000 });
        if (r.ok && r.data) {
          setStatus(r.data);
        }
      } else {
        const errMsg = (res.data && res.data.msg) ? res.data.msg : 'Gagal memformat SD Card. Periksa slot atau koneksi MicroSD.';
        setSdMsg({ text: errMsg, type: 'er' });
        setShowConfirmResetSd(false);
      }
    } catch {
      setSdMsg({ text: 'Gagal menghubungi GioT saat proses reset SD Card.', type: 'er' });
      setShowConfirmResetSd(false);
    } finally {
      setResettingSd(false);
    }
  };

  // Perhitungan kualitas RSSI & bar ladder
  const getRssiQuality = (rssi) => {
    if (rssi == null) return { pct: 0, bars: 0, text: 'Kualitas belum diketahui', tone: 'd' };
    const pct = Math.max(0, Math.min(100, Math.round(2 * (rssi + 100))));
    const bars = Math.max(1, Math.ceil(pct / 20));
    const tone = pct < 30 ? 'd' : pct < 50 ? 'w' : 'ok';
    const text = `Kualitas ${pct}% (${pct >= 60 ? 'Bagus' : pct >= 40 ? 'Cukup' : 'Lemah'})`;
    return { pct, bars, text, tone };
  };

  // Diagnostik Otomatis GioT
  const getDiagnostics = (d) => {
    if (!d) return { tone: 'warn', title: 'Menghubungi GioT...', sub: 'Menunggu kiriman data status dari alat.' };

    if (!d.ssid) {
      return { tone: 'warn', title: 'WiFi Tujuan Belum Diatur', sub: 'Pilih jaringan WiFi di kartu "Atur WiFi Tujuan", masukkan password, lalu klik Simpan.' };
    }
    if (!d.conn) {
      if (d.st === 202) return { tone: 'bad', title: 'Password WiFi Salah', sub: 'Ketik ulang password WiFi yang benar di kartu pengaturan WiFi.' };
      if (d.st === 201) return { tone: 'bad', title: 'Nama WiFi (SSID) Tidak Ditemukan', sub: 'Periksa nama WiFi. Ingat bahwa GioT hanya mendukung jaringan 2.4 GHz.' };
      if (d.st === 1001) return { tone: 'warn', title: `Sedang Menyambung ke ${d.ssid}`, sub: 'Harap tunggu beberapa saat...' };
      return { tone: 'bad', title: `WiFi Belum Tersambung (${ST_MAP[d.st] || d.st})`, sub: 'Dekatkan GioT ke router atau periksa kembali SSID & password.' };
    }
    if (d.rssi != null && d.rssi <= -80) {
      return { tone: 'warn', title: `Sinyal WiFi Lemah (${d.rssi} dBm)`, sub: 'Posisikan GioT lebih dekat dengan router agar pengiriman data stabil.' };
    }
    if (d.dnsms === -1) {
      return { tone: 'bad', title: 'Internet Tidak Terjangkau (DNS Gagal)', sub: 'WiFi terhubung tetapi router tidak memiliki akses internet atau DNS bermasalah.' };
    }
    if (d.drops >= 3) {
      return { tone: 'warn', title: `WiFi Sering Terputus (${d.drops} kali)`, sub: 'Periksa kestabilan daya USB dan jarak alat ke router.' };
    }
    return { tone: 'ok', title: 'Koneksi WiFi Normal & Online', sub: `Tersambung ke ${d.ssid} dengan IP ${d.ip}. Siap mengirim telemetri ke GeoTrack.` };
  };

  // Diagnostik Otomatis GPS
  const getGpsDiagnostics = (g) => {
    if (!g) return { tone: 'bad', tag: 'Menunggu', title: 'GPS Belum Aktif', sub: 'Menunggu pembacaan sensor GPS.' };
    const tot = (g.ok || 0) + (g.bad || 0);

    if (g.t > 0) return { tone: 'warn', tag: 'Dites', title: 'Tes GPS Berjalan...', sub: 'Pembacaan GPS normal dijeda ~30 detik. Hasil pengujian akan muncul di log.' };
    if (g.age == null) return { tone: 'bad', tag: 'Mati', title: 'GPS Tidak Terdeteksi', sub: 'Belum ada data NMEA sejak boot. Pastikan kabel TX/RX terpasang benar dan modul mendapat daya.' };
    if (g.age > 5) return { tone: 'bad', tag: 'Mati', title: `Data GPS Berhenti (${g.age} detik lalu)`, sub: 'Alat tidak lagi menerima data serial dari GPS. Periksa kabel dan sambungan modul.' };
    if (tot > 0 && g.bad / tot > 0.2) return { tone: 'warn', tag: 'Noise', title: 'Banyak Kalimat GPS Rusak (Noise)', sub: 'Kabel terlalu panjang, kendor, atau daya baterai tidak stabil.' };
    if (g.fq === 0 && g.sv === 0) return { tone: 'warn', tag: 'No Fix', title: 'GPS Hidup, Belum Melihat Satelit', sub: 'Antena belum menghadap langit bebas. Bawa kendaraan ke area terbuka, tunggu 3-10 menit.' };
    if (g.fq === 0) return { tone: 'warn', tag: 'No Fix', title: 'GPS Hidup, Belum Mendapat Fix', sub: `Terlihat ${g.sv} satelit. Sinyal sedang dikunci, harap tunggu di area terbuka.` };
    if (g.su < g.ms || (g.hd != null && g.hd > g.mh)) return { tone: 'warn', tag: 'Fix Lemah', title: 'Fix Ada, Kualitas Belum Cukup', sub: `Satelit ${g.su} (min ${g.ms}), HDOP ${g.hd} (maks ${g.mh}). Belum dikirim ke peta agar tidak melompat.` };
    return { tone: 'ok', tag: 'Fix Akurat', title: 'GPS Normal & Akurat', sub: `Mengunci ${g.su} satelit dengan akurasi HDOP ${g.hd}. Data posisi valid.` };
  };

  /* ============================================================
     TAMPILAN 1: KONEKSI DEBUG (SIMPEL: TOMBOL CARI WIFI & MASUK KE MENU GIOT)
     ============================================================ */
  if (!connected) {
    return (
      <div className="debug-simple-container">
        <div className="debug-simple-box panel">
          <div className="debug-simple-head">
            <div className="debug-simple-avatar">
              <Cpu size={26} />
            </div>
            <div>
              <h3>Koneksi Debug GioT</h3>
              <p>Sambungkan Wi-Fi smartphone ke Hotspot alat</p>
            </div>
          </div>

          <div className="debug-connect-status-card">
            <div className="debug-status-indicator">
              <div className={`status-pulse-dot ${isEspDetected ? 'dot-online' : 'dot-waiting'}`} />
              <div>
                <b>{isEspDetected ? 'Hotspot GioT Terdeteksi' : 'Belum Terhubung ke GioT'}</b>
                <p>
                  {isEspDetected
                    ? `Perangkat siap diakses pada ${espHost}`
                    : 'Sambungkan Wi-Fi HP ke hotspot alat GioT (192.168.4.2) terlebih dahulu.'}
                </p>
              </div>
            </div>
            {isEspDetected && (
              <span className="badge badge-green">Siap</span>
            )}
          </div>

          {connError && (
            <div className="debug-simple-error" role="alert">
              <TriangleAlert size={16} />
              <span>{connError}</span>
            </div>
          )}

          <div className="debug-action-buttons">
            <Button
              type="button"
              variant="outline"
              icon={Search}
              onClick={handleOpenWifiSettings}
              style={{ width: '100%', height: 46, fontSize: 14 }}
            >
              Cari WiFi
            </Button>

            <Button
              type="button"
              disabled={connecting}
              icon={connecting ? RefreshCw : ArrowRight}
              onClick={handleConnect}
              style={{ width: '100%', height: 46, fontSize: 14 }}
            >
              {connecting ? 'Memeriksa Sambungan GioT…' : 'Masuk ke Menu GioT'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================
     TAMPILAN 2: SUDAH TERSAMBUNG (DASHBOARD DEBUG GIOT LENGKAP)
     ============================================================ */
  const d = status;
  const g = d?.gps;
  const diag = getDiagnostics(d);
  const gdiag = getGpsDiagnostics(g);
  const q = getRssiQuality(d?.rssi);

  return (
    <div className="debug-dashboard-wrap">
      {/* Top Header Card */}
      <section className="panel debug-top-status">
        <div className="debug-top-info">
          <div className="debug-device-badge">
            <Cpu size={22} />
            <div>
              <h3>{d?.ap || 'GeoTrack GioT'}</h3>
              <p>
                IP HP: {phoneIp || ESP_TARGET_IP} · Menyala {Math.floor((d?.up || 0) / 60)} menit
              </p>
            </div>
          </div>
        </div>
        <div className="debug-top-actions">
          <Button variant="outline" small icon={RefreshCw} onClick={() => setStatus({ ...status })}>
            Segarkan
          </Button>
          <Button variant="danger" small icon={Power} onClick={disconnect}>
            Ganti Jaringan / Putus
          </Button>
        </div>
      </section>

      {/* Peringatan jika koneksi sempat terputus */}
      {connLossCount > 2 && (
        <div className="modern-warn-banner">
          <TriangleAlert size={18} />
          <div>
            <b>Sinyal Wi-Fi Terputus ({connLossCount}x percobaan)</b>
            <p>Pastikan smartphone tetap berada di dekat alat dan tidak berpindah ke jaringan Wi-Fi lain.</p>
          </div>
        </div>
      )}

      {/* Kartu Diagnostik Utama */}
      <section className={`panel debug-diag-card diag-${diag.tone}`}>
        <div className="diag-icon-col">
          {diag.tone === 'ok' ? <CheckCircle2 size={24} /> : <TriangleAlert size={24} />}
        </div>
        <div className="diag-copy">
          <b>{diag.title}</b>
          <p>{diag.sub}</p>
        </div>
      </section>

      {/* Grid Multi-Kolom Dashboard Debug */}
      <div className="debug-grid">
        {/* KARTU 1: KOORDINAT & POSISI REAL-TIME */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>Koordinat & Posisi</h3>
              <Badge tone={(d?.pos?.lat != null && d?.pos?.lon != null) ? 'green' : 'gray'}>
                {(d?.pos?.lat != null && d?.pos?.lon != null) ? 'Posisi Valid' : 'Menunggu GPS'}
              </Badge>
            </div>
            <MapPin size={18} />
          </div>

          <div className="card-body">
            <div className="debug-coords-grid">
              <div className="coord-cell">
                <small>Latitude</small>
                <b>{d?.pos?.lat != null ? d.pos.lat : (g?.la != null ? g.la.toFixed(6) : '-')}</b>
              </div>
              <div className="coord-cell">
                <small>Longitude</small>
                <b>{d?.pos?.lon != null ? d.pos.lon : (g?.lo != null ? g.lo.toFixed(6) : '-')}</b>
              </div>
              <div className="coord-cell">
                <small>Ketinggian (Alt)</small>
                <b>
                  {d?.pos?.alt != null
                    ? `${d.pos.alt} m`
                    : (g?.al != null ? `${g.al} m` : '-')}
                </b>
              </div>
              <div className="coord-cell">
                <small>Kecepatan</small>
                <b>
                  {d?.pos?.spd != null
                    ? `${d.pos.spd} km/j`
                    : (g?.sp != null ? `${g.sp} km/j` : '0.0 km/j')}
                </b>
              </div>
            </div>

            <dl className="debug-dl" style={{ marginBottom: 14 }}>
              <dt>Kondisi Gerak</dt>
              <dd>
                {(d?.pos?.spd || 0) < 1.5 ? (
                  <span style={{ color: '#059669', fontWeight: 600 }}>Diam (Kumulatif Rata-rata)</span>
                ) : (
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>Sedang Bergerak</span>
                )}
              </dd>
              <dt>Status Akurasi</dt>
              <dd>{g?.su ? `${g.su} satelit (HDOP ${g?.hd ?? '-'})` : '-'}</dd>
            </dl>

            {((d?.pos?.lat != null && d?.pos?.lon != null) || (g?.la != null && g?.lo != null)) ? (
              <Button
                variant="outline"
                small
                icon={ExternalLink}
                style={{ width: '100%' }}
                onClick={() => {
                  const lat = d?.pos?.lat ?? g?.la;
                  const lon = d?.pos?.lon ?? g?.lo;
                  window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
                }}
              >
                Buka Lokasi di Google Maps
              </Button>
            ) : (
              <p className="debug-hint-note" style={{ textAlign: 'center' }}>
                Koordinat akan aktif saat modul GPS mengunci satelit di luar ruangan.
              </p>
            )}
          </div>
        </section>

        {/* KARTU 2: STATUS WIFI GIOT */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>Wi-Fi GioT</h3>
              <Badge tone={d?.conn ? 'green' : 'red'}>
                {d?.conn ? 'Tersambung' : 'Terputus'}
              </Badge>
            </div>
            <span className="debug-card-meta">Sinyal {d?.ch ? `Ch ${d.ch}` : ''}</span>
          </div>

          <div className="card-body">
            {/* Visual Ladder Meter RSSI */}
            <div className="meter-ladder-wrap">
              <div className={`lad-ladder lad-${q.tone}`}>
                <i className={q.bars >= 1 ? 'on' : ''} />
                <i className={q.bars >= 2 ? 'on' : ''} />
                <i className={q.bars >= 3 ? 'on' : ''} />
                <i className={q.bars >= 4 ? 'on' : ''} />
                <i className={q.bars >= 5 ? 'on' : ''} />
              </div>
              <div>
                <div className="meter-val-big">
                  {d?.rssi == null ? '-' : d.rssi} <small>dBm</small>
                </div>
                <div className="meter-val-sub">{q.text}</div>
              </div>
            </div>

            <dl className="debug-dl">
              <dt>Status Koneksi</dt>
              <dd>{ST_MAP[d?.st] || `Kode ${d?.st || '-'}`}</dd>

              <dt>Jaringan Tujuan (SSID)</dt>
              <dd><b>{d?.ssid || '(Belum Diatur)'}</b></dd>

              <dt>Alamat IP Internal</dt>
              <dd>{d?.ip || '-'}</dd>

              <dt>Gateway</dt>
              <dd>{d?.gw || '-'}</dd>

              <dt>DNS Server</dt>
              <dd>{d?.dns || '-'}</dd>

              <dt>Waktu Cari Alamat (DNS)</dt>
              <dd>{d?.dnsms == null ? '-' : d.dnsms < 0 ? 'Gagal' : `${d.dnsms} ms`}</dd>

              <dt>Terputus Sejak Boot</dt>
              <dd>{d?.drops ?? 0} kali</dd>

              <dt>Tegangan Baterai</dt>
              <dd>{d?.bv == null ? '-' : `${d.bv.toFixed(2)} V (${d.bp}%)`}</dd>

              <dt>HP di Hotspot Ini</dt>
              <dd>{d?.clients < 0 ? '-' : `${d?.clients || 1} perangkat`}</dd>
            </dl>
          </div>
        </section>

        {/* KARTU 3: SINKRONISASI CLOUD SUPABASE */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>Cloud Supabase Sync</h3>
              <Badge tone={(d?.sb?.ok ?? 0) > 0 ? 'green' : (d?.sb?.fail ?? 0) > 0 ? 'orange' : 'gray'}>
                {d?.sb?.status ? d.sb.status.toUpperCase() : 'STANDBY'}
              </Badge>
            </div>
            <Cloud size={18} />
          </div>

          <div className="card-body">
            <dl className="debug-dl" style={{ marginBottom: 14 }}>
              <dt>Status Sinkronisasi</dt>
              <dd><b>{d?.sb?.status || 'Standby / Menunggu WiFi'}</b></dd>

              <dt>Sukses Terunggah</dt>
              <dd style={{ color: '#16a34a', fontWeight: 700 }}>
                {d?.sb?.ok ?? 0} batch data
              </dd>

              <dt>Gagal Terunggah</dt>
              <dd style={{ color: (d?.sb?.fail ?? 0) > 0 ? '#dc2626' : undefined }}>
                {d?.sb?.fail ?? 0} kali
              </dd>

              <dt>Koneksi Internet</dt>
              <dd>{d?.net?.ok ? 'Aktif (Cloudflare OK)' : 'Offline / Terputus'}</dd>

              <dt>Kecepatan Download CDN</dt>
              <dd>
                {d?.net?.mbps != null ? `${d.net.mbps} Mbps` : '-'}
              </dd>
            </dl>

            <div className="debug-info-box">
              <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <p>
                Data koordinat GPS otomatis dikirim langsung dari GioT ke Supabase (tabel <code>locations</code>)
                setiap ada data valid dan internet terhubung.
              </p>
            </div>
          </div>
        </section>

        {/* KARTU 4: PENYIMPANAN OFFLINE SD CARD */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>SD Card Offline Storage</h3>
              <Badge tone={d?.sd?.ok ? 'green' : 'red'}>
                {d?.sd?.ok ? 'Terpasang (OK)' : 'Tidak Terdeteksi'}
              </Badge>
            </div>
            <HardDrive size={18} />
          </div>

          <div className="card-body">
            <dl className="debug-dl" style={{ marginBottom: 14 }}>
              <dt>Status Kartu MicroSD</dt>
              <dd><b>{d?.sd?.ok ? 'Terpasang & Siap Simpan' : 'Gagal Mount (Cek Slot SD)'}</b></dd>

              <dt>Antrean Tertunda (Pending)</dt>
              <dd style={{ color: (d?.sd?.pend ?? 0) > 0 ? '#d97706' : '#16a34a', fontWeight: 700 }}>
                {d?.sd?.pend ?? 0} baris koordinat
              </dd>

              <dt>File Antrean</dt>
              <dd><code>/sd/pending.csv</code></dd>

              <dt>Mode Penyimpanan</dt>
              <dd>Store-and-Forward Otomatis</dd>
            </dl>

            <div className="debug-info-box">
              <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <p>
                <b>Store-and-Forward:</b> Saat kendaraan masuk area blank spot tanpa sinyal internet,
                GioT menyimpan setiap koordinat ke kartu MicroSD. Begitu kembali terhubung,
                antrean otomatis diunggah ke server tanpa ada riwayat perjalanan yang hilang.
              </p>
            </div>

            {sdMsg.text && (
              <div className={`debug-mini-msg msg-${sdMsg.type}`} style={{ marginTop: 12 }}>
                {sdMsg.text}
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="danger"
                small
                icon={RotateCcw}
                disabled={resettingSd}
                onClick={() => setShowConfirmResetSd(true)}
              >
                {resettingSd ? 'Sedang Memformat…' : 'Reset / Flash SD Card'}
              </Button>
            </div>

            <p className="debug-hint-note">
              Gunakan tombol <b>Reset / Flash SD Card</b> jika kartu belum diformat FAT32, mengalami kendala baca-tulis [ENODEV], atau ingin mengosongkan seluruh antrean koordinat untuk disegarkan kembali.
            </p>
          </div>
        </section>

        {/* KARTU 5: ATUR WIFI TUJUAN (STATION) */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div>
              <h3>Atur Wi-Fi Tujuan</h3>
              <p>Sambungkan GioT ke Hotspot HP / Wi-Fi Rumah agar bisa kirim GPS ke server</p>
            </div>
            <Settings size={18} />
          </div>

          <div className="card-body">
            <form onSubmit={handleSaveWifi}>
              <div className="modern-field-group">
                <label className="modern-label">
                  <Wifi size={14} className="label-icon" />
                  <span>Pilih Jaringan di Sekitar Alat</span>
                </label>
                <div className="modern-input-box">
                  <select
                    value={targetSsid}
                    onChange={(e) => setTargetSsid(e.target.value)}
                    className="modern-select"
                  >
                    <option value="">{wifiList.length ? '-- Pilih Jaringan Sekitar --' : '(Tekan tombol Cari)'}</option>
                    {wifiList.map((x, i) => (
                      <option key={i} value={x.s}>
                        {x.s} ({x.l ? 'Terkunci' : 'Terbuka'}) {x.r} dBm
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-search-addon"
                    disabled={scanningWifi}
                    onClick={scanWifiNetworks}
                  >
                    <RefreshCw size={13} className={scanningWifi ? 'spin-icon' : ''} />
                    <span>{scanningWifi ? 'Mencari…' : 'Cari'}</span>
                  </button>
                </div>
              </div>

              <div className="modern-field-group" style={{ marginTop: 12 }}>
                <label className="modern-label">
                  <Radio size={14} className="label-icon" />
                  <span>Nama Wi-Fi (SSID)</span>
                </label>
                <div className="modern-input-box">
                  <input
                    required
                    maxLength={32}
                    placeholder="mis. Hotspot-Pribadi"
                    value={targetSsid}
                    onChange={(e) => setTargetSsid(e.target.value)}
                    className="modern-input"
                  />
                </div>
              </div>

              <div className="modern-field-group" style={{ marginTop: 12 }}>
                <label className="modern-label">
                  <Lock size={14} className="label-icon" />
                  <span>Password Wi-Fi</span>
                </label>
                <div className="modern-input-box">
                  <input
                    type={showTargetPass ? 'text' : 'password'}
                    maxLength={63}
                    placeholder="Kosongkan jika jaringan terbuka"
                    value={targetPass}
                    onChange={(e) => setTargetPass(e.target.value)}
                    className="modern-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTargetPass(!showTargetPass)}
                    className="btn-peek-addon"
                  >
                    {showTargetPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {saveMsg.text && (
                <div className={`debug-mini-msg msg-${saveMsg.type}`}>
                  {saveMsg.text}
                </div>
              )}

              <Button
                type="submit"
                disabled={savingWifi}
                icon={Wifi}
                style={{ marginTop: 14, width: '100%' }}
              >
                {savingWifi ? 'Menyimpan & Menyambungkan…' : 'Simpan dan Sambungkan'}
              </Button>

              <p className="debug-hint-note">
                Catatan: GioT hanya mendukung frekuensi <b>Wi-Fi 2.4 GHz</b>. Saat berpindah jaringan,
                hotspot alat bisa terputus sebentar.
              </p>
            </form>
          </div>
        </section>

        {/* KARTU 6: STATUS & DIAGNOSTIK GPS */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>Sensor GPS</h3>
              <Badge tone={gdiag.tone === 'ok' ? 'green' : gdiag.tone === 'warn' ? 'orange' : 'red'}>
                {gdiag.tag}
              </Badge>
            </div>
            <Navigation size={18} />
          </div>

          <div className="card-body">
            {/* Banner Diagnosa GPS */}
            <div className={`debug-gps-banner banner-${gdiag.tone}`}>
              <b>{gdiag.title}</b>
              <p>{gdiag.sub}</p>
            </div>

            <dl className="debug-dl">
              <dt>Status GPS</dt>
              <dd><b>{g?.t > 0 ? 'Sedang Dites' : (GS_MAP[g?.st] || g?.st || '-')}</b></dd>

              <dt>Satelit Dipakai / Terlihat</dt>
              <dd><b>{g?.su ?? '-'}</b> dipakai / <b>{g?.sv ?? '-'}</b> terlihat</dd>

              <dt>Akurasi HDOP</dt>
              <dd>{g?.hd == null ? '-' : `${g.hd} (maks ${g.mh || 2.5})`}</dd>

              <dt>Kecepatan</dt>
              <dd>{g?.sp != null ? `${g.sp} km/j` : '-'}</dd>

              <dt>Kalimat NMEA Valid / Rusak</dt>
              <dd>{g?.ok ?? 0} valid / {g?.bad ?? 0} rusak</dd>

              <dt>Data Terakhir</dt>
              <dd>{g?.age == null ? 'Belum pernah' : `${g.age} detik lalu`}</dd>

              <dt>Port UART Hardware</dt>
              <dd>{g ? `RX GPIO${g.rx}, TX GPIO${g.tx}, ${g.baud} baud` : '-'}</dd>
            </dl>

            <div style={{ marginTop: 14 }}>
              <Button
                variant="outline"
                small
                icon={Navigation}
                disabled={testingGps || g?.t > 0}
                onClick={handleTestGps}
              >
                {testingGps || g?.t > 0 ? 'Sedang Menjalankan Tes GPS…' : 'Mulai Tes GPS (30 Detik)'}
              </Button>
            </div>

            {g?.tr && g.tr.length > 0 && (
              <div className="gps-trace-box">
                <small>Cuplikan NMEA Terakhir:</small>
                <code>{g.tr.join('\n')}</code>
              </div>
            )}
          </div>
        </section>

        {/* KARTU 7: KONTROL GIOT */}
        <section className="panel debug-card">
          <div className="panel-heading">
            <div>
              <h3>Kontrol Alat GioT</h3>
              <p>Operasional restart perangkat dari jarak dekat</p>
            </div>
            <Power size={18} />
          </div>

          <div className="card-body">
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>
              Gunakan tombol di bawah jika program GioT macet atau setelah mengganti kabel modul GPS.
              Hotspot akan mati sebentar lalu hidup kembali dalam ~15 detik.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="danger"
                small
                icon={RotateCcw}
                disabled={resetting}
                onClick={handleResetEsp}
              >
                {resetting ? 'Merestart GioT…' : 'Reset / Reboot GioT'}
              </Button>

              <Button
                variant="outline"
                small
                icon={Power}
                onClick={disconnect}
              >
                Ganti Jaringan / Putus
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* KARTU 8: LOG REALTIME GIOT (CONSOLE OUTPUT) */}
      <section className="panel debug-log-panel">
        <div className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3>Log Keluaran Program GioT</h3>
            <Badge tone="blue">{logs.length} Baris</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="log-pause-toggle">
              <input
                type="checkbox"
                checked={pauseLog}
                onChange={(e) => setPauseLog(e.target.checked)}
              />
              <span>Jeda Tampilan</span>
            </label>
            <Button
              variant="outline"
              small
              icon={RefreshCw}
              onClick={() => { setLogs([]); setLogN(0); }}
            >
              Bersihkan
            </Button>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <pre className="debug-log-pre" ref={logPreRef}>
            {logs.length > 0 ? logs.join('\n') : '(Menunggu baris log dari alat...)'}
          </pre>
        </div>
      </section>

      {showConfirmResetSd && (
        <ConfirmModal
          title="Flash & Reset SD Card?"
          text="Semua file dan data antrean koordinat yang tersimpan di dalam MicroSD akan dihapus secara permanen untuk memformat ulang partisi FAT dan merefresh kartu agar siap digunakan kembali. Apakah Anda yakin ingin melanjutkan proses flash ini?"
          confirmText={resettingSd ? 'Sedang Memformat…' : 'Ya, Flash SD Card'}
          danger
          onClose={() => !resettingSd && setShowConfirmResetSd(false)}
          onConfirm={handleResetSd}
        />
      )}
    </div>
  );
}
