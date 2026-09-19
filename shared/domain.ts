/**
 * Tipe domain aplikasi — dipakai bersama oleh main process dan renderer.
 *
 * File ini HARUS bebas dari API Node/Electron, karena ikut ter-bundle ke renderer.
 *
 * Konvensi waktu: semua timestamp adalah epoch milliseconds UTC (INTEGER di SQLite).
 * Konversi ke timezone lokal HANYA dilakukan di layer presentasi (brief §5.1).
 */

/** Asal data trade. `'manual'` untuk entry tangan, di luar sync exchange. */
export type ExchangeId = 'mexc' | 'bitunix' | 'manual'

export type TradeDirection = 'long' | 'short'

export type MarginMode = 'isolated' | 'cross'

/**
 * Saldo akun exchange futures (misal USDT).
 */
export interface AccountBalance {
    exchange: ExchangeId
    asset: string
    total: number
    available: number
    unrealizedPnl: number
    updatedAt: number
}


/**
 * Asal nilai `realizedPnl` — keputusan D3 (plans/01-ARCHITECTURE.md).
 * Disimpan eksplisit supaya keandalan tiap baris bisa diaudit, bukan diasumsikan seragam.
 */
export type PnlSource = 'exchange_reported' | 'computed_average_cost' | 'manual'

/** Grade eksekusi. SENGAJA terpisah dari hasil profit/loss (brief §5.3, §12). */
export type ExecutionGrade = 'A' | 'B' | 'C' | 'D'

/** Tag emosi default. User boleh menambah sendiri — disimpan sebagai string bebas. */
export const DEFAULT_EMOTION_TAGS = ['calm', 'fomo', 'revenge', 'overconfident', 'anxious'] as const

/** Label template checklist default. Di-copy ke trade saat dibuat. */
export const DEFAULT_CHECKLIST_TEMPLATE = [
    'Sesuai rencana risk %',
    'Tidak entry saat news besar',
    'Setup sesuai playbook',
    'Stop loss sudah ditentukan sebelum entry'
] as const

export interface Trade {
    id: number
    exchange: ExchangeId
    /** ID posisi dari exchange. NULL untuk trade manual. */
    externalId: string | null
    symbol: string
    direction: TradeDirection

    entryPrice: number
    exitPrice: number
    /** Epoch ms UTC */
    entryTime: number
    /** Epoch ms UTC */
    exitTime: number

    size: number
    leverage: number
    marginMode: MarginMode | null

    realizedPnl: number
    pnlSource: PnlSource

    feeOpen: number
    feeClose: number
    /** NULL bila exchange tidak memecah maker/taker. */
    feeOpenMaker: number | null
    feeCloseMaker: number | null
    fundingFee: number

    createdAt: number
    updatedAt: number
}

/** Field manual yang diisi user (brief §5.3). */
export interface TradeJournal {
    tradeId: number
    setupTag: string | null
    preTradeThesis: string | null
    postTradeReview: string | null
    emotionTag: string | null
    executionGrade: ExecutionGrade | null
    screenshotPath: string | null
    updatedAt: number
}

export interface ChecklistItem {
    id: number
    tradeId: number
    label: string
    checked: boolean
    sortOrder: number
}

/**
 * Satu tag kustom pada trade (fitur 3). Disimpan lewat tabel many-to-many
 * `trade_journal_tags` — lihat plans/05-FEATURES-PLAN.md.
 */
export interface TradeTag {
    id: number
    /** Nama ternormalisasi tanpa tanda '#' berulang. */
    name: string
}

/**
 * Normalisasi nama tag: trim spasi luar dan hapus tanda '#' berulang.
 * Contoh: "##BTC_Scalp " -> "BTC_Scalp".
 */
export function normalizeTagName(raw: string): string {
    let value = raw.trim()
    while (value.startsWith('#')) value = value.slice(1)
    return value
}

/**
 * Pisahkan input teks multi-tag (dipisah spasi/koma) menjadi daftar nama
 * ternormalisasi yang unik (case-insensitive), tanpa string kosong.
 */
export function parseTags(input: string): string[] {
    const parts = input.split(/[\s,]+/)
    const seen = new Set<string>()
    const result: string[] = []
    for (const part of parts) {
        const normalized = normalizeTagName(part)
        if (normalized === '') continue
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
    }
    return result
}

/**
 * Stop-loss yang DIRENCANAKAN. Sumber perhitungan `rMultiple`.
 * Bila `plannedStop` null, `rMultiple` juga null — tidak diestimasi (brief §5.2).
 */
export interface PlannedRisk {
    tradeId: number
    plannedStop: number | null
    plannedTarget: number | null
    riskAmount: number | null
    plannedRr: number | null
}

/** Trade + relasi jurnal. Bentuk yang dipakai UI. */
export interface TradeDetail {
    trade: Trade
    journal: TradeJournal | null
    plannedRisk: PlannedRisk | null
    checklist: ChecklistItem[]
    /** Tag kustom banyak nilai (fitur 3). */
    tags: TradeTag[]
    /** Dihitung; NULL bila stop loss tidak diisi. */
    rMultiple: number | null
}

// ---------------------------------------------------------------------------
// Payload input (dari formulir UI)
// ---------------------------------------------------------------------------

export interface TradeInput {
    exchange: ExchangeId
    externalId?: string | null
    symbol: string
    direction: TradeDirection
    entryPrice: number
    exitPrice: number
    entryTime: number
    exitTime: number
    size: number
    leverage: number
    marginMode: MarginMode | null
    realizedPnl: number
    feeOpen: number
    feeClose: number
    fundingFee: number
}

export interface JournalInput {
    setupTag?: string | null
    preTradeThesis?: string | null
    postTradeReview?: string | null
    emotionTag?: string | null
    executionGrade?: ExecutionGrade | null
    screenshotPath?: string | null
    /** Tag kustom banyak nilai (fitur 3). Nama sudah ternormalisasi. */
    tags?: string[]
    /** Bila diisi, checklist trade diganti seluruhnya. */
    checklist?: { label: string; checked: boolean }[]
}

export interface PlannedRiskInput {
    plannedStop?: number | null
    plannedTarget?: number | null
    riskAmount?: number | null
    plannedRr?: number | null
}

/**
 * Hitung R-multiple.
 *
 * Aturan (plans/02-DATA-MODEL.md §6): bila tidak ada stop loss ATAU tidak ada
 * nominal risiko, hasilnya NULL. Tidak diestimasi dan tidak diisi 0 — histogram
 * R yang diam-diam hanya menggambar sebagian data adalah bentuk kebohongan data.
 */
export function computeRMultiple(
    realizedPnl: number,
    riskAmount: number | null | undefined
): number | null {
    if (riskAmount === null || riskAmount === undefined) return null
    if (riskAmount === 0) return null
    return realizedPnl / riskAmount
}

/**
 * Hitung RR rencana dari entry, SL, dan TP.
 *
 * Aturan (plans/05-FEATURES-PLAN.md fitur 2):
 * - Long: rewardPerUnit = abs(plannedTarget - entryPrice)
 * - Short: rewardPerUnit = abs(entryPrice - plannedTarget)
 * - riskPerUnit = abs(entryPrice - plannedStop)
 * - plannedRr = rewardPerUnit / riskPerUnit jika risk > 0
 * - plannedRr = null jika SL kosong/sama dengan entry
 *
 * @param direction 'long' | 'short'
 * @param entryPrice Harga entry
 * @param plannedStop Stop loss direncanakan
 * @param plannedTarget Target direncanakan
 * @returns RR rencana atau null
 */
export function computePlannedRR(
    direction: 'long' | 'short',
    entryPrice: number,
    plannedStop: number | null,
    plannedTarget: number | null
): number | null {
    if (plannedStop === null || plannedStop === entryPrice) return null
    if (plannedTarget === null) return null

    const riskPerUnit = Math.abs(entryPrice - plannedStop)
    if (riskPerUnit === 0) return null

    const rewardPerUnit = direction === 'long'
        ? Math.abs(plannedTarget - entryPrice)
        : Math.abs(entryPrice - plannedTarget)

    return rewardPerUnit / riskPerUnit
}
