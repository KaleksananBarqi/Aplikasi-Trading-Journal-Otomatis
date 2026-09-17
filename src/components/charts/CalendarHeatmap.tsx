import { useMemo, useState } from 'react'
import type { TradeDetail } from '../../../shared/domain'
import { netPnlOf } from '../../lib/analytics/dimensions'
import { formatPnl } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * Heatmap kalender harian — mirip grafik kontribusi GitHub (brief §6).
 *
 * ===========================================================================
 * KENAPA SVG SENDIRI, BUKAN LIBRARY CHART
 * ===========================================================================
 *
 * Heatmap kalender adalah grid persegi dengan warna. Library chart umum
 * menyediakan ini lewat jalur yang berbelit (mis. heatmap di atas sumbu waktu
 * numerik) dan menambah ratusan kilobyte. Menggambarnya sebagai grid SVG
 * memberi kontrol penuh atas tooltip, aksesibilitas, dan warna tema — dan
 * brief §7 memang meminta tampilan yang tidak terlihat seperti template
 * generik.
 *
 * ===========================================================================
 * DASAR WAKTU: UTC
 * ===========================================================================
 *
 * Hari dikelompokkan berdasarkan tanggal UTC dari `exitTime`. Aplikasi ini
 * menyimpan semua waktu sebagai UTC (brief §5.1); mengelompokkan berdasarkan
 * tanggal lokal akan membuat dua trade di hari yang sama menurut exchange
 * jatuh ke kotak berbeda hanya karena timezone user.
 */

interface DayCell {
    /** Kunci tanggal `YYYY-MM-DD` (UTC). */
    dateKey: string
    netPnl: number
    count: number
    /** Apakah ada trade sama sekali di hari ini. */
    hasTrades: boolean
}

interface CalendarHeatmapProps {
    trades: TradeDetail[]
    /** Jumlah minggu ke belakang yang ditampilkan. */
    weeks?: number
}

/** Format tanggal UTC sebagai `YYYY-MM-DD`. */
function toUtcDateKey(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10)
}

export function CalendarHeatmap({ trades, weeks = 26 }: CalendarHeatmapProps): React.JSX.Element {
    const [hovered, setHovered] = useState<DayCell | null>(null)

    const { cells, months, maxAbs } = useMemo(() => {
        // Kelompokkan P&L bersih per tanggal UTC.
        const byDay = new Map<string, { netPnl: number; count: number }>()

        for (const detail of trades) {
            const key = toUtcDateKey(detail.trade.exitTime)
            const existing = byDay.get(key)
            const pnl = netPnlOf(detail)
            if (existing) {
                existing.netPnl += pnl
                existing.count += 1
            } else {
                byDay.set(key, { netPnl: pnl, count: 1 })
            }
        }

        // Bangun grid: mulai dari awal minggu (Senin) sejauh `weeks` minggu lalu,
        // sampai akhir minggu ini.
        const today = new Date()
        const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

        // getUTCDay(): 0 = Minggu. Kita ingin minggu mulai Senin.
        const todayDow = new Date(todayUtc).getUTCDay()
        const daysSinceMonday = (todayDow + 6) % 7
        const endOfWeek = todayUtc + (6 - daysSinceMonday) * 86_400_000
        const start = endOfWeek - (weeks * 7 - 1) * 86_400_000

        const cellList: DayCell[] = []
        const monthLabels: { index: number; label: string }[] = []
        let lastMonth = -1

        const totalDays = weeks * 7
        for (let i = 0; i < totalDays; i += 1) {
            const time = start + i * 86_400_000
            const dateKey = toUtcDateKey(time)
            const entry = byDay.get(dateKey)

            const date = new Date(time)
            const month = date.getUTCMonth()

            // Catat label bulan saat berganti, dan hanya di baris pertama kolom.
            if (month !== lastMonth && i % 7 === 0) {
                monthLabels.push({
                    index: i / 7,
                    label: date.toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' })
                })
                lastMonth = month
            }

            cellList.push({
                dateKey,
                netPnl: entry?.netPnl ?? 0,
                count: entry?.count ?? 0,
                hasTrades: entry !== undefined
            })
        }

        const maxAbsValue = Math.max(
            1,
            ...cellList.filter((c) => c.hasTrades).map((c) => Math.abs(c.netPnl))
        )

        return { cells: cellList, months: monthLabels, maxAbs: maxAbsValue }
    }, [trades, weeks])

    /**
     * Warna sel berdasarkan intensitas.
     *
     * `opacity` diturunkan dari besaran relatif terhadap hari terbesar, sehingga
     * hari dengan P&L kecil terlihat redup tanpa menghilang. Warna profit/loss
     * diambil dari variabel tema, jadi mode colorblind-safe otomatis ikut.
     */
    function cellColor(cell: DayCell): string {
        if (!cell.hasTrades) return 'var(--muted)'
        const intensity = Math.min(1, Math.abs(cell.netPnl) / maxAbs)
        // Minimum 0.25 supaya hari dengan P&L kecil tetap terlihat sebagai
        // profit/loss, bukan tampak seperti tidak ada trade.
        const alpha = 0.25 + intensity * 0.75
        const base = cell.netPnl > 0 ? 'var(--profit)' : cell.netPnl < 0 ? 'var(--loss)' : 'var(--flat)'
        return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`
    }

    const cellSize = 11
    const gap = 2
    const columns = Math.ceil(cells.length / 7)
    const width = columns * (cellSize + gap)
    const height = 7 * (cellSize + gap)

    return (
        <div className="flex flex-col gap-2">
            <div className="overflow-x-auto">
                <svg
                    viewBox={`0 0 ${width} ${height + 14}`}
                    width={width}
                    height={height + 14}
                    role="img"
                    aria-label={`Heatmap P&L harian ${weeks} minggu terakhir`}
                    className="min-w-full"
                >
                    {/* Label bulan */}
                    {months.map((month) => (
                        <text
                            key={`${month.index}-${month.label}`}
                            x={month.index * (cellSize + gap)}
                            y={9}
                            className="fill-muted-foreground"
                            style={{ fontSize: 9 }}
                        >
                            {month.label}
                        </text>
                    ))}

                    {/* Sel harian. Kolom = minggu, baris = hari (Senin..Minggu). */}
                    {cells.map((cell, index) => {
                        const column = Math.floor(index / 7)
                        const row = index % 7
                        return (
                            <rect
                                key={cell.dateKey}
                                x={column * (cellSize + gap)}
                                y={14 + row * (cellSize + gap)}
                                width={cellSize}
                                height={cellSize}
                                rx={2}
                                fill={cellColor(cell)}
                                className="cursor-pointer transition-opacity hover:opacity-70"
                                onMouseEnter={() => setHovered(cell)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <title>
                                    {cell.dateKey}
                                    {cell.hasTrades
                                        ? ` · ${cell.count} trade · ${formatPnl(cell.netPnl)}`
                                        : ' · tidak ada trade'}
                                </title>
                            </rect>
                        )
                    })}
                </svg>
            </div>

            <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                <span>
                    {hovered
                        ? `${hovered.dateKey} · ${hovered.hasTrades
                            ? `${hovered.count} trade · ${formatPnl(hovered.netPnl)}`
                            : 'tidak ada trade'
                        }`
                        : 'Arahkan kursor ke kotak untuk detail'}
                </span>

                {/* Legenda */}
                <div className="flex items-center gap-1">
                    <span>Loss</span>
                    {[-1, -0.5, 0, 0.5, 1].map((step) => (
                        <span
                            key={step}
                            className={cn('inline-block rounded-sm')}
                            style={{
                                width: 10,
                                height: 10,
                                backgroundColor:
                                    step === 0
                                        ? 'var(--muted)'
                                        : `color-mix(in srgb, ${step > 0 ? 'var(--profit)' : 'var(--loss)'
                                        } ${Math.round((0.25 + Math.abs(step) * 0.75) * 100)}%, transparent)`
                            }}
                        />
                    ))}
                    <span>Profit</span>
                </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
                Hari dikelompokkan menurut tanggal <span className="font-medium">UTC</span> dari waktu
                exit, konsisten dengan cara waktu disimpan. Warna mengikuti tema aktif, termasuk mode
                colorblind-safe.
            </p>
        </div>
    )
}
