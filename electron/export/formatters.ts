/**
 * Formatter untuk main process (ekspor).
 *
 * Duplikasi ringan dari `src/lib/format.ts` — TIDAK boleh di-import dari sana
 * karena `src/` adalah kode renderer yang ter-bundle Vite, sedangkan `electron/`
 * adalah kode main process yang ter-bundle electron-vite secara terpisah.
 * Meng-import lintas boundary itu akan break build.
 */

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
})

/** Epoch ms UTC -> string tanggal+waktu lokal. */
export function formatDateTime(epochMs: number): string {
    return dateTimeFormatter.format(new Date(epochMs))
}

/** P&L dengan tanda eksplisit. */
export function formatPnl(value: number, decimals = 2): string {
    if (!Number.isFinite(value)) return '—'
    const formatted = Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    })
    if (value > 0) return `+${formatted}`
    if (value < 0) return `-${formatted}`
    return formatted
}

/** Format R-multiple. NULL -> "—". */
export function formatR(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—'
    const formatted = Math.abs(value).toFixed(2)
    if (value > 0) return `+${formatted}R`
    if (value < 0) return `-${formatted}R`
    return `${formatted}R`
}
