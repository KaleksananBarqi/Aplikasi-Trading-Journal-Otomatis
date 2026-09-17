/**
 * Formatter terpusat untuk angka dan waktu.
 *
 * ATURAN PENTING (plans/02-DATA-MODEL.md §2): pembulatan HANYA terjadi di sini.
 * Database menyimpan nilai apa adanya dari exchange. Kalau pembulatan disebar ke
 * seluruh komponen, dua tempat bisa menampilkan angka berbeda untuk trade yang sama.
 *
 * ATURAN WAKTU (brief §5.1): semua timestamp di DB adalah UTC (epoch ms).
 * Konversi ke timezone lokal HANYA terjadi di layer ini.
 */

// ---------------------------------------------------------------------------
// Waktu
// ---------------------------------------------------------------------------

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // Sengaja tidak menyetel timeZone — memakai timezone lokal user.
    // Data disimpan UTC, ditampilkan lokal (brief §5.1).
    timeZoneName: 'short'
})

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
})

/** Epoch ms UTC -> string tanggal+waktu lokal, mis. "17 Sep 2026, 13:24 WIB". */
export function formatDateTime(epochMs: number): string {
    return dateTimeFormatter.format(new Date(epochMs))
}

/** Epoch ms UTC -> string tanggal lokal saja. */
export function formatDate(epochMs: number): string {
    return dateFormatter.format(new Date(epochMs))
}

/** Epoch ms UTC -> string jam lokal saja. */
export function formatTime(epochMs: number): string {
    return timeFormatter.format(new Date(epochMs))
}

/** Epoch ms UTC -> nilai untuk `<input type="datetime-local">` (waktu LOKAL). */
export function toDateTimeLocalInput(epochMs: number): string {
    const date = new Date(epochMs)
    // Koreksi offset timezone: input datetime-local menginginkan waktu lokal
    // tanpa info zona, sedangkan toISOString() selalu menghasilkan UTC.
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
}

/**
 * Nilai `<input type="datetime-local">` -> epoch ms UTC.
 * Mengembalikan null bila input kosong/tidak valid.
 */
export function fromDateTimeLocalInput(value: string): number | null {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.getTime()
}

/** Durasi posisi terbuka, dalam format ringkas mis. "3h 24m". */
export function formatDuration(fromMs: number, toMs: number): string {
    const totalMinutes = Math.max(0, Math.round((toMs - fromMs) / 60_000))
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
}

// ---------------------------------------------------------------------------
// Angka
// ---------------------------------------------------------------------------

/**
 * Format angka umum dengan jumlah desimal terkendali.
 * Harga crypto bisa butuh 2 desimal (BTC) atau 6+ (koin murah), jadi
 * jumlah desimal tidak boleh dipaksa seragam.
 */
export function formatNumber(value: number, decimals = 2): string {
    if (!Number.isFinite(value)) return '—'
    return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    })
}

/** Format harga: hapus nol ekor yang tidak informatif, tapi jaga presisi. */
export function formatPrice(value: number): string {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    // Koin dengan harga sangat kecil butuh lebih banyak desimal agar tidak
    // tampil sebagai "0.00" (informasi hilang sepenuhnya).
    const decimals = abs === 0 ? 2 : abs < 0.01 ? 8 : abs < 1 ? 6 : abs < 100 ? 4 : 2
    return formatNumber(value, decimals)
}

/** P&L dengan tanda eksplisit. Tanda + penting: profit harus terlihat jelas. */
export function formatPnl(value: number, decimals = 2): string {
    if (!Number.isFinite(value)) return '—'
    const formatted = formatNumber(Math.abs(value), decimals)
    if (value > 0) return `+${formatted}`
    if (value < 0) return `-${formatted}`
    return formatted
}

/** Persentase dengan tanda, mis. "+12.40%". */
export function formatPercent(value: number, decimals = 2): string {
    if (!Number.isFinite(value)) return '—'
    const formatted = formatNumber(Math.abs(value), decimals)
    if (value > 0) return `+${formatted}%`
    if (value < 0) return `-${formatted}%`
    return `${formatted}%`
}

/**
 * Format R-multiple.
 * NULL -> "—" (bukan "0.00R"), karena R null berarti stop loss tidak diisi,
 * bukan berarti hasilnya nol (brief §5.2).
 */
export function formatR(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—'
    const formatted = Math.abs(value).toFixed(2)
    if (value > 0) return `+${formatted}R`
    if (value < 0) return `-${formatted}R`
    return `${formatted}R`
}

/**
 * Format nilai tak terhingga untuk profit factor.
 * Brief §6 meminta ini ditampilkan sebagai ∞, bukan angka besar buatan.
 */
export function formatRatio(value: number): string {
    if (!Number.isFinite(value)) return '∞'
    return value.toFixed(2)
}

/** Kelas warna berdasarkan arah nilai. Nol = netral (bukan profit/loss). */
export function pnlColorClass(value: number): string {
    if (value > 0) return 'text-profit'
    if (value < 0) return 'text-loss'
    return 'text-flat'
}

/** Kelas warna untuk R-multiple. NULL = netral, bukan loss. */
export function rColorClass(value: number | null): string {
    if (value === null || value === 0) return 'text-flat'
    return value > 0 ? 'text-profit' : 'text-loss'
}
