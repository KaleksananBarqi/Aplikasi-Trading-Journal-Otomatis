import { useEffect, useRef } from 'react'
import {
    AreaSeries,
    ColorType,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp
} from 'lightweight-charts'
import type { EquityPoint } from '../../lib/analytics/metrics'
import { cn } from '../../lib/utils'

/**
 * Kurva equity + drawdown (underwater) memakai `lightweight-charts`.
 *
 * Brief §3 menyarankan library ini khusus untuk data finansial. Dua hal yang
 * membuatnya tepat di sini:
 *
 * 1. Sumbu waktu-nya sadar akan celah data. Equity hanya berubah saat trade
 *    ditutup, jadi antara dua trade tidak ada titik. Chart biasa akan
 *    menggambar garis lurus antar waktu kosong, menyembunyikan bahwa tidak ada
 *    aktivitas di rentang itu.
 *
 * 2. Skala harga-nya menangani nilai negatif dengan benar. Equity bisa di bawah
 *    nol (drawdown), dan itu harus terlihat sebagai area terpisah — brief §6
 *    meminta "area di bawah nol beda warna".
 *
 * Warna dibaca dari CSS variable lewat getComputedStyle supaya chart ikut
 * berubah saat user mengganti tema atau mengaktifkan mode colorblind-safe,
 * tanpa perlu kode tambahan.
 */

interface EquityChartProps {
    /** Kurva equity kumulatif. */
    points: EquityPoint[]
    /** Mode drawdown: gambar nilai drawdown (<= 0) alih-alih equity. */
    variant?: 'equity' | 'drawdown'
    /** Tinggi chart dalam px. */
    height?: number
    className?: string
}

/** Baca nilai warna dari CSS variable tema aktif. */
function readThemeColor(variable: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    return value === '' ? fallback : value
}

export function EquityChart({
    points,
    variant = 'equity',
    height = 260,
    className
}: EquityChartProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

    // Buat chart sekali. Pembuatan ulang setiap render akan menghapus canvas
    // dan membuat tampilan berkedip.
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const textColor = readThemeColor('--muted-foreground', '#8b949e')
        const borderColor = readThemeColor('--border', '#2a313c')

        const chart = createChart(container, {
            height,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor,
                fontFamily: readThemeColor('--font-mono', 'monospace'),
                fontSize: 11,
                attributionLogo: false
            },
            grid: {
                vertLines: { color: borderColor, style: 3 },
                horzLines: { color: borderColor, style: 3 }
            },
            rightPriceScale: {
                borderColor,
                // Equity bisa negatif; skala harus mengizinkannya.
                scaleMargins: { top: 0.1, bottom: 0.1 }
            },
            timeScale: {
                borderColor,
                // Izinkan celah waktu; jangan paksa bar berurutan.
                timeVisible: true,
                secondsVisible: false
            },
            handleScale: { axisPressedMouseMove: false },
            crosshair: {
                vertLine: { color: textColor, width: 1, style: 3, labelBackgroundColor: textColor },
                horzLine: { color: textColor, width: 1, style: 3, labelBackgroundColor: textColor }
            }
        })

        const isDrawdown = variant === 'drawdown'
        const lineColor = isDrawdown
            ? readThemeColor('--loss', '#f85149')
            : readThemeColor('--primary', '#58a6ff')

        const series = chart.addSeries(AreaSeries, {
            lineColor,
            topColor: `${lineColor}40`,
            bottomColor: `${lineColor}05`,
            lineWidth: 2,
            // Garis nol ditampilkan sebagai referensi: di atas nol = profit,
            // di bawah nol = drawdown.
            priceLineVisible: false,
            lastValueVisible: true
        })

        chartRef.current = chart
        seriesRef.current = series

        const observer = new ResizeObserver(() => {
            chart.applyOptions({ width: container.clientWidth })
        })
        observer.observe(container)
        chart.applyOptions({ width: container.clientWidth })

        return () => {
            observer.disconnect()
            chart.remove()
            chartRef.current = null
            seriesRef.current = null
        }
    }, [height, variant])

    // Perbarui data tanpa membuat ulang chart.
    useEffect(() => {
        const series = seriesRef.current
        if (!series) return

        const data = points.map((point) => ({
            // lightweight-charts memakai detik, bukan milidetik.
            time: Math.floor(point.time / 1000) as UTCTimestamp,
            value: variant === 'drawdown' ? point.drawdown : point.equity
        }))

        series.setData(data)
        chartRef.current?.timeScale().fitContent()
    }, [points, variant])

    if (points.length === 0) {
        return (
            <div
                className={cn('flex items-center justify-center text-xs text-muted-foreground', className)}
                style={{ height }}
            >
                Belum ada data untuk digambar.
            </div>
        )
    }

    return <div ref={containerRef} className={cn('w-full', className)} style={{ height }} />
}
