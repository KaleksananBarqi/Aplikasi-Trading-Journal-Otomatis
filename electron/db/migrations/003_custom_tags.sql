-- Migrasi 003 — tag kustom banyak nilai + pendukung penyimpanan lampiran terkelola.
--
-- ATURAN (plans/02-DATA-MODEL.md §9): migrasi yang sudah dirilis TIDAK BOLEH
-- di-edit. Perubahan skema = migrasi BARU. Maka tabel di bawah ditambahkan lewat
-- file ini, bukan dengan mengubah 001_init.sql / 002_sync_support.sql.
--
-- Tag kustom (Fitur 3):
--   User mengelompokkan transaksi memakai tag bebas, mis. #BTC_Scalp, #ETH_Swing,
--   #SalahEksekusi. Satu trade boleh punya banyak tag (many-to-many).
--   `setup_tag` dan `emotion_tag` lama dipertahankan untuk kompatibilitas data lama;
--   tag katalog di sini bersifat independen dari keduanya.

-- Katalog tag unik. Nama di-normalisasi (trim, tanpa '#' berulang) di lapisan app.
CREATE TABLE journal_tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

-- Relasi many-to-many trade <-> tag. Cascade menghapus relasi saat trade/tag dihapus.
CREATE TABLE trade_journal_tags (
  trade_id INTEGER NOT NULL REFERENCES trades(id)         ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES journal_tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

CREATE INDEX idx_trade_journal_tags_tag ON trade_journal_tags(tag_id);