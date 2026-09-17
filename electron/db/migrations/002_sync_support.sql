-- Migrasi 002 — dukungan sync exchange (Fase 2).
--
-- ATURAN (plans/02-DATA-MODEL.md §9): migrasi yang sudah dirilis TIDAK BOLEH
-- di-edit. Perubahan skema = migrasi BARU. Itulah sebabnya kolom di bawah
-- ditambahkan lewat file ini, bukan dengan mengubah 001_init.sql.
--
-- Kenapa `raw_payload` perlu disimpan:
--   Saat ada selisih angka antara aplikasi dan exchange, kita butuh jalur
--   penelusuran ke response aslinya. Tanpa ini, satu-satunya cara menelusuri
--   adalah memanggil ulang API dan berharap data historisnya masih sama.
--
-- SQLite mendukung ADD COLUMN, jadi tidak perlu rebuild tabel.

-- Response mentah exchange (JSON string) untuk audit. NULL untuk trade manual.
ALTER TABLE trades ADD COLUMN raw_payload TEXT;

-- Penanda jumlah hari histori yang sudah di-sync, untuk ditampilkan di UI.
ALTER TABLE sync_state ADD COLUMN positions_synced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN fills_synced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN funding_synced INTEGER NOT NULL DEFAULT 0;
