# GeoTrack

Sistem GPS monitoring dengan dua mode akun (Running & Rental). Semua data disimpan di Supabase, tanpa data dummy.

## Cara menjalankan
1. **Database** — Supabase > SQL Editor: tempel & jalankan seluruh `supabase/schema.sql`, lalu `supabase/heartbeat.sql`, lalu `supabase/laporan_pembelian.sql`.
   Lalu di bagian 11 (paling bawah) isi email/password admin, hapus `--` di depan baris `select ...`, dan jalankan.
2. **Env** — salin `.env.example` menjadi `.env`, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `npm install` lalu `npm run dev`.

## Alur sistem
- **Admin** login → *Manajemen User* → Tambah User: nama, username, email, password, role, **mode (Running/Rental)**.
  User itu langsung bisa login (email atau username) dan masuk ke tampilan sesuai modenya.
- Admin menambah device (*Manajemen Device*), lalu menghubungkannya ke user (*Jual / Hubungkan Device*).
- **Mode Rental**: user mengelola alat rental miliknya (judul, deskripsi, harga/hari, kontak, lokasi, dan status).
  Kesepakatan dengan penyewa dilakukan langsung oleh pemilik alat, lalu status alat diperbarui menjadi *Disewa* atau *Tersedia*.
- **Mode Running**: user merekam lari memakai GPS browser (perlu izin lokasi dan HTTPS atau localhost); jarak, pace, serta jalur diperbarui dari posisi GPS. Sesi aktif dipulihkan setelah halaman dimuat ulang dan bisa dihentikan atau disimpan sendiri. Browser dapat menghentikan pembaruan GPS jika aplikasi ditutup atau sistem membatasi aktivitas latar belakang.
- Keamanan: Row Level Security — user hanya bisa membaca/mengubah data miliknya; admin memegang semua.

## ESP32 → tabel `gps_data`
Struktur `gps_data`: `id, device_id, latitude, longitude, speed, accuracy, satellites, battery, signal, recorded_at`.
ESP32 mengirim lewat fungsi `ingest_gps` (kode device + kunci rahasia per device; kunci terlihat admin di
*Manajemen Device > Edit*). Contoh firmware: `esp32/geotrack.ino` (isi `esp32/config.h`).
Device dianggap **Online** jika mengirim data dalam 2 menit terakhir.

### Sambungan modul GPS ke ESP32
Gunakan UART silang: **TX GPS ke RX ESP32**, **RX GPS ke TX ESP32**, dan **GND ke GND**. Untuk NEO-6M/NEO-7M,
pasang antena lalu tunggu fix di area terbuka. VCC harus mengikuti spesifikasi board GPS; jalur UART ESP32 tetap 3,3 V.

| Firmware yang di-flash | TX GPS ke RX ESP32 | RX GPS ke TX ESP32 | Baud |
| --- | --- | --- | --- |
| Arduino `geotrack.ino` | GPIO16 | GPIO17 | 9600 |
| MicroPython `boot.py` | GPIO17 | GPIO16 | 9600 |

Pilih dan flash **satu** firmware saja. Isi `DEVICE_KEY`, lalu buka Serial Monitor 115200 baud. Respons POST
`200`/`201` menunjukkan titik GPS telah masuk ke Supabase.

## Fitur pemantauan & laporan
- **Laporan Pembelian** (admin): tiap kali device dihubungkan ke user di *Jual / Hubungkan Device*, harga, tanggal,
  metode bayar, dan catatan tercatat otomatis. Laporan bisa difilter (tanggal, mode, pencarian), diunduh CSV, dan dicetak.
  User melihat bukti pembeliannya sendiri di *Device Saya > Pembelian*. Perlu menjalankan `supabase/laporan_pembelian.sql`.
- **Cek Fungsional**: menguji 4 hal per device — Dashboard (database & realtime), Baterai (level + tren turun), Koneksi
  (online/offline, kekuatan Wi-Fi, interval kirim), Maps (server peta, validitas koordinat, jumlah satelit, HDOP).
  Admin: menu *Cek Fungsional*. User: *Device Saya > Cek Fungsional*.
- **Titik per titik**: *Lokasi > Titik per Titik* menampilkan tiap titik GPS (waktu, koordinat, kecepatan, satelit, baterai,
  jarak antar titik) pada peta bernomor, dengan filter rentang waktu dan unduh CSV. Admin: menu *Lokasi & Titik*.
- **Deteksi lokasi**: koordinat device diterjemahkan menjadi nama jalan/daerah (OpenStreetMap Nominatim), dan tombol
  *Deteksi lokasi saya* memakai GPS/Wi-Fi browser untuk menampilkan posisi Anda, jaraknya ke device, dan rute di Google Maps.
  Deteksi lokasi browser hanya jalan di HTTPS atau localhost.

## Menu user (diringkas jadi 5)
Dashboard · Running *(atau Rental Alat)* · Lokasi · Device Saya · Bantuan.
Fitur lain menjadi tab di dalam halaman: Running = Rekam Lari/Riwayat; Lokasi = Peta/Titik per Titik/Riwayat Jalur;
Device Saya = Perangkat/Cek Fungsional/Pembelian; Bantuan = Pengaduan/Notifikasi.
