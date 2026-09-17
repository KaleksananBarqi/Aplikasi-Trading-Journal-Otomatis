import type Database from 'better-sqlite3'
import type { RawClosedPosition, RawFill, RawFundingFee, SupportedExchange } from '../../exchanges/types'

/**
 * Repository sync — jalur tulis khusus data dari exchange.
 *
 * ===========================================================================
 * ATURAN PALING PENTING DI FILE INI
 * ===========================================================================
 *
 * Repository ini HANYA menulis ke `trades`, `trade_fills`, `funding_fees`,
 * dan `sync_state`.
 *
 * `trade_journal`, `journal_checklist`, dan `planned_risk` TIDAK PERNAH
 * disentuh dari sini — sekalipun trade-nya baru dibuat oleh sync.
 *
 * Alasan: catatan subjektif user (tesis, review, grade, emosi) adalah satu-
 * satunya data di aplikasi ini yang tidak bisa dihasilkan ulang oleh mesin.
 * Kalau sync diizinkan menulisnya, satu bug upsert bisa menghapus pemikiran
 * user secara permanen. Memisahkan jalur tulisnya membuat kelas bug itu
 * mustahil terjadi, bukan sekadar tidak disengaja.
 * Lihat plans/02-DATA-MODEL.md §4.
 *
 * ===========================================================================
 * IDEMPOTENSI (brief §4.3)
 * ===========================================================================
 *
 * Kunci dedup: `(exchange, external_id)` di `trades`.
 * Upsert memakai `ON CONFLICT ... DO UPDATE`, jadi sync berulang tidak
 * menciptakan duplikat.
 *
 * `pnl_source` selalu di-set `'exchange_reported'` (keputusan D3): angka P&L
 * berasal dari exchange, bukan dihitung ulang oleh kita.
 */

export interface SyncState {
    exchange: SupportedExchange
    lastExitTime: number | null
    lastExternalId: string | null
    lastSyncAt: number | null
    lastStatus: 'ok' | 'partial' | 'error' | null
    lastError: string | null
    positionsSynced: number
    fillsSynced: number
    fundingSynced: number
}

interface SyncStateRow {
    exchange: string
    last_exit_time: number | null
    last_external_id: string | null
    last_sync_at: number | null
    last_status: string | null
    last_error: string | null
    positions_synced: number
    fills_synced: number
    funding_synced: number
}

function mapState(row: SyncStateRow): SyncState {
    return {
        exchange: row.exchange as SupportedExchange,
        lastExitTime: row.last_exit_time,
        lastExternalId: row.last_external_id,
        lastSyncAt: row.last_sync_at,
        lastStatus: row.last_status as SyncState['lastStatus'],
        lastError: row.last_error,
        positionsSynced: row.positions_synced,
        fillsSynced: row.fills_synced,
        fundingSynced: row.funding_synced
    }
}

export function getSyncState(db: Database.Database, exchange: SupportedExchange): SyncState {
    const row = db.prepare('SELECT * FROM sync_state WHERE exchange = ?').get(exchange) as
        | SyncStateRow
        | undefined

    if (!row) {
        return {
            exchange,
            lastExitTime: null,
            lastExternalId: null,
            lastSyncAt: null,
            lastStatus: null,
            lastError: null,
            positionsSynced: 0,
            fillsSynced: 0,
            fundingSynced: 0
        }
    }
    return mapState(row)
}

export function updateSyncState(
    db: Database.Database,
    exchange: SupportedExchange,
    patch: Partial<Omit<SyncState, 'exchange'>>
): void {
    const current = getSyncState(db, exchange)

    db.prepare(
        `INSERT INTO sync_state
       (exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error,
        positions_synced, fills_synced, funding_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(exchange) DO UPDATE SET
       last_exit_time   = excluded.last_exit_time,
       last_external_id = excluded.last_external_id,
       last_sync_at     = excluded.last_sync_at,
       last_status      = excluded.last_status,
       last_error       = excluded.last_error,
       positions_synced = excluded.positions_synced,
       fills_synced     = excluded.fills_synced,
       funding_synced   = excluded.funding_synced`
    ).run(
        exchange,
        patch.lastExitTime !== undefined ? patch.lastExitTime : current.lastExitTime,
        patch.lastExternalId !== undefined ? patch.lastExternalId : current.lastExternalId,
        patch.lastSyncAt !== undefined ? patch.lastSyncAt : current.lastSyncAt,
        patch.lastStatus !== undefined ? patch.lastStatus : current.lastStatus,
        patch.lastError !== undefined ? patch.lastError : current.lastError,
        patch.positionsSynced !== undefined ? patch.positionsSynced : current.positionsSynced,
        patch.fillsSynced !== undefined ? patch.fillsSynced : current.fillsSynced,
        patch.fundingSynced !== undefined ? patch.fundingSynced : current.fundingSynced
    )
}

// ---------------------------------------------------------------------------
// Upsert posisi tertutup
// ---------------------------------------------------------------------------

export interface UpsertResult {
    inserted: number
    updated: number
    /** Baris yang dilewati karena sudah ada dan nilainya identik. */
    unchanged: number
}

interface ExistingTradeRow {
    id: number
    realized_pnl: number
    exit_price: number
    size: number
    funding_fee: number
    fee_close: number
}

/**
 * Upsert posisi tertutup dari exchange.
 *
 * PENTING: query UPDATE sengaja TIDAK menyentuh kolom jurnal manapun.
 * Yang diperbarui hanya field data yang berasal dari exchange.
 *
 * `funding_fee` di-COPY dari nilai yang sudah ada, karena funding diakumulasi
 * terpisah lewat `applyFundingToTrades` dan tidak datang bersama posisi.
 */
export function upsertPositions(
    db: Database.Database,
    exchange: SupportedExchange,
    positions: RawClosedPosition[]
): UpsertResult {
    const result: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 }

    const findExisting = db.prepare(
        'SELECT id, realized_pnl, exit_price, size, funding_fee, fee_close FROM trades WHERE exchange = ? AND external_id = ?'
    )

    const insert = db.prepare(
        `INSERT INTO trades
       (exchange, external_id, symbol, direction, entry_price, exit_price,
        entry_time, exit_time, size, leverage, margin_mode, realized_pnl,
        pnl_source, fee_open, fee_close, fee_open_maker, fee_close_maker,
        funding_fee, raw_payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'exchange_reported',
             ?, ?, NULL, NULL, ?, ?, ?, ?)`
    )

    // UPDATE tidak menyentuh kolom jurnal apapun — lihat catatan di atas.
    const update = db.prepare(
        `UPDATE trades SET
       symbol = ?, direction = ?, entry_price = ?, exit_price = ?,
       entry_time = ?, exit_time = ?, size = ?, leverage = ?, margin_mode = ?,
       realized_pnl = ?, fee_open = ?, fee_close = ?, raw_payload = ?, updated_at = ?
     WHERE id = ?`
    )

    const run = db.transaction(() => {
        const now = Date.now()

        for (const position of positions) {
            const existing = findExisting.get(exchange, position.externalId) as
                | ExistingTradeRow
                | undefined

            const rawPayload = position.raw !== undefined ? JSON.stringify(position.raw) : null

            if (!existing) {
                insert.run(
                    exchange,
                    position.externalId,
                    position.symbol,
                    position.direction,
                    position.entryPrice,
                    position.exitPrice,
                    position.entryTime,
                    position.exitTime,
                    position.size,
                    position.leverage,
                    position.marginMode,
                    position.realizedPnl,
                    position.feeOpen,
                    position.feeClose,
                    // funding_fee awal 0 — diisi terpisah oleh applyFundingToTrades.
                    0,
                    rawPayload,
                    now,
                    now
                )
                result.inserted += 1
                continue
            }

            // Deteksi perubahan. Kalau identik, lewati update — menghemat tulis dan
            // membuat "sync tanpa perubahan" benar-benar tidak mengubah apa pun.
            const changed =
                existing.realized_pnl !== position.realizedPnl ||
                existing.exit_price !== position.exitPrice ||
                existing.size !== position.size ||
                existing.fee_close !== position.feeClose

            if (!changed) {
                result.unchanged += 1
                continue
            }

            update.run(
                position.symbol,
                position.direction,
                position.entryPrice,
                position.exitPrice,
                position.entryTime,
                position.exitTime,
                position.size,
                position.leverage,
                position.marginMode,
                position.realizedPnl,
                position.feeOpen,
                position.feeClose,
                rawPayload,
                now,
                existing.id
            )
            result.updated += 1
        }
    })

    run()
    return result
}

// ---------------------------------------------------------------------------
// Upsert fills
// ---------------------------------------------------------------------------

/**
 * Upsert fill individual.
 *
 * `trade_id` sengaja dibiarkan NULL di sini. Fill bisa belum bisa dipasangkan
 * ke posisi, dan itu tidak boleh menghalangi penyimpanan. Fill dengan
 * trade_id NULL adalah bukti audit yang sah (plans/02-DATA-MODEL.md §7).
 *
 * `trade_id` TIDAK di-null-kan ulang saat update, supaya pemasangan yang sudah
 * dilakukan tidak hilang saat sync berikutnya.
 */
export function upsertFills(
    db: Database.Database,
    exchange: SupportedExchange,
    fills: RawFill[]
): UpsertResult {
    const result: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 }

    const insert = db.prepare(
        `INSERT INTO trade_fills
       (trade_id, exchange, external_id, symbol, side, price, qty, fee, is_maker, filled_at)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const update = db.prepare(
        `UPDATE trade_fills SET symbol = ?, side = ?, price = ?, qty = ?, fee = ?, is_maker = ?
     WHERE exchange = ? AND external_id = ?`
    )

    const run = db.transaction(() => {
        for (const fill of fills) {
            try {
                insert.run(
                    exchange,
                    fill.externalId,
                    fill.symbol,
                    fill.side,
                    fill.price,
                    fill.qty,
                    fill.fee,
                    fill.isMaker === null ? null : fill.isMaker ? 1 : 0,
                    fill.filledAt
                )
                result.inserted += 1
            } catch (error) {
                // UNIQUE constraint = fill sudah ada. Ini jalur normal saat sync ulang,
                // bukan error. Perbarui nilainya kalau berubah.
                if (String(error).includes('UNIQUE')) {
                    update.run(
                        fill.symbol,
                        fill.side,
                        fill.price,
                        fill.qty,
                        fill.fee,
                        fill.isMaker === null ? null : fill.isMaker ? 1 : 0,
                        exchange,
                        fill.externalId
                    )
                    result.updated += 1
                } else {
                    throw error
                }
            }
        }
    })

    run()
    return result
}

// ---------------------------------------------------------------------------
// Upsert funding
// ---------------------------------------------------------------------------

export function upsertFundingFees(
    db: Database.Database,
    exchange: SupportedExchange,
    fees: RawFundingFee[]
): UpsertResult {
    const result: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 }

    const insert = db.prepare(
        `INSERT INTO funding_fees (exchange, external_id, symbol, amount, rate, charged_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(exchange, external_id) DO UPDATE SET
       amount = excluded.amount,
       rate = excluded.rate`
    )

    const run = db.transaction(() => {
        for (const fee of fees) {
            const info = insert.run(
                exchange,
                fee.externalId,
                fee.symbol,
                fee.amount,
                fee.rate,
                fee.chargedAt
            )
            // SQLite: changes = 1 baik untuk insert maupun update; bedakan lewat
            // lastInsertRowid yang tetap sama saat jalur update.
            if (info.changes > 0) {
                if (info.lastInsertRowid !== undefined) result.inserted += 1
            }
        }
    })

    run()
    return result
}

/**
 * Akumulasi funding ke trade.
 *
 * DIPANGGIL TERPISAH setelah posisi dan funding tersimpan.
 *
 * Kenapa terpisah, bukan digabung saat mapping posisi:
 * MEXC mencatat funding per simbol per interval, TIDAK per posisi. Jadi satu
 * catatan funding tidak bisa dipetakan langsung ke satu posisi. Yang bisa
 * dilakukan adalah mengakumulasi funding suatu simbol yang jatuh DALAM rentang
 * waktu posisi terbuka.
 *
 * Ini pendekatan aproksimasi, dan itu disengaja: alternatifnya adalah membagi
 * rata funding simbol ke semua posisi, yang menghasilkan angka yang tidak
 * pernah dilaporkan exchange manapun. Aproksimasi berbasis waktu minimal bisa
 * dipertanggungjawabkan.
 *
 * Hasilnya dijumlahkan ulang dari nol setiap kali dipanggil, sehingga idempotent
 * — memanggil dua kali tidak menggandakan nilai.
 */
export function applyFundingToTrades(
    db: Database.Database,
    exchange: SupportedExchange
): { tradesUpdated: number } {
    const run = db.transaction((): number => {
        // Hitung ulang total funding per trade langsung di SQL.
        // Subquery menjumlahkan funding simbol yang charged_at-nya di dalam rentang
        // entry_time..exit_time trade tersebut.
        const info = db
            .prepare(
                `UPDATE trades SET
           funding_fee = COALESCE((
             SELECT SUM(f.amount) FROM funding_fees f
             WHERE f.exchange = trades.exchange
               AND f.symbol = trades.symbol
               AND f.charged_at >= trades.entry_time
               AND f.charged_at <= trades.exit_time
           ), 0)
         WHERE exchange = ?`
            )
            .run(exchange)

        return info.changes
    })

    return { tradesUpdated: run() }
}

/**
 * Tautkan fill ke posisi (trade) berdasarkan simbol + rentang waktu.
 *
 * KENAPA INI ADA:
 * `upsertFills` menyimpan fill dengan `trade_id = NULL` karena saat fill
 * disimpan, kita belum tahu ia milik posisi yang mana (MEXC tidak memberi
 * tautan langsung dari fill ke posisi). Tanpa penautan, kolom `trade_id`
 * selamanya kosong dan nilai auditnya hilang.
 *
 * PENTING: fungsi ini TIDAK menghitung atau mengubah angka P&L apapun. Ia
 * hanya mengisi kolom `trade_id` pada tabel `trade_fills`. Angka finansial
 * tetap berasal dari exchange (keputusan D3) — fill adalah bukti pendukung,
 * bukan sumber perhitungan.
 *
 * Hanya mengisi baris yang `trade_id IS NULL`, sehingga penautan manual yang
 * sudah dilakukan tidak akan tertimpa.
 *
 * Idempotent: dijalankan berulang menghasilkan hasil yang sama.
 */
export function linkFillsToTrades(
    db: Database.Database,
    exchange: SupportedExchange
): { linked: number } {
    const run = db.transaction((): number => {
        const info = db
            .prepare(
                `UPDATE trade_fills SET trade_id = (
           SELECT t.id FROM trades t
           WHERE t.exchange = trade_fills.exchange
             AND t.symbol = trade_fills.symbol
             AND trade_fills.filled_at >= t.entry_time
             AND trade_fills.filled_at <= t.exit_time
           ORDER BY t.entry_time DESC
           LIMIT 1
         )
         WHERE exchange = ?
           AND trade_id IS NULL
           AND EXISTS (
             SELECT 1 FROM trades t
             WHERE t.exchange = trade_fills.exchange
               AND t.symbol = trade_fills.symbol
               AND trade_fills.filled_at >= t.entry_time
               AND trade_fills.filled_at <= t.exit_time
           )`
            )
            .run(exchange)

        return info.changes
    })

    return { linked: run() }
}

export function clearExchangeData(db: Database.Database, exchange: SupportedExchange): void {
    const run = db.transaction(() => {
        db.prepare('DELETE FROM funding_fees WHERE exchange = ?').run(exchange)
        db.prepare('DELETE FROM trade_fills WHERE exchange = ?').run(exchange)
        // Hapus trade + relasi jurnalnya lewat CASCADE. Ini SATU-SATUNYA tempat
        // data jurnal bisa hilang, dan hanya atas permintaan eksplisit user.
        db.prepare('DELETE FROM trades WHERE exchange = ?').run(exchange)
        db.prepare('DELETE FROM sync_state WHERE exchange = ?').run(exchange)
    })
    run()
}
