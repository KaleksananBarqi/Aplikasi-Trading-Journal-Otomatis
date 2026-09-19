import { useMemo, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { PageHeader } from '../components/AppShell'
import { AiInsightsPanel } from '../components/AiInsightsPanel'
import { MetricCard } from '../components/MetricCard'
import { CalendarHeatmap } from '../components/charts/CalendarHeatmap'
import { PnlValue } from '../components/PnlValue'
import { EquityChart } from '../components/charts/EquityChart'
import { GradeScatter } from '../components/charts/GradeScatter'
import { RHistogram } from '../components/charts/RHistogram'
import { Badge, Button, EmptyState, Select } from '../components/ui'
import { ShareAnalyticsModal } from '../components/ShareAnalyticsModal'
import {
    buildBreakdown,
    collectFilterValues,
    DIMENSION_OPTIONS,
    type Dimension
} from '../lib/analytics/dimensions'
import {
    buildEquityCurve,
    computeDrawdown,
    summarize
} from '../lib/analytics/metrics'
import { formatDuration, formatPnl, formatRatio, formatR, pnlColorClass } from '../lib/format'
import { cn } from '../lib/utils'

/**
 * Analytics — semua metrik brief §6 dengan filter global.
 *
 * ===========================================================================
 * FILTER GLOBAL MENGUBAH SEMUA CHART (brief §6)
 * ===========================================================================
 *
 * Filter diterapkan SEKALI di atas, lalu seluruh chart dan metrik memakai
 * himpunan data yang sudah tersaring. Alternatifnya — filter per chart — akan
 * membuat dua chart di halaman yang sama menampilkan rentang data berbeda, dan
 * user bisa menyimpulkan hal yang salah karena membandingkan apel dengan jeruk.
 */

interface Filters {
    from: string
    to: string
    symbol: string
    exchange: string
    setupTag: string
}

const EMPTY_FILTERS: Filters = { from: '', to: '', symbol: '', exchange: '', setupTag: '' }

interface AnalyticsProps {
    trades: TradeDetail[]
    hidePnl: boolean
}

export function Analytics({ trades, hidePnl }: AnalyticsProps): React.JSX.Element {
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
    const [dimension, setDimension] = useState<Dimension>('setupTag')
    const [equityVariant, setEquityVariant] = useState<'equity' | 'drawdown'>('equity')
    const [shareAnalyticsOpen, setShareAnalyticsOpen] = useState(false)

    const options = useMemo(() => collectFilterValues(trades), [trades])

    /** Terapkan filter global. Satu tempat, dipakai semua chart. */
    const filtered = useMemo(() => {
        const fromMs = filters.from ? new Date(`${filters.from}T00:00:00Z`).getTime() : null
        const toMs = filters.to ? new Date(`${filters.to}T23:59:59Z`).getTime() : null

        return trades.filter((detail) => {
            const exitTime = detail.trade.exitTime
            if (fromMs !== null && exitTime < fromMs) return false
            if (toMs !== null && exitTime > toMs) return false
            if (filters.symbol && detail.trade.symbol !== filters.symbol) return false
            if (filters.exchange && detail.trade.exchange !== filters.exchange) return false
            if (filters.setupTag && (detail.journal?.setupTag ?? '') !== filters.setupTag) return false
            return true
        })
    }, [trades, filters])

    const summary = useMemo(() => summarize(filtered), [filtered])
    const curve = useMemo(() => buildEquityCurve(filtered), [filtered])
    const drawdown = useMemo(() => computeDrawdown(curve), [curve])
    const buckets = useMemo(() => buildBreakdown(filtered, dimension), [filtered, dimension])

    const activeFilterCount = Object.values(filters).filter((v) => v !== '').length
    const maxAbsPnl = Math.max(1, ...buckets.map((b) => Math.abs(b.netPnl)))

    if (trades.length === 0) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                <PageHeader title="Analytics" description="Breakdown performa per dimensi" />
                <EmptyState
                    title="Belum ada data untuk dianalisis"
                    description="Breakdown per symbol, setup, sesi, hari, dan grade akan muncul setelah ada trade tercatat. Tambahkan trade manual di Trade Log, atau hubungkan API key exchange di Settings."
                />
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title="Analytics"
                description={`${filtered.length} dari ${trades.length} trade dianalisis`}
                actions={
                    <div className="flex items-center gap-2">
                        {activeFilterCount > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                                Reset filter ({activeFilterCount})
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={() => setShareAnalyticsOpen(true)}
                        >
                            📊 Pamer Analytics
                        </Button>
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* --- Filter global --- */}
                <section className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 flex items-center gap-2">
                        <h2 className="text-xs font-semibold">Filter Global</h2>
                        <span className="text-[10px] text-muted-foreground">
                            berlaku untuk SEMUA chart & metrik di halaman ini
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Dari tanggal (exit)</span>
                            <input
                                type="date"
                                value={filters.from}
                                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                                className="h-8 rounded-md border border-input bg-background px-2 text-[11px]"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Sampai tanggal (exit)</span>
                            <input
                                type="date"
                                value={filters.to}
                                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                                className="h-8 rounded-md border border-input bg-background px-2 text-[11px]"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Symbol</span>
                            <Select
                                className="h-8 text-[11px]"
                                value={filters.symbol}
                                onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value }))}
                            >
                                <option value="">Semua</option>
                                {options.symbols.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </Select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Exchange</span>
                            <Select
                                className="h-8 text-[11px]"
                                value={filters.exchange}
                                onChange={(e) => setFilters((f) => ({ ...f, exchange: e.target.value }))}
                            >
                                <option value="">Semua</option>
                                {options.exchanges.map((s) => (
                                    <option key={s} value={s}>
                                        {s.toUpperCase()}
                                    </option>
                                ))}
                            </Select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Setup</span>
                            <Select
                                className="h-8 text-[11px]"
                                value={filters.setupTag}
                                onChange={(e) => setFilters((f) => ({ ...f, setupTag: e.target.value }))}
                            >
                                <option value="">Semua</option>
                                {options.setupTags.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </Select>
                        </label>
                    </div>
                </section>

                {filtered.length === 0 ? (
                    <div className="mt-4">
                        <EmptyState
                            title="Tidak ada trade yang cocok dengan filter"
                            description="Coba longgarkan rentang tanggal atau kosongkan salah satu filter."
                            action={
                                <Button variant="primary" onClick={() => setFilters(EMPTY_FILTERS)}>
                                    Reset filter
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <>
                        {/* --- Headline metrics (brief §6) --- */}
                        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <MetricCard
                                label="Win Rate"
                                value={summary.winRate === null ? '—' : `${(summary.winRate * 100).toFixed(1)}%`}
                                hint={
                                    summary.breakEven > 0
                                        ? `${summary.wins}W / ${summary.losses}L · ${summary.breakEven} flat dikecualikan`
                                        : `${summary.wins}W / ${summary.losses}L`
                                }
                            />
                            <MetricCard
                                label="Profit Factor"
                                value={<PnlValue value={formatRatio(summary.profitFactor)} hide={hidePnl} />}
                                hint={
                                    !Number.isFinite(summary.profitFactor)
                                        ? 'Tanpa loss — tidak terhingga'
                                        : 'Profit kotor ÷ loss kotor'
                                }
                                valueClassName={
                                    !Number.isFinite(summary.profitFactor) || summary.profitFactor >= 1
                                        ? 'text-profit'
                                        : 'text-loss'
                                }
                            />
                            <MetricCard
                                label="Expectancy"
                                value={<PnlValue value={summary.expectancy === null ? '—' : formatPnl(summary.expectancy)} hide={hidePnl} className={summary.expectancy === null ? undefined : pnlColorClass(summary.expectancy)} />}
                                hint="Rata-rata hasil per trade"
                            />
                            <MetricCard
                                label="P&L Bersih"
                                value={<PnlValue value={formatPnl(summary.netPnlTotal)} hide={hidePnl} className={pnlColorClass(summary.netPnlTotal)} />}
                                hint={`Fee ${formatPnl(-summary.feeTotal)} · funding ${formatPnl(-summary.fundingFeeTotal)}`}
                            />
                        </div>

                        {/* --- Equity & drawdown --- */}
                        <section className="mt-4 rounded-lg border border-border bg-card">
                            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                                <div>
                                    <h2 className="text-sm font-semibold">
                                        {equityVariant === 'equity' ? 'Kurva Equity' : 'Kurva Drawdown (Underwater)'}
                                    </h2>
                                    <p className="text-[11px] text-muted-foreground">
                                        {equityVariant === 'equity'
                                            ? 'Kumulatif P&L bersih menurut waktu exit'
                                            : 'Penurunan dari puncak equity — selalu ≤ 0'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                                        {(
                                            [
                                                { id: 'equity', label: 'Equity' },
                                                { id: 'drawdown', label: 'Drawdown' }
                                            ] as const
                                        ).map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setEquityVariant(option.id)}
                                                className={cn(
                                                    'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                                                    equityVariant === option.id
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    {equityVariant === 'equity' && (
                                        <PnlValue
                                            value={formatPnl(curve[curve.length - 1]?.equity ?? 0)}
                                            hide={hidePnl}
                                            className={cn('text-sm font-semibold', pnlColorClass(curve[curve.length - 1]?.equity ?? 0))}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="px-2 py-3">
                                <EquityChart points={curve} variant={equityVariant} height={260} />
                            </div>
                        </section>

                        {/* --- Drawdown stats --- */}
                        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <MetricCard
                                label="Max Drawdown"
                                value={<PnlValue value={formatPnl(drawdown.maxDrawdown)} hide={hidePnl} className={drawdown.maxDrawdown < 0 ? 'text-loss' : undefined} />}
                                hint="Penurunan terbesar dari puncak"
                            />
                            <MetricCard
                                label="Durasi Drawdown"
                                value={
                                    drawdown.maxDrawdownDurationMs === null
                                        ? 'Belum pulih'
                                        : formatDuration(0, drawdown.maxDrawdownDurationMs)
                                }
                                hint="Dari puncak sampai pulih"
                            />
                            <MetricCard
                                label="R Valid"
                                value={`${summary.tradesWithR} / ${summary.totalTrades}`}
                                hint="Trade dengan stop loss terisi"
                                badge={
                                    summary.tradesWithR < summary.totalTrades ? (
                                        <Badge tone="warning">sebagian</Badge>
                                    ) : undefined
                                }
                            />
                            <MetricCard
                                label="Funding Fee"
                                value={<PnlValue value={formatPnl(-summary.fundingFeeTotal)} hide={hidePnl} className={summary.fundingFeeTotal > 0 ? 'text-loss' : undefined} />}
                                hint="Biaya berkelanjutan perpetual"
                            />
                        </div>

                        {/* --- Kalender heatmap --- */}
                        <section className="mt-4 rounded-lg border border-border bg-card">
                            <div className="border-b border-border px-4 py-3">
                                <h2 className="text-sm font-semibold">Kalender P&L Harian</h2>
                                <p className="text-[11px] text-muted-foreground">
                                    P&L bersih per hari — intensitas warna mengikuti besarnya
                                </p>
                            </div>
                            <div className="p-4">
                                <CalendarHeatmap trades={filtered} />
                            </div>
                        </section>

                        {/* --- Histogram R --- */}
                        <section className="mt-4 rounded-lg border border-border bg-card">
                            <div className="border-b border-border px-4 py-3">
                                <h2 className="text-sm font-semibold">Distribusi R-Multiple</h2>
                                <p className="text-[11px] text-muted-foreground">
                                    Bentuk distribusi hasil relatif terhadap risiko yang diambil
                                </p>
                            </div>
                            <div className="p-4">
                                <RHistogram trades={filtered} />
                            </div>
                        </section>

                        {/* --- Scatter grade vs P&L --- */}
                        <section className="mt-4 rounded-lg border border-border bg-card">
                            <div className="border-b border-border px-4 py-3">
                                <h2 className="text-sm font-semibold">
                                    Grade Eksekusi vs Realized P&L
                                </h2>
                                <p className="text-[11px] text-muted-foreground">
                                    Apakah proses bagus benar-benar sejalan dengan hasil bagus?
                                </p>
                            </div>
                            <div className="p-4">
                                <GradeScatter trades={filtered} />
                            </div>
                        </section>

                        {/* --- Breakdown per dimensi --- */}
                        <section className="mt-4 rounded-lg border border-border bg-card">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                                <div>
                                    <h2 className="text-sm font-semibold">Breakdown</h2>
                                    <p className="text-[11px] text-muted-foreground">
                                        {DIMENSION_OPTIONS.find((d) => d.id === dimension)?.hint}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 rounded-md border border-border p-0.5">
                                    {DIMENSION_OPTIONS.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setDimension(option.id)}
                                            className={cn(
                                                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                                                dimension === option.id
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {dimension === 'session' && (
                                <div className="mx-4 mt-3 rounded-md border border-chart-3/40 bg-chart-3/10 px-3 py-2 text-[11px]">
                                    <span className="font-medium">Perhatian overlap sesi:</span> London
                                    (07:00–16:00 UTC) dan New York (12:00–21:00 UTC) bertumpuk pada
                                    12:00–16:00 UTC. Trade di jam itu dihitung di <em>kedua</em> sesi,
                                    jadi persentase lintas sesi bisa berjumlah lebih dari 100%. Sesi
                                    ditentukan dari waktu <span className="font-medium">entry</span>,
                                    dan trade yang melewati batas sesi tidak dipecah.
                                </div>
                            )}

                            <div className="flex flex-col gap-2 p-4">
                                {buckets.map((bucket) => {
                                    const barWidth = (Math.abs(bucket.netPnl) / maxAbsPnl) * 100
                                    return (
                                        <div
                                            key={bucket.label}
                                            className="rounded-md border border-border bg-background px-3 py-2"
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="truncate text-xs font-medium">{bucket.label}</span>
                                                        <span className="shrink-0 text-[10px] text-muted-foreground">
                                                            {bucket.trades.length} trade
                                                        </span>
                                                        {bucket.breakEven > 0 && (
                                                            <span className="shrink-0 text-[10px] text-muted-foreground">
                                                                · {bucket.breakEven} flat
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Bar P&L dua arah dari garis tengah. */}
                                                    <div className="mt-1.5 flex h-1.5 items-center">
                                                        <div className="flex h-full w-1/2 justify-end">
                                                            {bucket.netPnl < 0 && (
                                                                <div
                                                                    className="h-full rounded-l bg-loss"
                                                                    style={{ width: `${barWidth}%` }}
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="h-full w-px bg-border" />
                                                        <div className="flex h-full w-1/2">
                                                            {bucket.netPnl > 0 && (
                                                                <div
                                                                    className="h-full rounded-r bg-profit"
                                                                    style={{ width: `${barWidth}%` }}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-4 text-right">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                            Win rate
                                                        </p>
                                                        <p className="tabular text-[11px]">
                                                            {bucket.winRate === null
                                                                ? '—'
                                                                : `${(bucket.winRate * 100).toFixed(0)}%`}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                            Avg R
                                                        </p>
                                                        <p className="tabular text-[11px]">{formatR(bucket.avgR)}</p>
                                                    </div>
                                                    <div className="w-20">
                                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                            P&L
                                                        </p>
                                                        <p
                                                            className={cn(
                                                                'tabular text-[11px] font-medium',
                                                                pnlColorClass(bucket.netPnl)
                                                            )}
                                                        >
                                                            {formatPnl(bucket.netPnl)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>

                        {/* --- AI Insights (fitur 6) --- */}
                        <AiInsightsPanel trades={filtered} />

                        <p className="mt-4 text-[11px] text-muted-foreground">
                            Semua metrik di halaman ini memakai <span className="font-medium">P&L bersih</span>{' '}
                            — realized P&L dikurangi fee buka, fee tutup, dan funding fee. Brief §6
                            menyebut funding sebagai biaya riil perpetual futures, jadi ia tidak
                            diabaikan. Angka yang memakai stop loss tidak lengkap akan tampil
                            sebagai “—” dan tidak diestimasi.
                        </p>
                    </>
                )}
            </div>

            {/* Modal Pamer Full Analytics */}
            <ShareAnalyticsModal
                isOpen={shareAnalyticsOpen}
                onClose={() => setShareAnalyticsOpen(false)}
                trades={filtered}
            />
        </div>
    )
}
