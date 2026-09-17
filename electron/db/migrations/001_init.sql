-- Migrasi 001 — skema awal lengkap.
--
-- Sesuai plans/02-DATA-MODEL.md. Semua skema dibuat di sini, TERMASUK tabel
-- exchange yang belum dipakai di Fase 1. Alasannya: migrasi yang sudah dirilis
-- tidak boleh di-edit (plans/02-DATA-MODEL.md §9), jadi lebih murah membuat
-- skema lengkap sejak awal daripada menambah migrasi hanya untuk tabel kosong.
--
-- Konvensi waktu: SEMUA kolom waktu adalah epoch milliseconds UTC (INTEGER).
-- Konversi ke timezone lokal hanya di layer presentasi (brief §5.1).

-- ===========================================================================
-- trades — field otomatis dari exchange / input manual
-- ===========================================================================
CREATE TABLE trades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange        TEXT    NOT NULL CHECK (exchange IN ('mexc','bitunix','manual')),
  external_id     TEXT,
  symbol          TEXT    NOT NULL,
  direction       TEXT    NOT NULL CHECK (direction IN ('long','short')),

  entry_price     REAL    NOT NULL,
  exit_price      REAL    NOT NULL,
  entry_time      INTEGER NOT NULL,
  exit_time       INTEGER NOT NULL,

  size            REAL    NOT NULL,
  leverage        REAL    NOT NULL,
  margin_mode     TEXT    CHECK (margin_mode IN ('isolated','cross')),

  realized_pnl    REAL    NOT NULL,
  pnl_source      TEXT    NOT NULL CHECK (pnl_source IN
                    ('exchange_reported','computed_average_cost','manual')),

  fee_open        REAL    NOT NULL DEFAULT 0,
  fee_close       REAL    NOT NULL DEFAULT 0,
  fee_open_maker  REAL,
  fee_close_maker REAL,
  funding_fee     REAL    NOT NULL DEFAULT 0,

  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Dedup idempotent (brief §4.3). Partial index supaya baris tanpa external_id
-- (trade manual) boleh berulang tanpa dianggap duplikat.
CREATE UNIQUE INDEX idx_trades_dedup
  ON trades(exchange, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX idx_trades_exit_time ON trades(exit_time);
CREATE INDEX idx_trades_entry_time ON trades(entry_time);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_exchange ON trades(exchange);

-- ===========================================================================
-- trade_journal — field manual (brief §5.3)
-- ===========================================================================
-- PENTING: tabel ini TIDAK PERNAH ditulis oleh sync engine. Ini melindungi
-- pemikiran subjektif user dari tertimpa data exchange.
--
-- PENTING: execution_grade SENGAJA terpisah dari outcome. Dilarang digabung
-- dengan realized_pnl/win-loss menjadi satu skor turunan (brief §12).
CREATE TABLE trade_journal (
  trade_id          INTEGER PRIMARY KEY REFERENCES trades(id) ON DELETE CASCADE,
  setup_tag         TEXT,
  pre_trade_thesis  TEXT,
  post_trade_review TEXT,
  emotion_tag       TEXT,
  execution_grade   TEXT CHECK (execution_grade IN ('A','B','C','D')),
  screenshot_path   TEXT,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_journal_setup_tag ON trade_journal(setup_tag);
CREATE INDEX idx_journal_grade ON trade_journal(execution_grade);

-- ===========================================================================
-- journal_checklist — rule_checklist sebagai daftar boolean custom
-- ===========================================================================
CREATE TABLE journal_checklist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  checked    INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_checklist_trade ON journal_checklist(trade_id);

-- ===========================================================================
-- planned_risk — sumber perhitungan r_multiple
-- ===========================================================================
CREATE TABLE planned_risk (
  trade_id       INTEGER PRIMARY KEY REFERENCES trades(id) ON DELETE CASCADE,
  planned_stop   REAL,
  planned_target REAL,
  risk_amount    REAL,
  planned_rr     REAL
);

-- ===========================================================================
-- trade_fills — detail granular dari exchange
-- ===========================================================================
-- trade_id boleh NULL (ON DELETE SET NULL) karena fill bisa ada sebelum berhasil
-- dipasangkan ke posisi. Fill yatim adalah bukti audit dan tidak boleh hilang
-- saat trade dihapus.
CREATE TABLE trade_fills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id    INTEGER REFERENCES trades(id) ON DELETE SET NULL,
  exchange    TEXT    NOT NULL,
  external_id TEXT    NOT NULL,
  symbol      TEXT    NOT NULL,
  side        TEXT    NOT NULL CHECK (side IN ('buy','sell')),
  price       REAL    NOT NULL,
  qty         REAL    NOT NULL,
  fee         REAL    NOT NULL DEFAULT 0,
  is_maker    INTEGER,
  filled_at   INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_fills_dedup ON trade_fills(exchange, external_id);
CREATE INDEX idx_fills_trade ON trade_fills(trade_id);

-- ===========================================================================
-- funding_fees — biaya funding perpetual (brief §5.1)
-- ===========================================================================
CREATE TABLE funding_fees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange    TEXT    NOT NULL,
  external_id TEXT    NOT NULL,
  symbol      TEXT    NOT NULL,
  amount      REAL    NOT NULL,
  rate        REAL,
  charged_at  INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_funding_dedup ON funding_fees(exchange, external_id);
CREATE INDEX idx_funding_symbol ON funding_fees(symbol);

-- ===========================================================================
-- sync_state — cursor incremental per exchange (brief §4.3)
-- ===========================================================================
CREATE TABLE sync_state (
  exchange         TEXT PRIMARY KEY CHECK (exchange IN ('mexc','bitunix')),
  last_exit_time   INTEGER,
  last_external_id TEXT,
  last_sync_at     INTEGER,
  last_status      TEXT CHECK (last_status IN ('ok','partial','error')),
  last_error       TEXT
);

-- ===========================================================================
-- settings — konfigurasi non-kredensial (nilai JSON-encoded)
-- ===========================================================================
-- Kredensial TIDAK PERNAH disimpan di sini. Itu lewat safeStorage (keputusan D2).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
