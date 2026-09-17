import { useMemo } from 'react'
import type { TradeDetail } from '@shared/domain'
import { PageHeader } from '../components/AppShell'
import { MetricCard } from '../components/MetricCard'
import { Badge, EmptyState } from '../components/ui'
import {
    buildEquityCurve,
    computeDrawdown,
    summarize
} from '../lib/analytics/metrics'
import { formatDateTime, formatDuration, formatPnl, formatRatio, formatR, pnlColorClass, rColorClass } from '../lib/format'
import { cn } from '../lib/utils'

/**
 * Dashboard — ringkasan performa.
 *
 * Fase 1: headline metrics + equity curve sederhana (SVG inline) + trade terakhir.
 * Chart finansial penuh (lightweight-charts, heatmap, histogram) menyusul di Fase 4.
 */

/** Equity curve ringkas sebagai sparkline SVG. Tanpa dependency chart. */
function EquitySparkline({ points }: { points: { time: number; equity: number }[] }): React.JSX.Element {
    if (points.length < 2) {
        return (
            <p className="text-xs text-muted-foreground">
                Butuh minimal 2 trade untuk menggambar kurva equity.
            </p>
        )
    }

    const width = 800
    const height = 120
    const values = points.map((p) => p.equity)
    const min = Math.min(0, ...values)
    const max = Math.max(0, ...values)
    const range = max - min || 1

    const toX = (index: number): number => (index / (points.length - 1)) * width
    const toY = (value: number): number => height - ((value - min) / range) * height

    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index).toFixed(2)} ${toY(point.equity).toFixed(2)}`)
        .join(' ')

    const zeroY = toY(0)
    const areaPath = `${linePath} L ${width} ${zeroY.toFixed(2)} L 0 ${zeroY.toFixed(2)} Z`

    const last = values[values.length - 1] ?? 0
    const isPositive = last >= 0

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-32 w-full"
            role="img"
            aria-label="Kurva equity kumulatif"
        >
            {/* Garis nol: pembeda antara zona profit dan zona loss. */}
            <line
                x1="0"
                y1={zeroY}
                x2={width}
                y2={zeroY}
                className="stroke-border"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
            />
            <path
                d={areaPath}
                className={isPositive ? 'fill-profit/15' : 'fill-loss/15'}
            />
            <path
                d={linePath}
                className={isPositive ? 'stroke-profit' : 'stroke-loss'}
                strokeWidth="2"
                fill="none"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    )
}

interface DashboardProps {
    trades: TradeDetail[]
}

export function Dashboard({ trades }: DashboardProps): React.JSX.Element {
    const summary = useMemo(() => summarize(trades), [trades])
    const curve = useMemo(() => buildEquityCurve(trades), [trades])
    const drawdown = useMemo(() => computeDrawdown(curve), [curve])

    const recent = useMemo(
        () => [...trades].sort((a, b) => b.trade.exitTime - a.trade.exitTime).slice(0, 5),
        [trades]
    )

    if (trades.length === 0) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                <PageHeader title="Dashboard" description="Ringkasan performa trading" />
                <EmptyState
                    title="Belum ada data"
                    description="Dashboard akan menampilkan metrik performa setelah ada trade tercatat. Tambahkan trade manual lewat Trade Log, atau hubungkan API key exchange di Settings."
                />
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title="Dashboard"
                description={`Berdasarkan ${summary.totalTrades} trade · P&L bersih setelah fee & funding`}
            />

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Headline metrics (brief §6) */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                        value={formatRatio(summary.profitFactor)}
                        hint={
                            !Number.isFinite(summary.profitFactor)
                                ? 'Tanpa loss — tidak terhingga'
                                : 'Profit kotor / loss kotor'
                        }
                        valueClassName={
                            !Number.isFinite(summary.profitFactor)
                                ? 'text-profit'
                                : summary.profitFactor >= 1
                                    ? 'text-profit'
                                    : 'text-loss'
                        }
                    />
                    <MetricCard
                        label="Expectancy"
                        value={summary.expectancy === null ? '—' : formatPnl(summary.expectancy)}
                        hint="Rata-rata hasil per trade"
                        valueClassName={summary.expectancy === null ? undefined : pnlColorClass(summary.expectancy)}
                    />
                    <MetricCard
                        label="P&L Bersih"
                        value={formatPnl(summary.netPnlTotal)}
                        hint={`Kotor ${formatPnl(summary.grossPnlTotal)} · fee ${formatPnl(-summary.feeTotal)}`}
                        valueClassName={pnlColorClass(summary.netPnlTotal)}
                    />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard
                        label="Max Drawdown"
                        value={formatPnl(drawdown.maxDrawdown)}
                        hint={
                            drawdown.maxDrawdownTime
                                ? `Terburuk ${formatDateTime(drawdown.maxDrawdownTime)}`
                                : 'Belum ada drawdown'
                        }
                        valueClassName={drawdown.maxDrawdown < 0 ? 'text-loss' : undefined}
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
                        label="Funding Fee"
                        value={formatPnl(-summary.fundingFeeTotal)}
                        hint="Biaya berkelanjutan perpetual futures"
                        valueClassName={summary.fundingFeeTotal > 0 ? 'text-loss' : undefined}
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
                </div>

                {/* Equity curve */}
                <section className="mt-4 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold">Kurva Equity</h2>
                            <p className="text-[11px] text-muted-foreground">
                                Kumulatif P&L bersih menurut waktu exit
                            </p>
                        </div>
                        <span
                            className={cn(
                                'tabular text-sm font-semibold',
                                pnlColorClass(curve[curve.length - 1]?.equity ?? 0)
                            )}
                        >
                            {formatPnl(curve[curve.length - 1]?.equity ?? 0)}
                        </span>
                    </div>
                    <div className="px-2 py-3">
                        <EquitySparkline points={curve} />
                    </div>
                </section>

                {/* Trade terakhir */}
                <section className="mt-4 rounded-lg border border-border bg-card">
                    <div className="border-b border-border px-4 py-3">
                        <h2 className="text-sm font-semibold">Trade Terakhir</h2>
                    </div>
                    <div className="divide-y divide-border/60">
                        {recent.map((detail) => (
                            <div
                                key={detail.trade.id}
                                className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs"
                            >
                                <div className="flex items-center gap-3">
                                    <Badge tone={detail.trade.direction === 'long' ? 'profit' : 'loss'}>
                                        {detail.trade.direction === 'long' ? 'Long' : 'Short'}
                                    </Badge>
                                    <span className="font-medium">{detail.trade.symbol}</span>
                                    {detail.journal?.setupTag && (
                                        <span className="text-muted-foreground">{detail.journal.setupTag}</span>
                                    )}
                                    {detail.journal?.executionGrade && (
                                        <Badge tone={detail.journal.executionGrade === 'A' ? 'profit' : 'muted'}>
                                            Grade {detail.journal.executionGrade}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="tabular text-muted-foreground">
                                        {formatDateTime(detail.trade.exitTime)}
                                    </span>
                                    <span className={cn('tabular w-20 text-right text-xs', rColorClass(detail.rMultiple))}>
                                        {formatR(detail.rMultiple)}
                                    </span>
                                    <span
                                        className={cn(
                                            'tabular w-24 text-right font-medium',
                                            pnlColorClass(detail.trade.realizedPnl)
                                        )}
                                    >
                                        {formatPnl(detail.trade.realizedPnl)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <p className="mt-4 text-[11px] text-muted-foreground">
                    Catatan: metrik di atas memakai P&L bersih (realized P&L dikurangi fee buka,
                    fee tutup, dan funding fee). Grafik finansial lengkap — drawdown chart,
                    heatmap kalender, histogram R, dan breakdown per setup/sesi/grade — tersedia
                    di halaman Analytics pada Fase 4.
                </p>
            </div>
        </div>
    )
}
