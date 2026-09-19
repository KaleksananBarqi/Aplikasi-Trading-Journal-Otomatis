/**
 * Ekspor journal ke CSV, JSON, atau PDF.
 *
 * ===========================================================================
 * DESAIN
 * ===========================================================================
 *
 * - CSV: UTF-8 dengan BOM supaya Excel membaca encoding dengan benar.
 *   Field yang berisi koma, kutip, atau newline di-escape dengan RFC 4180.
 *
 * - JSON: Pretty-print 2 spasi, UTF-8.
 *
 * - PDF: Render HTML template via BrowserWindow.offscreen, lalu printToPDF.
 *   Tidak pakai dependency eksternal — Electron sudah punya Chromium.
 *
 * File disimpan via dialog.showSaveDialog() supaya user pilih lokasi.
 * Tidak ada penulisan file diam-diam tanpa sepengetahuan user.
 */

import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import type { TradeDetail } from '../../shared/domain'
import { formatDateTime, formatPnl, formatR } from './formatters'
import { logger } from '../utils/logger'

export type ExportFormat = 'csv' | 'json' | 'pdf'

const EXTENSIONS: Record<ExportFormat, string> = {
    csv: 'csv',
    json: 'json',
    pdf: 'pdf'
}

const FILTERS = {
    csv: { name: 'CSV (UTF-8)', extensions: ['csv'] },
    json: { name: 'JSON', extensions: ['json'] },
    pdf: { name: 'PDF', extensions: ['pdf'] }
}

/**
 * Ekspor daftar trade ke file dalam format yang dipilih.
 *
 * @returns path file yang disimpan, atau throw bila user batal.
 */
export async function exportJournal(
    format: ExportFormat,
    trades: TradeDetail[]
): Promise<string> {
    const result = await dialog.showSaveDialog({
        title: `Ekspor Journal (${format.toUpperCase()})`,
        defaultPath: `trading-journal-${Date.now()}.${EXTENSIONS[format]}`,
        filters: [FILTERS[format]]
    })

    if (result.canceled || !result.filePath) {
        throw new Error('Ekspor dibatalkan.')
    }

    const filePath = result.filePath

    switch (format) {
        case 'csv':
            writeFileSync(filePath, toCsv(trades), 'utf8')
            break
        case 'json':
            writeFileSync(filePath, toJson(trades), 'utf8')
            break
        case 'pdf':
            await toPdf(trades, filePath)
            break
    }

    logger.info(`[export] ${format.toUpperCase()} diekspor ke ${filePath} (${trades.length} trade)`)
    return filePath
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
    'ID',
    'Exchange',
    'Symbol',
    'Direction',
    'Entry Price',
    'Exit Price',
    'Entry Time',
    'Exit Time',
    'Size',
    'Leverage',
    'Margin Mode',
    'Realized PnL',
    'Fee Open',
    'Fee Close',
    'Funding Fee',
    'Setup Tag',
    'Emotion Tag',
    'Execution Grade',
    'Tags',
    'Planned Stop',
    'Planned Target',
    'Risk Amount',
    'Planned RR',
    'R Multiple',
    'Pre-Trade Thesis',
    'Post-Trade Review',
    'Screenshot'
]

function csvEscape(value: unknown): string {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

function toCsv(trades: TradeDetail[]): string {
    // BOM supaya Excel deteksi UTF-8 dengan benar.
    const BOM = '\uFEFF'
    const rows: string[] = [CSV_HEADERS.join(',')]

    for (const detail of trades) {
        const { trade, journal, plannedRisk, tags, rMultiple } = detail
        rows.push([
            trade.id,
            trade.exchange,
            trade.symbol,
            trade.direction,
            trade.entryPrice,
            trade.exitPrice,
            formatDateTime(trade.entryTime),
            formatDateTime(trade.exitTime),
            trade.size,
            trade.leverage,
            trade.marginMode ?? '',
            trade.realizedPnl,
            trade.feeOpen,
            trade.feeClose,
            trade.fundingFee,
            journal?.setupTag ?? '',
            journal?.emotionTag ?? '',
            journal?.executionGrade ?? '',
            tags.map((t) => t.name).join('; '),
            plannedRisk?.plannedStop ?? '',
            plannedRisk?.plannedTarget ?? '',
            plannedRisk?.riskAmount ?? '',
            plannedRisk?.plannedRr ?? '',
            rMultiple ?? '',
            journal?.preTradeThesis ?? '',
            journal?.postTradeReview ?? '',
            journal?.screenshotPath ?? ''
        ].map(csvEscape).join(','))
    }

    return BOM + rows.join('\r\n')
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function toJson(trades: TradeDetail[]): string {
    return JSON.stringify(trades, null, 2)
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function buildPdfHtml(trades: TradeDetail[]): string {
    const rows = trades.map((detail) => {
        const { trade, journal, tags, rMultiple } = detail
        return `<tr>
            <td>${formatDateTime(trade.exitTime)}</td>
            <td>${escapeHtml(trade.symbol)}</td>
            <td>${trade.direction}</td>
            <td class="num">${formatPnl(trade.realizedPnl)}</td>
            <td class="num">${formatR(rMultiple)}</td>
            <td>${escapeHtml(journal?.setupTag ?? '')}</td>
            <td>${escapeHtml(journal?.emotionTag ?? '')}</td>
            <td>${journal?.executionGrade ?? ''}</td>
            <td>${escapeHtml(tags.map((t) => '#' + t.name).join(' '))}</td>
            <td>${escapeHtml(journal?.preTradeThesis ?? '')}</td>
            <td>${escapeHtml(journal?.postTradeReview ?? '')}</td>
        </tr>`
    }).join('')

    const totalPnl = trades.reduce((sum, d) => sum + d.trade.realizedPnl, 0)

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<style>
    body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 10px; color: #1a1a1a; margin: 0; padding: 20px; }
    h1 { font-size: 18px; margin: 0 0 4px 0; }
    .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; text-align: left; padding: 4px 6px; font-size: 9px; text-transform: uppercase; border-bottom: 1px solid #ccc; }
    td { padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
    .num { text-align: right; font-family: 'Consolas', monospace; }
    .summary { margin-top: 16px; font-size: 11px; font-weight: bold; }
</style>
</head>
<body>
    <h1>Trading Journal Export</h1>
    <div class="meta">
        ${trades.length} trade · Dibuat ${formatDateTime(Date.now())}
    </div>
    <table>
        <thead>
            <tr>
                <th>Exit</th>
                <th>Symbol</th>
                <th>Arah</th>
                <th>P&L</th>
                <th>R</th>
                <th>Setup</th>
                <th>Emosi</th>
                <th>Grade</th>
                <th>Tags</th>
                <th>Tesis</th>
                <th>Review</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>
    <div class="summary">Total P&L: ${formatPnl(totalPnl)}</div>
</body>
</html>`
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

async function toPdf(trades: TradeDetail[], filePath: string): Promise<void> {
    const html = buildPdfHtml(trades)

    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true
        }
    })

    try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        const pdf = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            landscape: trades.length > 5
        })
        writeFileSync(filePath, pdf)
    } finally {
        win.destroy()
    }
}
