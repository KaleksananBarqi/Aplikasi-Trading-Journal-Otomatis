# Aplikasi Trading Journal Otomatis

Aplikasi desktop lokal (single user) untuk menarik histori futures secara **read-only** dari
**MEXC** dan **Bitunix**, menyimpannya di SQLite lokal, lalu menyajikan analitik trading dan
jurnal manual.

Bukan web app, bukan SaaS, bukan trading bot. **Tidak ada kemampuan eksekusi order.**

---

## Ringkasan Cepat

| Aspek | Nilai |
|---|---|
| Platform | Electron + React 19 + TypeScript + Vite 7 |
| Database | SQLite lokal (`better-sqlite3`, prebuilt N-API) |
| Styling | Tailwind v4 (plugin Vite, bukan PostCSS) |
| Chart | `lightweight-charts` v5 (equity/drawdown) + SVG sendiri (heatmap, histogram, scatter) |
| Exchange | MEXC via `ccxt` (certified) · Bitunix via REST resmi (manual) |
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

Proyek ini punya 300+ pemeriksaan otomatis. Semuanya bisa dijalankan ulang:

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

### Sinkronisasi (read-only)
- **MEXC** — posisi tertutup, fills, funding fee. Backfill penuh saat sync pertama, incremental setelahnya.
- **Bitunix** — posisi tertutup & order historis. Funding fee **tidak tersedia** (lihat Keterbatasan).
- Idempotent: sync berulang **tidak** menciptakan duplikat.
- Tombol Sync Now tersedia di sidebar (dari halaman mana pun) dan di Settings.
- Auto-sync **default OFF** — tidak pernah memanggil API tanpa Anda minta.

### Jurnal manual
- `setup_tag`, tesis pre-trade, review post-trade, tag emosi, checklist aturan, screenshot path.
- **`execution_grade` (A/B/C/D) terpisah dari profit/loss.** Eksekusi bagus bisa rugi; eksekusi
  buruk bisa untung. Menggabungkannya akan membuat Anda salah belajar dari data sendiri.
- Jurnal **tidak pernah** disentuh sync engine — catatan subjektif Anda aman dari tertimpa.

### Analitik
- Equity curve, kurva drawdown (underwater), kalender heatmap harian.
- Win rate, profit factor, expectancy sebagai headline metrics.
- Histogram R-multiple, **dengan cakupan eksplisit** (berapa trade punya R valid).
- Breakdown per setup, symbol, sesi, hari, grade, arah, exchange.
- Scatter grade vs P&L — sengaja **tanpa** garis tren atau skor korelasi.
- Filter global yang berlaku untuk semua chart sekaligus.

### Tampilan
- Dark mode default, dengan opsi light dan ikuti sistem.
- **Mode colorblind-safe** — hijau/merah menjadi biru/oranye.
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

---

## Keterbatasan yang Diketahui

| Keterbatasan | Sebab | Dampak |
|---|---|---|
| **Funding fee Bitunix = 0** | Bitunix tidak menyediakan endpoint riwayat biaya funding per akun. Yang ada hanya riwayat *rate* publik | Kolom funding fee trade Bitunix bernilai 0. Aplikasi **tidak mengira-ngira** dari rate, karena itu akan menghasilkan angka karangan |
| **Nama field Bitunix belum tersempitkan** | Dokumentasi tidak menampilkan contoh response lengkap | Mapper membaca beberapa kandidat nama field. Setelah sync akun nyata, periksa `raw_payload` lalu sempitkan |
| **Belum diuji di mesin bersih** | Butuh VM tanpa Node/Python | Installer terbentuk & isinya terverifikasi, tapi instalasi di mesin bersih belum dijalankan |
| **Belum sync akun nyata** | Butuh API key read-only dari user | Idempotensi terbukti dengan data deterministik, bukan dengan API live |
| **Tanpa code signing** | Build personal tanpa sertifikat | Windows SmartScreen akan menampilkan peringatan saat installer dibuka |

---

## Keamanan

- Kredensial disimpan lewat `safeStorage` — **tidak pernah** di file plaintext, database, atau `.env`.
- Kredensial mengalir **satu arah**: renderer → main. Renderer tidak pernah menerimanya kembali;
  yang dibaca hanya status + petunjuk kunci (mis. `a1b2…f9`).
- Kalau `safeStorage` tidak tersedia, penyimpanan **ditolak** — tidak ada fallback plaintext.
- CSP melarang renderer menghubungi apa pun (`connect-src 'none'`). Tidak ada telemetry.
- Semua panggilan network dilakukan dari main process.

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
  credentials/       safeStorage wrapper
  db/                koneksi, migrasi, repositories
  exchanges/         adapter per exchange (mexc/, bitunix/) + kontrak types.ts
  sync/              sync engine — exchange-agnostic
  ipc/               handlers

src/                 renderer — TANPA akses Node
  routes/            Dashboard, TradeLog, JournalEntry, Analytics, Settings
  components/        UI primitives + charts
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
| [`plans/SESSION.md`](plans/SESSION.md:1) | Status per fase |

---

## Lisensi

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

MIT License
