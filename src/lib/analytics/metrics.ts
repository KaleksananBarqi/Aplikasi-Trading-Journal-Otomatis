// Import relatif (bukan alias `@shared`) supaya file ini juga bisa dipakai dari
// skrip verifikasi yang di-build lewat entry main process, di mana alias
// renderer tidak dikonfigurasi.
import type { TradeDetail } from '../../../shared/domain'

/**
 * Perhitungan metrik performa.
 *
 * Fungsi-fungsi di sini MURNI (input -> output, tanpa efek samping) supaya bisa
 * diuji langsung terhadap dataset fixture. plans/03-PHASES.md Fase 4 menegaskan:
 * metrik finansial tanpa test adalah angka yang tidak bisa dipercaya.
 *
 * Definisi formula dikunci di plans/03-PHASES.md Fase 4. Beberapa keputusan yang
 * sengaja diambil dan alasannya:
 *
 * 1. Win rate: trade dengan P&L PERSIS NOL dikecualikan dari penyebut. Trade flat
 *    bukan kekalahan, jadi memasukkannya akan menekan win rate secara menyesatkan.
 * 2. Profit factor tanpa loss -> Infinity, ditampilkan sebagai "∞". Bukan angka
 *    besar buatan yang terlihat seperti hasil sebenarnya.
 * 3. Funding fee TERMASUK dalam perhitungan P&L bersih. Brief §6 menyebutnya
 *    biaya riil, bukan biaya tersembunyi yang boleh diabaikan.
 */

/** P&L bersih satu trade: realized P&L dikurangi fee dan funding. */
export function netPnl(detail: TradeDetail): number {
    const { realizedPnl, feeOpen, feeClose, fundingFee } = detail.trade
    return realizedPnl - feeOpen - feeClose - fundingFee
}

export interface PerformanceSummary {
    totalTrades: number
    /** Trade dengan P&L bersih > 0. */
    wins: number
    /** Trade dengan P&L bersih < 0. */
    losses: number
    /** Trade dengan P&L bersih persis 0. Dikecualikan dari win rate. */
    breakEven: number
    /** wins / (wins + losses). Null bila tidak ada trade berarah. */
    winRate: number | null
    /** sum(profit) / |sum(loss)|. Infinity bila tidak ada loss sama sekali. */
    profitFactor: number
    /** (winRate × avgWin) − (lossRate × avgLoss). Null bila tidak dapat dihitung. */
    expectancy: number | null
    avgWin: number | null
    avgLoss: number | null
    netPnlTotal: number
    grossPnlTotal: number
    feeTotal: number
    fundingFeeTotal: number
    /** Jumlah trade yang punya R valid (stop loss diisi). */
    tradesWithR: number
}

export function summarize(trades: TradeDetail[]): PerformanceSummary {
    let wins = 0
    let losses = 0
    let breakEven = 0
    let grossProfit = 0
    let grossLoss = 0
    let grossPnlTotal = 0
    let feeTotal = 0
    let fundingFeeTotal = 0
    let tradesWithR = 0

    for (const detail of trades) {
        const pnl = netPnl(detail)
        grossPnlTotal += detail.trade.realizedPnl
        feeTotal += detail.trade.feeOpen + detail.trade.feeClose
        fundingFeeTotal += detail.trade.fundingFee
        if (detail.rMultiple !== null) tradesWithR += 1

        if (pnl > 0) {
            wins += 1
            grossProfit += pnl
        } else if (pnl < 0) {
            losses += 1
            grossLoss += Math.abs(pnl)
        } else {
            breakEven += 1
        }
    }

    const directional = wins + losses
    const winRate = directional > 0 ? wins / directional : null
    // Tanpa loss: profit factor tak terhingga. Dibiarkan Infinity (bukan angka
    // besar buatan) supaya UI bisa menampilkannya sebagai "∞" secara eksplisit.
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Number.POSITIVE_INFINITY

    const avgWin = wins > 0 ? grossProfit / wins : null
    const avgLoss = losses > 0 ? grossLoss / losses : null

    let expectancy: number | null = null
    if (winRate !== null && avgWin !== null && avgLoss !== null) {
        const lossRate = 1 - winRate
        expectancy = winRate * avgWin - lossRate * avgLoss
    }

    return {
        totalTrades: trades.length,
        wins,
        losses,
        breakEven,
        winRate,
        profitFactor,
        expectancy,
        avgWin,
        avgLoss,
        netPnlTotal: grossProfit - grossLoss,
        grossPnlTotal,
        feeTotal,
        fundingFeeTotal,
        tradesWithR
    }
}

export interface EquityPoint {
    /** Epoch ms UTC — waktu exit trade. */
    time: number
    /** Equity kumulatif SETELAH trade ini. */
    equity: number
    /** Puncak tertinggi sejauh ini. */
    peak: number
    /** Penurunan dari puncak (nilai <= 0). */
    drawdown: number
    tradeId: number
}

/**
 * Kurva equity kumulatif, diurutkan naik berdasarkan waktu exit.
 *
 * Mengembalikan juga puncak dan drawdown per titik, sehingga chart underwater
 * (drawdown) bisa digambar dari data yang sama tanpa perhitungan ulang.
 */
export function buildEquityCurve(trades: TradeDetail[]): EquityPoint[] {
    const ordered = [...trades].sort((a, b) => {
        if (a.trade.exitTime !== b.trade.exitTime) return a.trade.exitTime - b.trade.exitTime
        // Tie-breaker id: urutan harus deterministik saat exit_time identik.
        return a.trade.id - b.trade.id
    })

    let equity = 0
    let peak = 0

    return ordered.map((detail) => {
        equity += netPnl(detail)
        if (equity > peak) peak = equity
        return {
            time: detail.trade.exitTime,
            equity,
            peak,
            // Selalu <= 0. Nol berarti sedang di puncak.
            drawdown: equity - peak,
            tradeId: detail.trade.id
        }
    })
}

export interface DrawdownStats {
    /** Penurunan terbesar dari puncak (nilai negatif atau 0). */
    maxDrawdown: number
    /** Epoch ms saat drawdown terburuk terjadi. */
    maxDrawdownTime: number | null
    /**
     * Lama (ms) dari puncak sebelum drawdown terburuk sampai equity kembali
     * menyentuh level puncak itu. Null bila belum pernah pulih.
     */
    maxDrawdownDurationMs: number | null
}

export function computeDrawdown(curve: EquityPoint[]): DrawdownStats {
    if (curve.length === 0) {
        return { maxDrawdown: 0, maxDrawdownTime: null, maxDrawdownDurationMs: null }
    }

    let maxDrawdown = 0
    let maxDrawdownTime: number | null = null
    let maxDrawdownIndex = -1

    curve.forEach((point, index) => {
        if (point.drawdown < maxDrawdown) {
            maxDrawdown = point.drawdown
            maxDrawdownTime = point.time
            maxDrawdownIndex = index
        }
    })

    if (maxDrawdownIndex === -1) {
        return { maxDrawdown: 0, maxDrawdownTime: null, maxDrawdownDurationMs: null }
    }

    // Cari titik puncak terakhir sebelum drawdown terburuk, lalu cari kapan
    // equity kembali ke level puncak tersebut.
    //
    // PENTING: kondisi loop memeriksa `curve[peakIndex].equity` (titik itu
    // SENDIRI), bukan `peakIndex - 1`. Memakai `peakIndex - 1` membuat loop
    // berhenti satu langkah terlalu awal, sehingga `startTime` jatuh ke titik
    // drawdown terburuk — bukan ke titik puncaknya. Akibatnya durasi drawdown
    // terukur lebih pendek dari yang sebenarnya.
    //
    // Ditemukan oleh unit test dengan nilai yang dihitung tangan (skenario 6):
    // diharapkan 3 jam, sempat menghasilkan 2 jam.
    const peakLevel = curve[maxDrawdownIndex]?.peak ?? 0
    let peakIndex = maxDrawdownIndex
    while (peakIndex > 0 && (curve[peakIndex]?.equity ?? 0) < peakLevel) {
        peakIndex -= 1
    }

    const startTime = curve[peakIndex]?.time ?? 0
    let duration: number | null = null
    for (let i = maxDrawdownIndex; i < curve.length; i += 1) {
        const point = curve[i]
        if (point && point.equity >= peakLevel) {
            duration = point.time - startTime
            break
        }
    }

    return { maxDrawdown, maxDrawdownTime, maxDrawdownDurationMs: duration }
}

/** Distribusi R-multiple per bucket, untuk histogram Fase 4. */
export interface RBucket {
    label: string
    min: number
    max: number
    count: number
}

export const R_BUCKETS: Omit<RBucket, 'count'>[] = [
    { label: '< -2R', min: Number.NEGATIVE_INFINITY, max: -2 },
    { label: '-2R…-1R', min: -2, max: -1 },
    { label: '-1R…0R', min: -1, max: 0 },
    { label: '0R…1R', min: 0, max: 1 },
    { label: '1R…2R', min: 1, max: 2 },
    { label: '2R…3R', min: 2, max: 3 },
    { label: '> 3R', min: 3, max: Number.POSITIVE_INFINITY }
]

/**
 * Hitung distribusi R.
 *
 * Mengembalikan juga cakupan (berapa trade punya R valid vs total), karena
 * histogram yang diam-diam hanya menggambar sebagian data adalah bentuk
 * kebohongan data (plans/02-DATA-MODEL.md §6).
 */
export function buildRDistribution(trades: TradeDetail[]): {
    buckets: RBucket[]
    withR: number
    total: number
} {
    const buckets = R_BUCKETS.map((b) => ({ ...b, count: 0 }))
    let withR = 0

    for (const detail of trades) {
        const r = detail.rMultiple
        if (r === null) continue
        withR += 1
        const bucket = buckets.find((b) => r >= b.min && r < b.max)
        if (bucket) bucket.count += 1
    }

    return { buckets, withR, total: trades.length }
}
