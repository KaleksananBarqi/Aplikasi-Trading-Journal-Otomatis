import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Kartu metrik headline.
 *
 * Semua nilai memakai font monospace (`tabular`) supaya digit sejajar antar kartu
 * dan mudah dibandingkan sekilas — brief §7.
 */

interface MetricCardProps {
    label: string
    /**
     * Nilai utama. Bisa berupa string (mis. "∞" atau "—") atau elemen
     * (mis. <PnlValue> untuk menyamarkan angka PnL). Dipakai sebagai ReactNode
     * supaya penyamaran bisa dilakukan di dalam kartu.
     */
    value: ReactNode
    /** Keterangan di bawah nilai. */
    hint?: string
    /** Kelas warna untuk nilai. Default: warna teks biasa. */
    valueClassName?: string
    /** Penanda kecil di kanan atas, mis. jumlah sampel. */
    badge?: ReactNode
}

export function MetricCard({
    label,
    value,
    hint,
    valueClassName,
    badge
}: MetricCardProps): React.JSX.Element {
    return (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {label}
                </p>
                {badge}
            </div>
            <p className={cn('tabular mt-1.5 text-xl font-semibold leading-none', valueClassName)}>
                {value}
            </p>
            {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    )
}
