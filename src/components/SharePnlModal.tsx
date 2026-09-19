import { useCallback, useEffect, useRef, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Button, Modal } from './ui'
import { formatDateTime, formatPnl, formatR } from '../lib/format'

type AspectRatio = '1:1' | '9:16' | '16:9'
type BgTheme = 'cyberpunk' | 'obsidian' | 'sunset' | 'emerald' | 'minimal'

export interface SharePnlModalProps {
    trade?: TradeDetail | null
    detail?: TradeDetail | null
    isOpen?: boolean
    onClose: () => void
}

export function SharePnlModal({ trade: propTrade, detail: propDetail, isOpen = true, onClose }: SharePnlModalProps): React.JSX.Element | null {
    const trade = propTrade || propDetail
    if (!isOpen || !trade) return null

    return <SharePnlModalContent trade={trade} onClose={onClose} />
}

function SharePnlModalContent({ trade, onClose }: { trade: TradeDetail; onClose: () => void }): React.JSX.Element {
    const [ratio, setRatio] = useState<AspectRatio>('1:1')
    const [theme, setTheme] = useState<BgTheme>('cyberpunk')
    const [showThesis, setShowThesis] = useState<boolean>(true)
    const [customThesis, setCustomThesis] = useState<string>(
        trade.journal?.preTradeThesis || trade.journal?.postTradeReview || 'Setup terkonfirmasi sesuai playbook & manajemen risiko disiplin.'
    )
    const [showExchangeLogo, setShowExchangeLogo] = useState<boolean>(true)
    const [selectedExchange, setSelectedExchange] = useState<string>(trade.trade.exchange || 'mexc')
    const [traderHandle, setTraderHandle] = useState<string>('@trader')
    const [showWatermark, setShowWatermark] = useState<boolean>(true)
    const [copySuccess, setCopySuccess] = useState<boolean>(false)
    const [downloading, setDownloading] = useState<boolean>(false)

    const previewRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const isWin = trade.trade.realizedPnl >= 0
    const leverage = trade.trade.leverage || 1
    const margin = trade.trade.entryPrice > 0 ? (trade.trade.size * trade.trade.entryPrice) / leverage : 0
    const roiPercent = margin > 0 ? (trade.trade.realizedPnl / margin) * 100 : 0

    // Gambar ke Canvas untuk ekspor resolusi tinggi
    const drawToCanvas = useCallback((): HTMLCanvasElement => {
        const canvas = canvasRef.current || document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return canvas

        // Resolusi export tinggi
        let width = 1080
        let height = 1080
        if (ratio === '9:16') {
            width = 1080
            height = 1920
        } else if (ratio === '16:9') {
            width = 1920
            height = 1080
        }

        canvas.width = width
        canvas.height = height

        // 1. Background Gradient
        let bgGradient = ctx.createLinearGradient(0, 0, width, height)
        if (theme === 'cyberpunk') {
            bgGradient = ctx.createRadialGradient(width / 2, height / 3, 50, width / 2, height / 2, width)
            bgGradient.addColorStop(0, '#0f172a')
            bgGradient.addColorStop(0.5, '#020617')
            bgGradient.addColorStop(1, '#000000')
        } else if (theme === 'obsidian') {
            bgGradient = ctx.createLinearGradient(0, 0, width, height)
            bgGradient.addColorStop(0, '#18181b')
            bgGradient.addColorStop(0.5, '#09090b')
            bgGradient.addColorStop(1, '#000000')
        } else if (theme === 'sunset') {
            bgGradient = ctx.createLinearGradient(0, 0, width, height)
            bgGradient.addColorStop(0, '#2e1065')
            bgGradient.addColorStop(0.5, '#0f172a')
            bgGradient.addColorStop(1, '#1c1917')
        } else if (theme === 'emerald') {
            bgGradient = ctx.createRadialGradient(width / 2, height / 4, 100, width / 2, height / 2, width)
            bgGradient.addColorStop(0, '#064e3b')
            bgGradient.addColorStop(0.6, '#022c22')
            bgGradient.addColorStop(1, '#020617')
        } else {
            bgGradient = ctx.createLinearGradient(0, 0, width, height)
            bgGradient.addColorStop(0, '#1e293b')
            bgGradient.addColorStop(1, '#0f172a')
        }

        ctx.fillStyle = bgGradient
        ctx.fillRect(0, 0, width, height)

        // 2. Subtle Grid Lines / Texture
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
        ctx.lineWidth = 1
        const gridSize = 60
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
            ctx.stroke()
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
        }

        // 3. Glowing Ambient Accent
        const glowColor = isWin ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'
        const glowRad = ctx.createRadialGradient(width / 2, height * 0.35, 10, width / 2, height * 0.35, width * 0.45)
        glowRad.addColorStop(0, glowColor)
        glowRad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowRad
        ctx.fillRect(0, 0, width, height)

        // 4. Glass Card Container
        const cardMargin = width * 0.08
        const cardWidth = width - cardMargin * 2
        const cardY = height * 0.1
        const cardHeight = height * 0.8
        const cardRadius = 32

        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
        ctx.strokeStyle = isWin ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(cardMargin, cardY, cardWidth, cardHeight, cardRadius)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        const contentX = cardMargin + 48
        let currentY = cardY + 64

        // 5. Header: Symbol + Badges + Exchange Logo
        ctx.save()
        ctx.font = 'bold 44px sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(trade.trade.symbol, contentX, currentY)

        // Direction Badge
        const dirText = `${trade.trade.direction.toUpperCase()} ${leverage}x`
        ctx.font = 'bold 22px sans-serif'
        const dirWidth = ctx.measureText(dirText).width + 28
        const dirX = contentX + ctx.measureText(trade.trade.symbol).width + 24
        ctx.fillStyle = isWin ? '#166534' : '#991b1b'
        ctx.beginPath()
        ctx.roundRect(dirX, currentY - 32, dirWidth, 38, 8)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.fillText(dirText, dirX + 14, currentY - 7)

        // Exchange Tag / Logo
        if (showExchangeLogo) {
            const exName = selectedExchange.toUpperCase()
            ctx.font = 'bold 20px sans-serif'
            const exWidth = ctx.measureText(exName).width + 32
            const exX = cardMargin + cardWidth - exWidth - 48
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(exX, currentY - 34, exWidth, 42, 10)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = '#94a3b8'
            ctx.fillText(exName, exX + 16, currentY - 6)
        }
        ctx.restore()

        // 6. Hero PnL Section
        currentY += 120
        ctx.save()
        ctx.font = '500 24px sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('REALIZED P&L', contentX, currentY)

        currentY += 80
        ctx.font = 'bold 88px sans-serif'
        ctx.fillStyle = isWin ? '#22c55e' : '#ef4444'
        const pnlText = formatPnl(trade.trade.realizedPnl)
        ctx.fillText(pnlText, contentX, currentY)

        // ROI Badge & R-Multiple
        currentY += 50
        const roiText = `${roiPercent >= 0 ? '+' : ''}${roiPercent.toFixed(1)}% ROI`
        ctx.font = 'bold 30px sans-serif'
        ctx.fillStyle = isWin ? '#4ade80' : '#f87171'
        ctx.fillText(roiText, contentX, currentY)

        if (trade.rMultiple !== null && trade.rMultiple !== undefined) {
            const rText = `·  ${formatR(trade.rMultiple)}`
            ctx.fillStyle = '#38bdf8'
            ctx.fillText(rText, contentX + ctx.measureText(roiText).width + 24, currentY)
        }
        ctx.restore()

        // 7. Stats Grid: Entry, Exit, Grade
        currentY += 70
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.beginPath()
        ctx.roundRect(contentX, currentY, cardWidth - 96, 110, 16)
        ctx.fill()

        const colWidth = (cardWidth - 96) / 3
        // Col 1: Entry
        ctx.font = '20px sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('Entry Price', contentX + 24, currentY + 40)
        ctx.font = 'bold 26px sans-serif'
        ctx.fillStyle = '#f8fafc'
        ctx.fillText(trade.trade.entryPrice.toString(), contentX + 24, currentY + 82)

        // Col 2: Exit
        ctx.font = '20px sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('Exit Price', contentX + colWidth + 24, currentY + 40)
        ctx.font = 'bold 26px sans-serif'
        ctx.fillStyle = '#f8fafc'
        ctx.fillText(trade.trade.exitPrice.toString(), contentX + colWidth + 24, currentY + 82)

        // Col 3: Grade / Duration
        ctx.font = '20px sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('Execution Grade', contentX + colWidth * 2 + 24, currentY + 40)
        ctx.font = 'bold 26px sans-serif'
        ctx.fillStyle = '#fbbf24'
        const gradeStr = trade.journal?.executionGrade ? `Grade ${trade.journal.executionGrade} ⭐` : 'Unrated'
        ctx.fillText(gradeStr, contentX + colWidth * 2 + 24, currentY + 82)
        ctx.restore()

        // 8. Thesis Section (Kutipan Tesis Estetik)
        currentY += 150
        if (showThesis && customThesis.trim()) {
            ctx.save()
            const thesisBoxHeight = ratio === '9:16' ? 320 : 180
            ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(contentX, currentY, cardWidth - 96, thesisBoxHeight, 18)
            ctx.fill()
            ctx.stroke()

            // Header Tesis
            ctx.font = 'bold 20px sans-serif'
            ctx.fillStyle = '#38bdf8'
            ctx.fillText('💡 TRADE THESIS & LOGIC', contentX + 28, currentY + 42)

            // Teks Tesis (Word wrap)
            ctx.font = 'italic 22px sans-serif'
            ctx.fillStyle = '#cbd5e1'
            const maxLineWidth = cardWidth - 150
            const words = customThesis.split(' ')
            let line = '“ '
            let lineY = currentY + 82

            for (let i = 0; i < words.length; i++) {
                const testLine = line + words[i] + ' '
                const testWidth = ctx.measureText(testLine).width
                if (testWidth > maxLineWidth && i > 0) {
                    ctx.fillText(line, contentX + 28, lineY)
                    line = words[i] + ' '
                    lineY += 34
                    if (lineY > currentY + thesisBoxHeight - 30) {
                        line += '…”'
                        break
                    }
                } else {
                    line = testLine
                }
            }
            if (lineY <= currentY + thesisBoxHeight - 20) {
                ctx.fillText(line + '”', contentX + 28, lineY)
            }
            ctx.restore()
        }

        // 9. Watermark Footer
        if (showWatermark) {
            ctx.save()
            ctx.font = '22px sans-serif'
            ctx.fillStyle = '#64748b'
            const dateStr = formatDateTime(trade.trade.exitTime)
            ctx.fillText(dateStr, contentX, cardY + cardHeight - 36)

            ctx.font = 'bold 22px sans-serif'
            ctx.fillStyle = '#94a3b8'
            const handleText = `${traderHandle} · Trading Journal Pro`
            const handleWidth = ctx.measureText(handleText).width
            ctx.fillText(handleText, cardMargin + cardWidth - handleWidth - 48, cardY + cardHeight - 36)
            ctx.restore()
        }

        return canvas
    }, [ratio, theme, showThesis, customThesis, showExchangeLogo, selectedExchange, traderHandle, showWatermark, trade, isWin, leverage, roiPercent])

    // Salin Gambar ke Clipboard
    const handleCopyToClipboard = async () => {
        try {
            const canvas = drawToCanvas()
            canvas.toBlob(async (blob) => {
                if (!blob) return
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ])
                    setCopySuccess(true)
                    setTimeout(() => setCopySuccess(false), 2500)
                } catch (err) {
                    console.error('Gagal salin ke clipboard:', err)
                    alert('Browser tidak mengizinkan akses clipboard langsung. Gunakan opsi Unduh PNG.')
                }
            }, 'image/png')
        } catch (err) {
            console.error('Error saat membuat gambar:', err)
        }
    }

    // Unduh PNG
    const handleDownload = () => {
        setDownloading(true)
        try {
            const canvas = drawToCanvas()
            const link = document.createElement('a')
            link.download = `PnL-${trade.trade.symbol}-${new Date().toISOString().slice(0, 10)}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        } catch (err) {
            console.error('Gagal unduh gambar:', err)
        } finally {
            setDownloading(false)
        }
    }

    useEffect(() => {
        drawToCanvas()
    }, [drawToCanvas])

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="✨ Pamer PnL + Thesis Card Generator"
            description="Buat kartu pamer performa estetik dan bagikan langsung ke media sosial atau komunitas."
            size="xl"
        >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Kontrol Kustomisasi (Kiri) */}
                <div className="flex flex-col gap-4 lg:col-span-5">
                    {/* Rasio */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground">Format Rasio</label>
                        <div className="mt-1.5 flex gap-2">
                            {(['1:1', '9:16', '16:9'] as AspectRatio[]).map((r) => (
                                <Button
                                    key={r}
                                    size="sm"
                                    variant={ratio === r ? 'primary' : 'outline'}
                                    onClick={() => setRatio(r)}
                                    className="flex-1 text-xs"
                                >
                                    {r === '1:1' ? 'Square (1:1)' : r === '9:16' ? 'Story (9:16)' : 'Wide (16:9)'}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Tema Background */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground">Tema Visual</label>
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                            {(
                                [
                                    { id: 'cyberpunk', label: 'Cyberpunk' },
                                    { id: 'obsidian', label: 'Obsidian' },
                                    { id: 'sunset', label: 'Sunset' },
                                    { id: 'emerald', label: 'Emerald' },
                                    { id: 'minimal', label: 'Minimal Slate' }
                                ] as { id: BgTheme; label: string }[]
                            ).map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTheme(t.id)}
                                    className={`rounded-md border p-2 text-center text-xs font-medium transition-all ${theme === t.id
                                            ? 'border-primary bg-primary/20 text-primary shadow-sm'
                                            : 'border-border bg-card text-muted-foreground hover:border-border/80'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Logo Exchange */}
                    <div className="rounded-lg border border-border/70 p-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-foreground">Tampilkan Logo Exchange</label>
                            <input
                                type="checkbox"
                                checked={showExchangeLogo}
                                onChange={(e) => setShowExchangeLogo(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                            />
                        </div>
                        {showExchangeLogo && (
                            <div className="mt-2.5 flex items-center gap-2">
                                {['mexc', 'bitunix', 'binance', 'bybit'].map((ex) => (
                                    <button
                                        key={ex}
                                        type="button"
                                        onClick={() => setSelectedExchange(ex)}
                                        className={`rounded px-2.5 py-1 text-xs uppercase font-bold transition-all ${selectedExchange === ex
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tesis Trade */}
                    <div className="rounded-lg border border-border/70 p-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-foreground">Tesis Trade</label>
                            <input
                                type="checkbox"
                                checked={showThesis}
                                onChange={(e) => setShowThesis(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                            />
                        </div>
                        {showThesis && (
                            <div className="mt-2">
                                <textarea
                                    value={customThesis}
                                    onChange={(e) => setCustomThesis(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                                    placeholder="Tulis tesis atau alasan entry di sini…"
                                />
                            </div>
                        )}
                    </div>

                    {/* Watermark / Handle */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-muted-foreground">Trader Handle / Username</label>
                            <input
                                type="text"
                                value={traderHandle}
                                onChange={(e) => setTraderHandle(e.target.value)}
                                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                                placeholder="@trader_name"
                            />
                        </div>
                        <div className="pt-5">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={showWatermark}
                                    onChange={(e) => setShowWatermark(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-border"
                                />
                                Watermark
                            </label>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-3 flex flex-col gap-2">
                        <Button
                            variant="primary"
                            onClick={() => void handleCopyToClipboard()}
                            className="w-full justify-center py-2 text-sm font-semibold"
                        >
                            {copySuccess ? '✓ Berhasil Disalin ke Clipboard!' : '📋 Salin Gambar ke Clipboard'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="w-full justify-center py-2 text-xs"
                        >
                            💾 Unduh PNG Resolusi Tinggi
                        </Button>
                    </div>
                </div>

                {/* Live Preview (Kanan) */}
                <div className="flex flex-col items-center justify-center lg:col-span-7">
                    <div className="text-[11px] font-medium text-muted-foreground mb-2">Live Preview</div>
                    <div
                        ref={previewRef}
                        className="relative flex items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-neutral-950 p-2 shadow-2xl"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '520px'
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '500px',
                                objectFit: 'contain',
                                borderRadius: '8px'
                            }}
                        />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                        Hasil ekspor menggunakan resolusi HD (Retina 2x). Langsung paste dengan Ctrl+V ke media sosial.
                    </p>
                </div>
            </div>
        </Modal>
    )
}
