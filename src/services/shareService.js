// GeoTrack Share Activity Service
// Menghasilkan gambar aktivitas bergaya Strava (1080x1920, 9:16)
// Mendukung Mode Maps (Peta Background) dan Mode Transparan (Rute Transparan PNG RGBA)
// Terintegrasi dengan FileProvider & Intent Native Android/iOS via Capacitor untuk berbagi file gambar langsung

import { validCoord } from './geo.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import logoGeoTrackUrl from '../assets/images/logo-geotrack.png';

const NativeShareHelper = registerPlugin('ShareHelper');

// Cache instance logo resmi GeoTrack dalam memori
let cachedLogo = null;
function loadLogoImage() {
  if (cachedLogo) return Promise.resolve(cachedLogo);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedLogo = img;
      resolve(img);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = logoGeoTrackUrl;
  });
}

// Utilitas hitung detik dari string waktu 'MM:SS' atau 'HH:MM:SS'
export function durationToSecs(dur) {
  if (!dur) return 0;
  return dur.split(':').reduce((acc, part) => acc * 60 + (Number(part) || 0), 0);
}

// Format statistik aktivitas: Distance, Pace, Time
export function formatActivityStats(run) {
  const km = Number(run?.distance || 0);
  const distVal = km < 1 ? String(Math.round(km * 1000)) : km.toFixed(2);
  const distUnit = km < 1 ? 'm' : 'km';
  const distFull = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;

  const totalSecs = durationToSecs(run?.duration);
  let paceStr = '-';
  let paceUnit = '/km';

  if (km > 0.01 && totalSecs > 0) {
    const minsPerKm = (totalSecs / 60) / km;
    if (minsPerKm < 120 && Number.isFinite(minsPerKm)) {
      const pMin = Math.floor(minsPerKm);
      const pSec = Math.round((minsPerKm % 1) * 60);
      paceStr = `${pMin}:${String(pSec).padStart(2, '0')}`;
    }
  }

  const timeStr = run?.duration || '0:00';

  let dateStr = 'GeoTrack Activity';
  if (run?.startedAt) {
    try {
      const d = new Date(run.startedAt);
      dateStr = d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB';
    } catch {
      dateStr = run.startedAt;
    }
  }

  return {
    distVal,
    distUnit,
    distFull,
    paceStr,
    paceUnit,
    timeStr,
    dateStr,
    note: run?.note || ''
  };
}

// Proyeksi koordinat geografis Web Mercator (EPSG:3857)
function projectMercator(lat, lng, zoom) {
  const d = Math.PI / 180;
  const max = 85.0511287798;
  const latClamped = Math.max(Math.min(max, lat), -max);
  const sin = Math.sin(latClamped * d);
  const scale = 256 * Math.pow(2, zoom);
  const x = scale * (lng + 180) / 360;
  const y = scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
  return { x, y };
}

// Cari zoom optimal agar rute muat dengan padding
function calculateOptimalZoom(minLat, maxLat, minLng, maxLng, viewW, viewH) {
  for (let z = 18; z >= 9; z--) {
    const pTopLeft = projectMercator(maxLat, minLng, z);
    const pBottomRight = projectMercator(minLat, maxLng, z);
    const w = Math.abs(pBottomRight.x - pTopLeft.x);
    const h = Math.abs(pBottomRight.y - pTopLeft.y);
    if (w <= viewW * 0.72 && h <= viewH * 0.72) {
      return z;
    }
  }
  return 12;
}

// Muat gambar tile OSM dengan timeout agar tidak macet
function loadTileImage(url, timeoutMs = 2800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Gambar persegi panjang bersudut tumpul (cross-browser)
function drawRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Render visual aktivitas ke HTML5 Canvas ukuran 1080x1920 (9:16)
 * @param {Object} run Objek aktivitas riwayat lari
 * @param {'map'|'transparent'} mode 'map' untuk background peta (Maps), 'transparent' untuk rute transparan RGBA
 * @returns {Promise<{canvas: HTMLCanvasElement, blob: Blob, dataUrl: string, filename: string, stats: Object}>}
 */
export async function renderActivityImage(run, mode = 'map') {
  const targetW = 1080;
  const targetH = 1920;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  const stats = formatActivityStats(run);
  const rawRoute = Array.isArray(run?.route) ? run.route : [];
  const pts = rawRoute.filter(p => validCoord(p[0], p[1]));

  // Muat logo resmi GeoTrack
  const logoImg = await loadLogoImage();

  if (mode === 'transparent') {
    // Mode Transparan: Latar belakang 100% transparan murni (RGBA alpha = 0)
    ctx.clearRect(0, 0, targetW, targetH);
  } else {
    // Mode Maps: Latar belakang gelap dasar sebelum peta dimuat
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  // --- RENDERING RUTE & PETA ---
  if (pts.length >= 2) {
    const lats = pts.map(p => Number(p[0]));
    const lngs = pts.map(p => Number(p[1]));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    if (mode === 'map') {
      // Area fokus rute di tengah kartu
      const mapW = targetW;
      const mapH = 1450;
      const zoom = calculateOptimalZoom(minLat, maxLat, minLng, maxLng, mapW, mapH);

      const centerPixel = projectMercator(centerLat, centerLng, zoom);
      const canvasCenterX = targetW / 2;
      const canvasCenterY = 820; // pusat rute di kanvas

      const leftPixel = centerPixel.x - canvasCenterX;
      const rightPixel = centerPixel.x + canvasCenterX;
      const topPixel = centerPixel.y - canvasCenterY;
      const bottomPixel = centerPixel.y + (targetH - canvasCenterY);

      const minTileX = Math.floor(leftPixel / 256);
      const maxTileX = Math.floor(rightPixel / 256);
      const minTileY = Math.floor(topPixel / 256);
      const maxTileY = Math.floor(bottomPixel / 256);

      // Ambil tile OpenStreetMap secara paralel
      const tileLoads = [];
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          const sub = ['a', 'b', 'c'][Math.abs(tx + ty) % 3];
          const url = `https://${sub}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          tileLoads.push(
            loadTileImage(url).then(img => ({ img, tx, ty }))
          );
        }
      }

      const loadedTiles = await Promise.all(tileLoads);
      let tilesDrawn = 0;
      for (const t of loadedTiles) {
        if (t.img) {
          const x = Math.round(t.tx * 256 - leftPixel);
          const y = Math.round(t.ty * 256 - topPixel);
          ctx.drawImage(t.img, x, y, 256, 256);
          tilesDrawn++;
        }
      }

      // Jika tile gagal atau offline, beri latar grid gelap artistik
      if (tilesDrawn < 2) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < targetW; gx += 80) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, targetH);
          ctx.stroke();
        }
        for (let gy = 0; gy < targetH; gy += 80) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(targetW, gy);
          ctx.stroke();
        }
      }

      // Overlay gelap lembut bergaya Strava agar kontras rute biru maksimal
      const mapOverlay = ctx.createLinearGradient(0, 0, 0, targetH);
      mapOverlay.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
      mapOverlay.addColorStop(0.3, 'rgba(15, 23, 42, 0.15)');
      mapOverlay.addColorStop(0.7, 'rgba(15, 23, 42, 0.25)');
      mapOverlay.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
      ctx.fillStyle = mapOverlay;
      ctx.fillRect(0, 0, targetW, targetH);

      // Konversi titik GPS ke koordinat piksel kanvas
      const screenPts = pts.map(p => {
        const prj = projectMercator(Number(p[0]), Number(p[1]), zoom);
        return [prj.x - leftPixel, prj.y - topPixel];
      });

      // 1. Bayangan rute
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      screenPts.forEach(([sx, sy], i) => {
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      // 2. Garis rute biru utama GeoTrack (#2563eb)
      ctx.beginPath();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      screenPts.forEach(([sx, sy], i) => {
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      // 3. Titik Awal (Hijau) & Titik Akhir (Merah)
      const startPt = screenPts[0];
      const endPt = screenPts[screenPts.length - 1];

      // Marker Start (Hijau)
      ctx.beginPath();
      ctx.arc(startPt[0], startPt[1], 15, 0, Math.PI * 2);
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Marker Finish (Merah)
      ctx.beginPath();
      ctx.arc(endPt[0], endPt[1], 15, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

    } else {
      // MODE TRANSPARAN: Rute murni alpha channel
      const boxX = 110;
      const boxY = 320;
      const boxW = targetW - 220; // 860px
      const boxH = 1120; // ruang rute tengah

      const rad = Math.PI / 180;
      const cosLat = Math.cos(centerLat * rad);
      const spanLng = (maxLng - minLng) * cosLat;
      const spanLat = maxLat - minLat;

      const scale = Math.min(boxW / Math.max(spanLng, 0.0001), boxH / Math.max(spanLat, 0.0001));
      const routePixelW = spanLng * scale;
      const routePixelH = spanLat * scale;
      const offsetX = boxX + (boxW - routePixelW) / 2;
      const offsetY = boxY + (boxH - routePixelH) / 2;

      const transPts = pts.map(p => {
        const x = offsetX + (Number(p[1]) - minLng) * cosLat * scale;
        const y = offsetY + (maxLat - Number(p[0])) * scale;
        return [x, y];
      });

      // 1. Gambar bayangan lembut rute transparan
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      transPts.forEach(([tx, ty], i) => {
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      });
      ctx.stroke();

      // 2. Garis rute biru solid
      ctx.beginPath();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      transPts.forEach(([tx, ty], i) => {
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      });
      ctx.stroke();

      // Marker Start & Finish
      const startPt = transPts[0];
      const endPt = transPts[transPts.length - 1];

      ctx.beginPath();
      ctx.arc(startPt[0], startPt[1], 15, 0, Math.PI * 2);
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(endPt[0], endPt[1], 15, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  } else {
    // Rute kosong
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tidak ada rekaman koordinat rute GPS', targetW / 2, 850);
  }

  // --- HEADER BRANDING RESMI GEOTRACK (Watermark Putih & Logo Asli) ---
  const headerY = 110;
  ctx.save();
  // Bayangan teks tipis agar kontras maksimal di latar terang maupun gelap
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  let brandX = 60;
  // Gambar Logo Resmi GeoTrack (56x56) dengan proporsi asli
  if (logoImg) {
    ctx.drawImage(logoImg, brandX, headerY - 6, 56, 56);
    brandX += 70;
  }

  // Teks Logo GeoTrack Putih Murni (#FFFFFF)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GeoTrack', brandX, headerY + 38);

  // Tanggal & Waktu Aktivitas di Bawah Branding
  ctx.font = '500 26px sans-serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(stats.dateStr, 60, headerY + 115);
  ctx.restore();

  // --- KARTU STATISTIK (Bagian Bawah: Pace, Distance, Time) ---
  const cardX = 60;
  const cardY = 1480;
  const cardW = targetW - 120; // 960px
  const cardH = 360;
  const cardRadius = 32;

  ctx.save();
  // Latar belakang kartu statistik (gelap elegan / frosted glass)
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.stroke();
  ctx.restore();

  // 3 Kolom Statistik
  const colW = cardW / 3;
  const labelY = cardY + 70;
  const valY = cardY + 155;
  const unitY = cardY + 205;

  ctx.save();
  ctx.textAlign = 'center';

  // Kolom 1: PACE
  const col1X = cardX + colW * 0.5;
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('PACE', col1X, labelY);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(stats.paceStr, col1X, valY);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 26px sans-serif';
  ctx.fillText(stats.paceUnit, col1X, unitY);

  // Garis Pemisah 1
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + colW, cardY + 40);
  ctx.lineTo(cardX + colW, cardY + cardH - 100);
  ctx.stroke();

  // Kolom 2: DISTANCE (JARAK)
  const col2X = cardX + colW * 1.5;
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('JARAK', col2X, labelY);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(stats.distVal, col2X, valY);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 26px sans-serif';
  ctx.fillText(stats.distUnit, col2X, unitY);

  // Garis Pemisah 2
  ctx.beginPath();
  ctx.moveTo(cardX + colW * 2, cardY + 40);
  ctx.lineTo(cardX + colW * 2, cardY + cardH - 100);
  ctx.stroke();

  // Kolom 3: TIME (WAKTU)
  const col3X = cardX + colW * 2.5;
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('WAKTU', col3X, labelY);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(stats.timeStr, col3X, valY);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 26px sans-serif';
  ctx.fillText('durasi', col3X, unitY);

  // Footer kartu statistik: [LOGO] GeoTrack (Putih & Tajam)
  const footerCenterY = cardY + cardH - 45;
  const brandLabel = 'GeoTrack';
  const tagLabel = ' · Smart GPS Tracker';
  ctx.font = 'bold 28px sans-serif';
  const brandW = ctx.measureText(brandLabel).width;
  ctx.font = '500 22px sans-serif';
  const tagW = ctx.measureText(tagLabel).width;
  const footerLogoSize = 36;
  const footerGap = 12;
  const totalFooterW = (logoImg ? footerLogoSize + footerGap : 0) + brandW + tagW;
  const footerStartX = (targetW - totalFooterW) / 2;

  let curX = footerStartX;
  if (logoImg) {
    ctx.drawImage(logoImg, curX, footerCenterY - footerLogoSize / 2, footerLogoSize, footerLogoSize);
    curX += footerLogoSize + footerGap;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(brandLabel, curX, footerCenterY);
  curX += brandW;

  ctx.font = '500 22px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(tagLabel, curX, footerCenterY);

  ctx.restore();

  // Generate output Blob dan DataURL
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const dataUrl = canvas.toDataURL('image/png');
  const cleanDate = (run?.startedAt || 'activity').slice(0, 10).replace(/[^0-9-]/g, '');
  const cleanDist = stats.distFull.replace(/\s+/g, '');
  const filename = `geotrack-${cleanDate}-${cleanDist}-${mode}.png`;

  return {
    canvas,
    blob,
    dataUrl,
    filename,
    stats
  };
}

// Bantuan unduh file blob secara langsung
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * Mekanisme Native Sharing Android/iOS via Capacitor FileProvider & Intent,
 * dengan Web Share API Level 2 (files) dan download fallback.
 */
export async function shareActivity({ blob, dataUrl, filename, title, text, target = 'native' }) {
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  const shareTitle = title || 'Aktivitas Lari GeoTrack';
  const shareText = text || 'Aktivitas lari bersama GeoTrack!';

  // 1. Jika di Android / iOS (Capacitor Native): Gunakan FileProvider & Intent asli dengan File Attachment
  if (isNative) {
    try {
      let base64 = dataUrl;
      if (!base64 && blob) {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const res = await NativeShareHelper.shareFile({
        base64Data: base64,
        filename: filename || 'geotrack-activity.png',
        title: shareTitle,
        text: shareText,
        target: target // 'whatsapp' | 'instagram' | 'native'
      });

      let message = 'Membuka menu berbagi perangkat dengan gambar terlampir...';
      if (target === 'whatsapp') {
        message = res?.direct
          ? 'Membuka WhatsApp dengan gambar terlampir...'
          : 'Pilih WhatsApp pada menu berbagi untuk melampirkan gambar.';
      } else if (target === 'instagram') {
        message = res?.direct
          ? 'Membuka Instagram dengan gambar terlampir...'
          : 'Pilih Instagram pada menu berbagi untuk melampirkan gambar.';
      }

      return { success: true, method: 'capacitor-native', message };
    } catch (err) {
      console.warn('NativeShareHelper gagal, mencoba web fallback:', err);
    }
  }

  // 2. Web Share API Level 2 (jika didukung oleh browser modern dengan files)
  if (blob) {
    const file = new File([blob], filename, { type: 'image/png' });
    const canNativeShareFile = typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] });

    if (canNativeShareFile) {
      try {
        await navigator.share({
          files: [file],
          title: shareTitle,
          text: shareText
        });
        return { success: true, method: 'web-share', message: 'Gambar berhasil dibagikan!' };
      } catch (err) {
        if (err?.name === 'AbortError') {
          return { cancelled: true, message: 'Berbagi dibatalkan.' };
        }
      }
    }
  }

  // 3. Fallback jika native sharing tidak didukung oleh browser web
  if (blob) downloadBlob(blob, filename);

  if (target === 'whatsapp') {
    const waText = encodeURIComponent(`${shareText}\n(Gambar hasil aktivitas lari telah diunduh, silakan lampirkan ke WhatsApp)`);
    window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
    return {
      success: true,
      method: 'whatsapp-web-fallback',
      message: 'Gambar berhasil diunduh! Silakan lampirkan ke Status atau Chat WhatsApp Anda.'
    };
  }

  return {
    success: true,
    method: 'download-fallback',
    message: 'Gambar aktivitas berhasil diunduh ke perangkat Anda.'
  };
}
