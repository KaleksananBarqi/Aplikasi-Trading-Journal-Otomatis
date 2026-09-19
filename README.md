# Aplikasi Trading Journal Otomatis

Aplikasi desktop lokal (single user) untuk menarik histori futures secara **read-only** dari
**MEXC** dan **Bitunix**, menyimpannya di SQLite lokal, lalu menyajikan analitik trading dan
jurnal manual.

Bukan web app, bukan SaaS, bukan trading bot. **Tidak ada kemampuan eksekusi order.**

---

## Ringkasan Cepat

| Aspek | Nilai |
|---|---|
| Versi | 1.2.0 |
| Platform | Electron + React 19 + TypeScript + Vite 7 |
| Database | SQLite lokal (`better-sqlite3`, prebuilt N-API) |
| Styling | Tailwind v4 (plugin Vite, bukan PostCSS) |
| Chart | `lightweight-charts` v5 (equity/drawdown) + SVG sendiri (heatmap, histogram, scatter) |
| Exchange | MEXC via `ccxt` (certified) · Bitunix via REST resmi (manual) |
| AI | OpenAI-compatible Chat Completions API (fitur opsional) |
| Backup | Google Drive via OAuth 2.0 PKCE (satu arah) |
| Ekspor | CSV (UTF-8 BOM), JSON, PDF (Chromium offscreen) |
| Kredensial | `safeStorage` bawaan Electron — DPAPI / Keychain / libsecret |
| Installer | `electron-builder` → NSIS `.exe` |

---

## Menjalankan

```bash
npm install          # tidak ada compile native — lihat catatan di bawah
npm run dev          # buka aplikasi dalam mode development
```

### Membuat installer

```bash
npm run dist         # menghasilkan release/TradingJournal-Setup-<versi>.exe
```

Installer bisa diklik dua kali — tidak perlu command line, Docker, atau database server.

> **Catatan penting soal `npm install`:** proyek ini **tidak memerlukan Visual Studio C++ build
> tools**. `better-sqlite3@13` mengirim prebuilt **N-API** binary yang ABI-stabil, sehingga tidak
> perlu di-rebuild per versi Electron. Karena itu `electron-builder.yml` menyetel `npmRebuild: false`.
> Kalau membuat dari nol, npm 11 memblokir install script secara default — jalankan
> `npm approve-scripts better-sqlite3 esbuild` (per paket, bukan `--all`).

---

## Verifikasi

Proyek ini punya 349 pemeriksaan otomatis. Semuanya bisa dijalankan ulang:

```bash
npm run verify              # seluruh rangkaian (typecheck + semua fase)
npm run verify:fase1        # 45 pemeriksaan — skema, CRUD, isolasi jurnal
npm run verify:fase2        # 66 pemeriksaan — mapper MEXC, idempotensi sync
npm run verify:fase3        # 63 pemeriksaan — signing Bitunix, dua exchange berdampingan
npm run verify:metrics      # 93 pemeriksaan — metrik dengan nilai dihitung tangan
npm run verify:packaged     # 31 pemeriksaan — isi installer & native addon
npm run verify:acceptance   # 51 pemeriksaan — 7 acceptance criteria brief §11
npm run smoke               # native addon di dalam Electron
```

Hasil terakhir: **semua lulus**. Lihat [`plans/SESSION.md`](plans/SESSION.md:1) untuk status per fase.

---

## Fitur

### Sinkronisasi Saldo & Riwayat (read-only)
- **MEXC** — posisi tertutup, fills, funding fee, dan **saldo akun futures real-time** via CCXT swap balance. Backfill penuh saat sync pertama, incremental setelahnya.
- **Bitunix** — posisi tertutup, order historis, dan **saldo akun futures real-time** via REST `/api/v1/futures/account`. Funding fee **tidak tersedia** (lihat Keterbatasan).
- **Widget Saldo di Dashboard** — menampilkan Total Ekuitas Akun, Free Margin, Floating PnL, chip rincian per exchange, serta tombol perbarui saldo instan.
- Idempotent: sync berulang **tidak** menciptakan duplikat.
- Tombol Sync Now tersedia di sidebar (dari halaman mana pun) dan di Settings.
- Auto-sync **default OFF** — tidak pernah memanggil API tanpa Anda minta.

### Jurnal manual
- `setup_tag`, tesis pre-trade, review post-trade, tag emosi, checklist aturan, screenshot path.
- **`execution_grade` (A/B/C/D) terpisah dari profit/loss.** Eksekusi bagus bisa rugi; eksekusi
  buruk bisa untung. Menggabungkannya akan membuat Anda salah belajar dari data sendiri.
- Jurnal **tidak pernah** disentuh sync engine — catatan subjektif Anda aman dari tertimpa.

### Generator Kartu Pamer PnL + Tesis Tiap Trade
- Buat kartu pamer performa estetik beresolusi tinggi (Retina 2x) berbasis HTML5 Canvas native.
- **5 Pilihan Tema Visual**: *Cyberpunk Neon*, *Obsidian Gold*, *Emerald Mint*, *Sunset Synth*, dan *Minimal Dark*.
- **3 Aspek Rasio**: `1:1` (Square untuk Instagram/Telegram Feed), `9:16` (Story/TikTok/Reels), dan `16:9` (Twitter/X Header).
- **Tesis & Review Live**: Catatan tesis pre-trade dan review post-trade otomatis diambil dan dapat disunting langsung di preview modal.
- **Logo Exchange Opsional**: Bisa memasang logo MEXC, Bitunix, Binance, Bybit, atau mode polos tanpa logo.
- **Ekspor 1-Klik**: Salin gambar langsung ke clipboard (bisa langsung Ctrl+V di chat/medsos) atau unduh file PNG.
- Tombol **✨ Pamer** tersedia langsung di tabel Trade Log, daftar Journal Entry, dan card Trade Terakhir di Dashboard.

### Generator Kartu Pamer Full Analytics
- Kartu visual komprehensif merangkum seluruh metrik kunci: Net PnL, Win Rate %, Visual Win/Loss Bar, Profit Factor, Expectancy, Total Trades, dan Max Drawdown.
- **Mini Kurva Equity Glowing**: Visualisasi grafik pertumbuhan modal neon dengan area gradient.
- **Mode Privasi**: Sembunyikan nominal dolar ($) untuk pamer rasio, win rate, dan ROI persentase tanpa mengekspos modal riil Anda.
- Tombol pintas **📊 Pamer Analytics** disematkan di header halaman Dashboard dan Analytics.

### Screenshot
- Unggah screenshot langsung ke trade dari Trade Editor.
- File disimpan di folder terkelola `userData/data/screenshots` dengan nama generik.
- Validasi ekstensi (PNG/JPG/WebP/GIF) dan magic bytes — file bukan gambar ditolak.
- Batas ukuran 4 MB. Path traversal dicegah: nama file generik, bukan input user.
- Screenshot ikut ter-backup ke Google Drive saat backup dijalankan.

### RR Rencana Otomatis
- `plannedRr` dihitung otomatis dari entry, SL, dan TP saat Anda mengisi ketiganya.
- Long: `reward = |target - entry|`, Short: `reward = |entry - target|`.
- Jika SL kosong atau sama dengan entry, RR tetap `null` — bukan nol buatan.
- RR Rencana ditampilkan terpisah dari R-Multiple Realisasi.

### Tag Kustom Banyak Nilai
- Satu trade bisa memiliki banyak tag bebas (mis. `BTC_Scalp`, `SalahEksekusi`).
- `setup_tag` lama tetap dipertahankan untuk kompatibilitas data lama.
- Autocomplete dari tag yang pernah dipakai.
- Filter multi-tag memakai semantik **SEMUA tag harus ada** agar hasil lebih presisi.
- Tag ditampilkan sebagai chip di daftar trade, detail jurnal, dan hasil ekspor.

### Analitik
- Equity curve, kurva drawdown (underwater), kalender heatmap harian.
- Win rate, profit factor, expectancy sebagai headline metrics.
- Histogram R-multiple, **dengan cakupan eksplisit** (berapa trade punya R valid).
- Breakdown per setup, symbol, sesi, hari, grade, arah, exchange.
- Scatter grade vs P&L — sengaja **tanpa** garis tren atau skor korelasi.
- Filter global yang berlaku untuk semua chart sekaligus.

### Ekspor Journal
- **CSV** dengan UTF-8 BOM agar Excel membaca encoding dengan benar. Escaping RFC 4180.
- **JSON** pretty-print 2 spasi, UTF-8.
- **PDF** dirender dari HTML via Chromium offscreen `BrowserWindow.printToPDF()`.
- File disimpan lewat `dialog.showSaveDialog()` — tidak ada penulisan diam-diam.
- Filter aktif diterapkan ke hasil ekspor.

### Backup Google Drive (Dual-Mode)
- **Mode 1 (Folder Lokal Google Drive — Rekomendasi/1-Klik)**:
  - Cukup pilih folder Google Drive di komputer Anda (misal `G:\My Drive\TradingBackup`).
  - Snapshot JSON semua trade dan lampiran screenshot otomatis disalin ke folder tersebut, dan disinkronkan langsung ke cloud oleh aplikasi Google Drive for Desktop. **Tanpa perlu konfigurasi API key atau GCP Client ID sama sekali.**
- **Mode 2 (Cloud OAuth Direct)**:
  - Form input Google OAuth Client ID terintegrasi langsung di UI Settings tanpa perlu mengedit file `.env` manual.
  - Alur login OAuth 2.0 PKCE dengan loopback redirect (`http://localhost:PORT`).
  - Token disimpan aman via `safeStorage` OS.
- Backup **satu arah**: aman dari risiko tertimpa data finansial.

### Wawasan AI (opsional)
- Analisa otomatis pola kelemahan dan saran perbaikan dari data journal.
- Memakai OpenAI Chat Completions API (kompatibel dengan provider OpenAI-compatible).
- API key disimpan via `safeStorage`. Model dan base URL dikonfigurasi di Settings.
- Prompt terstruktur dalam Bahasa Indonesia, meminta output JSON stabil.
- Hasil: ringkasan, pola kelemahan, saran perbaikan, dan metrik.
- **Bukan nasihat keuangan.** Tidak ada saran order atau sinyal entry.

### Tampilan
- Dark mode default, dengan opsi light dan ikuti sistem.
- **Mode colorblind-safe** — hijau/merah menjadi biru/oranye.
- **Hide P&L** — sembunyikan semua angka P&L dengan satu toggle (privasi saat screen share).
- Font monospace untuk angka dan tabel, sans-serif untuk teks naratif.

---

## Keputusan Teknis yang Perlu Diketahui

### 1. `ccxt` hanya untuk MEXC
Bitunix tidak didukung ccxt (dari 104 exchange). Bitunix memakai implementasi manual ke REST resmi,
sesuai brief §4.2 yang melarang library unofficial tidak terawat.

### 2. Mapper MEXC membaca response MENTAH, bukan hasil normalisasi ccxt
Diverifikasi langsung ke source ccxt 4.5.78. Ada tiga masalah pada normalisasi posisi **tertutup**:

| Field | Masalah |
|---|---|
| `contracts` | ccxt membaca `holdVol`, yang bernilai `'0'` untuk posisi tertutup. Volume sebenarnya di `closeVol` |
| `marginType` | ccxt membaca `margin_mode` yang **tidak ada** di response MEXC (namanya `openType`), sehingga selalu salah jadi `cross` |
| `exitPrice` | tidak ada di struktur standar ccxt |

ccxt tetap dipakai untuk yang sulit — HMAC signing, rate limiting, routing endpoint. Tapi **field
data** dibaca dari `position.info`. Jangan "merapikan" ini tanpa memverifikasi ulang ke ccxt terbaru.

### 3. Signing Bitunix BUKAN HMAC
Brief menyebut "HMAC-SHA256 double-hash". Itu **keliru**. Yang benar adalah SHA256 berantai:

```
digest = SHA256(nonce + timestamp + apiKey + queryParams + body)
sign   = SHA256(digest + secretKey)
```

Tidak ada HMAC sama sekali. Diverifikasi dari SDK resmi Bitunix dan dokumentasi resmi.

### 4. `npmRebuild: false` di electron-builder
Default-nya electron-builder menjalankan `@electron/rebuild`, yang **membuat packaging gagal total**
tanpa Visual Studio. Rebuild itu tidak diperlukan karena prebuilt N-API sudah ABI-stabil.

### 5. PDF tanpa dependency eksternal
PDF dibuat dari HTML via `BrowserWindow.offscreen` + `printToPDF()` — Electron sudah punya Chromium,
tidak perlu library PDF tambahan.

### 6. Backup Google Drive: satu arah
Tidak ada download/restore otomatis. Alasan: restore otomatis bisa menimpa data lokal tanpa
konfirmasi user, yang berbahaya untuk data finansial.

---

## Keterbatasan yang Diketahui

| Keterbatasan | Sebab | Dampak |
|---|---|---|
| **Funding fee Bitunix = 0** | Bitunix tidak menyediakan endpoint riwayat biaya funding per akun. Yang ada hanya riwayat *rate* publik | Kolom funding fee trade Bitunix bernilai 0. Aplikasi **tidak mengira-ngira** dari rate, karena itu akan menghasilkan angka karangan |
| **Nama field Bitunix belum tersempitkan** | Dokumentasi tidak menampilkan contoh response lengkap | Mapper membaca beberapa kandidat nama field. Setelah sync akun nyata, periksa `raw_payload` lalu sempitkan |
| **Belum diuji di mesin bersih** | Butuh VM tanpa Node/Python | Installer terbentuk & isinya terverifikasi, tapi instalasi di mesin bersih belum dijalankan |
| **Belum sync akun nyata** | Butuh API key read-only dari user | Idempotensi terbukti dengan data deterministik, bukan dengan API live |
| **Tanpa code signing** | Build personal tanpa sertifikat | Windows SmartScreen akan menampilkan peringatan saat installer dibuka |
| **AI hanya analisa teks** | Implementasi awal | Screenshot tidak dikirim sebagai input vision. Hanya data terstruktur dan teks jurnal |
| **Google Drive Client ID perlu diset** | Tidak ada default hardcoded | Set `GDRIVE_CLIENT_ID` environment variable sebelum bisa menghubungkan Drive |

---

## Keamanan

- Kredensial disimpan lewat `safeStorage` — **tidak pernah** di file plaintext, database, atau `.env`.
- Kredensial mengalir **satu arah**: renderer → main. Renderer tidak pernah menerimanya kembali;
  yang dibaca hanya status + petunjuk kunci (mis. `a1b2…f9`).
- API key AI dan token Google Drive juga disimpan via `safeStorage` — pola yang sama.
- Kalau `safeStorage` tidak tersedia, penyimpanan **ditolak** — tidak ada fallback plaintext.
- CSP melarang renderer menghubungi apa pun (`connect-src 'none'`). Tidak ada telemetry.
- Semua panggilan network (exchange, OpenAI, Google Drive) dilakukan dari main process.
- Screenshot divalidasi: ekstensi, magic bytes, batas ukuran, dan nama generik anti path traversal.

### Membuat API key yang benar
Saat mengisi API key di Settings, **hanya aktifkan izin baca**. Jangan aktifkan izin trading atau
withdraw. Aplikasi tidak akan memanggil endpoint yang bisa membuat, mengubah, atau membatalkan order —
sekalipun Anda memberinya izin tersebut.

---

## Struktur Proyek

```
electron/            main process — akses Node penuh
  main.ts            entry, window, single-instance lock
  preload.ts         contextBridge — surface IPC sempit & bertipe
  credentials/       safeStorage wrapper (exchange + AI + Google Drive)
  db/                koneksi, migrasi, repositories
  exchanges/         adapter per exchange (mexc/, bitunix/) + kontrak types.ts
  sync/              sync engine — exchange-agnostic
  ipc/               handlers
  ai/                OpenAI-compatible API integration
  backup/            Google Drive OAuth PKCE + backup engine
  export/            CSV, JSON, PDF formatters
  screenshots/       manajemen file screenshot lokal

src/                 renderer — TANPA akses Node
  routes/            Dashboard, TradeLog, JournalEntry, TradeEditor, Analytics, Settings, ErrorLog
  components/        UI primitives + charts + AiInsightsPanel + BackupPanel
  hooks/             useTheme, useHidePnl, useTrades
  lib/analytics/     metrik & dimensi (fungsi murni, teruji)

shared/              tipe & kontrak IPC (dipakai kedua sisi)

plans/               dokumen perencanaan & keputusan
scripts/             verifikasi & launcher
```

**Batas keras:** `src/` tidak boleh meng-import dari `electron/`. Semua lewat IPC di `preload.ts`.

---

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`plans/01-ARCHITECTURE.md`](plans/01-ARCHITECTURE.md:1) | Keputusan terkunci, struktur, kontrak adapter, batas sesi |
| [`plans/02-DATA-MODEL.md`](plans/02-DATA-MODEL.md:1) | Skema SQLite, PRAGMA wajib, aturan migrasi |
| [`plans/03-PHASES.md`](plans/03-PHASES.md:1) | Fase 0–5 dengan kriteria verifikasi & temuan |
| [`plans/04-FEATURES.md`](plans/04-FEATURES.md:1) | Rencana implementasi enam fitur tambahan |
| [`plans/05-FEATURES-PLAN.md`](plans/05-FEATURES-PLAN.md:1) | Detail langkah implementasi fitur |
| [`plans/SESSION.md`](plans/SESSION.md:1) | Status per fase |
| [`docs/git-tagging-steps.md`](docs/git-tagging-steps.md:1) | Langkah tagging rilis Git |

---

## Lisensi

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

MIT License
