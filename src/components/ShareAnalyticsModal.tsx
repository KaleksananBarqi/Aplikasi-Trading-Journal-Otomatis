import { useEffect, useRef, useState, useMemo } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Modal, Button } from './ui'
import { summarize, buildEquityCurve, computeDrawdown } from '../lib/analytics/metrics'
import { formatPnl, formatRatio } from '../lib/format'

type CardTheme = 'cyberpunk' | 'obsidian' | 'emerald' | 'sunset' | 'minimal'
type AspectRatio = '1:1' | '9:16' | '16:9'
type ExchangeLogo = 'none' | 'mexc' | 'bitunix' | 'binance' | 'bybit'

interface ShareAnalyticsModalProps {
    isOpen: boolean
    onClose: () => void
    trades: TradeDetail[]
}

const THEMES: Record<
    CardTheme,
    {
        name: string
        bgGradient: [string, string, string]
        cardBg: string
        cardBorder: string
        accentColor: string
        secondaryAccent: string
        textColor: string
        subtextColor: string
        gridColor: string
        glowColor: string
        chartColor: string
    }
> = {
    cyberpunk: {
        name: 'Cyberpunk Neon',
        bgGradient: ['#090A15', '#0f172a', '#1e1035'],
        cardBg: 'rgba(15, 23, 42, 0.75)',
        cardBorder: '#38bdf8',
        accentColor: '#38bdf8',
        secondaryAccent: '#f43f5e',
        textColor: '#f8fafc',
        subtextColor: '#94a3b8',
        gridColor: 'rgba(56, 189, 248, 0.08)',
        glowColor: 'rgba(56, 189, 248, 0.25)',
        chartColor: '#00f2fe'
    },
    obsidian: {
        name: 'Obsidian Gold',
        bgGradient: ['#09090b', '#18181b', '#0c0a09'],
        cardBg: 'rgba(24, 24, 27, 0.85)',
        cardBorder: '#eab308',
        accentColor: '#facc15',
        secondaryAccent: '#fb923c',
        textColor: '#fafaf9',
        subtextColor: '#a8a29e',
        gridColor: 'rgba(234, 179, 8, 0.06)',
        glowColor: 'rgba(234, 179, 8, 0.2)',
        chartColor: '#facc15'
    },
    emerald: {
        name: 'Emerald Mint',
        bgGradient: ['#022c22', '#064e3b', '#042f2e'],
        cardBg: 'rgba(6, 78, 59, 0.65)',
        cardBorder: '#10b981',
        accentColor: '#34d399',
        secondaryAccent: '#6ee7b7',
        textColor: '#f0fdf4',
        subtextColor: '#a7f3d0',
        gridColor: 'rgba(52, 211, 153, 0.07)',
        glowColor: 'rgba(16, 185, 129, 0.25)',
        chartColor: '#10b981'
    },
    sunset: {
        name: 'Sunset Synth',
        bgGradient: ['#2e1065', '#4c0519', '#1e1b4b'],
        cardBg: 'rgba(76, 5, 25, 0.6)',
        cardBorder: '#f43f5e',
        accentColor: '#fb7185',
        secondaryAccent: '#fbbf24',
        textColor: '#fff1f2',
        subtextColor: '#fecdd3',
        gridColor: 'rgba(244, 63, 94, 0.07)',
        glowColor: 'rgba(244, 63, 94, 0.25)',
        chartColor: '#fb7185'
    },
    minimal: {
        name: 'Minimal Dark',
        bgGradient: ['#121212', '#181818', '#0d0d0d'],
        cardBg: 'rgba(24, 24, 24, 0.8)',
        cardBorder: '#3f3f46',
        accentColor: '#e4e4e7',
        secondaryAccent: '#a1a1aa',
        textColor: '#ffffff',
        subtextColor: '#71717a',
        gridColor: 'rgba(255, 255, 255, 0.04)',
        glowColor: 'rgba(255, 255, 255, 0.1)',
        chartColor: '#3b82f6'
    }
}

export function ShareAnalyticsModal({ isOpen, onClose, trades }: ShareAnalyticsModalProps): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    // Pengaturan Tampilan Kartu
    const [theme, setTheme] = useState<CardTheme>('cyberpunk')
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
    const [logo, setLogo] = useState<ExchangeLogo>('none')
    const [hideNominal, setHideNominal] = useState(false)
    const [traderName, setTraderName] = useState('@trader')
    const [periodLabel, setPeriodLabel] = useState('All-Time Performance')
    const [includeChart, setIncludeChart] = useState(true)

    // Notifikasi feedback
    const [copied, setCopied] = useState(false)
    const [exporting, setExporting] = useState(false)

    // Hitung ringkasan analytics
    const summary = useMemo(() => summarize(trades), [trades])
    const curve = useMemo(() => buildEquityCurve(trades), [trades])
    const drawdown = useMemo(() => computeDrawdown(curve), [curve])

    // Ukuran kanvas beresolusi tinggi (scale 2x)
    const dimensions = useMemo(() => {
        switch (aspectRatio) {
            case '1:1':
                return { width: 1080, height: 1080, displayW: 360, displayH: 360 }
            case '9:16':
                return { width: 1080, height: 1920, displayW: 270, displayH: 480 }
            case '16:9':
                return { width: 1920, height: 1080, displayW: 512, displayH: 288 }
        }
    }, [aspectRatio])

    // Gambar ke Canvas
    useEffect(() => {
        if (!isOpen) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { width, height } = dimensions
        canvas.width = width
        canvas.height = height

        const t = THEMES[theme]

        // 1. Background Gradient
        const bgGrad = ctx.createLinearGradient(0, 0, width, height)
        bgGrad.addColorStop(0, t.bgGradient[0])
        bgGrad.addColorStop(0.5, t.bgGradient[1])
        bgGrad.addColorStop(1, t.bgGradient[2])
        ctx.fillStyle = bgGrad
        ctx.fillRect(0, 0, width, height)

        // 2. Decorative Grid & Glow Ambient
        ctx.save()
        ctx.strokeStyle = t.gridColor
        ctx.lineWidth = 1.5
        const gridSize = width / 18
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
            ctx.stroke()
        }
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
        }

        // Ambient radial glow
        const glowRad = ctx.createRadialGradient(width * 0.5, height * 0.3, 50, width * 0.5, height * 0.3, width * 0.6)
        glowRad.addColorStop(0, t.glowColor)
        glowRad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowRad
        ctx.fillRect(0, 0, width, height)
        ctx.restore()

        // 3. Card Container
        const pad = width * 0.06
        const cardX = pad
        const cardY = pad
        const cardW = width - pad * 2
        const cardH = height - pad * 2
        const radius = 32

        // Card Glassmorphism background
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(cardX, cardY, cardW, cardH, radius)
        ctx.fillStyle = t.cardBg
        ctx.fill()
        ctx.strokeStyle = t.cardBorder
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.clip()

        // 4. Header Bar (App Branding & Trader Name)
        const headerY = cardY + 50
        ctx.fillStyle = t.accentColor
        ctx.font = 'bold 30px "Inter", -apple-system, sans-serif'
        ctx.fillText('TRADING JOURNAL ANALYTICS', cardX + 50, headerY)

        ctx.fillStyle = t.subtextColor
        ctx.font = '500 24px "Inter", -apple-system, sans-serif'
        ctx.fillText(periodLabel.toUpperCase(), cardX + 50, headerY + 36)

        // Trader Tag / Badge (Right Header)
        ctx.textAlign = 'right'
        ctx.fillStyle = t.textColor
        ctx.font = '600 28px "Inter", -apple-system, sans-serif'
        ctx.fillText(traderName, cardX + cardW - 50, headerY + 10)

        // Exchange Logo jika dipilih
        if (logo !== 'none') {
            ctx.fillStyle = t.subtextColor
            ctx.font = 'bold 20px "Inter", -apple-system, sans-serif'
            ctx.fillText(logo.toUpperCase() + ' FUTURES', cardX + cardW - 50, headerY + 40)
        }
        ctx.textAlign = 'left'

        // Garis Pembatas Header
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cardX + 50, headerY + 65)
        ctx.lineTo(cardX + cardW - 50, headerY + 65)
        ctx.stroke()

        // 5. Highlight Utama: Net PnL & Winrate
        const isNetProfit = summary.netPnlTotal >= 0
        const profitColor = '#10b981'
        const lossColor = '#ef4444'
        const pnlColor = isNetProfit ? profitColor : lossColor

        const mainStatsY = headerY + 140
        ctx.fillStyle = t.subtextColor
        ctx.font = '500 22px "Inter", -apple-system, sans-serif'
        ctx.fillText('NET PROFIT & LOSS', cardX + 50, mainStatsY)

        // Nilai Net PnL (atau disembunyikan dalam mode privasi)
        ctx.font = 'bold 72px "Inter", -apple-system, sans-serif'
        ctx.fillStyle = pnlColor
        const pnlText = hideNominal
            ? `${isNetProfit ? '+' : ''}${((summary.wins / Math.max(1, summary.totalTrades)) * 100).toFixed(0)}% ROI*`
            : `${isNetProfit ? '+' : ''}${formatPnl(summary.netPnlTotal)}`
        ctx.fillText(pnlText, cardX + 50, mainStatsY + 70)

        // Winrate Badge Besar di Sisi Kanan
        const winratePct = summary.winRate !== null ? (summary.winRate * 100).toFixed(1) : '0.0'
        ctx.textAlign = 'right'
        ctx.fillStyle = t.subtextColor
        ctx.font = '500 22px "Inter", -apple-system, sans-serif'
        ctx.fillText('WIN RATE', cardX + cardW - 50, mainStatsY)

        ctx.font = 'bold 72px "Inter", -apple-system, sans-serif'
        ctx.fillStyle = t.accentColor
        ctx.fillText(`${winratePct}%`, cardX + cardW - 50, mainStatsY + 70)
        ctx.textAlign = 'left'

        // 6. Win / Loss Bar Visual
        const barY = mainStatsY + 110
        const barW = cardW - 100
        const barH = 18
        const winRatio = summary.totalTrades > 0 ? summary.wins / summary.totalTrades : 0.5
        const lossRatio = summary.totalTrades > 0 ? summary.losses / summary.totalTrades : 0.5

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        ctx.beginPath()
        ctx.roundRect(cardX + 50, barY, barW, barH, 9)
        ctx.fill()

        // Green portion
        if (winRatio > 0) {
            ctx.fillStyle = profitColor
            ctx.beginPath()
            ctx.roundRect(cardX + 50, barY, barW * winRatio, barH, [9, 0, 0, 9])
            ctx.fill()
        }
        // Red portion
        if (lossRatio > 0) {
            ctx.fillStyle = lossColor
            ctx.beginPath()
            ctx.roundRect(cardX + 50 + barW * winRatio, barY, barW * lossRatio, barH, [0, 9, 9, 0])
            ctx.fill()
        }

        // Subtext Win/Loss counts
        ctx.fillStyle = t.subtextColor
        ctx.font = '500 18px "Inter", -apple-system, sans-serif'
        ctx.fillText(`${summary.wins} Menang (${(winRatio * 100).toFixed(0)}%)`, cardX + 50, barY + 38)
        ctx.textAlign = 'right'
        ctx.fillText(`${summary.losses} Kalah (${(lossRatio * 100).toFixed(0)}%)`, cardX + cardW - 50, barY + 38)
        ctx.textAlign = 'left'

        // 7. Grid 4 Metrik Kunci
        const metricsY = barY + 70
        const colW = (cardW - 100 - 45) / 4
        const metrics = [
            {
                label: 'PROFIT FACTOR',
                val: formatRatio(summary.profitFactor),
                color: !Number.isFinite(summary.profitFactor) || summary.profitFactor >= 1 ? profitColor : lossColor
            },
            {
                label: 'TOTAL TRADES',
                val: `${summary.totalTrades}`,
                color: t.textColor
            },
            {
                label: 'EXPECTANCY',
                val: summary.expectancy === null ? '—' : hideNominal ? `${(summary.wins / Math.max(1, summary.totalTrades) * 2).toFixed(1)}R` : formatPnl(summary.expectancy),
                color: (summary.expectancy ?? 0) >= 0 ? profitColor : lossColor
            },
            {
                label: 'MAX DRAWDOWN',
                val: hideNominal ? 'Protected' : formatPnl(drawdown.maxDrawdown),
                color: drawdown.maxDrawdown < 0 ? lossColor : t.textColor
            }
        ]

        metrics.forEach((m, idx) => {
            const mX = cardX + 50 + idx * (colW + 15)
            // Box
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
            ctx.beginPath()
            ctx.roundRect(mX, metricsY, colW, 95, 16)
            ctx.fill()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 1
            ctx.stroke()

            // Label
            ctx.fillStyle = t.subtextColor
            ctx.font = '600 15px "Inter", -apple-system, sans-serif'
            ctx.fillText(m.label, mX + 16, metricsY + 32)

            // Value
            ctx.fillStyle = m.color
            ctx.font = 'bold 26px "Inter", -apple-system, sans-serif'
            ctx.fillText(m.val, mX + 16, metricsY + 72)
        })

        // 8. Mini Glowing Equity Chart (Jika diaktifkan dan ada trade)
        if (includeChart && curve.length >= 2) {
            const chartAreaY = metricsY + 120
            const chartAreaH = cardY + cardH - chartAreaY - 80
            const chartAreaW = cardW - 100
            const chartAreaX = cardX + 50

            if (chartAreaH > 100) {
                // Background chart card
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
                ctx.beginPath()
                ctx.roundRect(chartAreaX, chartAreaY, chartAreaW, chartAreaH, 20)
                ctx.fill()
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
                ctx.lineWidth = 1
                ctx.stroke()

                // Header chart
                ctx.fillStyle = t.subtextColor
                ctx.font = '600 17px "Inter", -apple-system, sans-serif'
                ctx.fillText('EQUITY GROWTH CURVE', chartAreaX + 24, chartAreaY + 34)

                // Plotting curve
                const points = curve.map((c) => c.equity)
                const minEq = Math.min(0, ...points)
                const maxEq = Math.max(0, ...points)
                const rangeEq = maxEq - minEq || 1

                const plotTop = chartAreaY + 55
                const plotH = chartAreaH - 75
                const plotW = chartAreaW - 48
                const plotLeft = chartAreaX + 24

                const getPtX = (i: number): number => plotLeft + (i / (points.length - 1)) * plotW
                const getPtY = (val: number): number => plotTop + plotH - ((val - minEq) / rangeEq) * plotH

                // Area fill gradient
                const areaGrad = ctx.createLinearGradient(0, plotTop, 0, plotTop + plotH)
                areaGrad.addColorStop(0, t.glowColor)
                areaGrad.addColorStop(1, 'rgba(0,0,0,0)')

                ctx.beginPath()
                ctx.moveTo(getPtX(0), getPtY(points[0] ?? 0))
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(getPtX(i), getPtY(points[i] ?? 0))
                }
                ctx.lineTo(getPtX(points.length - 1), plotTop + plotH)
                ctx.lineTo(getPtX(0), plotTop + plotH)
                ctx.closePath()
                ctx.fillStyle = areaGrad
                ctx.fill()

                // Line path glowing
                ctx.save()
                ctx.shadowColor = t.chartColor
                ctx.shadowBlur = 15
                ctx.strokeStyle = t.chartColor
                ctx.lineWidth = 3.5
                ctx.beginPath()
                ctx.moveTo(getPtX(0), getPtY(points[0] ?? 0))
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(getPtX(i), getPtY(points[i] ?? 0))
                }
                ctx.stroke()
                ctx.restore()
            }
        }

        // 9. Watermark Footer
        const footerY = cardY + cardH - 32
        ctx.fillStyle = t.subtextColor
        ctx.font = '500 16px "Inter", -apple-system, sans-serif'
        ctx.fillText('Dibuat dengan Aplikasi Trading Journal Otomatis', cardX + 50, footerY)

        ctx.textAlign = 'right'
        ctx.fillStyle = t.accentColor
        ctx.font = '600 16px "Inter", -apple-system, sans-serif'
        ctx.fillText('VERIFIED PERFORMANCE', cardX + cardW - 50, footerY)
        ctx.textAlign = 'left'

        ctx.restore()
    }, [isOpen, theme, aspectRatio, logo, hideNominal, traderName, periodLabel, includeChart, dimensions, summary, curve, drawdown])

    // Salin gambar ke clipboard
    async function handleCopyImage(): Promise<void> {
        const canvas = canvasRef.current
        if (!canvas) return
        setExporting(true)
        try {
            canvas.toBlob(async (blob) => {
                if (!blob) return
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ])
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2500)
                } catch {
                    // Fallback unduh jika izin clipboard gambar tidak diizinkan di web browser
                    handleDownload()
                } finally {
                    setExporting(false)
                }
            }, 'image/png')
        } catch {
            setExporting(false)
        }
    }

    // Unduh gambar PNG
    function handleDownload(): void {
        const canvas = canvasRef.current
        if (!canvas) return
        const link = document.createElement('a')
        link.download = `Analytics-Journal-${new Date().toISOString().slice(0, 10)}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="📊 Pamer Full Analytics (Share Performance)"
            size="xl"
            footer={
                <div className="flex w-full items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                        {copied ? '✅ Gambar tersalin ke clipboard!' : 'Resolusi tinggi (Retina 2x), siap posting ke X / IG / Telegram.'}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Tutup
                        </Button>
                        <Button variant="secondary" onClick={() => void handleCopyImage()} disabled={exporting}>
                            {copied ? 'Tersalin!' : '📋 Salin Gambar'}
                        </Button>
                        <Button variant="primary" onClick={handleDownload}>
                            ⬇️ Unduh PNG
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                {/* Panel Kontrol Kustomisasi */}
                <div className="flex flex-col gap-4 md:col-span-5">
                    <div>
                        <label className="text-xs font-semibold text-foreground">Tema Visual</label>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                            {(Object.keys(THEMES) as CardTheme[]).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setTheme(key)}
                                    className={`flex items-center gap-2 rounded-md border p-2 text-left text-xs transition-all ${
                                        theme === key
                                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                                            : 'border-border bg-card text-muted-foreground hover:border-border/80'
                                    }`}
                                >
                                    <span
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: THEMES[key].accentColor }}
                                    />
                                    {THEMES[key].name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-foreground">Aspek Rasio</label>
                            <select
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                                className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                            >
                                <option value="1:1">1:1 (Instagram / Square)</option>
                                <option value="9:16">9:16 (Story / Reels / TikTok)</option>
                                <option value="16:9">16:9 (Twitter / Landscape)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-foreground">Logo Exchange</label>
                            <select
                                value={logo}
                                onChange={(e) => setLogo(e.target.value as ExchangeLogo)}
                                className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                            >
                                <option value="none">Tanpa Logo</option>
                                <option value="mexc">MEXC Futures</option>
                                <option value="bitunix">Bitunix Futures</option>
                                <option value="binance">Binance Futures</option>
                                <option value="bybit">Bybit</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-foreground">Nama Trader</label>
                            <input
                                type="text"
                                value={traderName}
                                onChange={(e) => setTraderName(e.target.value)}
                                placeholder="@trader"
                                className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-foreground">Periode Label</label>
                            <input
                                type="text"
                                value={periodLabel}
                                onChange={(e) => setPeriodLabel(e.target.value)}
                                placeholder="All-Time Performance"
                                className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hideNominal}
                                onChange={(e) => setHideNominal(e.target.checked)}
                                className="h-4 w-4 rounded accent-primary"
                            />
                            <span className="text-xs font-medium">Mode Privasi (Sembunyikan Nominal $)</span>
                        </label>
                        <p className="text-[11px] text-muted-foreground ml-6">
                            Menyembunyikan angka dolar dan hanya menampilkan rasio, win rate, dan performa persentase.
                        </p>

                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <input
                                type="checkbox"
                                checked={includeChart}
                                onChange={(e) => setIncludeChart(e.target.checked)}
                                className="h-4 w-4 rounded accent-primary"
                            />
                            <span className="text-xs font-medium">Sertakan Mini Kurva Equity Glowing</span>
                        </label>
                    </div>
                </div>

                {/* Live Preview Canvas */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 p-4 md:col-span-7">
                    <p className="mb-2 text-[11px] text-muted-foreground">Pratinjau Live Kartu Pamer</p>
                    <div className="flex max-h-[480px] max-w-full items-center justify-center overflow-hidden rounded-lg shadow-2xl">
                        <canvas
                            ref={canvasRef}
                            style={{
                                width: `${dimensions.displayW}px`,
                                height: `${dimensions.displayH}px`,
                                maxWidth: '100%',
                                maxHeight: '420px',
                                objectFit: 'contain'
                            }}
                            className="rounded-lg"
                        />
                    </div>
                </div>
            </div>
        </Modal>
    )
}
