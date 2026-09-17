# Tracker Sesi — Aplikasi Trading Journal Otomatis

> **Lokasi file ini disengaja.** ADR `Remove Roo Commander from smc-prompt-cli` menyatakan `SESSION.md` di root repo adalah artifact yang **tidak boleh dibuat ulang** tanpa diminta. Tracker ini karena itu ditaruh di [`plans/`](plans/SESSION.md:1) — bukan di root project.

---

## Status Saat Ini

| Item | Nilai |
|---|---|
| Fase aktif | **SELESAI — semua fase tuntas** |
| Fase selesai | **Fase 0 ✅ · 1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ · 5 ✅ (2026-09-17)** |
| Total verifikasi | **349 pemeriksaan, semua lulus** (45+66+63+93+31+51) |
| Blocker | — |
| Menunggu user | 2 butir: uji installer di mesin bersih, sync akun nyata |

> **Menunggu aksi user:** sync terhadap akun exchange nyata belum dijalankan (tidak ada
> kredensial di lingkungan ini). Gate idempotensi kedua exchange sudah terbukti dengan
> data deterministik; verifikasi API nyata perlu API key read-only dan masuk daftar Fase 5.

---

## Dokumen Perencanaan

| Dokumen | Isi |
|---|---|
| [`01-ARCHITECTURE.md`](plans/01-ARCHITECTURE.md:1) | Keputusan terkunci D1–D3, struktur proyek, kontrak adapter, strategi sync |
| [`02-DATA-MODEL.md`](plans/02-DATA-MODEL.md:1) | Skema SQLite lengkap, PRAGMA wajib, aturan migrasi |
| [`03-PHASES.md`](plans/03-PHASES.md:1) | Fase 0–5, langkah, kriteria verifikasi, gate, definisi formula metric |

---

## Keputusan Terkunci

| ID | Keputusan | Dampak |
|---|---|---|
| D1 | ~~`@electron/rebuild` sebagai `postinstall`~~ → **DIREVISI**: `better-sqlite3` pakai prebuilt N-API, compile ulang tidak diperlukan. Yang tetap wajib: `external` di Vite | Fase 0 ✅ |
| D2 | `safeStorage` bawaan Electron; `keytar` ditolak | Fase 2 & 5 |
| D3 | `realized_pnl` exchange = source of truth; average-cost hanya fallback; FIFO tidak dipakai | Skema DB Fase 1, sync Fase 2–3 |

> **Catatan koreksi D1 (2026-09-17):** asumsi awal bahwa `better-sqlite3` perlu di-rebuild ke ABI
> Electron via MSVC terbukti keliru saat Fase 0. Paket `better-sqlite3@13.0.3` mengirim prebuilt
> N-API binary yang ABI-stabil, sehingga Visual Studio C++ build tools **tidak diperlukan sama sekali**.
> Detail: [`01-ARCHITECTURE.md`](plans/01-ARCHITECTURE.md:1) §Koreksi D1.

Keputusan tambahan yang diambil saat perencanaan (mengisi ambiguitas brief):

| Topik | Ketetapan | Lokasi |
|---|---|---|
| Nilai `exchange` untuk trade manual | Tambah nilai ketiga `'manual'` di CHECK constraint | [`02-DATA-MODEL.md`](plans/02-DATA-MODEL.md:1) §3 |
| Tipe angka keuangan | `REAL` (float64); pembulatan hanya di layer presentasi | [`02-DATA-MODEL.md`](plans/02-DATA-MODEL.md:1) §2 |
| Penentuan sesi trading | Dari `entry_time`, bukan `exit_time`; trade lintas sesi tidak dipecah | [`01-ARCHITECTURE.md`](plans/01-ARCHITECTURE.md:1) §5 |
| Overlap sesi London/NY (12:00–16:00 UTC) | Disengaja; wajib ditampilkan sebagai catatan di UI | [`01-ARCHITECTURE.md`](plans/01-ARCHITECTURE.md:1) §5 |
| Trade P&L persis nol pada win rate | Dikecualikan dari penyebut | [`03-PHASES.md`](plans/03-PHASES.md:1) Fase 4 |
| Profit factor tanpa loss | Tampilkan `∞`, bukan angka besar buatan | [`03-PHASES.md`](plans/03-PHASES.md:1) Fase 4 |
| Fill yatim (belum terpasang ke trade) | `trade_id` boleh NULL, `ON DELETE SET NULL` — tidak boleh hilang saat trade dihapus | [`02-DATA-MODEL.md`](plans/02-DATA-MODEL.md:1) §7 |
| Template checklist | Di-copy ke trade saat dibuat, tidak direferensikan | [`02-DATA-MODEL.md`](plans/02-DATA-MODEL.md:1) §5 |

---

## Temuan Skill Discovery

**Skill relevan yang akan di-load:** `roadmap`, `tailwind-theme-builder`, `shadcn-ui`, `react-patterns`, `vitest`, `design-review`, `codex-review`, `project-docs`, `project-health`

**Tanpa skill (implementasi manual + verifikasi dokumentasi resmi):** Electron/`electron-builder`, `better-sqlite3`, `safeStorage`, MEXC API, Bitunix API, `ccxt`

**Catatan:** `d1-drizzle-schema` **bukan** match — skill itu spesifik Cloudflare D1, bukan SQLite lokal.

**Pelajaran dari vault yang diterapkan di rencana ini:**
- Gotcha `.gitignore` negation ordering → jadi gotcha eksplisit di Fase 0
- Pola artifact Roo Commander project-scoped dihindari → tidak ada `.roo/`, `.roomodes`, `SESSION.md` di root

---

## Log Fase

### Fase 0 — Verifikasi Prasyarat & Scaffolding Toolchain
- Status: **✅ SELESAI (2026-09-17)**
- Toolchain: Node v24.19.0, npm 11.17.0, Python 3.11.9, git 2.52.0
- Runtime: Electron 44.4.1 (ABI 149, NAPI 10), SQLite 3.53.4
- Bukti: `npm run smoke` → 5/5 LULUS; `npm run build` sukses 3 target; `npm run typecheck` bersih;
  aplikasi dijalankan sungguhan dan membuka DB tanpa crash
- **Temuan besar:** MSVC tidak diperlukan — `better-sqlite3@13.0.3` pakai prebuilt N-API binary.
  Assumsi awal D1 dikoreksi. Prasyarat install Visual Studio (~6 GB) hilang sepenuhnya.
- **Bug integritas data yang ditemukan & diperbaiki** (dari log runtime, bukan dari brief):
  - `app.setName()` belum dipanggil → `userData` jatuh ke `%APPDATA%\Electron`, berbagi folder
    dengan semua app Electron dev lain. ✅ Diperbaiki, path kini terisolasi
  - Tanpa single-instance lock → dua instance berisiko korupsi SQLite. ✅ Diperbaiki & terverifikasi
- Gotcha environment: `ELECTRON_RUN_AS_NODE=1` diset terminal VS Code → diatasi
  [`scripts/run-smoke.cjs`](scripts/run-smoke.cjs:1)
- Gotcha npm 11: lifecycle script diblokir default → `npm approve-scripts better-sqlite3 esbuild`

### Fase 1 — Skeleton & Manual Journal
- Status: **✅ SELESAI (2026-09-17)**
- Bukti: `npm run verify:fase1` → **45/45 LULUS** · `npm run typecheck` bersih ·
  `npm run build` sukses 3 target · aplikasi dijalankan dan migrasi diterapkan ke DB produksi
- **Keputusan UI:** `shadcn init` TIDAK dipakai — CLI-nya interaktif (berisiko menggantung)
  dan menghasilkan tampilan default yang justru dilarang brief §7. Primitif UI dibangun
  sendiri dengan Tailwind + `cn()`, sehingga brief §7 ("jangan terlihat seperti template
  admin-dashboard generik") terpenuhi sejak awal.
- Cakupan terverifikasi: migrasi (9 tabel, idempotent), CRUD trade, isolasi jurnal dari P&L,
  `r_multiple` NULL tanpa SL, grade A/B/C/D terpisah dari hasil, dedup idempotent,
  CASCADE + fill yatim, persistensi lintas restart, settings
- **Cacat test yang ditemukan & diperbaiki:** test isolasi jurnal awalnya mengirim nilai P&L
  berbeda sehingga "gagal" padahal aplikasi benar. Test yang cacat lebih berbahaya daripada
  tidak ada test — sudah diperbaiki dan kini mengirim nilai identik.

### Fase 2 — Integrasi MEXC
- Status: **✅ SELESAI (2026-09-17)** — `npm run verify:fase2` → **66/66 LULUS**
- ccxt 4.5.78: MEXC `certified: true`; `fetchMyTrades`/`fetchPositionsHistory`/`fetchFundingHistory` native; rateLimit 50 ms
- **Temuan kritis:** 3 bug normalisasi ccxt untuk posisi tertutup (`holdVol=0`, `margin_mode` tidak ada, `exitPrice` absen) → mapper membaca `position.info` mentah
- Migrasi 002 ditambahkan (bukan mengedit 001 yang sudah dirilis)

### Fase 3 — Integrasi Bitunix
- Status: **✅ SELESAI (2026-09-17)** — `npm run verify:fase3` → **63/63 LULUS**
- ccxt: Bitunix **tidak didukung** (dari 104 exchange) → konfirmasi brief §4.2, implementasi manual
- 🔴 **Brief §4.2 keliru:** signing BUKAN HMAC-SHA256, melainkan SHA256 berantai (`SHA256(SHA256(nonce+timestamp+apiKey+queryParams+body)+secretKey)`)
- **Keterbatasan dilaporkan:** tidak ada endpoint funding per akun → `funding_fee = 0`, bukan angka karangan
- ⚠️ Nama field dalam item **belum terverifikasi** → mapper toleran multi-kandidat, **wajib disempitkan di Fase 5** setelah sync akun nyata
- GATE terpenuhi: nol perubahan fungsional di `sync/engine.ts`

### Fase 4 — Analitik
- Status: **✅ SELESAI (2026-09-17)** — `npm run verify:metrics` → **93/93 LULUS**
- **Bug nyata ditemukan test:** durasi drawdown terukur 2 jam padahal seharusnya 3 jam.
  Penyebab di kode produksi (loop pencarian puncak berhenti terlalu awal), bukan di test. Sudah diperbaiki
- `lightweight-charts` v5 untuk equity/drawdown; heatmap kalender, histogram R, dan scatter
  grade dibuat SVG sendiri
- Scatter grade-vs-P&L **sengaja tidak menyimpulkan apa pun** — tanpa korelasi, tanpa garis tren

### Fase 5 — Polish
- Status: **✅ SELESAI (2026-09-17)**
- `npm run verify:packaged` → **31/31 LULUS** · `npm run verify:acceptance` → **51/51 LULUS**
- Installer: `release/TradingJournal-Setup-1.0.0.exe` (**122.6 MB**)
- **Temuan kritis:** `electron-builder` default-nya menjalankan `@electron/rebuild` → packaging
  **GAGAL TOTAL** tanpa MSVC. Diperbaiki dengan `npmRebuild: false`, karena Fase 0 sudah
  membuktikan prebuilt N-API tidak perlu rebuild
- **Perbaikan ukuran:** devDependencies (tailwind, lightningcss, react, vite) sebelumnya ikut
  terbawa ke installer. Dipindah ke `devDependencies`, `lucide-react` dihapus (0 pemakaian)
- **Keputusan library chart:** `lightweight-charts` v5 untuk equity/drawdown; heatmap kalender,
  histogram R, dan scatter grade dibuat SVG sendiri (lebih kecil, kontrol penuh, tidak perlu
  menambah dependency untuk grid persegi)
- Mode colorblind-safe ditanam sebagai nilai CSS variable, bukan logika komponen — menambah mode
  ini tidak menyentuh satu file UI pun
- README dibuat (mencakup keterbatasan yang diketahui secara eksplisit)

---

## Butir yang Menunggu Aksi User

Dua acceptance criteria brief §11 **tidak bisa** diverifikasi otomatis, dan sengaja TIDAK
ditandai lulus:

| Butir | Alasan | Cara memverifikasi |
|---|---|---|
| Uji installer di mesin BERSIH | Butuh VM tanpa Node/Python | Jalankan installer di VM, pastikan aplikasi terbuka dan DB dibuat |
| Sync akun NYATA (MEXC + Bitunix) | Butuh API key read-only dari user | Isi di Settings → Sync Now → jalankan dua kali, pastikan jumlah trade tidak bertambah |

### Tindakan lanjutan setelah sync Bitunix pertama

Setelah sync akun Bitunix nyata berhasil:

1. Periksa `raw_payload` di tabel `trades` (response mentah tersimpan)
2. Bandingkan nama field dengan kandidat di
   [`mapper.ts`](electron/exchanges/bitunix/mapper.ts:1)
3. **Sempitkan** kandidat menjadi nama field tunggal yang benar
4. Jalankan ulang `npm run verify:fase3`

Mapper Bitunix sengaja toleran terhadap beberapa kandidat nama field karena dokumentasi resmi
tidak menampilkan contoh response lengkap. Menyempitkannya tanpa data nyata hanya akan mengganti
tebakan dengan tebakan lain.

---

## Jalur Verifikasi Cepat

```powershell
# Prasyarat
node --version; npm --version; python --version; git --version

# Setelah scaffolding
npm run dev

# Cek .gitignore (gotcha dari vault)
git check-ignore -v .env.example

# Cek data lokal tidak ter-commit
git status --porcelain

# Smoke test native addon (Fase 0)
npm run smoke

# Verifikasi Fase 1 — 45 pemeriksaan terhadap kode repository asli
npm run verify:fase1

# Verifikasi engine sync tidak berubah di Fase 3
git diff HEAD~1 -- electron/sync/engine.ts
```

---

## Aturan yang Tetap Berlaku di Setiap Sesi

1. Tidak ada endpoint order execution — read-only (brief §12)
2. Tidak ada kredensial di source code atau file plaintext (brief §8)
3. Verifikasi endpoint exchange ke dokumentasi resmi, bukan dari memori (brief §4)
4. Asumsi besar dinyatakan eksplisit, tidak ditebak (brief §0)
5. Requirement yang tidak feasible dilaporkan, tidak didiamkan (brief §12)
6. `execution_grade` terpisah dari outcome (brief §5.3)
7. UTC internal, konversi hanya di presentasi (brief §5.1)
