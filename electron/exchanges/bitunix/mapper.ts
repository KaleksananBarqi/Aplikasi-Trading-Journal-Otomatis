import type { RawClosedPosition, RawFill, RawFundingFee } from '../types'

/**
 * Mapper Bitunix: response mentah REST -> bentuk ternormalisasi internal.
 *
 * ===========================================================================
 * STATUS VERIFIKASI NAMA FIELD — BACA SEBELUM MENGUBAH
 * ===========================================================================
 *
 * Yang SUDAH terverifikasi dari sumber resmi (2026-09-17):
 * - Base URL, header, algoritma signing  -> `client.ts`
 * - Path endpoint:
 *     posisi tertutup : /api/v1/futures/position/get_history_positions
 *     order historis  : /api/v1/futures/trade/get_history_orders
 *     akun            : /api/v1/futures/account
 * - Bentuk response amplop: `{ code, msg, data }` dengan `code === 0` untuk sukses
 * - Response list dibungkus lagi: `data = { list: [...], total: n }`
 *
 * Yang BELUM terverifikasi: NAMA FIELD DI DALAM setiap item.
 * Dokumentasi resmi Bitunix tidak menampilkan contoh response lengkap di
 * halaman SDK yang bisa diakses dari lingkungan ini. Karena itu:
 *
 *   1. Mapper ini membaca BEBERAPA KANDIDAT nama field (mis. `qty` atau
 *      `quantity`), bukan satu nama yang diasumsikan benar.
 *   2. Setiap field yang gagal dibaca akan terlihat di verifikasi Fase 5
 *      sebagai nilai 0 / waktu yang aneh — bukan gagal diam-diam.
 *   3. `raw` SELALU disimpan, sehingga saat verifikasi dengan akun nyata,
 *      nama field yang benar bisa langsung dibaca dari DB dan mapper
 *      diperbaiki sekali.
 *
 * >>> TINDAKAN WAJIB DI FASE 5: jalankan sync dengan akun Bitunix nyata,
 * >>> periksa kolom `raw_payload` di tabel `trades`, lalu sempitkan kandidat
 * >>> di bawah menjadi nama field tunggal yang benar.
 *
 * JANGAN menghapus dukungan multi-kandidat sebelum verifikasi akun nyata
 * selesai — menghapusnya berdasarkan tebakan akan lebih buruk daripada
 * menyimpannya.
 */

/** Ambil nilai pertama yang ada dan valid dari daftar kandidat nama field. */
function pick(source: Record<string, unknown>, candidates: string[]): unknown {
    for (const key of candidates) {
        const value = source[key]
        if (value !== undefined && value !== null && value !== '') return value
    }
    return undefined
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function toNumberOrNull(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null
    const parsed = toNumber(value)
    return Number.isFinite(parsed) ? parsed : null
}

function toStringOrNull(value: unknown): string | null {
    if (value === undefined || value === null) return null
    const text = String(value).trim()
    return text === '' ? null : text
}

/**
 * Konversi waktu ke epoch ms.
 *
 * Bitunix mengirim timestamp sebagai string milidetik (konsisten dengan header
 * `timestamp` di dokumentasi resmi). Tapi kalau suatu saat dikirim sebagai
 * DETIK, angkanya akan jauh lebih kecil — deteksi itu daripada menghasilkan
 * trade dari tahun 1970 yang membingungkan.
 */
function toEpochMs(value: unknown): number | null {
    const numeric = toNumberOrNull(value)
    if (numeric === null || numeric <= 0) return null
    // Timestamp dalam detik (< 10^11) dikonversi ke milidetik.
    // 10^11 ms = tahun 1973; 10^11 detik = tahun 5138. Batas ini aman.
    return numeric < 1e11 ? Math.round(numeric * 1000) : Math.round(numeric)
}

/** `BTCUSDT` / `BTC-USDT` / `BTC_USDT` -> `BTCUSDT`. */
function normalizeSymbol(raw: string): string {
    return raw.replace(/[_-]/g, '').replace(/\//g, '')
}

/**
 * Normalisasi arah posisi.
 *
 * Bitunix memakai `side` dengan nilai LONG/SHORT (huruf besar) pada posisi,
 * berbeda dari `side` BUY/SELL pada order. Dicek case-insensitive supaya
 * variasi kapitalisasi tidak menghasilkan arah yang salah.
 */
function parseDirection(value: unknown): 'long' | 'short' {
    const text = String(value ?? '').toUpperCase()
    return text === 'SHORT' ? 'short' : 'long'
}

/**
 * Normalisasi margin mode.
 *
 * Nilai Bitunix: ISOLATED / CROSS. Mengembalikan null bila tidak dikenali —
 * lebih baik kosong daripada salah menebak, karena margin mode memengaruhi
 * cara membaca risiko posisi.
 */
function parseMarginMode(value: unknown): 'isolated' | 'cross' | null {
    const text = String(value ?? '').toUpperCase()
    if (text.includes('ISOLATED')) return 'isolated'
    if (text.includes('CROSS')) return 'cross'
    return null
}

/**
 * Normalisasi satu posisi tertutup Bitunix.
 *
 * Kandidat nama field didaftar dari konvensi umum API derivatif dan
 * penamaan yang muncul di dokumentasi Bitunix. Lihat catatan status
 * verifikasi di atas file ini.
 */
export function mapClosedPosition(raw: Record<string, unknown>): RawClosedPosition | null {
    const externalId = toStringOrNull(
        pick(raw, ['positionId', 'position_id', 'id', 'positionNo'])
    )
    const rawSymbol = toStringOrNull(pick(raw, ['symbol', 'tradingPair', 'pair']))

    const entryTime = toEpochMs(pick(raw, ['ctime', 'createTime', 'openTime', 'createdTime', 'entryTime']))
    const exitTime = toEpochMs(pick(raw, ['mtime', 'updateTime', 'closeTime', 'updatedTime', 'exitTime']))

    // Tanpa id, simbol, dan waktu, baris ini tidak bisa dipakai sebagai trade
    // maupun di-dedup. Dilewati, bukan disimpan sebagai data rusak.
    if (externalId === null || rawSymbol === null || entryTime === null || exitTime === null) {
        return null
    }

    return {
        externalId,
        symbol: normalizeSymbol(rawSymbol),
        direction: parseDirection(pick(raw, ['side', 'positionSide', 'direction', 'posSide'])),
        entryPrice: toNumber(pick(raw, ['entryPrice', 'openAvgPrice', 'avgOpenPrice', 'entryAvgPrice'])),
        exitPrice: toNumber(pick(raw, ['closePrice', 'closeAvgPrice', 'avgClosePrice', 'exitAvgPrice'])),
        entryTime,
        exitTime,
        size: toNumber(
            pick(raw, ['qty', 'quantity', 'closeQty', 'size', 'closeVolume', 'volume', 'qtyClosed'])
        ),
        leverage: toNumber(pick(raw, ['leverage', 'lever'])) || 1,
        marginMode: parseMarginMode(pick(raw, ['marginMode', 'marginType', 'margin_mode'])),
        // `realizedPNL` (huruf besar semua) muncul di contoh dokumentasi Bitunix —
        // sertakan sebagai kandidat pertama.
        realizedPnl: toNumber(
            pick(raw, ['realizedPNL', 'realizedPnl', 'realized_pnl', 'pnl', 'profit', 'closeProfit'])
        ),
        // Bitunix melaporkan fee sebagai satu angka per posisi; tidak dipisah
        // buka/tutup. Dibagi rata TIDAK dilakukan — itu menciptakan angka yang
        // tidak pernah dilaporkan exchange.
        feeOpen: 0,
        feeClose: toNumber(pick(raw, ['fee', 'totalFee', 'closeFee', 'commission'])),
        // Funding diambil dari endpoint terpisah dan diakumulasi di sync engine.
        fundingFee: 0,
        raw
    }
}

/** Normalisasi fill / history trade individual. */
export function mapFill(raw: Record<string, unknown>): RawFill | null {
    const externalId = toStringOrNull(pick(raw, ['id', 'tradeId', 'orderId', 'tid']))
    const rawSymbol = toStringOrNull(pick(raw, ['symbol', 'tradingPair', 'pair']))
    const filledAt = toEpochMs(pick(raw, ['ctime', 'time', 'createTime', 'timestamp', 'filledTime']))

    if (externalId === null || rawSymbol === null || filledAt === null) return null

    const sideText = String(pick(raw, ['side', 'tradeSide', 'direction']) ?? '').toUpperCase()

    return {
        externalId,
        symbol: normalizeSymbol(rawSymbol),
        // Bitunix memakai BUY/SELL untuk eksekusi.
        side: sideText.includes('SELL') ? 'sell' : 'buy',
        price: toNumber(pick(raw, ['price', 'fillPrice', 'avgPrice', 'filledPrice'])),
        qty: toNumber(pick(raw, ['qty', 'quantity', 'amount', 'size', 'filledQty'])),
        fee: toNumber(pick(raw, ['fee', 'commission', 'feeAmount'])),
        // null (bukan false) bila exchange tidak memberi tahu.
        isMaker: parseIsMaker(pick(raw, ['isMaker', 'maker', 'liquidity', 'role'])),
        filledAt
    }
}

function parseIsMaker(value: unknown): boolean | null {
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'boolean') return value
    const text = String(value).toUpperCase()
    if (text === 'MAKER' || text === 'TRUE' || text === '1') return true
    if (text === 'TAKER' || text === 'FALSE' || text === '0') return false
    return null
}

/**
 * Normalisasi catatan funding Bitunix.
 *
 * CATATAN: Bitunix tidak mengekspos endpoint riwayat funding yang terpisah di
 * daftar endpoint resmi yang terverifikasi. Yang tersedia adalah:
 * - `market/get_funding_rate_history` -> RIWAYAT RATE (publik, per simbol),
 *   BUKAN biaya yang dibayar akun user.
 *
 * Jadi funding fee per akun kemungkinan TIDAK tersedia lewat endpoint publik
 * yang terverifikasi. Fungsi ini tetap ada supaya adapter bisa mengembalikan
 * array kosong secara sah, dan supaya kalau kelak Bitunix menambah
 * endpoint-nya, hanya fungsi ini yang perlu disesuaikan.
 *
 * TIDAK diisi dengan estimasi dari funding rate x nilai posisi: itu akan
 * menghasilkan angka karangan yang terlihat seperti data exchange.
 */
export function mapFundingFee(raw: Record<string, unknown>): RawFundingFee | null {
    const externalId = toStringOrNull(pick(raw, ['id', 'fundingId', 'billId']))
    const rawSymbol = toStringOrNull(pick(raw, ['symbol', 'tradingPair', 'pair']))
    const chargedAt = toEpochMs(pick(raw, ['ctime', 'time', 'settleTime', 'timestamp']))

    if (externalId === null || rawSymbol === null || chargedAt === null) return null

    return {
        externalId,
        symbol: normalizeSymbol(rawSymbol),
        // Tanda dipertahankan: negatif = dibayar, positif = diterima.
        amount: toNumber(pick(raw, ['amount', 'funding', 'fundingFee', 'fee'])),
        rate: toNumberOrNull(pick(raw, ['rate', 'fundingRate'])),
        chargedAt
    }
}
