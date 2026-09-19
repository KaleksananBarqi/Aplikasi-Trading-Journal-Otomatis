-- Migrasi 004 — tabel penyimpanan saldo akun exchange (Fase Ekstensi)
--
-- Menyimpan saldo futures / margin per exchange dan aset (misal USDT).
-- Primary key gabungan (exchange, asset) memastikan data idempotent dan selalu mutakhir.

CREATE TABLE IF NOT EXISTS account_balances (
  exchange       TEXT    NOT NULL,
  asset          TEXT    NOT NULL,
  total          REAL    NOT NULL,
  available      REAL    NOT NULL,
  unrealized_pnl REAL    NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (exchange, asset)
);

CREATE INDEX IF NOT EXISTS idx_balances_updated ON account_balances(updated_at);
