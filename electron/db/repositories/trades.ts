import type Database from 'better-sqlite3'
import {
    DEFAULT_CHECKLIST_TEMPLATE,
    normalizeTagName,
    type ChecklistItem,
    type ExecutionGrade,
    type ExchangeId,
    type JournalInput,
    type MarginMode,
    type PlannedRisk,
    type PlannedRiskInput,
    type PnlSource,
    type Trade,
    type TradeDetail,
    type TradeDirection,
    type TradeInput,
    type TradeJournal,
    type TradeTag
} from '../../../shared/domain'

/**
 * Repository trades + relasinya (jurnal, checklist, planned risk).
 *
 * Semua operasi tulis yang menyentuh lebih dari satu tabel dibungkus transaksi,
 * supaya trade tidak pernah tersimpan setengah jadi.
 *
 * PENTING: repository ini adalah satu-satunya penulis tabel `trades`,
 * `trade_journal`, `journal_checklist`, dan `planned_risk`. Sync engine (Fase 2+)
 * HANYA boleh menulis `trades`, dan TIDAK BOLEH menyentuh tabel jurnal.
 * Lihat plans/02-DATA-MODEL.md §4.
 */

// ---------------------------------------------------------------------------
// Bentuk baris mentah dari SQLite (snake_case)
// ---------------------------------------------------------------------------

interface TradeRow {
    id: number
    exchange: string
    external_id: string | null
    symbol: string
    direction: string
    entry_price: number
    exit_price: number
    entry_time: number
    exit_time: number
    size: number
    leverage: number
    margin_mode: string | null
    realized_pnl: number
    pnl_source: string
    fee_open: number
    fee_close: number
    fee_open_maker: number | null
    fee_close_maker: number | null
    funding_fee: number
    created_at: number
    updated_at: number
}

interface JournalRow {
    trade_id: number
    setup_tag: string | null
    pre_trade_thesis: string | null
    post_trade_review: string | null
    emotion_tag: string | null
    execution_grade: string | null
    screenshot_path: string | null
    updated_at: number
}

interface ChecklistRow {
    id: number
    trade_id: number
    label: string
    checked: number
    sort_order: number
}

interface PlannedRiskRow {
    trade_id: number
    planned_stop: number | null
    planned_target: number | null
    risk_amount: number | null
    planned_rr: number | null
}

// ---------------------------------------------------------------------------
// Mapper: baris SQLite -> tipe domain
// ---------------------------------------------------------------------------

function mapTrade(row: TradeRow): Trade {
    return {
        id: row.id,
        exchange: row.exchange as ExchangeId,
        externalId: row.external_id,
        symbol: row.symbol,
        direction: row.direction as TradeDirection,
        entryPrice: row.entry_price,
        exitPrice: row.exit_price,
        entryTime: row.entry_time,
        exitTime: row.exit_time,
        size: row.size,
        leverage: row.leverage,
        marginMode: row.margin_mode as MarginMode | null,
        realizedPnl: row.realized_pnl,
        pnlSource: row.pnl_source as PnlSource,
        feeOpen: row.fee_open,
        feeClose: row.fee_close,
        feeOpenMaker: row.fee_open_maker,
        feeCloseMaker: row.fee_close_maker,
        fundingFee: row.funding_fee,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function mapJournal(row: JournalRow): TradeJournal {
    return {
        tradeId: row.trade_id,
        setupTag: row.setup_tag,
        preTradeThesis: row.pre_trade_thesis,
        postTradeReview: row.post_trade_review,
        emotionTag: row.emotion_tag,
        executionGrade: row.execution_grade as ExecutionGrade | null,
        screenshotPath: row.screenshot_path,
        updatedAt: row.updated_at
    }
}

function mapChecklist(row: ChecklistRow): ChecklistItem {
    return {
        id: row.id,
        tradeId: row.trade_id,
        label: row.label,
        // SQLite menyimpan boolean sebagai INTEGER 0/1.
        checked: row.checked === 1,
        sortOrder: row.sort_order
    }
}

function mapPlannedRisk(row: PlannedRiskRow): PlannedRisk {
    return {
        tradeId: row.trade_id,
        plannedStop: row.planned_stop,
        plannedTarget: row.planned_target,
        riskAmount: row.risk_amount,
        plannedRr: row.planned_rr
    }
}

/** Hitung R-multiple. NULL bila tidak ada stop loss / nominal risiko (brief §5.2). */
function computeR(realizedPnl: number, riskAmount: number | null): number | null {
    if (riskAmount === null || riskAmount === 0) return null
    return realizedPnl / riskAmount
}

// ---------------------------------------------------------------------------
// Pemuat relasi (batch, hindari N+1)
// ---------------------------------------------------------------------------

function placeholders(count: number): string {
    return new Array(count).fill('?').join(', ')
}

interface RelatedData {
    journals: Map<number, TradeJournal>
    risks: Map<number, PlannedRisk>
    checklists: Map<number, ChecklistItem[]>
    tags: Map<number, TradeTag[]>
}

function loadRelated(db: Database.Database, tradeIds: number[]): RelatedData {
    const journals = new Map<number, TradeJournal>()
    const risks = new Map<number, PlannedRisk>()
    const checklists = new Map<number, ChecklistItem[]>()
    const tags = new Map<number, TradeTag[]>()

    if (tradeIds.length === 0) return { journals, risks, checklists, tags }

    const list = placeholders(tradeIds.length)

    const journalRows = db
        .prepare(`SELECT * FROM trade_journal WHERE trade_id IN (${list})`)
        .all(...tradeIds) as JournalRow[]
    for (const row of journalRows) journals.set(row.trade_id, mapJournal(row))

    const riskRows = db
        .prepare(`SELECT * FROM planned_risk WHERE trade_id IN (${list})`)
        .all(...tradeIds) as PlannedRiskRow[]
    for (const row of riskRows) risks.set(row.trade_id, mapPlannedRisk(row))

    const checklistRows = db
        .prepare(
            `SELECT * FROM journal_checklist WHERE trade_id IN (${list}) ORDER BY trade_id, sort_order, id`
        )
        .all(...tradeIds) as ChecklistRow[]
    for (const row of checklistRows) {
        const existing = checklists.get(row.trade_id)
        const item = mapChecklist(row)
        if (existing) {
            existing.push(item)
        } else {
            checklists.set(row.trade_id, [item])
        }
    }

    // Tag kustom many-to-many (fitur 3). Gabungkan journal_tags + relasi per trade,
    // diposisikan per trade (group by trade_id) untuk menghindari N+1.
    const tagRows = db
        .prepare(
            `SELECT jt.trade_id, jt2.id as tag_id, jt2.name
       FROM trade_journal_tags jt
       JOIN journal_tags jt2 ON jt2.id = jt.tag_id
       WHERE jt.trade_id IN (${list})
       ORDER BY jt.trade_id, jt2.name COLLATE NOCASE`
        )
        .all(...tradeIds) as { trade_id: number; tag_id: number; name: string }[]
    for (const row of tagRows) {
        const existing = tags.get(row.trade_id)
        const tag: TradeTag = { id: row.tag_id, name: row.name }
        if (existing) {
            existing.push(tag)
        } else {
            tags.set(row.trade_id, [tag])
        }
    }

    return { journals, risks, checklists, tags }
}

function assembleDetail(trade: Trade, related: RelatedData): TradeDetail {
    const journal = related.journals.get(trade.id) ?? null
    const plannedRisk = related.risks.get(trade.id) ?? null
    return {
        trade,
        journal,
        plannedRisk,
        checklist: related.checklists.get(trade.id) ?? [],
        tags: related.tags.get(trade.id) ?? [],
        rMultiple: computeR(trade.realizedPnl, plannedRisk?.riskAmount ?? null)
    }
}

// ---------------------------------------------------------------------------
// Operasi baca
// ---------------------------------------------------------------------------

export interface TradeFilter {
    exchange?: ExchangeId
    symbol?: string
    /** Batas bawah exitTime (inklusif), epoch ms UTC. */
    from?: number
    /** Batas atas exitTime (inklusif), epoch ms UTC. */
    to?: number
    setupTag?: string
    limit?: number
    offset?: number
}

/**
 * Ambil daftar trade beserta relasinya.
 *
 * Catatan: filter `setupTag` butuh JOIN ke trade_journal. Filter diterapkan di SQL
 * agar tidak memuat seluruh tabel ke memori saat data sudah banyak.
 */
export function listTrades(db: Database.Database, filter: TradeFilter = {}): TradeDetail[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter.exchange) {
        conditions.push('t.exchange = ?')
        params.push(filter.exchange)
    }
    if (filter.symbol) {
        conditions.push('t.symbol = ?')
        params.push(filter.symbol)
    }
    if (filter.from !== undefined) {
        conditions.push('t.exit_time >= ?')
        params.push(filter.from)
    }
    if (filter.to !== undefined) {
        conditions.push('t.exit_time <= ?')
        params.push(filter.to)
    }

    let join = ''
    if (filter.setupTag !== undefined) {
        join = 'LEFT JOIN trade_journal j ON j.trade_id = t.id'
        conditions.push('j.setup_tag = ?')
        params.push(filter.setupTag)
    }

    let sql = `SELECT t.* FROM trades t ${join}`
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`
    // Urut berdasarkan waktu exit, terbaru dulu. id sebagai tie-breaker supaya
    // urutan deterministik saat dua trade punya exit_time identik.
    sql += ' ORDER BY t.exit_time DESC, t.id DESC'

    if (filter.limit !== undefined) {
        sql += ' LIMIT ?'
        params.push(filter.limit)
        if (filter.offset !== undefined) {
            sql += ' OFFSET ?'
            params.push(filter.offset)
        }
    }

    const rows = db.prepare(sql).all(...params) as TradeRow[]
    const trades = rows.map(mapTrade)
    const related = loadRelated(
        db,
        trades.map((t) => t.id)
    )
    return trades.map((trade) => assembleDetail(trade, related))
}

export function getTrade(db: Database.Database, id: number): TradeDetail | null {
    const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow | undefined
    if (!row) return null
    const trade = mapTrade(row)
    const related = loadRelated(db, [trade.id])
    return assembleDetail(trade, related)
}

/** Daftar `setup_tag` unik yang pernah dipakai — untuk autocomplete di UI. */
export function listSetupTags(db: Database.Database): string[] {
    const rows = db
        .prepare(
            `SELECT DISTINCT setup_tag FROM trade_journal
       WHERE setup_tag IS NOT NULL AND TRIM(setup_tag) <> ''
       ORDER BY setup_tag COLLATE NOCASE`
        )
        .all() as { setup_tag: string }[]
    return rows.map((r) => r.setup_tag)
}

/** Daftar `emotion_tag` unik yang pernah dipakai user. */
export function listEmotionTags(db: Database.Database): string[] {
    const rows = db
        .prepare(
            `SELECT DISTINCT emotion_tag FROM trade_journal
       WHERE emotion_tag IS NOT NULL AND TRIM(emotion_tag) <> ''
       ORDER BY emotion_tag COLLATE NOCASE`
        )
        .all() as { emotion_tag: string }[]
    return rows.map((r) => r.emotion_tag)
}

export function countTrades(db: Database.Database): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM trades').get() as { n: number }
    return row.n
}

/** Daftar semua nama tag kustom yang pernah dipakai — untuk autocomplete di UI. */
export function listTagNames(db: Database.Database): string[] {
    const rows = db
        .prepare(
            `SELECT DISTINCT name FROM journal_tags
       ORDER BY name COLLATE NOCASE`
        )
        .all() as { name: string }[]
    return rows.map((r) => r.name)
}

// ---------------------------------------------------------------------------
// Operasi tulis
// ---------------------------------------------------------------------------

function writeJournal(
    db: Database.Database,
    tradeId: number,
    journal: JournalInput | null | undefined,
    now: number
): void {
    if (!journal) return

    db.prepare(
        `INSERT INTO trade_journal
       (trade_id, setup_tag, pre_trade_thesis, post_trade_review, emotion_tag,
        execution_grade, screenshot_path, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(trade_id) DO UPDATE SET
       setup_tag         = excluded.setup_tag,
       pre_trade_thesis  = excluded.pre_trade_thesis,
       post_trade_review = excluded.post_trade_review,
       emotion_tag       = excluded.emotion_tag,
       execution_grade   = excluded.execution_grade,
       screenshot_path   = excluded.screenshot_path,
       updated_at        = excluded.updated_at`
    ).run(
        tradeId,
        normalizeText(journal.setupTag),
        normalizeText(journal.preTradeThesis),
        normalizeText(journal.postTradeReview),
        normalizeText(journal.emotionTag),
        journal.executionGrade ?? null,
        normalizeText(journal.screenshotPath),
        now
    )

    if (journal.checklist !== undefined) {
        // Ganti seluruh checklist: hapus lalu tulis ulang. Lebih sederhana dan
        // pasti konsisten daripada mencocokkan per item.
        db.prepare('DELETE FROM journal_checklist WHERE trade_id = ?').run(tradeId)
        const insert = db.prepare(
            'INSERT INTO journal_checklist (trade_id, label, checked, sort_order) VALUES (?, ?, ?, ?)'
        )
        journal.checklist.forEach((item, index) => {
            insert.run(tradeId, item.label, item.checked ? 1 : 0, index)
        })
    }

    // Tag kustom banyak nilai (fitur 3). Ganti seluruh relasi trade <-> tag;
    // katalog tag dibiarkan utuh (tidak dihapus) agar riwayat tetap stabil.
    if (journal.tags !== undefined) {
        writeTradeTags(db, tradeId, journal.tags)
    }
}

/**
 * Tulis ulang relasi many-to-many trade <-> tag.
 *
 * Katalog `journal_tags` dipertahankan (tidak dihapus) supaya riwayat ekspor dan
 * autocomplete tetap stabil. Nama tag dinormalisasi (trim, tanpa '#' berulang)
 * dan relasi menggunakan `name` sebagai kunci unik case-insensitive.
 */
function writeTradeTags(db: Database.Database, tradeId: number, names: string[]): void {
    const normalized = new Set<string>()
    for (const raw of names) {
        const n = normalizeTagName(raw)
        if (n === '') continue
        normalized.add(n)
    }

    db.prepare('DELETE FROM trade_journal_tags WHERE trade_id = ?').run(tradeId)

    if (normalized.size === 0) return

    const findTag = db.prepare('SELECT id FROM journal_tags WHERE name = ? COLLATE NOCASE')
    const insertTag = db.prepare('INSERT INTO journal_tags (name, created_at) VALUES (?, ?)')
    const link = db.prepare(
        'INSERT OR IGNORE INTO trade_journal_tags (trade_id, tag_id) VALUES (?, ?)'
    )

    for (const name of normalized) {
        let row = findTag.get(name) as { id: number } | undefined
        if (!row) {
            const info = insertTag.run(name, Date.now())
            row = { id: Number(info.lastInsertRowid) }
        }
        link.run(tradeId, row.id)
    }
}

function writePlannedRisk(
    db: Database.Database,
    tradeId: number,
    risk: PlannedRiskInput | null | undefined
): void {
    if (!risk) return

    db.prepare(
        `INSERT INTO planned_risk (trade_id, planned_stop, planned_target, risk_amount, planned_rr)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(trade_id) DO UPDATE SET
       planned_stop   = excluded.planned_stop,
       planned_target = excluded.planned_target,
       risk_amount    = excluded.risk_amount,
       planned_rr     = excluded.planned_rr`
    ).run(
        tradeId,
        risk.plannedStop ?? null,
        risk.plannedTarget ?? null,
        risk.riskAmount ?? null,
        risk.plannedRr ?? null
    )
}

/** Trim string; string kosong jadi NULL supaya tidak ada "" yang tersimpan. */
function normalizeText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

export interface CreateTradePayload {
    trade: TradeInput
    journal?: JournalInput | null
    plannedRisk?: PlannedRiskInput | null
}

/**
 * Buat trade manual baru.
 *
 * `pnlSource` selalu `'manual'` di sini — trade dari sync exchange ditangani
 * jalur terpisah di Fase 2 dengan `pnlSource` sesuai keputusan D3.
 *
 * Checklist: kalau journal dikirim tanpa checklist, template default di-copy.
 * Template di-COPY (bukan direferensikan) supaya mengubah template di masa depan
 * tidak mengubah riwayat trade lama (plans/02-DATA-MODEL.md §5).
 */
export function createTrade(db: Database.Database, payload: CreateTradePayload): number {
    const now = Date.now()
    const t = payload.trade

    const execute = db.transaction((): number => {
        const result = db
            .prepare(
                `INSERT INTO trades
           (exchange, external_id, symbol, direction, entry_price, exit_price,
            entry_time, exit_time, size, leverage, margin_mode, realized_pnl,
            pnl_source, fee_open, fee_close, fee_open_maker, fee_close_maker,
            funding_fee, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                t.exchange,
                normalizeText(t.externalId),
                t.symbol.trim(),
                t.direction,
                t.entryPrice,
                t.exitPrice,
                t.entryTime,
                t.exitTime,
                t.size,
                t.leverage,
                t.marginMode ?? null,
                t.realizedPnl,
                'manual' satisfies PnlSource,
                t.feeOpen,
                t.feeClose,
                null,
                null,
                t.fundingFee,
                now,
                now
            )

        const tradeId = Number(result.lastInsertRowid)

        const journal: JournalInput = payload.journal ?? {}
        if (journal.checklist === undefined) {
            journal.checklist = DEFAULT_CHECKLIST_TEMPLATE.map((label) => ({
                label,
                checked: false
            }))
        }
        writeJournal(db, tradeId, journal, now)
        writePlannedRisk(db, tradeId, payload.plannedRisk)

        return tradeId
    })

    return execute()
}

export interface UpdateTradePayload {
    trade: TradeInput
    journal?: JournalInput | null
    plannedRisk?: PlannedRiskInput | null
}

/**
 * Perbarui trade.
 *
 * PENTING: `pnlSource` TIDAK diubah di sini. Trade hasil sync exchange tetap
 * ditandai `exchange_reported` walau user mengedit catatannya — mengubah asal
 * data P&L akan membuat audit keandalan data tidak mungkin dilakukan.
 */
export function updateTrade(
    db: Database.Database,
    id: number,
    payload: UpdateTradePayload
): boolean {
    const now = Date.now()
    const t = payload.trade

    const execute = db.transaction((): boolean => {
        const result = db
            .prepare(
                `UPDATE trades SET
           exchange = ?, external_id = ?, symbol = ?, direction = ?,
           entry_price = ?, exit_price = ?, entry_time = ?, exit_time = ?,
           size = ?, leverage = ?, margin_mode = ?, realized_pnl = ?,
           fee_open = ?, fee_close = ?, funding_fee = ?, updated_at = ?
         WHERE id = ?`
            )
            .run(
                t.exchange,
                normalizeText(t.externalId),
                t.symbol.trim(),
                t.direction,
                t.entryPrice,
                t.exitPrice,
                t.entryTime,
                t.exitTime,
                t.size,
                t.leverage,
                t.marginMode ?? null,
                t.realizedPnl,
                t.feeOpen,
                t.feeClose,
                t.fundingFee,
                now,
                id
            )

        if (result.changes === 0) return false

        writeJournal(db, id, payload.journal, now)
        writePlannedRisk(db, id, payload.plannedRisk)
        return true
    })

    return execute()
}

/**
 * Hapus trade.
 *
 * Baris jurnal, checklist, dan planned_risk ikut terhapus lewat ON DELETE CASCADE
 * — ini hanya bekerja karena `PRAGMA foreign_keys = ON` benar-benar aktif
 * (plans/02-DATA-MODEL.md §8). Fill tetap ada dengan trade_id = NULL sebagai
 * bukti audit.
 */
export function deleteTrade(db: Database.Database, id: number): boolean {
    const result = db.prepare('DELETE FROM trades WHERE id = ?').run(id)
    return result.changes > 0
}
