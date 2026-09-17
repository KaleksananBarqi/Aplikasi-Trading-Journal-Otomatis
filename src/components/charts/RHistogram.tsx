import { useMemo } from 'react'
import type { TradeDetail } from '../../../shared/domain'
import { buildRDistribution } from '../../lib/analytics/metrics'
import { cn } from '../../lib/utils'

/**
 * Histogram distribusi R-multiple (brief §6).
 *
 * ===========================================================================
 * CAKUPAN WAJIB DITAMPILKAN
 * ===========================================================================
 *
 * plans/02-DATA-MODEL.md §6: "histogram yang diam-diam hanya menggambar sebagian
 * data adalah bentuk kebohongan data."
 *
 * Trade tanpa stop loss punya R = NULL, bukan R = 0. Menggambarnya sebagai 0
 * akan menciptakan puncak palsu di tengah histogram dan membuat distribusinya
 * terlihat jauh lebih rapat dari kenyataan.
 *
 * Karena itu komponen ini SELALU menampilkan berapa trade yang punya R valid
 * dari total, dan menonjolkan selisihnya saat ada trade tanpa R.
 */

interface RHistogramProps {
    trades: TradeDetail[]
    height?: number
}

export function RHistogram({ trades, height = 200 }: RHistogramProps): React.JSX.Element {
    const dist = useMemo(() => buildRDistribution(trades), [trades])

    if (dist.withR === 0) {
        return (
            <div
                className="flex items-center justify-center px-4 text-center text-xs text-muted-foreground"
                style={{ height }}
            >
                Belum ada trade dengan R valid. R dihitung dari nominal risiko yang Anda
                isi di form trade — isi stop loss dan nominal risiko untuk mengaktifkan
                histogram ini.
            </div>
        )
    }

    const maxCount = Math.max(1, ...dist.buckets.map((b) => b.count))
    const hiddenCount = dist.total - dist.withR

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                {dist.buckets.map((bucket) => {
                    const widthPercent = (bucket.count / maxCount) * 100
                    // Bucket negatif diwarnai loss, positif profit — supaya bentuk
                    // distribusinya terbaca sekilas tanpa membaca label.
                    const isNegative = bucket.max <= 0
                    const isPositive = bucket.min >= 0
                    const tone = isNegative && bucket.count > 0
                        ? 'bg-loss/70'
                        : isPositive && bucket.count > 0
                            ? 'bg-profit/70'
                            : 'bg-primary/60'

                    return (
                        <div key={bucket.label} className="flex items-center gap-3">
                            <span className="tabular w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                                {bucket.label}
                            </span>
                            <div className="h-4 flex-1 overflow-hidden rounded bg-muted/40">
                                <div
                                    className={cn('h-full rounded transition-all', tone)}
                                    style={{ width: `${widthPercent}%` }}
                                />
                            </div>
                            <span className="tabular w-8 shrink-0 text-[11px]">{bucket.count}</span>
                        </div>
                    )
                })}
            </div>

            {/* Cakupan: selalu ditampilkan, dan ditekankan saat ada yang tersembunyi. */}
            <div
                className={cn(
                    'rounded-md border px-3 py-2 text-[11px]',
                    hiddenCount > 0 ? 'border-chart-3/40 bg-chart-3/10' : 'border-border bg-muted/20'
                )}
            >
                <span className="font-medium">
                    {dist.withR} dari {dist.total} trade punya R valid
                </span>
                {hiddenCount > 0 && (
                    <>
                        {' — '}
                        {hiddenCount} trade tidak masuk histogram karena stop loss tidak diisi.
                        R-nya <span className="font-medium">tidak diestimasi</span>, karena
                        menghitung R tanpa nominal risiko akan menghasilkan angka yang tidak
                        berarti.
                    </>
                )}
            </div>
        </div>
    )
}
