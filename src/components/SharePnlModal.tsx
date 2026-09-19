import { useCallback, useEffect, useRef, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Modal } from './ui'
import { formatDate, formatDuration, formatPercent, formatPnl, formatPrice, formatR } from '../lib/format'
import {
    BG_TEMPLATES,
    EXCHANGES,
    loadShareSettings,
    type BgTemplate,
    type ExchangeName
} from '../lib/shareSettings'

// ---------------------------------------------------------------------------
// Tipe Props
// ---------------------------------------------------------------------------

export interface SharePnlModalProps {
    trade?: TradeDetail | null
    detail?: TradeDetail | null
    isOpen?: boolean
    onClose: () => void
}

// ---------------------------------------------------------------------------
// Helper Pemecah Teks Canvas (Word Wrap Dinamis)
// ---------------------------------------------------------------------------

function wrapCanvasText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    if (currentLine) {
        lines.push(currentLine)
    }
    return lines
}

// ---------------------------------------------------------------------------
// Entry Point Modal
// ---------------------------------------------------------------------------

export function SharePnlModal({ trade: propTrade, detail: propDetail, isOpen = true, onClose }: SharePnlModalProps): React.JSX.Element | null {
    const trade = propTrade || propDetail
    if (!isOpen || !trade) return null
    return <SharePnlModalContent trade={trade} onClose={onClose} />
}

// ---------------------------------------------------------------------------
// Komponen Utama Modal
// ---------------------------------------------------------------------------

function SharePnlModalContent({ trade, onClose }: { trade: TradeDetail; onClose: () => void }): React.JSX.Element {
    // --- Kalkulasi Metrik Finansial ---
    const isWin = trade.trade.realizedPnl >= 0
    const leverage = trade.trade.leverage || 1
    const margin = trade.trade.entryPrice > 0
        ? (trade.trade.size * trade.trade.entryPrice) / leverage
        : 0
    const roiPercent = margin > 0 ? (trade.trade.realizedPnl / margin) * 100 : 0
    const duration = formatDuration(trade.trade.entryTime, trade.trade.exitTime)

    // --- Muat Konfigurasi Branding dari Settings ---
    const [savedSettings] = useState(() => loadShareSettings())

    const initialBgIdx = Math.max(
        0,
        BG_TEMPLATES.findIndex((t) => t.id === savedSettings.bgPresetId)
    )

    // --- State: Background Preset (Bisa Switch Cepat di Modal) ---
    const [selectedBgIdx, setSelectedBgIdx] = useState<number>(initialBgIdx)
    const [isCustomBgActive, setIsCustomBgActive] = useState<boolean>(savedSettings.isCustomBg && !!savedSettings.customBgUrl)

    const bg: BgTemplate = BG_TEMPLATES[selectedBgIdx] ?? BG_TEMPLATES[0]!
    const accent = isWin ? bg.accentProfit : bg.accentLoss

    // Data Identitas & Branding dari Settings
    const avatarUrl = savedSettings.avatarUrl
    const traderHandle = savedSettings.traderHandle
    const brandTitle = savedSettings.brandTitle || 'SHARENYA'
    const brandSubtitle = savedSettings.brandSubtitle || 'JOURNAL'
    const customBgUrl = savedSettings.customBgUrl
    const bgDimming = savedSettings.bgDimming

    // Data Exchange & Referral dari Settings
    const mexcLogoUrl = savedSettings.mexcLogoUrl
    const mexcReferralCode = savedSettings.mexcReferralCode
    const bitunixLogoUrl = savedSettings.bitunixLogoUrl
    const bitunixReferralCode = savedSettings.bitunixReferralCode

    // Default exchange berdasarkan trade (hanya MEXC & Bitunix)
    const defaultExchange: ExchangeName = trade.trade.exchange === 'bitunix' ? 'bitunix' : 'mexc'
    const [selectedExchange, setSelectedExchange] = useState<ExchangeName>(defaultExchange)

    // --- State: Toggle Visibilitas Elemen ---
    const [showSide, setShowSide] = useState(true)
    const [showPnl, setShowPnl] = useState(true)
    const [showRoi, setShowRoi] = useState(true)
    const [showProfile, setShowProfile] = useState(true)
    const [showWatermark, setShowWatermark] = useState(true)
    const [showDuration, setShowDuration] = useState(true)
    const [showReferral, setShowReferral] = useState<boolean>(savedSettings.showReferral)
    const [showThesis, setShowThesis] = useState<boolean>(!!(trade.journal?.preTradeThesis))
    const [showReview, setShowReview] = useState<boolean>(!!(trade.journal?.postTradeReview))

    // --- State: Opsi Tampilkan Semua Teks (Tanpa Terpotong) ---
    const [showFullText, setShowFullText] = useState<boolean>(savedSettings.showFullText)

    // --- State: Konten Teks Editable ---
    const [customThesis, setCustomThesis] = useState<string>(trade.journal?.preTradeThesis || '')
    const [customReview, setCustomReview] = useState<string>(trade.journal?.postTradeReview || '')

    // --- State: Status Aksi ---
    const [copySuccess, setCopySuccess] = useState(false)
    const [downloading, setDownloading] = useState(false)

    // Ref elemen canvas
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Preloader image refs untuk canvas export
    const avatarImgRef = useRef<HTMLImageElement | null>(null)
    const customBgImgRef = useRef<HTMLImageElement | null>(null)
    const mexcLogoImgRef = useRef<HTMLImageElement | null>(null)
    const bitunixLogoImgRef = useRef<HTMLImageElement | null>(null)

    // Preload gambar Avatar
    useEffect(() => {
        if (avatarUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = avatarUrl
            img.onload = () => { avatarImgRef.current = img }
        } else {
            avatarImgRef.current = null
        }
    }, [avatarUrl])

    // Preload gambar Custom Background
    useEffect(() => {
        if (customBgUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = customBgUrl
            img.onload = () => { customBgImgRef.current = img }
        } else {
            customBgImgRef.current = null
        }
    }, [customBgUrl])

    // Preload logo MEXC
    useEffect(() => {
        if (mexcLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = mexcLogoUrl
            img.onload = () => { mexcLogoImgRef.current = img }
        } else {
            mexcLogoImgRef.current = null
        }
    }, [mexcLogoUrl])

    // Preload logo Bitunix
    useEffect(() => {
        if (bitunixLogoUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = bitunixLogoUrl
            img.onload = () => { bitunixLogoImgRef.current = img }
        } else {
            bitunixLogoImgRef.current = null
        }
    }, [bitunixLogoUrl])

    // Logo & Referral aktif berdasarkan exchange terpilih
    const activeLogoImg = selectedExchange === 'mexc' ? mexcLogoImgRef.current : bitunixLogoImgRef.current
    const activeLogoUrl = selectedExchange === 'mexc' ? mexcLogoUrl : bitunixLogoUrl
    const activeReferral = selectedExchange === 'mexc' ? mexcReferralCode : bitunixReferralCode

    // -----------------------------------------------------------------------
    // Mesin Render Canvas Dinamis (Auto-Flow Y Layout Engine)
    // -----------------------------------------------------------------------
    const drawToCanvas = useCallback((): HTMLCanvasElement => {
        const canvas = canvasRef.current || document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return canvas

        // 1. Ukuran Kartu Standar & Usable Area
        const W = 1080
        const mx = 48
        const cw = W - mx * 2 // 984px
        const cx = mx + 52
        const contentW = cw - 104 // 880px

        // 2. Hitung Ukuran Teks Thesis (Penuh atau Compact)
        ctx.font = 'italic 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        let thesisLines: string[] = []
        let thesisBoxH = 0
        if (showThesis && customThesis.trim()) {
            thesisLines = wrapCanvasText(ctx, customThesis.trim(), contentW - 48)
            if (!showFullText && thesisLines.length > 4) {
                thesisLines = thesisLines.slice(0, 4)
                thesisLines[3] = (thesisLines[3] || '') + '…'
            }
            thesisBoxH = 46 + thesisLines.length * 36 + 22
        }

        // 3. Hitung Ukuran Teks Review (Penuh atau Compact)
        ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        let reviewLines: string[] = []
        let reviewBoxH = 0
        if (showReview && customReview.trim()) {
            reviewLines = wrapCanvasText(ctx, customReview.trim(), contentW - 48)
            if (!showFullText && reviewLines.length > 3) {
                reviewLines = reviewLines.slice(0, 3)
                reviewLines[2] = (reviewLines[2] || '') + '…'
            }
            reviewBoxH = 44 + reviewLines.length * 34 + 22
        }

        // 4. Hitung Tinggi Total Kartu Secara Dinamis
        const hasReferralDisplay = showReferral && !!activeReferral.trim()
        const headerH = hasReferralDisplay ? 68 : 40
        const my = 48
        const padTop = 52
        const padBottom = 48
        const symbolH = 48
        const roiH = showRoi ? 92 : 0
        const pnlH = showPnl ? 46 : 0
        const statsH = 132
        const footerH = (showProfile || showWatermark) ? 68 : 0

        let innerH = padTop + headerH + 32 + symbolH + 24
        if (showRoi) innerH += roiH + 16
        if (showPnl) innerH += pnlH + 28
        innerH += statsH + 28
        if (thesisBoxH > 0) innerH += thesisBoxH + 20
        if (reviewBoxH > 0) innerH += reviewBoxH + 20
        if (footerH > 0) innerH += 24 + 1 + 24 + footerH
        innerH += padBottom

        const ch = innerH
        const H = ch + my * 2

        canvas.width = W
        canvas.height = H

        // 5. Gambar Latar Belakang Luar
        const isTransparentMode = !isCustomBgActive && bg.isTransparent

        if (isTransparentMode) {
            ctx.clearRect(0, 0, W, H)
        } else {
            const bgGrad = ctx.createLinearGradient(0, 0, W, H)
            if (bg.id === 'cyberpunk') {
                const radGrad = ctx.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.5, H * 0.5, W)
                radGrad.addColorStop(0, '#1e0836')
                radGrad.addColorStop(0.6, '#0a0014')
                radGrad.addColorStop(1, '#000000')
                ctx.fillStyle = radGrad
            } else if (bg.id === 'emerald') {
                bgGrad.addColorStop(0, '#064e3b')
                bgGrad.addColorStop(0.6, '#022c22')
                bgGrad.addColorStop(1, '#020617')
                ctx.fillStyle = bgGrad
            } else if (bg.id === 'sunset') {
                bgGrad.addColorStop(0, '#2e1065')
                bgGrad.addColorStop(0.4, '#1e0a30')
                bgGrad.addColorStop(1, '#0f172a')
                ctx.fillStyle = bgGrad
            } else if (bg.id === 'obsidian') {
                bgGrad.addColorStop(0, '#18181b')
                bgGrad.addColorStop(0.6, '#09090b')
                bgGrad.addColorStop(1, '#000000')
                ctx.fillStyle = bgGrad
            } else {
                bgGrad.addColorStop(0, '#0d1117')
                bgGrad.addColorStop(0.5, '#0a0e1a')
                bgGrad.addColorStop(1, '#060912')
                ctx.fillStyle = bgGrad
            }
            ctx.fillRect(0, 0, W, H)
        }

        // 6. Custom Background (dari Settings) jika aktif
        if (isCustomBgActive && customBgImgRef.current && customBgImgRef.current.complete) {
            const img = customBgImgRef.current
            const imgAspect = img.width / img.height
            const canvasAspect = W / H
            let dw = W, dh = H, dx = 0, dy = 0

            if (imgAspect > canvasAspect) {
                dh = H
                dw = H * imgAspect
                dx = (W - dw) / 2
            } else {
                dw = W
                dh = W / imgAspect
                dy = (H - dh) / 2
            }
            ctx.drawImage(img, dx, dy, dw, dh)

            ctx.fillStyle = `rgba(0, 0, 0, ${bgDimming / 100})`
            ctx.fillRect(0, 0, W, H)
        }

        // 7. Grid Texture & Ambient Glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'
        ctx.lineWidth = 1
        for (let x = 0; x < W; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        }
        for (let y = 0; y < H; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
        }

        const glowRad = ctx.createRadialGradient(W / 2, my + 200, 30, W / 2, my + 200, W * 0.45)
        glowRad.addColorStop(0, `${accent}1c`)
        glowRad.addColorStop(1, 'transparent')
        ctx.fillStyle = glowRad
        ctx.fillRect(0, 0, W, H)

        // 8. Kontainer Kartu Glassmorphism
        const cr = 32
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(mx, my, cw, ch, cr)
        if (isTransparentMode) {
            ctx.fillStyle = 'rgba(11, 15, 25, 0.88)'
            ctx.strokeStyle = `${accent}66`
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
            ctx.strokeStyle = `${accent}44`
        }
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // -------------------------------------------------------------------
        // Penataan Elemen Berurutan Secara Dinamis (Auto Flow Y)
        // -------------------------------------------------------------------
        let curY = my + padTop

        // A. Header: Logo/Nama Brand + Logo Exchange & Kode Referral
        ctx.save()
        // Nama Brand Utama (dinamis dari settings)
        ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(brandTitle, cx, curY + 28)

        // Sub-label Badge Brand (dinamis dari settings)
        const brandTitleW = ctx.measureText(brandTitle).width
        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const badgeW = ctx.measureText(brandSubtitle).width + 24
        ctx.fillStyle = `${accent}26`
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx + brandTitleW + 16, curY + 6, badgeW, 28, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = accent
        ctx.fillText(brandSubtitle, cx + brandTitleW + 28, curY + 26)

        // Exchange Logo / Badge (Sisi Kanan)
        const rightEdgeX = mx + cw - 52
        if (activeLogoImg && activeLogoImg.complete) {
            // Render gambar logo kustom
            const maxLogoH = 34
            const logoAspect = activeLogoImg.width / activeLogoImg.height
            const logoW = Math.min(140, maxLogoH * logoAspect)
            const logoX = rightEdgeX - logoW
            ctx.drawImage(activeLogoImg, logoX, curY + 2, logoW, maxLogoH)

            // Tampilkan Referral di bawah logo jika ada
            if (hasReferralDisplay) {
                const refText = `Ref: ${activeReferral}`
                ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const refW = ctx.measureText(refText).width + 20
                const refX = rightEdgeX - refW
                const refY = curY + maxLogoH + 8

                ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.roundRect(refX, refY, refW, 24, 6)
                ctx.fill()
                ctx.stroke()
                ctx.fillStyle = '#38bdf8'
                ctx.fillText(refText, refX + 10, refY + 18)
            }
        } else {
            // Render badge teks default exchange (MEXC / BITUNIX)
            const exText = selectedExchange.toUpperCase()
            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            const exW = ctx.measureText(exText).width + 32
            const exX = rightEdgeX - exW
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(exX, curY + 2, exW, 32, 8)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = '#cbd5e1'
            ctx.fillText(exText, exX + 16, curY + 25)

            // Tampilkan Referral di bawah badge exchange
            if (hasReferralDisplay) {
                const refText = `Ref: ${activeReferral}`
                ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                const refW = ctx.measureText(refText).width + 20
                const refX = rightEdgeX - refW
                const refY = curY + 40

                ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.roundRect(refX, refY, refW, 24, 6)
                ctx.fill()
                ctx.stroke()
                ctx.fillStyle = '#38bdf8'
                ctx.fillText(refText, refX + 10, refY + 18)
            }
        }
        ctx.restore()

        curY += headerH + 32

        // B. Symbol + Direction + Leverage
        ctx.save()
        ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(trade.trade.symbol, cx, curY + 36)

        if (showSide) {
            const symW = ctx.measureText(trade.trade.symbol).width
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
            ctx.fillRect(cx + symW + 20, curY + 6, 2, 34)

            ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            const dirStr = trade.trade.direction.toUpperCase()
            ctx.fillText(dirStr, cx + symW + 36, curY + 34)

            const dirW = ctx.measureText(dirStr).width
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillText(`${leverage}X`, cx + symW + 36 + dirW + 12, curY + 34)
        }
        ctx.restore()

        curY += symbolH + 24

        // C. ROI Hero Text
        if (showRoi) {
            ctx.save()
            ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            ctx.fillText(formatPercent(roiPercent), cx, curY + 76)
            ctx.restore()
            curY += roiH + 16
        }

        // D. PnL Amount & R-Multiple
        if (showPnl) {
            ctx.save()
            ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            const pnlStr = `${formatPnl(trade.trade.realizedPnl)} USDT`
            ctx.fillText(pnlStr, cx, curY + 32)

            if (trade.rMultiple !== null && trade.rMultiple !== undefined) {
                const pnlW = ctx.measureText(pnlStr).width
                ctx.fillStyle = '#38bdf8'
                ctx.font = '500 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillText(`  ·  ${formatR(trade.rMultiple)}`, cx + pnlW, curY + 32)
            }
            ctx.restore()
            curY += pnlH + 28
        }

        // E. Stats Row Grid (Entry, Exit, Duration)
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx, curY, contentW, statsH, 18)
        ctx.fill()
        ctx.stroke()

        const statColW = contentW / 3
        const drawStatCol = (title: string, val: string, colIdx: number) => {
            const colX = cx + statColW * colIdx + 28
            ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = bg.textSub
            ctx.fillText(title, colX, curY + 46)

            ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(val, colX, curY + 92)
        }

        drawStatCol('Entry Price', formatPrice(trade.trade.entryPrice), 0)
        drawStatCol('Exit Price', formatPrice(trade.trade.exitPrice), 1)
        drawStatCol('Duration', showDuration ? duration : '—', 2)

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath()
        ctx.moveTo(cx + statColW, curY + 24); ctx.lineTo(cx + statColW, curY + statsH - 24)
        ctx.moveTo(cx + statColW * 2, curY + 24); ctx.lineTo(cx + statColW * 2, curY + statsH - 24)
        ctx.stroke()
        ctx.restore()

        curY += statsH + 28

        // F. Trade Thesis (Dinamis: Penuh / Compact)
        if (thesisBoxH > 0) {
            ctx.save()
            ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'
            ctx.strokeStyle = `${accent}44`
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(cx, curY, contentW, thesisBoxH, 18)
            ctx.fill()
            ctx.stroke()

            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = accent
            ctx.fillText('💡 Trade Thesis', cx + 24, curY + 34)

            ctx.font = 'italic 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
            thesisLines.forEach((l, i) => {
                ctx.fillText(l, cx + 24, curY + 70 + i * 36)
            })
            ctx.restore()

            curY += thesisBoxH + 20
        }

        // G. Post-Trade Review (Dinamis: Penuh / Compact)
        if (reviewBoxH > 0) {
            ctx.save()
            ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.roundRect(cx, curY, contentW, reviewBoxH, 18)
            ctx.fill()
            ctx.stroke()

            ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = '#38bdf8'
            ctx.fillText('📝 Post-Trade Review', cx + 24, curY + 32)

            ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
            reviewLines.forEach((l, i) => {
                ctx.fillText(l, cx + 24, curY + 66 + i * 34)
            })
            ctx.restore()

            curY += reviewBoxH + 20
        }

        // H. Footer: Avatar Gambar / Inisial + Handle + Watermark
        if (showProfile || showWatermark) {
            curY += 12

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(cx, curY)
            ctx.lineTo(cx + contentW, curY)
            ctx.stroke()

            curY += 24

            if (showProfile) {
                const avatarSize = 54
                const avatarX = cx
                const avatarY = curY + 4

                if (avatarImgRef.current && avatarImgRef.current.complete) {
                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.closePath()
                    ctx.clip()
                    ctx.drawImage(avatarImgRef.current, avatarX, avatarY, avatarSize, avatarSize)
                    ctx.restore()

                    ctx.save()
                    ctx.strokeStyle = accent
                    ctx.lineWidth = 2.5
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.stroke()
                    ctx.restore()
                } else {
                    ctx.save()
                    ctx.fillStyle = `${accent}33`
                    ctx.strokeStyle = accent
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.stroke()

                    ctx.fillStyle = '#ffffff'
                    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    const initText = traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'
                    const initW = ctx.measureText(initText).width
                    ctx.fillText(initText, avatarX + (avatarSize - initW) / 2, avatarY + 35)
                    ctx.restore()
                }

                ctx.save()
                ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(traderHandle, avatarX + avatarSize + 18, avatarY + 26)

                ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                ctx.fillText(formatDate(trade.trade.exitTime), avatarX + avatarSize + 18, avatarY + 52)
                ctx.restore()
            }

            if (showWatermark) {
                ctx.save()
                ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
                const wm1 = 'sharenya.app'
                const w1W = ctx.measureText(wm1).width
                ctx.fillText(wm1, mx + cw - 52 - w1W, curY + 26)

                ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                ctx.fillStyle = bg.textSub
                const wm2 = 'Trading Journal'
                const w2W = ctx.measureText(wm2).width
                ctx.fillText(wm2, mx + cw - 52 - w2W, curY + 52)
                ctx.restore()
            }
        }

        return canvas
    }, [
        bg, accent, selectedExchange, trade,
        showSide, showPnl, showRoi, showProfile, showWatermark, showDuration,
        showThesis, customThesis, showReview, customReview, showFullText, showReferral,
        traderHandle, brandTitle, brandSubtitle, activeLogoImg, activeReferral,
        duration, roiPercent, leverage,
        isCustomBgActive, bgDimming
    ])

    // Update canvas preview saat parameter berubah
    useEffect(() => {
        drawToCanvas()
    }, [drawToCanvas])

    // -----------------------------------------------------------------------
    // Aksi Export (Download PNG & Copy Clipboard)
    // -----------------------------------------------------------------------
    const handleDownload = () => {
        setDownloading(true)
        try {
            const canvas = drawToCanvas()
            const link = document.createElement('a')
            const dateStr = new Date().toISOString().slice(0, 10)
            link.download = `${brandTitle}-${trade.trade.symbol}-${dateStr}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        } finally {
            setDownloading(false)
        }
    }

    const handleCopy = async () => {
        try {
            const canvas = drawToCanvas()
            canvas.toBlob(async (blob) => {
                if (!blob) return
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    setCopySuccess(true)
                    setTimeout(() => setCopySuccess(false), 2500)
                } catch {
                    alert('Clipboard browser tidak mendukung penulisan gambar. Silakan gunakan tombol "Save PNG".')
                }
            }, 'image/png')
        } catch {
            // Abaikan kesalahan clipboard
        }
    }

    // -----------------------------------------------------------------------
    // Render Modal UI
    // -----------------------------------------------------------------------
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Profit Sharing Card"
            size="xl"
        >
            <div className="flex flex-col gap-0 max-h-[85vh] overflow-y-auto">
                {/* ── CARD LIVE PREVIEW ── */}
                <div className="p-3 bg-muted/20 rounded-2xl flex items-center justify-center">
                    <div className="w-full max-w-[540px]">
                        <PnlCard
                            trade={trade}
                            bg={bg}
                            accent={accent}
                            roiPercent={roiPercent}
                            duration={duration}
                            leverage={leverage}
                            selectedExchange={selectedExchange}
                            traderHandle={traderHandle}
                            brandTitle={brandTitle}
                            brandSubtitle={brandSubtitle}
                            activeLogoUrl={activeLogoUrl}
                            activeReferral={activeReferral}
                            avatarUrl={avatarUrl}
                            isCustomBgActive={isCustomBgActive}
                            customBgUrl={customBgUrl}
                            bgDimming={bgDimming}
                            showSide={showSide}
                            showPnl={showPnl}
                            showRoi={showRoi}
                            showProfile={showProfile}
                            showWatermark={showWatermark}
                            showDuration={showDuration}
                            showReferral={showReferral}
                            showThesis={showThesis}
                            customThesis={customThesis}
                            showReview={showReview}
                            customReview={customReview}
                            showFullText={showFullText}
                        />
                    </div>
                    {/* Hidden canvas for export */}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* ── BACKGROUND PRESET SELECTOR ── */}
                <div className="border-t border-border/40 px-4 py-2 bg-card/30 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground mr-1">Tema:</span>
                        {BG_TEMPLATES.map((t, i) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                    setSelectedBgIdx(i)
                                    setIsCustomBgActive(false)
                                }}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${!isCustomBgActive && selectedBgIdx === i
                                    ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-xs'
                                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{
                                        background: t.isTransparent ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)' : t.accentProfit,
                                    }}
                                />
                                <span>{t.label}</span>
                            </button>
                        ))}

                        {customBgUrl && (
                            <button
                                type="button"
                                onClick={() => setIsCustomBgActive(true)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${isCustomBgActive
                                    ? 'border-primary bg-primary/15 text-foreground font-semibold shadow-xs'
                                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <span>🖼️ Custom BG</span>
                            </button>
                        )}
                    </div>

                    <span className="text-[11px] text-muted-foreground">
                        ⚙️ Brand, Logo & Reff diatur di <span className="font-medium text-foreground">Settings</span>
                    </span>
                </div>

                {/* ── TOGGLE CHECKBOXES ── */}
                <div className="border-t border-border/40 px-4 py-2.5 bg-card/10">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Komponen Tampilan:
                        </span>
                        {/* Toggle Teks Lengkap Tanpa Terpotong */}
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold select-none text-primary">
                            <input
                                type="checkbox"
                                checked={showFullText}
                                onChange={(e) => setShowFullText(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-border text-primary accent-primary"
                            />
                            <span>Tampilkan Semua Teks (Tanpa Terpotong)</span>
                        </label>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {([
                            ['Side', showSide, setShowSide],
                            ['PnL', showPnl, setShowPnl],
                            ['ROI', showRoi, setShowRoi],
                            ['Profile', showProfile, setShowProfile],
                            ['Watermark', showWatermark, setShowWatermark],
                            ['Duration', showDuration, setShowDuration],
                            ['Referral Code', showReferral, setShowReferral],
                            ['Thesis', showThesis, setShowThesis],
                            ['Review', showReview, setShowReview],
                        ] as [string, boolean, (v: boolean) => void][]).map(([label, checked, setter]) => (
                            <label key={label} className="flex cursor-pointer items-center gap-1.5 text-xs select-none">
                                <span
                                    className="inline-flex items-center justify-center rounded w-4 h-4 flex-shrink-0 transition-colors"
                                    style={{
                                        background: checked ? accent : 'transparent',
                                        border: `1.5px solid ${checked ? accent : 'rgba(148,163,184,0.5)'}`,
                                    }}
                                    onClick={() => setter(!checked)}
                                >
                                    {checked && (
                                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                                            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </span>
                                <span className="text-foreground font-medium">{label}</span>
                            </label>
                        ))}
                    </div>

                    {/* Edit Trade Thesis Inline */}
                    {showThesis && (
                        <div className="mt-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-sky-400">💡 Trade Thesis:</span>
                            </div>
                            <textarea
                                value={customThesis}
                                onChange={(e) => setCustomThesis(e.target.value)}
                                rows={showFullText ? 3 : 2}
                                placeholder="Tulis alasan masuk posisi / thesis trading di sini..."
                                className="w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground resize-none focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
                            />
                        </div>
                    )}

                    {/* Edit Post-Trade Review Inline */}
                    {showReview && (
                        <div className="mt-1.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-sky-400">📝 Post-Trade Review:</span>
                            </div>
                            <textarea
                                value={customReview}
                                onChange={(e) => setCustomReview(e.target.value)}
                                rows={showFullText ? 3 : 2}
                                placeholder="Tulis evaluasi / pelajaran setelah trade ditutup..."
                                className="w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground resize-none focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
                            />
                        </div>
                    )}
                </div>

                {/* ── EXCHANGE SELECTOR BAR (HANYA MEXC & BITUNIX) ── */}
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/40 bg-card/20">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">Exchange:</span>
                        {EXCHANGES.map((ex) => (
                            <button
                                key={ex}
                                type="button"
                                onClick={() => setSelectedExchange(ex)}
                                className={`rounded-md px-3 py-1 text-xs font-bold uppercase transition-all ${selectedExchange === ex
                                    ? 'text-white shadow-xs'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                style={selectedExchange === ex ? { background: accent } : {}}
                            >
                                {ex}
                            </button>
                        ))}

                        {/* Referral Code preview */}
                        {showReferral && activeReferral && (
                            <span className="text-[11px] font-semibold text-sky-400 ml-1">
                                (Kode Reff: {activeReferral})
                            </span>
                        )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Trader: <span className="font-semibold text-foreground">{traderHandle}</span>
                    </div>
                </div>

                {/* ── ACTION BUTTONS ── */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/40 bg-card/30">
                    {[
                        {
                            icon: (
                                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M4 14l6 6 6-6" />
                                    <path d="M10 3v17" />
                                    <path d="M2 17v1a2 2 0 002 2h12a2 2 0 002-2v-1" />
                                </svg>
                            ),
                            label: downloading ? 'Menyimpan...' : 'Save PNG (HQ)',
                            onClick: handleDownload,
                            disabled: downloading,
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <rect x="9" y="9" width="13" height="13" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            ),
                            label: copySuccess ? 'Tersalin ke Clipboard!' : 'Copy Image',
                            onClick: () => void handleCopy(),
                            disabled: false,
                        },
                        {
                            icon: (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            ),
                            label: 'Share Twitter / X',
                            onClick: () => {
                                const refStr = showReferral && activeReferral ? `\nRef Code: ${activeReferral}` : ''
                                const text = `${trade.trade.symbol} ${trade.trade.direction.toUpperCase()} ${leverage}x | ${formatPercent(roiPercent)} ROI | ${formatPnl(trade.trade.realizedPnl)} USDT${refStr}\n\n#Trading #Crypto #${brandTitle} ${traderHandle}`
                                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
                            },
                            disabled: false,
                        },
                    ].map(({ icon, label, onClick, disabled }) => (
                        <button
                            key={label}
                            type="button"
                            onClick={onClick}
                            disabled={disabled}
                            className="flex flex-1 flex-col items-center gap-1 py-2 text-foreground/85 hover:text-foreground transition-all rounded-xl hover:bg-muted/40 disabled:opacity-50"
                        >
                            <div
                                className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
                                style={{ background: 'rgba(255, 255, 255, 0.08)', color: accent }}
                            >
                                {icon}
                            </div>
                            <span className="text-[11px] font-medium leading-tight">{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    )
}

// ---------------------------------------------------------------------------
// Komponen PnlCard — HTML Live Preview
// ---------------------------------------------------------------------------

interface PnlCardProps {
    trade: TradeDetail
    bg: BgTemplate
    accent: string
    roiPercent: number
    duration: string
    leverage: number
    selectedExchange: ExchangeName
    traderHandle: string
    brandTitle: string
    brandSubtitle: string
    activeLogoUrl: string | null
    activeReferral: string
    avatarUrl: string | null
    isCustomBgActive: boolean
    customBgUrl: string | null
    bgDimming: number
    showSide: boolean
    showPnl: boolean
    showRoi: boolean
    showProfile: boolean
    showWatermark: boolean
    showDuration: boolean
    showReferral: boolean
    showThesis: boolean
    customThesis: string
    showReview: boolean
    customReview: string
    showFullText: boolean
}

function PnlCard({
    trade, bg, accent, roiPercent, duration, leverage, selectedExchange,
    traderHandle, brandTitle, brandSubtitle, activeLogoUrl, activeReferral,
    avatarUrl, isCustomBgActive, customBgUrl, bgDimming,
    showSide, showPnl, showRoi, showProfile, showWatermark, showDuration, showReferral,
    showThesis, customThesis, showReview, customReview, showFullText
}: PnlCardProps) {
    const isTransparentMode = !isCustomBgActive && bg.isTransparent
    const hasReferralDisplay = showReferral && !!activeReferral.trim()

    return (
        <div
            className="relative overflow-hidden transition-all duration-200 select-none"
            style={{
                borderRadius: 24,
                padding: '24px 28px 20px',
                background: isCustomBgActive
                    ? 'transparent'
                    : isTransparentMode
                        ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(10, 15, 30, 0.92) 100%)'
                        : bg.bg,
                border: isTransparentMode ? `1.5px solid ${accent}66` : `1px solid ${bg.border}`,
                boxShadow: isTransparentMode ? `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px ${accent}22` : '0 12px 36px rgba(0, 0, 0, 0.35)',
            }}
        >
            {/* Custom Image Background */}
            {isCustomBgActive && customBgUrl && (
                <>
                    <div
                        className="pointer-events-none absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${customBgUrl})` }}
                    />
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: `rgba(0, 0, 0, ${bgDimming / 100})` }}
                    />
                </>
            )}

            {/* Grid Pattern Overlay */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }}
            />

            {/* Ambient Radial Glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background: `radial-gradient(ellipse at 50% 25%, ${accent}20 0%, transparent 65%)`,
                }}
            />

            {/* Konten Utama */}
            <div className="relative z-10">
                {/* ── Header: Logo/Brand + Logo Exchange & Kode Referral ── */}
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base tracking-widest uppercase">
                            {brandTitle}
                        </span>
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide"
                            style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}44` }}
                        >
                            {brandSubtitle}
                        </span>
                    </div>

                    {/* Sisi Kanan: Logo Exchange + Kode Referral di Bawahnya */}
                    <div className="flex flex-col items-end gap-1">
                        {activeLogoUrl ? (
                            <img src={activeLogoUrl} alt={selectedExchange} className="h-6 max-w-[110px] object-contain" />
                        ) : (
                            <span
                                className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider"
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.14)',
                                    color: '#cbd5e1'
                                }}
                            >
                                {selectedExchange}
                            </span>
                        )}

                        {hasReferralDisplay && (
                            <span
                                className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                                style={{
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    border: '1px solid rgba(56, 189, 248, 0.35)',
                                    color: '#38bdf8'
                                }}
                            >
                                Ref: {activeReferral}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Symbol + Direction ── */}
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl font-bold text-white leading-none tracking-tight">
                        {trade.trade.symbol}
                    </span>
                    {showSide && (
                        <>
                            <div className="w-px h-4 opacity-30" style={{ background: '#d9d9d9' }} />
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                <span style={{ color: accent }}>
                                    {trade.trade.direction.toUpperCase()}
                                </span>
                                <span className="text-white">{leverage}X</span>
                            </div>
                        </>
                    )}
                </div>

                {/* ── ROI Hero ── */}
                {showRoi && (
                    <div
                        className="text-5xl font-extrabold leading-none my-3 tracking-tight"
                        style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}
                    >
                        {formatPercent(roiPercent)}
                    </div>
                )}

                {/* ── PnL Amount ── */}
                {showPnl && (
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl font-bold" style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}>
                            {formatPnl(trade.trade.realizedPnl)} USDT
                        </span>
                        {trade.rMultiple !== null && trade.rMultiple !== undefined && (
                            <span className="text-sm font-semibold" style={{ color: '#38bdf8' }}>
                                · {formatR(trade.rMultiple)}
                            </span>
                        )}
                    </div>
                )}

                {/* ── Key Metrics Grid (Entry, Exit, Duration) ── */}
                <div
                    className="grid grid-cols-3 gap-2 p-3 rounded-xl mb-3"
                    style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                >
                    <div>
                        <div className="text-[11px] leading-tight mb-1" style={{ color: bg.textSub }}>Entry Price</div>
                        <div className="text-xs font-bold text-white truncate">{formatPrice(trade.trade.entryPrice)}</div>
                    </div>
                    <div>
                        <div className="text-[11px] leading-tight mb-1" style={{ color: bg.textSub }}>Exit Price</div>
                        <div className="text-xs font-bold text-white truncate">{formatPrice(trade.trade.exitPrice)}</div>
                    </div>
                    <div>
                        <div className="text-[11px] leading-tight mb-1" style={{ color: bg.textSub }}>Duration</div>
                        <div className="text-xs font-bold text-white truncate">{showDuration ? duration : '—'}</div>
                    </div>
                </div>

                {/* ── Trade Thesis (Dinamis: Penuh / Compact) ── */}
                {showThesis && customThesis.trim() && (
                    <div
                        className="mt-2.5 rounded-xl px-3.5 py-2.5"
                        style={{
                            background: 'rgba(15, 23, 42, 0.7)',
                            border: `1px solid ${accent}33`,
                        }}
                    >
                        <div className="text-[11px] font-bold mb-1" style={{ color: accent }}>
                            💡 Trade Thesis
                        </div>
                        <p className={`text-xs italic leading-relaxed text-white/90 ${showFullText ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>
                            "{customThesis}"
                        </p>
                    </div>
                )}

                {/* ── Post-Trade Review (Dinamis: Penuh / Compact) ── */}
                {showReview && customReview.trim() && (
                    <div
                        className="mt-2 rounded-xl px-3.5 py-2.5"
                        style={{
                            background: 'rgba(15, 23, 42, 0.55)',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                        }}
                    >
                        <div className="text-[11px] font-bold mb-1 text-sky-400">
                            📝 Post-Trade Review
                        </div>
                        <p className={`text-xs leading-relaxed text-white/80 ${showFullText ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                            {customReview}
                        </p>
                    </div>
                )}

                {/* ── Footer: Profile + Watermark ── */}
                {(showProfile || showWatermark) && (
                    <div
                        className="flex items-center justify-between mt-4 pt-3"
                        style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
                    >
                        {showProfile && (
                            <div className="flex items-center gap-2.5">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Avatar"
                                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                        style={{ border: `1.5px solid ${accent}` }}
                                    />
                                ) : (
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                                        style={{ background: `${accent}33`, border: `1.5px solid ${accent}` }}
                                    >
                                        {traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <div>
                                    <div className="text-xs font-bold text-white leading-tight">
                                        {traderHandle}
                                    </div>
                                    <div className="text-[10px]" style={{ color: bg.textSub }}>
                                        {formatDate(trade.trade.exitTime)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {showWatermark && (
                            <div className="text-[10px] text-right leading-tight ml-auto" style={{ color: bg.textSub }}>
                                <div className="font-semibold text-white/80">sharenya.app</div>
                                <div>Trading Journal</div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
