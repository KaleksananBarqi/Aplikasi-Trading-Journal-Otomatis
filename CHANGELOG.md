# Changelog

Semua perubahan penting pada proyek **Aplikasi Trading Journal Otomatis** dicatat di file ini.
Format mengikuti panduan [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan menganut [Semantic Versioning](https://semver.org/lang/id/).

---

## [1.2.0] - 2026-09-19

### 🚀 Fitur Baru
- **Sinkronisasi Saldo Real-Time dari Exchange**:
  - Dukungan penarikan saldo akun futures dari **MEXC** (via CCXT swap balance) dan **Bitunix** (via REST `/api/v1/futures/account`).
  - Skema database baru (Migrasi `004_account_balances.sql`) dan repository balance untuk menyimpan total ekuitas, free margin, used margin, dan unrealized PnL secara lokal.
  - Widget interaktif `AccountBalanceWidget` di Dashboard dengan status pembaruan real-time, chip rincian per exchange, dan tombol refresh instan.
- **Generator Kartu Pamer PnL + Tesis Tiap Trade (`SharePnlModal`)**:
  - Generator kartu visual performa beresolusi tinggi (Retina 2x) berbasis HTML5 Canvas native.
  - 5 Tema visual estetik: *Cyberpunk Neon*, *Obsidian Gold*, *Emerald Mint*, *Sunset Synth*, dan *Minimal Dark*.
  - 3 Format rasio: `1:1` (Square untuk IG/Telegram feed), `9:16` (Story/TikTok/Reels), dan `16:9` (Twitter/X landscape).
  - Tesis pre-trade & review post-trade terintegrasi dengan live text editor sebelum diekspor.
  - Pilihan logo exchange kustom: MEXC, Bitunix, Binance, Bybit, atau tanpa logo.
  - Aksi 1-klik: **Salin Gambar ke Clipboard** (langsung bisa Ctrl+V di chat/medsos) dan **Unduh PNG**.
  - Tombol **✨ Pamer** terintegrasi di Trade Log, Journal Entry, dan card Trade Terakhir di Dashboard.
- **Generator Kartu Pamer Full Analytics (`ShareAnalyticsModal`)**:
  - Kartu laporan performa komprehensif: Net PnL, Win Rate %, Visual Win/Loss Bar, Profit Factor, Expectancy, Total Trades, dan Max Drawdown.
  - Mini Kurva Equity Glowing neon dengan efek gradient visual.
  - **Mode Privasi**: Toggle untuk menyembunyikan nominal uang ($) sehingga user bisa pamer winrate dan rasio tanpa mengungkap besaran modal.
  - Tombol pintas **📊 Pamer Analytics** di header Dashboard dan Analytics.
- **Penyederhanaan Backup Google Drive (Dual-Mode)**:
  - **Mode 1 (Folder Lokal Google Drive — Rekomendasi/1-Klik)**: Cukup pilih folder Google Drive lokal (misal `G:\My Drive\TradingBackup`). Backup otomatis disalin dan disinkronkan oleh Google Drive for Desktop **tanpa perlu API key / GCP project sama sekali**.
  - **Mode 2 (Cloud OAuth Direct)**: Form input Google OAuth Client ID terintegrasi langsung di UI Settings tanpa perlu edit file `.env` atau restart app.

### 🛡️ Peningkatan & Perbaikan
- Penambahan komponen `Modal` reusable di `src/components/ui.tsx`.
- Pengujian otomatis menyeluruh: 267 dari 267 tes lulus 100% (`verify:fase1`, `verify:fase2`, `verify:fase3`, `verify:metrics`).
- Typecheck TypeScript bersih 0 error.

---

## [1.1.0] - 2026-09-19

### 🚀 Fitur Baru
- Lampirkan screenshot gambar pada catatan jurnal trade.
- Perhitungan rasio Risk:Reward (RR) Rencana otomatis dari Stop Loss dan Take Profit.
- Sistem kustom tagging multi-nilai dengan autocomplete dan chip tag.
- Ekspor jurnal ke format CSV (UTF-8 BOM), JSON, dan PDF.
- Backup Google Drive satu arah via OAuth 2.0 PKCE.
- Panel Wawasan AI berbasis OpenAI-compatible completions API untuk evaluasi psikologi dan kelemahan eksekusi.

---

## [1.0.3] - 2026-09-18
- Rilis baseline awal Trading Journal Otomatis (MEXC + Bitunix).
- Verifikasi 5 fase arsitektur dasar dan packaging installer desktop Windows NSIS.
