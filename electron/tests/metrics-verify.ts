/**
 * Verifikasi Fase 4 — Metrik analitik.
 *
 * ===========================================================================
 * KENAPA NILAI HARUS DIHITUNG TANGAN
 * ===========================================================================
 *
 * plans/03-PHASES.md Fase 4: "Semua metric punya unit test terhadap dataset
 * fixture dengan nilai yang dihitung tangan. Metric finansial tanpa test adalah
 * angka yang tidak bisa dipercaya."
 *
 * Kalau expected value ditulis dengan menjalankan fungsi lalu menyalin
 * hasilnya, test itu hanya mengunci perilaku saat ini — TERMASUK bug-nya.
 * Karena itu setiap angka di bawah dihitung manual dari definisi, dan
 * perhitungannya ditulis di komentar.
 *
 * Test ini murni: tidak menyentuh DB, tidak merender React, tidak memanggil
 * jaringan. Semua fungsi yang diuji adalah fungsi murni.
 *
 * Jalankan: npm run verify:metrics
 */

import {
    buildEquityCurve,
    buildRDistribution,
    computeDrawdown,
    netPnl,
    summarize
} from '../../src/lib/analytics/metrics'
import {
    buildBreakdown,
    netPnlOf,
    sessionLabelOf,
    weekdayLabelOf
} from '../../src/lib/analytics/dimensions'
import type { TradeDetail } from '../../shared/domain'

const results: string[] = []
let failures = 0

function check(label: string, actual: unknown, expected: unknown, tolerance = 0): void {
    const pass =
        typeof actual === 'number' && typeof expected === 'number'
            ? Math.abs(actual - expected) <= tolerance
            : actual === expected

    if (pass) {
        results.push(`[LULUS] ${label}`)
    } else {
        failures += 1
        results.push(`[GAGAL] ${label} — diharapkan ${String(expected)}, dapat ${String(actual)}`)
    }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface FixtureSpec {
    id: number
    realizedPnl: number
    feeOpen?: number
    feeClose?: number
    fundingFee?: number
    setupTag?: string
    grade?: 'A' | 'B' | 'C' | 'D'
    symbol?: string
    direction?: 'long' | 'short'
    exchange?: 'mexc' | 'bitunix' | 'manual'
    riskAmount?: number | null
    entryTime?: number
    exitTime?: number
}

function makeTrade(spec: FixtureSpec): TradeDetail {
    const feeOpen = spec.feeOpen ?? 0
    const feeClose = spec.feeClose ?? 0
    const fundingFee = spec.fundingFee ?? 0
    const riskAmount = spec.riskAmount ?? null

    return {
        trade: {
            id: spec.id,
            exchange: spec.exchange ?? 'manual',
            externalId: null,
            symbol: spec.symbol ?? 'BTCUSDT',
            direction: spec.direction ?? 'long',
            entryPrice: 100,
            exitPrice: 101,
            // Default: 1 Jan 2026, jam = id. Angka ini aman untuk uji urutan waktu
            // dan batas sesi karena tidak bergantung timezone lokal proses.
            entryTime: spec.entryTime ?? Date.UTC(2026, 0, 1, spec.id, 0),
            exitTime: spec.exitTime ?? Date.UTC(2026, 0, 1, spec.id, 30),
            size: 1,
            leverage: 10,
            marginMode: 'isolated',
            realizedPnl: spec.realizedPnl,
            pnlSource: 'manual',
            feeOpen,
            feeClose,
            feeOpenMaker: null,
            feeCloseMaker: null,
            fundingFee,
            createdAt: 0,
            updatedAt: 0
        },
        journal:
            spec.setupTag || spec.grade
                ? {
                    tradeId: spec.id,
                    setupTag: spec.setupTag ?? null,
                    preTradeThesis: null,
                    postTradeReview: null,
                    emotionTag: null,
                    executionGrade: spec.grade ?? null,
                    screenshotPath: null,
                    updatedAt: 0
                }
                : null,
        plannedRisk:
            riskAmount === null
                ? null
                : {
                    tradeId: spec.id,
                    plannedStop: null,
                    plannedTarget: null,
                    riskAmount,
                    plannedRr: null
                },
        // R dihitung sama seperti repository: P&L / nominal risiko.
        rMultiple: riskAmount === null || riskAmount === 0 ? null : spec.realizedPnl / riskAmount,
        checklist: []
    }
}

// ---------------------------------------------------------------------------
// Skenario 1: dasar + trade flat dikecualikan dari win rate
// ---------------------------------------------------------------------------

/**
 * | # | grossPnl | fee | netPnl | hasil     |
 * |---|----------|-----|--------|-----------|
 * | 1 | +100     | 10  | +90    | win       |
 * | 2 | +200     | 20  | +180   | win       |
 * | 3 | -50      | 5   | -55    | loss      |
 * | 4 | -100     | 0   | -100   | loss      |
 * | 5 | 0        | 0   | 0      | breakEven |
 *
 *   wins = 2, losses = 2, breakEven = 1
 *   directional = 4   (breakEven TIDAK dihitung)
 *   winRate      = 2/4 = 0.5
 *   grossProfit  = 90 + 180 = 270
 *   grossLoss    = 55 + 100 = 155
 *   profitFactor = 270/155 = 1.741935483...
 *   avgWin       = 270/2 = 135
 *   avgLoss      = 155/2 = 77.5
 *   expectancy   = 0.5×135 − 0.5×77.5 = 67.5 − 38.75 = 28.75
 *   netPnlTotal  = 270 − 155 = 115
 *   feeTotal     = 10 + 20 + 5 = 35
 */
function scenarioBasic(): void {
    results.push('--- Skenario 1: dasar + trade flat dikecualikan ---')

    const trades = [
        makeTrade({ id: 1, realizedPnl: 100, feeOpen: 10, riskAmount: 50 }),
        makeTrade({ id: 2, realizedPnl: 200, feeClose: 20, riskAmount: 50 }),
        makeTrade({ id: 3, realizedPnl: -50, feeOpen: 5, riskAmount: 50 }),
        makeTrade({ id: 4, realizedPnl: -100, riskAmount: 50 }),
        makeTrade({ id: 5, realizedPnl: 0, riskAmount: 50 })
    ]

    const s = summarize(trades)

    check('totalTrades', s.totalTrades, 5)
    check('wins', s.wins, 2)
    check('losses', s.losses, 2)
    check('breakEven terdeteksi', s.breakEven, 1)
    check('winRate mengecualikan breakEven (2/4)', s.winRate, 0.5)
    check('netPnl satu trade (100-10)', netPnl(trades[0]!), 90)
    check('profitFactor (270/155)', s.profitFactor, 270 / 155, 1e-9)
    check('avgWin (270/2)', s.avgWin, 135)
    check('avgLoss (155/2)', s.avgLoss, 77.5)
    check('expectancy (67.5-38.75)', s.expectancy, 28.75, 1e-9)
    check('netPnlTotal (270-155)', s.netPnlTotal, 115)
    check('grossPnlTotal tanpa fee (150)', s.grossPnlTotal, 150)
    check('feeTotal (10+20+5)', s.feeTotal, 35)
    check('tradesWithR', s.tradesWithR, 5)
}

// ---------------------------------------------------------------------------
// Skenario 2: profit factor tanpa loss
// ---------------------------------------------------------------------------

function scenarioNoLoss(): void {
    results.push('--- Skenario 2: profit factor tanpa loss ---')

    const trades = [makeTrade({ id: 1, realizedPnl: 100 }), makeTrade({ id: 2, realizedPnl: 50 })]
    const s = summarize(trades)

    check('losses = 0', s.losses, 0)
    check(
        'profitFactor = Infinity (bukan angka besar buatan)',
        s.profitFactor === Number.POSITIVE_INFINITY,
        true
    )
    check('winRate = 1', s.winRate, 1)
    check('avgLoss null (tidak ada loss)', s.avgLoss, null)
    check('expectancy null bila avgLoss tidak diketahui', s.expectancy, null)
}

// ---------------------------------------------------------------------------
// Skenario 3: semua flat
// ---------------------------------------------------------------------------

function scenarioAllFlat(): void {
    results.push('--- Skenario 3: semua trade flat ---')

    const trades = [makeTrade({ id: 1, realizedPnl: 0 }), makeTrade({ id: 2, realizedPnl: 0 })]
    const s = summarize(trades)

    check('breakEven = 2', s.breakEven, 2)
    check('winRate null (bukan 0%, bukan 100%)', s.winRate, null)
    check('losses = 0', s.losses, 0)
    check('netPnlTotal = 0', s.netPnlTotal, 0)
}

// ---------------------------------------------------------------------------
// Skenario 4: funding fee termasuk P&L (brief §6)
// ---------------------------------------------------------------------------

function scenarioFunding(): void {
    results.push('--- Skenario 4: funding fee termasuk P&L ---')

    const trades = [makeTrade({ id: 1, realizedPnl: 100, fundingFee: 25, feeClose: 5 })]
    const s = summarize(trades)

    check('netPnl mengurangi funding (100-25-5)', netPnl(trades[0]!), 70)
    check('fundingFeeTotal', s.fundingFeeTotal, 25)
    check('netPnlTotal', s.netPnlTotal, 70)
    check('tetap win karena net > 0', s.wins, 1)

    // Funding bisa membalik hasil: gross +20, funding 30 -> net -10.
    const flipped = [makeTrade({ id: 2, realizedPnl: 20, fundingFee: 30 })]
    const sf = summarize(flipped)
    check('funding bisa membalik win menjadi loss', sf.losses, 1)
    check('netPnl jadi negatif (-10)', netPnl(flipped[0]!), -10)
}

// ---------------------------------------------------------------------------
// Skenario 5: R-multiple & cakupan distribusi
// ---------------------------------------------------------------------------

function scenarioR(): void {
    results.push('--- Skenario 5: R-multiple & cakupan ---')

    const trades = [
        makeTrade({ id: 1, realizedPnl: 150, riskAmount: 50 }), // R = 3
        makeTrade({ id: 2, realizedPnl: -50, riskAmount: 50 }), // R = -1
        makeTrade({ id: 3, realizedPnl: 25, riskAmount: 50 }), // R = 0.5
        makeTrade({ id: 4, realizedPnl: 500, riskAmount: null }), // R = null
        makeTrade({ id: 5, realizedPnl: 100, riskAmount: 0 }) // R = null
    ]

    const s = summarize(trades)
    check('tradesWithR hanya yang punya R valid', s.tradesWithR, 3)

    const dist = buildRDistribution(trades)

    // Bucket memakai kondisi r >= min && r < max:
    //   R = 3   -> 3 >= 2 && 3 < 3 false; 3 >= 3 && 3 < Inf true  -> "> 3R"
    //   R = -1  -> -1 >= -1 && -1 < 0 true                        -> "-1R…0R"
    //   R = 0.5 -> 0 <= 0.5 < 1 true                              -> "0R…1R"
    const counts = Object.fromEntries(dist.buckets.map((b) => [b.label, b.count]))
    check('bucket "> 3R" berisi R=3', counts['> 3R'], 1)
    check('bucket "-1R…0R" berisi R=-1', counts['-1R…0R'], 1)
    check('bucket "0R…1R" berisi R=0.5', counts['0R…1R'], 1)

    check('cakupan R: withR', dist.withR, 3)
    check('cakupan R: total', dist.total, 5)
    check(
        'histogram menyatakan cakupannya (bukan diam-diam sebagian data)',
        dist.withR < dist.total,
        true
    )
}

// ---------------------------------------------------------------------------
// Skenario 6: equity curve & drawdown — dihitung tangan
// ---------------------------------------------------------------------------

/**
 * Urutan exit (jam = id):
 *   1: +100  -> equity 100,  peak 100, dd   0
 *   2: -150  -> equity -50,  peak 100, dd -150   <- terburuk
 *   3: +30   -> equity -20,  peak 100, dd -120
 *   4: +200  -> equity 180,  peak 180, dd   0    <- pulih (>= peak 100)
 *   5: -40   -> equity 140,  peak 180, dd -40
 *
 *   maxDrawdown = -150 di jam 2
 *   puncak sebelum terburuk = jam 1 (peak 100)
 *   pulih saat equity >= 100 -> jam 4
 *   durasi = 4 - 1 = 3 jam
 */
function scenarioEquity(): void {
    results.push('--- Skenario 6: equity curve & drawdown ---')

    const trades = [
        makeTrade({ id: 1, realizedPnl: 100, exitTime: Date.UTC(2026, 0, 1, 1) }),
        makeTrade({ id: 2, realizedPnl: -150, exitTime: Date.UTC(2026, 0, 1, 2) }),
        makeTrade({ id: 3, realizedPnl: 30, exitTime: Date.UTC(2026, 0, 1, 3) }),
        makeTrade({ id: 4, realizedPnl: 200, exitTime: Date.UTC(2026, 0, 1, 4) }),
        makeTrade({ id: 5, realizedPnl: -40, exitTime: Date.UTC(2026, 0, 1, 5) })
    ]

    const curve = buildEquityCurve(trades)

    check('jumlah titik kurva', curve.length, 5)
    check('equity titik 1', curve[0]?.equity, 100)
    check('peak titik 1', curve[0]?.peak, 100)
    check('equity titik 2', curve[1]?.equity, -50)
    check('drawdown titik 2', curve[1]?.drawdown, -150)
    check('equity titik 4', curve[3]?.equity, 180)
    check('peak naik ke 180', curve[3]?.peak, 180)
    check('drawdown titik 4 = 0 (di puncak)', curve[3]?.drawdown, 0)
    check('drawdown titik 5', curve[4]?.drawdown, -40)

    const dd = computeDrawdown(curve)
    check('maxDrawdown', dd.maxDrawdown, -150)
    check('waktu maxDrawdown di jam 2', dd.maxDrawdownTime, Date.UTC(2026, 0, 1, 2))
    check('durasi drawdown 3 jam', dd.maxDrawdownDurationMs, 3 * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// Skenario 7: drawdown belum pulih
// ---------------------------------------------------------------------------

function scenarioNoRecovery(): void {
    results.push('--- Skenario 7: drawdown belum pulih ---')

    const trades = [
        makeTrade({ id: 1, realizedPnl: 100, exitTime: Date.UTC(2026, 0, 1, 1) }),
        makeTrade({ id: 2, realizedPnl: -200, exitTime: Date.UTC(2026, 0, 1, 2) })
    ]

    const dd = computeDrawdown(buildEquityCurve(trades))
    check('maxDrawdown', dd.maxDrawdown, -200)
    check('durasi null karena belum pulih', dd.maxDrawdownDurationMs, null)
}

// ---------------------------------------------------------------------------
// Skenario 8: kurva mengurutkan menurut waktu, bukan urutan input
// ---------------------------------------------------------------------------

function scenarioOrdering(): void {
    results.push('--- Skenario 8: kurva mengurutkan menurut waktu exit ---')

    const trades = [
        makeTrade({ id: 3, realizedPnl: 30, exitTime: Date.UTC(2026, 0, 1, 3) }),
        makeTrade({ id: 1, realizedPnl: 100, exitTime: Date.UTC(2026, 0, 1, 1) }),
        makeTrade({ id: 2, realizedPnl: -50, exitTime: Date.UTC(2026, 0, 1, 2) })
    ]

    const curve = buildEquityCurve(trades)
    check('titik pertama = trade paling awal (id 1)', curve[0]?.tradeId, 1)
    check('equity kumulatif titik 1', curve[0]?.equity, 100)
    check('equity kumulatif titik 2 (100-50)', curve[1]?.equity, 50)
    check('equity kumulatif titik 3 (50+30)', curve[2]?.equity, 80)
}

// ---------------------------------------------------------------------------
// Skenario 9: breakdown per dimensi
// ---------------------------------------------------------------------------

function scenarioBreakdown(): void {
    results.push('--- Skenario 9: breakdown per dimensi ---')

    const trades = [
        makeTrade({ id: 1, realizedPnl: 100, setupTag: 'breakout', symbol: 'BTCUSDT' }),
        makeTrade({ id: 2, realizedPnl: 60, setupTag: 'breakout', symbol: 'ETHUSDT' }),
        makeTrade({ id: 3, realizedPnl: -80, setupTag: 'pullback', symbol: 'BTCUSDT' }),
        makeTrade({ id: 4, realizedPnl: 20, setupTag: 'pullback', symbol: 'BTCUSDT' })
    ]

    const bySetup = buildBreakdown(trades, 'setupTag')
    check('dua kelompok setup', bySetup.length, 2)

    // breakout: +100, +60 -> net 160, wins 2, losses 0, winRate 1
    const breakout = bySetup.find((b) => b.label === 'breakout')
    check('breakout netPnl', breakout?.netPnl, 160)
    check('breakout wins', breakout?.wins, 2)
    check('breakout winRate', breakout?.winRate, 1)
    check('breakout urutan pertama (P&L tertinggi)', bySetup[0]?.label, 'breakout')

    // pullback: -80, +20 -> net -60, wins 1, losses 1, winRate 0.5
    const pullback = bySetup.find((b) => b.label === 'pullback')
    check('pullback netPnl', pullback?.netPnl, -60)
    check('pullback winRate', pullback?.winRate, 0.5)

    const bySymbol = buildBreakdown(trades, 'symbol')
    const btc = bySymbol.find((b) => b.label === 'BTCUSDT')
    // BTC: 100 - 80 + 20 = 40
    check('BTC netPnl', btc?.netPnl, 40)
    check('BTC jumlah trade', btc?.trades.length, 3)

    // Trade tanpa setup masuk "(tanpa setup)", tidak hilang.
    const withNoSetup = buildBreakdown(
        [...trades, makeTrade({ id: 5, realizedPnl: 10 })],
        'setupTag'
    )
    const noSetup = withNoSetup.find((b) => b.label === '(tanpa setup)')
    check('trade tanpa setup tetap terhitung', noSetup?.trades.length, 1)
    check(
        'tidak ada trade yang hilang dari total',
        withNoSetup.reduce((n, b) => n + b.trades.length, 0),
        5
    )
}

// ---------------------------------------------------------------------------
// Skenario 10: batas sesi UTC & overlap
// ---------------------------------------------------------------------------

function scenarioSessions(): void {
    results.push('--- Skenario 10: batas sesi UTC & overlap ---')

    // Asia 00-09, London 07-16, NY 12-21 (menit dari tengah malam, basis UTC).
    check('03:00 UTC -> Asia saja', sessionLabelOf(Date.UTC(2026, 0, 1, 3)), 'Asia (00–09 UTC)')

    const asiaLondon = sessionLabelOf(Date.UTC(2026, 0, 1, 8))
    check('08:00 UTC -> overlap Asia + London', asiaLondon.includes('Asia') && asiaLondon.includes('London'), true)

    const londonNy = sessionLabelOf(Date.UTC(2026, 0, 1, 14))
    check(
        '14:00 UTC -> overlap London + NY (disengaja)',
        londonNy.includes('London') && londonNy.includes('New York'),
        true
    )

    check('22:00 UTC -> di luar sesi', sessionLabelOf(Date.UTC(2026, 0, 1, 22)), 'Di luar sesi')

    // Batas: 09:00 tepat -> Asia berakhir (end eksklusif), London masih jalan.
    const atNine = sessionLabelOf(Date.UTC(2026, 0, 1, 9))
    check('09:00 UTC -> bukan Asia lagi', atNine.includes('Asia'), false)
    check('09:00 UTC masih London', atNine.includes('London'), true)

    // Sesi dari ENTRY, bukan exit. Entry 14:00, exit 23:00.
    const spanTrade = makeTrade({
        id: 1,
        realizedPnl: 10,
        entryTime: Date.UTC(2026, 0, 1, 14),
        exitTime: Date.UTC(2026, 0, 1, 23)
    })
    const label = sessionLabelOf(spanTrade.trade.entryTime)
    check(
        'sesi dari entry (14:00), bukan exit (23:00)',
        label.includes('London') && label.includes('New York'),
        true
    )

    const bySession = buildBreakdown([spanTrade], 'session')
    check('trade lintas sesi tidak dipecah jadi dua baris', bySession.length, 1)

    // 1 Januari 2026 jatuh pada hari Kamis (UTC).
    check('1 Jan 2026 = Kamis', weekdayLabelOf(Date.UTC(2026, 0, 1, 12)), 'Kamis')
}

// ---------------------------------------------------------------------------
// Skenario 11: grade terpisah dari hasil (brief §5.3 & §12)
// ---------------------------------------------------------------------------

function scenarioGradeIndependent(): void {
    results.push('--- Skenario 11: grade terpisah dari outcome ---')

    const trades = [
        makeTrade({ id: 1, realizedPnl: 500, grade: 'C' }),
        makeTrade({ id: 2, realizedPnl: -300, grade: 'A' })
    ]

    const byGrade = buildBreakdown(trades, 'grade')
    const gradeA = byGrade.find((b) => b.label === 'Grade A')
    const gradeC = byGrade.find((b) => b.label === 'Grade C')

    check('Grade A ada meski trade-nya rugi', gradeA !== undefined, true)
    check('Grade A netPnl negatif (rugi)', (gradeA?.netPnl ?? 0) < 0, true)
    check('Grade C ada meski trade-nya untung', gradeC !== undefined, true)
    check('Grade C netPnl positif (untung)', (gradeC?.netPnl ?? 0) > 0, true)

    check(
        'bucket grade tidak punya field skor gabungan',
        gradeA !== undefined && !('score' in gradeA) && !('compositeScore' in gradeA),
        true
    )
}

// ---------------------------------------------------------------------------
// Skenario 12: dataset kosong tidak crash
// ---------------------------------------------------------------------------

function scenarioEmpty(): void {
    results.push('--- Skenario 12: dataset kosong ---')

    const s = summarize([])
    check('totalTrades 0', s.totalTrades, 0)
    check('winRate null', s.winRate, null)
    check('profitFactor Infinity', s.profitFactor === Number.POSITIVE_INFINITY, true)
    check('netPnlTotal 0', s.netPnlTotal, 0)
    check('tradesWithR 0', s.tradesWithR, 0)

    check('kurva kosong', buildEquityCurve([]).length, 0)

    const dd = computeDrawdown([])
    check('drawdown kosong = 0', dd.maxDrawdown, 0)
    check('waktu drawdown null', dd.maxDrawdownTime, null)
    check('durasi drawdown null', dd.maxDrawdownDurationMs, null)

    const dist = buildRDistribution([])
    check('distribusi R kosong -> semua bucket 0', dist.buckets.every((b) => b.count === 0), true)
    check('cakupan 0/0', dist.withR === 0 && dist.total === 0, true)

    check('breakdown kosong', buildBreakdown([], 'setupTag').length, 0)
}

// ---------------------------------------------------------------------------
// Skenario 13: konsistensi definisi P&L di dua modul
// ---------------------------------------------------------------------------

function scenarioConsistency(): void {
    results.push('--- Skenario 13: konsistensi definisi P&L ---')

    const trade = makeTrade({ id: 1, realizedPnl: 100, feeOpen: 7, feeClose: 3, fundingFee: 12 })
    check('metrics.netPnl dan dimensions.netPnlOf sama', netPnl(trade), netPnlOf(trade))
    check('nilai benar (100-7-3-12)', netPnl(trade), 78)
}

// ---------------------------------------------------------------------------

function main(): void {
    scenarioBasic()
    scenarioNoLoss()
    scenarioAllFlat()
    scenarioFunding()
    scenarioR()
    scenarioEquity()
    scenarioNoRecovery()
    scenarioOrdering()
    scenarioBreakdown()
    scenarioSessions()
    scenarioGradeIndependent()
    scenarioEmpty()
    scenarioConsistency()

    console.log('\n===== TEST METRIK ANALITIK (Fase 4) =====')
    for (const line of results) console.log(line)
    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${results.filter((r) => r.startsWith('[')).length} pemeriksaan) =====\n`
    )

    process.exit(failures === 0 ? 0 : 1)
}

main()
