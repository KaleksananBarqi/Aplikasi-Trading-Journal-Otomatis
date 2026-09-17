// Import relatif — lihat catatan di metrics.ts.
import type { TradeDetail } from '../../../shared/domain'

/**
 * Pengelompokan (breakdown) per dimensi untuk halaman Analytics.
 *
 * Definisi batas sesi dan aturan penugasan dikunci di
 * plans/01-ARCHITECTURE.md §5. Dipisahkan dari halaman Analytics supaya bisa
 * diuji tanpa merender React.
 */

/** Batas sesi trading, basis UTC (menit dari tengah malam). */
export interface SessionBound {
    id: string
    label: string
    startUtcMinutes: number
    endUtcMinutes: number
}

export const SESSIONS: SessionBound[] = [
    { id: 'asia', label: 'Asia (00–09 UTC)', startUtcMinutes: 0, endUtcMinutes: 9 * 60 },
    { id: 'london', label: 'London (07–16 UTC)', startUtcMinutes: 7 * 60, endUtcMinutes: 16 * 60 },
    { id: 'newyork', label: 'New York (12–21 UTC)', startUtcMinutes: 12 * 60, endUtcMinutes: 21 * 60 }
]

export const WEEKDAY_LABELS = [
    'Minggu',
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis',
    'Jumat',
    'Sabtu'
] as const

/**
 * Sesi trading dari waktu ENTRY, bukan exit (plans/01-ARCHITECTURE.md §5).
 *
 * Alasannya: setup dan kondisi pasar saat entry yang ingin dianalisis.
 * Trade yang melewati batas sesi TIDAK dipecah — ia masuk ke sesi tempat ia dibuka.
 *
 * Bila entry jatuh di rentang yang overlap (London/NY pada 12:00–16:00 UTC),
 * nama kedua sesi dikembalikan sekaligus. Ini disengaja, dan UI wajib
 * menampilkan peringatannya supaya user tidak menjumlahkan persentase lintas
 * sesi lalu mengira totalnya 100%.
 */
export function sessionLabelOf(entryTime: number): string {
    const date = new Date(entryTime)
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()

    const matched = SESSIONS.filter(
        (session) => minutes >= session.startUtcMinutes && minutes < session.endUtcMinutes
    )

    if (matched.length === 0) return 'Di luar sesi'
    return matched.map((session) => session.label).join(' + ')
}

/** Hari dalam minggu dari waktu ENTRY, basis UTC. */
export function weekdayLabelOf(entryTime: number): string {
    const day = new Date(entryTime).getUTCDay()
    return WEEKDAY_LABELS[day] ?? 'Tidak diketahui'
}

/** Dimensi yang bisa dipakai untuk breakdown. */
export type Dimension = 'symbol' | 'setupTag' | 'session' | 'weekday' | 'grade' | 'direction' | 'exchange'

export interface DimensionOption {
    id: Dimension
    label: string
    hint: string
}

export const DIMENSION_OPTIONS: DimensionOption[] = [
    { id: 'setupTag', label: 'Per Setup', hint: 'Strategi mana yang benar-benar bekerja' },
    { id: 'symbol', label: 'Per Symbol', hint: 'Instrumen mana yang paling produktif' },
    { id: 'session', label: 'Per Sesi', hint: 'Jam berapa performa terbaik (basis UTC)' },
    { id: 'weekday', label: 'Per Hari', hint: 'Hari apa yang sebaiknya dihindari' },
    { id: 'grade', label: 'Per Grade', hint: 'Apakah proses bagus sejalan dengan hasil' },
    { id: 'direction', label: 'Per Arah', hint: 'Long vs short' },
    { id: 'exchange', label: 'Per Exchange', hint: 'MEXC vs Bitunix vs manual' }
]

/** Kunci pengelompokan untuk satu trade pada dimensi tertentu. */
export function groupKeyOf(detail: TradeDetail, dimension: Dimension): string {
    switch (dimension) {
        case 'symbol':
            return detail.trade.symbol
        case 'setupTag':
            return detail.journal?.setupTag ?? '(tanpa setup)'
        case 'session':
            return sessionLabelOf(detail.trade.entryTime)
        case 'weekday':
            return weekdayLabelOf(detail.trade.entryTime)
        case 'grade':
            return detail.journal?.executionGrade
                ? `Grade ${detail.journal.executionGrade}`
                : '(belum digrade)'
        case 'direction':
            return detail.trade.direction === 'long' ? 'Long' : 'Short'
        case 'exchange':
            return detail.trade.exchange.toUpperCase()
    }
}

export interface BreakdownBucket {
    label: string
    trades: TradeDetail[]
    /** P&L bersih (setelah fee & funding). */
    netPnl: number
    wins: number
    losses: number
    breakEven: number
    /** wins / (wins + losses). Null bila tidak ada trade berarah. */
    winRate: number | null
    /** Rata-rata R untuk trade yang punya R valid. Null bila tidak ada. */
    avgR: number | null
}

/** P&L bersih satu trade. Definisi sama dengan yang dipakai headline metrics. */
export function netPnlOf(detail: TradeDetail): number {
    const { realizedPnl, feeOpen, feeClose, fundingFee } = detail.trade
    return realizedPnl - feeOpen - feeClose - fundingFee
}

/**
 * Kelompokkan trade per dimensi, urut berdasarkan P&L menurun.
 *
 * Trade dengan P&L persis nol dihitung `breakEven` dan dikecualikan dari
 * penyebut win rate — konsisten dengan definisi di `metrics.ts`.
 */
export function buildBreakdown(
    trades: TradeDetail[],
    dimension: Dimension
): BreakdownBucket[] {
    const groups = new Map<string, TradeDetail[]>()

    for (const detail of trades) {
        const key = groupKeyOf(detail, dimension)
        const existing = groups.get(key)
        if (existing) existing.push(detail)
        else groups.set(key, [detail])
    }

    const buckets: BreakdownBucket[] = []

    for (const [label, group] of groups) {
        let wins = 0
        let losses = 0
        let breakEven = 0
        let netPnl = 0
        let rSum = 0
        let rCount = 0

        for (const detail of group) {
            const pnl = netPnlOf(detail)
            netPnl += pnl
            if (pnl > 0) wins += 1
            else if (pnl < 0) losses += 1
            else breakEven += 1

            if (detail.rMultiple !== null) {
                rSum += detail.rMultiple
                rCount += 1
            }
        }

        const directional = wins + losses
        buckets.push({
            label,
            trades: group,
            netPnl,
            wins,
            losses,
            breakEven,
            winRate: directional > 0 ? wins / directional : null,
            avgR: rCount > 0 ? rSum / rCount : null
        })
    }

    return buckets.sort((a, b) => b.netPnl - a.netPnl)
}

/** Daftar nilai unik untuk opsi filter. */
export function collectFilterValues(trades: TradeDetail[]): {
    symbols: string[]
    setupTags: string[]
    exchanges: string[]
    grades: string[]
} {
    const symbols = new Set<string>()
    const setupTags = new Set<string>()
    const exchanges = new Set<string>()
    const grades = new Set<string>()

    for (const detail of trades) {
        symbols.add(detail.trade.symbol)
        exchanges.add(detail.trade.exchange)
        if (detail.journal?.setupTag) setupTags.add(detail.journal.setupTag)
        if (detail.journal?.executionGrade) grades.add(detail.journal.executionGrade)
    }

    return {
        symbols: [...symbols].sort((a, b) => a.localeCompare(b)),
        setupTags: [...setupTags].sort((a, b) => a.localeCompare(b)),
        exchanges: [...exchanges].sort((a, b) => a.localeCompare(b)),
        grades: [...grades].sort()
    }
}
