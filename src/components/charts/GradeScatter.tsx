import { useMemo, useState } from 'react'
import type { ExecutionGrade, TradeDetail } from '../../../shared/domain'
import { netPnlOf } from '../../lib/analytics/dimensions'
import { formatPnl, formatR } from '../../lib/format'

/**
 * Scatter plot: execution_grade (sumbu X) vs realized P&L (sumbu Y).
 *
 * ===========================================================================
 * KENAPA CHART INI TIDAK BOLEH MENYIMPULKAN APA-APA (brief §6 & §12)
 * ===========================================================================
 *
 * Tujuan plot ini adalah supaya USER MELIHAT SENDIRI apakah proses bagus
 * benar-benar berkorelasi dengan hasil bagus, atau apakah mereka cuma beruntung.
 *
 * Karena itu chart ini SENGAJA TIDAK:
 * - menghitung koefisien korelasi
 * - menggambar garis tren
 * - menampilkan skor gabungan grade+hasil
 * - menulis kesimpulan seperti "eksekusi bagus terbukti menguntungkan"
 *
 * Alasan: dua grade bisa punya rata-rata P&L berbeda murni karena kebetulan,
 * terutama dengan sampel kecil. Angka korelasi akan terlihat otoritatif padahal
 * tidak bermakna. Yang disajikan hanya posisi titik dan ringkasan rata-rata —
 * user yang menyimpulkan.
 *
 * Menggabungkan grade dengan hasil menjadi satu skor juga dilarang brief §12:
 * keduanya sengaja dipisah supaya user tidak salah belajar dari datanya.
 *
 * ===========================================================================
 * KENAPA SVG SENDIRI
 * ===========================================================================
 *
 * Scatter 4 kategori × nilai kontinu adalah persegi dan titik. Library chart
 * akan menambah besar bundle untuk kebutuhan yang bisa dipenuhi ~80 baris SVG,
 * dan SVG sendiri memberi kontrol penuh atas label serta tooltip.
 */

const GRADES: ExecutionGrade[] = ['A', 'B', 'C', 'D']

interface GradeScatterProps {
    trades: TradeDetail[]
    height?: number
}

export function GradeScatter({ trades, height = 260 }: GradeScatterProps): React.JSX.Element {
    const [hovered, setHovered] = useState<TradeDetail | null>(null)

    const { series, maxAbs, summary } = useMemo(() => {
        // Hanya trade yang punya grade DAN nilai P&L. Trade tanpa grade tidak bisa
        // ditempatkan di sumbu X, jadi dikeluarkan — dan jumlahnya dilaporkan.
        const graded = trades.filter((detail) => detail.journal?.executionGrade)

        const byGrade = new Map<ExecutionGrade, TradeDetail[]>()
        for (const detail of graded) {
            const grade = detail.journal?.executionGrade
            if (!grade) continue
            const existing = byGrade.get(grade)
            if (existing) existing.push(detail)
            else byGrade.set(grade, [detail])
        }

        const allPnls = graded.map((d) => netPnlOf(d))
        const maxAbsValue = Math.max(1, ...allPnls.map((p) => Math.abs(p)))

        // Ringkasan per grade: jumlah, rata-rata P&L, rata-rata R.
        // Rata-rata ditampilkan sebagai konteks, TIDAK sebagai penilaian
        // "grade ini lebih baik" — user yang menafsirkan.
        const summaries = GRADES.map((grade) => {
            const group = byGrade.get(grade) ?? []
            const pnls = group.map((d) => netPnlOf(d))
            const withR = group.map((d) => d.rMultiple).filter((r): r is number => r !== null)

            return {
                grade,
                count: group.length,
                avgPnl: pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : null,
                avgR: withR.length > 0 ? withR.reduce((a, b) => a + b, 0) / withR.length : null
            }
        })

        return {
            series: byGrade,
            maxAbs: maxAbsValue,
            summary: { rows: summaries, totalGraded: graded.length }
        }
    }, [trades])

    if (summary.totalGraded === 0) {
        return (
            <div
                className="flex items-center justify-center px-4 text-center text-xs text-muted-foreground"
                style={{ height }}
            >
                Belum ada trade dengan grade eksekusi. Isi grade di halaman Journal Entry
                untuk melihat apakah proses sejalan dengan hasil.
            </div>
        )
    }

    // Dimensi plot
    const paddingLeft = 52
    const paddingRight = 16
    const paddingTop = 16
    const paddingBottom = 40
    const width = 640
    const plotWidth = width - paddingLeft - paddingRight
    const plotHeight = height - paddingTop - paddingBottom

    // Sumbu Y: simetris di sekitar nol supaya visual seimbang. Skala asimetris
    // membuat profit kecil terlihat setara loss besar.
    const yMax = maxAbs
    const yMin = -maxAbs

    const toY = (pnl: number): number =>
        paddingTop + plotHeight - ((pnl - yMin) / (yMax - yMin)) * plotHeight

    // Sumbu X: satu kolom per grade, dengan sedikit jitter horizontal supaya
    // titik yang nilainya sama tidak saling menutupi.
    const columnWidth = plotWidth / GRADES.length
    const toX = (grade: ExecutionGrade, index: number, total: number): number => {
        const gradeIndex = GRADES.indexOf(grade)
        const center = paddingLeft + columnWidth * gradeIndex + columnWidth / 2
        if (total <= 1) return center
        // Sebar dalam rentang 60% lebar kolom.
        const spread = columnWidth * 0.6
        const offset = (index / (total - 1) - 0.5) * spread
        return center + offset
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    width={width}
                    height={height}
                    role="img"
                    aria-label="Sebaran grade eksekusi terhadap P&L"
                    className="min-w-full"
                >
                    {/* Grid horizontal + label sumbu Y */}
                    {[-1, -0.5, 0, 0.5, 1].map((fraction) => {
                        const value = yMax * fraction
                        const y = toY(value)
                        const isZero = fraction === 0
                        return (
                            <g key={fraction}>
                                <line
                                    x1={paddingLeft}
                                    y1={y}
                                    x2={width - paddingRight}
                                    y2={y}
                                    className={isZero ? 'stroke-border' : 'stroke-border/40'}
                                    strokeWidth={isZero ? 1.5 : 1}
                                    strokeDasharray={isZero ? undefined : '3 3'}
                                />
                                <text
                                    x={paddingLeft - 6}
                                    y={y + 3}
                                    textAnchor="end"
                                    className="fill-muted-foreground"
                                    style={{ fontSize: 9 }}
                                >
                                    {value === 0 ? '0' : formatPnl(value, 0)}
                                </text>
                            </g>
                        )
                    })}

                    {/* Pemisah kolom grade + label sumbu X */}
                    {GRADES.map((grade, index) => {
                        const x = paddingLeft + columnWidth * index
                        const row = summary.rows.find((r) => r.grade === grade)
                        return (
                            <g key={grade}>
                                <line
                                    x1={x}
                                    y1={paddingTop}
                                    x2={x}
                                    y2={paddingTop + plotHeight}
                                    className="stroke-border/30"
                                    strokeWidth={1}
                                />
                                <text
                                    x={x + columnWidth / 2}
                                    y={height - paddingBottom + 16}
                                    textAnchor="middle"
                                    className="fill-foreground"
                                    style={{ fontSize: 11, fontWeight: 600 }}
                                >
                                    Grade {grade}
                                </text>
                                <text
                                    x={x + columnWidth / 2}
                                    y={height - paddingBottom + 30}
                                    textAnchor="middle"
                                    className="fill-muted-foreground"
                                    style={{ fontSize: 9 }}
                                >
                                    {row?.count ?? 0} trade
                                </text>
                            </g>
                        )
                    })}

                    {/* Titik trade */}
                    {GRADES.flatMap((grade) => {
                        const group = series.get(grade) ?? []
                        return group.map((detail, index) => {
                            const pnl = netPnlOf(detail)
                            const isHovered = hovered?.trade.id === detail.trade.id
                            const isPositive = pnl > 0
                            return (
                                <circle
                                    key={detail.trade.id}
                                    cx={toX(grade, index, group.length)}
                                    cy={toY(pnl)}
                                    r={isHovered ? 6 : 4}
                                    fill={isPositive ? 'var(--profit)' : pnl < 0 ? 'var(--loss)' : 'var(--flat)'}
                                    fillOpacity={isHovered ? 1 : 0.75}
                                    stroke={isHovered ? 'var(--foreground)' : 'none'}
                                    strokeWidth={1.5}
                                    className="cursor-pointer transition-all"
                                    onMouseEnter={() => setHovered(detail)}
                                    onMouseLeave={() => setHovered(null)}
                                >
                                    <title>
                                        {detail.trade.symbol} · {formatPnl(pnl)}
                                        {detail.rMultiple !== null ? ` · ${formatR(detail.rMultiple)}` : ''}
                                    </title>
                                </circle>
                            )
                        })
                    })}
                </svg>
            </div>

            {/* Tooltip/titik terpilih */}
            <div className="min-h-[18px] text-[10px] text-muted-foreground">
                {hovered ? (
                    <span>
                        <span className="font-medium text-foreground">{hovered.trade.symbol}</span>
                        {' · '}
                        {formatPnl(netPnlOf(hovered))}
                        {hovered.rMultiple !== null && ` · ${formatR(hovered.rMultiple)}`}
                        {hovered.journal?.setupTag && ` · ${hovered.journal.setupTag}`}
                    </span>
                ) : (
                    'Arahkan kursor ke titik untuk detail trade'
                )}
            </div>

            {/* Ringkasan per grade — DISAJIKAN, bukan disimpulkan */}
            <div className="rounded-md border border-border bg-background">
                <div className="grid grid-cols-4 divide-x divide-border">
                    {summary.rows.map((row) => (
                        <div key={row.grade} className="px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Grade {row.grade}
                            </p>
                            <p className="tabular mt-0.5 text-xs">
                                {row.avgPnl === null ? '—' : `rata-rata ${formatPnl(row.avgPnl)}`}
                            </p>
                            <p className="tabular text-[10px] text-muted-foreground">
                                {row.avgR === null ? 'R: —' : `rata-rata ${formatR(row.avgR)}`}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
                <span className="font-medium">Chart ini sengaja tidak menyimpulkan apa pun.</span>{' '}
                Tidak ada garis tren, skor korelasi, atau nilai gabungan grade+hasil — karena
                dengan sampel kecil, dua grade bisa berbeda rata-rata hanya karena kebetulan.
                Nilai di atas hanyalah ringkasan; Anda yang menilai apakah proses sejalan
                dengan hasil. {trades.length - summary.totalGraded > 0 && (
                    <>
                        {' '}
                        {trades.length - summary.totalGraded} trade belum digrade dan tidak
                        ditampilkan di sini.
                    </>
                )}
            </p>
        </div>
    )
}
