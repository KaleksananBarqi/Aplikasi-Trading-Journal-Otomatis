# Rencana Fase Implementasi: Fitur Ekstensi Trading Journal

Dokumen ini mendokumentasikan pembagian fase kerja untuk 4 fitur baru sesuai usulan pengguna:
1. Sinkronisasi saldo dari exchange (MEXC & Bitunix).
2. Generator kartu "Pamer PnL + Thesis Tiap Trade" (estetik, custom background, logo exchange opsional, copy/download).
3. Generator kartu "Pamer Full Analytics" (ringkasan performa pro, winrate, profit factor, kurva equity).
4. Penyederhanaan sinkronisasi Google Drive (Dual-Mode: 1-Click Local Google Drive Folder Sync + In-App OAuth Setup).

---

## 📅 Roadmap Fase Pengerjaan

### Fase 1: Infrastruktur Saldo Exchange (Backend & DB)
- **Target**: Mendukung pembacaan saldo riil dari MEXC & Bitunix.
- **Langkah Kerja**:
  1. Migrasi database `004_account_balances.sql` (tabel `account_balances`).
  2. Tambahkan interface `AccountBalance` dan method `fetchBalances` pada `ExchangeAdapter`.
  3. Implementasi `MexcAdapter.fetchBalances()` via CCXT (`client.fetchBalance({ type: 'swap' })`).
  4. Implementasi `BitunixAdapter.fetchBalances()` via endpoint `/api/v1/futures/account`.
  5. Buat repository `electron/db/repositories/balance.ts`.
  6. Daftarkan IPC channels `balance:get` dan `balance:sync`.
  7. Hubungkan pembaruan saldo otomatis saat `syncExchange()` berjalan.

### Fase 2: Tampilan Saldo di Frontend (UI/UX)
- **Target**: Pengguna dapat melihat total saldo, saldo bebas, dan floating PnL langsung di UI.
- **Langkah Kerja**:
  1. Buat komponen `AccountBalanceWidget.tsx`.
  2. Integrasikan ke `Dashboard.tsx` di samping/di bawah headline metrics.
  3. Tambahkan info saldo dan tombol "Refresh Saldo" pada `SyncPanel.tsx` (compact & full view).
  4. Dukung mode `hidePnl` untuk privasi saldo.

### Fase 3: Fitur Pamer PnL + Thesis Card Generator
- **Target**: Modal interaktif pembuat kartu pamer PnL yang memukau dan siap dibagikan ke media sosial.
- **Langkah Kerja**:
  1. Buat komponen `SharePnlModal.tsx` dengan live visual preview.
  2. Tambahkan tombol "✨ Pamer PnL" di `JournalEntry.tsx`, `TradeLog.tsx`, dan `TradeEditor.tsx`.
  3. Sediakan kontrol kustomisasi:
     - Rasio: `1:1` (Feed), `9:16` (Story), `16:9` (Banner).
     - Preset Background: Cyberpunk Glow, Obsidian Glass, Sunset Gradient, Midnight Clean, atau Custom Color.
     - Logo Exchange Opsional: MEXC, Bitunix, Binance, Bybit, atau Tanpa Logo.
     - Box Tesis Trade: Tampilkan tesis dari jurnal trade (bisa diedit on-the-fly di modal).
     - Trader Handle / Watermark.
  4. Engine Canvas renderer resolusi tinggi (Retina 2x/3x).
  5. Fitur "Salin Gambar ke Clipboard" (1-klik Ctrl+V ke medsos) & "Unduh PNG".

### Fase 4: Fitur Pamer Full Analytics Card
- **Target**: Kartu ringkasan performa analitik lengkap untuk dipamerkan ke audiens.
- **Langkah Kerja**:
  1. Buat komponen `ShareAnalyticsModal.tsx`.
  2. Tambahkan tombol "📊 Pamer Analytics" di `Analytics.tsx` dan `Dashboard.tsx`.
  3. Tampilkan metrik komprehensif: Net P&L, Win Rate, Profit Factor, Avg R-Multiple, Total Trades (W/L ratio), Best Trade, dan mini glowing Equity Curve.
  4. Kustomisasi tema, opsi sembunyikan nominal saldo (hanya tampilkan %, R, dan kurva jika ingin privasi), dan trader handle.
  5. Fitur Copy to Clipboard & Download PNG.

### Fase 5: Penyederhanaan Sinkronisasi Google Drive
- **Target**: Sinkronisasi Google Drive menjadi sangat mudah, tanpa rasa bingung.
- **Langkah Kerja**:
  1. Tambahkan **Mode A: Folder Sync Google Drive Lokal**:
     - Deteksi otomatis atau tombol "Pilih Folder Google Drive" menggunakan native directory dialog.
     - Backup otomatis database + screenshot ke folder tersebut secara lokal. Aplikasi desktop Google Drive otomatis mengunggahnya ke cloud tanpa API key!
  2. Tingkatkan **Mode B: Direct Google Cloud OAuth**:
     - Tambahkan field `gdriveClientId` di Settings UI yang langsung disimpan ke DB.
     - Sediakan tombol dan handler IPC `backup:startOAuth` yang membuka browser dan menangani callback.
     - Tampilkan panduan visual 3-langkah cara mendapatkan Client ID jika pengguna ingin direct OAuth.
  3. Tambahkan **Mode C: Backup & Restore Manual 1-Klik**:
     - Tombol "Ekspor File Cadangan (.zip / .json)" dan "Pulihkan Cadangan".
  4. Perbarui `src/components/BackupPanel.tsx` dan `electron/backup/index.ts`.

### Fase 6: Verifikasi, Typecheck & Testing
- **Target**: Menjamin kestabilan, tipe TypeScript valid, dan pengujian berjalan tanpa regresi.
- **Langkah Kerja**:
  1. Jalankan `npm run typecheck`.
  2. Jalankan skrip smoke/verifikasi yang ada.
  3. Uji coba fungsionalitas di UI.
