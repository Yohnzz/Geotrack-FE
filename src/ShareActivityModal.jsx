// Modal / Bottom Sheet Share Activity (Terinspirasi dari Strava)
// Menampilkan preview interaktif, pilihan Mode A (Peta) & Mode B (Transparan),
// statistik Pace, Jarak, Waktu, serta aksi berbagi ke WhatsApp, Instagram Story, dan Unduh.

import { useState, useEffect } from 'react';
import { Download, Share2, Layers, Map as MapIcon, Loader2, Check, AlertCircle, X } from 'lucide-react';
import { renderActivityImage, downloadBlob, shareActivity, formatActivityStats } from './services/shareService.js';
import { Modal } from './ui.jsx';

// SVG Ikon WhatsApp Resmi
const WhatsAppIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.174L2.05 21.95a.75.75 0 0 0 .937.937l4.802-1.39A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Zm-5.32 15.65.34.202A8.455 8.455 0 0 0 12 20.5a8.5 8.5 0 1 0-8.5-8.5c0 1.34.312 2.61.868 3.74l.2.404-.848 2.924 2.96-.868Zm8.328-4.228c-.23-.115-1.36-.67-1.57-.748-.21-.077-.363-.115-.516.115-.153.23-.593.748-.727.9-.134.154-.268.173-.498.058-.23-.115-.97-.358-1.848-1.14-.683-.61-1.145-1.363-1.28-1.593-.133-.23-.014-.355.101-.47.104-.103.23-.269.345-.403.115-.134.153-.23.23-.383.076-.153.038-.288-.02-.403-.057-.115-.516-1.246-.708-1.706-.186-.449-.376-.388-.517-.395l-.44-.008c-.154 0-.403.058-.613.288-.21.23-.805.786-.805 1.918 0 1.132.824 2.225.939 2.378.115.154 1.62 2.474 3.926 3.468.548.237.977.378 1.311.484.55.175 1.052.15 1.448.091.441-.066 1.36-.556 1.552-1.093.191-.537.191-.998.134-1.093-.057-.096-.21-.154-.44-.269Z"
      fill="#22c55e"
    />
  </svg>
);

// SVG Ikon Instagram Story Resmi
const InstagramIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-grad)" strokeWidth="2" />
    <circle cx="12" cy="12" r="4.5" stroke="url(#ig-grad)" strokeWidth="2" />
    <circle cx="18" cy="6" r="1.2" fill="url(#ig-grad)" />
    <defs>
      <linearGradient id="ig-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f59e0b" />
        <stop offset="0.5" stopColor="#ec4899" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
);

export function ShareActivityModal({ run, onClose }) {
  const [mode, setMode] = useState('map'); // 'map' (Mode A) atau 'transparent' (Mode B)
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [imageFilename, setImageFilename] = useState('');
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success'|'info'|'error', text: '' }
  const [sharingTarget, setSharingTarget] = useState(null);

  const stats = formatActivityStats(run);

  // Kunci scrolling halaman latar belakang saat modal dibuka, pulihkan saat ditutup
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    const origTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = origOverflow;
      document.body.style.touchAction = origTouchAction;
    };
  }, []);

  // Generate / Render canvas setiap kali mode berganti
  useEffect(() => {
    let active = true;
    setLoading(true);
    setStatusMessage(null);

    renderActivityImage(run, mode)
      .then(({ blob, dataUrl, filename }) => {
        if (!active) return;
        setPreviewUrl(dataUrl);
        setImageBlob(blob);
        setImageFilename(filename);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Gagal generate gambar share:', err);
        if (!active) return;
        setLoading(false);
        setStatusMessage({
          type: 'error',
          text: 'Gagal membuat gambar aktivitas. Silakan coba kembali.'
        });
      });

    return () => {
      active = false;
    };
  }, [run, mode]);

  // Aksi Unduh Gambar PNG
  const handleDownload = () => {
    if (!imageBlob) return;
    try {
      downloadBlob(imageBlob, imageFilename);
      setStatusMessage({
        type: 'success',
        text: `Gambar ${mode === 'transparent' ? 'rute transparan' : 'peta'} berhasil diunduh!`
      });
    } catch {
      setStatusMessage({ type: 'error', text: 'Gagal mengunduh gambar.' });
    }
  };

  // Aksi Berbagi (WhatsApp, Instagram, atau Native Share)
  const handleShare = async (target) => {
    if (!imageBlob && !previewUrl) return;
    setSharingTarget(target);
    setStatusMessage(null);

    const shareTitle = `Aktivitas Lari GeoTrack - ${stats.distFull}`;
    const shareText = `Aktivitas lari bersama GeoTrack 🏃\nJarak: ${stats.distFull}\nPace: ${stats.paceStr} ${stats.paceUnit}\nDurasi: ${stats.timeStr}\n\nTerekam otomatis dengan IoT GPS Tracker GeoTrack.`;

    try {
      const res = await shareActivity({
        blob: imageBlob,
        dataUrl: previewUrl,
        filename: imageFilename,
        title: shareTitle,
        text: shareText,
        target
      });

      if (res?.cancelled) {
        return;
      }

      if (res?.message) {
        setStatusMessage({
          type: res.success ? 'success' : 'info',
          text: res.message
        });
      }
    } catch (err) {
      console.warn('Gagal membagikan:', err);
      // Fallback unduh
      if (imageBlob) downloadBlob(imageBlob, imageFilename);
      setStatusMessage({
        type: 'info',
        text: 'Menu berbagi tidak merespons, gambar otomatis diunduh ke perangkat Anda.'
      });
    } finally {
      setSharingTarget(null);
    }
  };

  return (
    <Modal title="Bagikan Aktivitas" onClose={onClose} wide className="share-modal-dialog">
      <div className="share-modal-container">
        {/* KONTEN UTAMA (SCROLLABLE DENGAN OVERSCROLL CONTAINMENT) */}
        <div className="share-modal-scroll">
          {/* Pilihan Mode Tampilan: Maps & Transparan */}
          <div className="share-mode-selector">
            <button
              type="button"
              className={`share-mode-btn ${mode === 'map' ? 'active' : ''}`}
              onClick={() => setMode('map')}
            >
              <MapIcon size={15} />
              <span>Maps</span>
            </button>
            <button
              type="button"
              className={`share-mode-btn ${mode === 'transparent' ? 'active' : ''}`}
              onClick={() => setMode('transparent')}
            >
              <Layers size={15} />
              <span>Transparan</span>
            </button>
          </div>

          {/* Kotak Preview Gambar 9:16 Responsif */}
          <div className="share-preview-container">
            <div className={`share-preview-card ${mode === 'transparent' ? 'checkerboard-bg' : ''}`}>
              {loading ? (
                <div className="share-preview-loading">
                  <Loader2 size={26} className="spin-animate" />
                  <p>Membuat visual aktivitas...</p>
                  <small>
                    {mode === 'map' ? 'Memuat rute & peta' : 'Membuat rute transparan RGBA'}
                  </small>
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview Bagikan Aktivitas GeoTrack"
                  className="share-preview-img"
                />
              ) : (
                <div className="share-preview-empty">
                  <AlertCircle size={26} />
                  <p>Preview tidak tersedia</p>
                </div>
              )}
            </div>
          </div>

          {/* Ringkasan Statistik Aktivitas UI (Pace, Total Jarak, Durasi Waktu) */}
          <div className="share-stats-summary">
            <div className="share-stat-box">
              <small>PACE</small>
              <b>{stats.paceStr}</b>
              <span>{stats.paceUnit}</span>
            </div>
            <div className="share-stat-box">
              <small>TOTAL JARAK</small>
              <b>{stats.distVal}</b>
              <span>{stats.distUnit}</span>
            </div>
            <div className="share-stat-box">
              <small>DURASI WAKTU</small>
              <b>{stats.timeStr}</b>
              <span>durasi</span>
            </div>
          </div>

          {/* Pesan Notifikasi / Status Aksi */}
          {statusMessage && (
            <div className={`share-status-alert alert-${statusMessage.type}`}>
              {statusMessage.type === 'success' ? (
                <Check size={16} />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle size={16} />
              ) : (
                <Share2 size={16} />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* AREA AKSI BERBAGI (SELALU TERLIHAT DI BAGIAN BAWAH MODAL) */}
        <div className="share-modal-actions-bar">
          <div className="share-actions-grid">
            {/* 1. Unduh Gambar PNG */}
            <button
              type="button"
              className="share-action-btn btn-download"
              disabled={loading}
              onClick={handleDownload}
              title="Unduh gambar PNG 1080x1920"
            >
              <Download size={15} />
              <span>Unduh PNG</span>
            </button>

            {/* 2. WhatsApp Status / Chat */}
            <button
              type="button"
              className="share-action-btn btn-whatsapp"
              disabled={loading || sharingTarget === 'whatsapp'}
              onClick={() => handleShare('whatsapp')}
              title="Bagikan ke WhatsApp"
            >
              <WhatsAppIcon size={15} />
              <span>{sharingTarget === 'whatsapp' ? 'Membuka...' : 'WhatsApp'}</span>
            </button>

            {/* 3. Instagram Story */}
            <button
              type="button"
              className="share-action-btn btn-instagram"
              disabled={loading || sharingTarget === 'instagram'}
              onClick={() => handleShare('instagram')}
              title="Bagikan ke Instagram Story"
            >
              <InstagramIcon size={15} />
              <span>{sharingTarget === 'instagram' ? 'Membuka...' : 'Instagram'}</span>
            </button>

            {/* 4. Menu Berbagi Sistem */}
            <button
              type="button"
              className="share-action-btn btn-system-share"
              disabled={loading || sharingTarget === 'native'}
              onClick={() => handleShare('native')}
              title="Bagikan dengan aplikasi lain"
            >
              <Share2 size={15} />
              <span>Bagikan Lainnya</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ShareActivityModal;
