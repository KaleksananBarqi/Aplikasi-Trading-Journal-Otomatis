import type { RawClosedPosition, RawFill, RawFundingFee } from '../types'

/**
 * Mapper MEXC: response mentah ccxt -> bentuk ternormalisasi internal.
 *
 * ===========================================================================
 * KENAPA MAPPER INI MEMBACA `info` (RAW), BUKAN FIELD TERNORMALISASI ccxt
 * ===========================================================================
 *
 * Diverifikasi langsung ke source ccxt 4.5.78 (`dist/cjs/src/mexc.js`) pada
 * 2026-09-17. Ada TIGA masalah pada normalisasi ccxt untuk posisi TERTUTUP:
 *
 * 1. `contracts`  <- `safeString(position, 'holdVol')`  (baris ~5417)
 *    Untuk posisi yang sudah CLOSED, `holdVol` = '0'. Volume sebenarnya ada di
 *    `closeVol`. Memakai nilai ternormalisasi menghasilkan size = 0.
 *
 * 2. `marginType` <- `safeString(position, 'margin_mode')`  (baris ~5422)
 *    Field mentah MEXC bernama `openType`, BUKAN `margin_mode`. Karena
 *    `margin_mode` tidak pernah ada di response, hasilnya selalu undefined
 *    dan jatuh ke default 'cross'. Margin mode isolated jadi salah tercatat.
 *
 * 3. `exitPrice`  tidak ada di struktur posisi standar ccxt. Harus diambil dari
 *    `info.closeAvgPrice`.
 *
 * Kesimpulan: ccxt tetap dipakai untuk yang sulit dan rawan salah — HMAC signing,
 * manajemen kunci, rate limiting, routing endpoint, normalisasi simbol. Tapi
 * FIELD DATA dibaca dari `position.info`, yaitu response mentah yang lengkap.
 *
 * JANGAN "rapikan" kode ini dengan kembali ke field ternormalisasi ccxt tanpa
 * memverifikasi ulang ke source ccxt versi terbaru lebih dulu.
 */

/** MEXC memakai format `BTC_USDT` untuk id pasar, dan angka sebagai string. */
function toNumber(value: unknown): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = toNumber(value)
    return Number.isFinite(parsed) ? parsed : null
}

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text === '' ? null : text
}

/** `BTC_USDT` -> `BTCUSDT` (konvensi simbol yang dipakai aplikasi ini). */
function normalizeSymbol(rawSymbol: string): string {
    return rawSymbol.replace(/[_-]/g, '').replace(/\//g, '')
}

/**
 * `positionType`: '1' = long, '2' = short. Diverifikasi dari source ccxt
 * (baris ~5420-5421) dan contoh response resmi MEXC.
 */
function parseDirection(positionType: unknown): 'long' | 'short' {
    return String(positionType) === '1' ? 'long' : 'short'
}

/**
 * `openType`: '1' = isolated, '2' = cross.
 *
 * PERHATIAN: ccxt membaca field bernama `margin_mode` yang TIDAK ADA di response
 * MEXC (lihat catatan di atas). Kita membaca `openType` yang benar.
 */
function parseMarginMode(openType: unknown): 'isolated' | 'cross' | null {
    const value = String(openType)
    if (value === '1') return 'isolated'
    if (value === '2') return 'cross'
    return null
}

/**
 * Normalisasi satu posisi tertutup dari MEXC.
 *
 * Bentuk mentah (diverifikasi dari source ccxt, contoh response resmi):
 * ```
 * {
 *   positionId: '390281084',
 *   symbol: 'RVN_USDT',
 *   positionType: '1',        // 1=long, 2=short
 *   openType: '2',            // 1=isolated, 2=cross
 *   state: '3',               // 3 = closed
 *   holdVol: '0',             // KOSONG untuk posisi tertutup
 *   closeVol: '1141',         // volume sebenarnya
 *   openAvgPrice: '0.03491',  // entry
 *   closeAvgPrice: '0.03494', // exit
 *   realised: '0.1829',       // realized P&L
 *   leverage: '50',
 *   createTime: '1711512408000',
 *   updateTime: '1711512553000',
 *   fee: '0.1593977',
 *   closeProfitLoss: '0.3423',
 *   positionShowStatus: 'CLOSED'
 * }
 * ```
 */
export function mapClosedPosition(raw: Record<string, unknown>): RawClosedPosition | null {
    const positionId = toStringOrNull(raw['positionId'])
    const rawSymbol = toStringOrNull(raw['symbol'])
    const createTime = toNumberOrNull(raw['createTime'])
    const updateTime = toNumberOrNull(raw['updateTime'])

    // Tanpa id, simbol, atau waktu, baris ini tidak bisa dipakai sebagai trade —
    // dan tidak bisa di-dedup. Lebih baik dilewati daripada merusak data.
    if (positionId === null || rawSymbol === null || createTime === null || updateTime === null) {
        return null
    }

    // Volume: pakai closeVol, BUKAN holdVol (holdVol = '0' saat posisi tertutup).
    const closeVol = toNumber(raw['closeVol'])
    const holdVol = toNumber(raw['holdVol'])
    const size = closeVol > 0 ? closeVol : holdVol

    const leverage = toNumber(raw['leverage'])

    // Untuk fee, MEXC memberi `fee` (total) pada posisi tertutup. Kita tidak
    // memecah maker/taker di sini karena response posisi tidak memisahkannya —
    // pemecahan itu ada di level fills, bukan posisi.
    const feeTotal = toNumber(raw['fee'])

    // `closeProfitLoss` adalah P&L bersih termasuk fee; `realised` adalah P&L
    // kotor. Keputusan D3: pakai angka yang dilaporkan exchange sebagai source of
    // truth. `realised` dipilih karena itu field yang MEXC dokumentasikan sebagai
    // realized P&L posisi; fee disimpan terpisah agar bisa diaudit.
    const realizedPnl = toNumber(raw['realised'])

    return {
        externalId: positionId,
        symbol: normalizeSymbol(rawSymbol),
        direction: parseDirection(raw['positionType']),
        entryPrice: toNumber(raw['openAvgPrice']),
        exitPrice: toNumber(raw['closeAvgPrice']),
        entryTime: createTime,
        exitTime: updateTime,
        size,
        leverage,
        marginMode: parseMarginMode(raw['openType']),
        realizedPnl,
        // Fee dibagi dua secara konseptual (buka/tutup) TIDAK dilakukan di sini,
        // karena MEXC hanya memberi satu angka `fee` untuk seluruh posisi.
        // Membagi rata akan menciptakan angka yang tidak pernah dilaporkan exchange.
        feeOpen: 0,
        feeClose: feeTotal,
        // Funding fee diambil dari endpoint terpisah (fetchFundingHistory) dan
        // diakumulasi di sync engine, bukan di mapper ini.
        fundingFee: 0,
        raw
    }
}

/**
 * Normalisasi fill/trade individual.
 *
 * Diverifikasi dari source ccxt `fetchMyTrades` — strukturnya mengikuti
 * struktur trade terpadu ccxt (id, symbol, side, price, amount, fee, timestamp).
 * Field `info` tetap disimpan untuk audit.
 */
export function mapFill(raw: Record<string, unknown>): RawFill | null {
    const externalId =
        toStringOrNull(raw['id']) ?? toStringOrNull((raw['info'] as Record<string, unknown>)?.['id'])
    const rawSymbol =
        toStringOrNull(raw['symbol']) ?? toStringOrNull((raw['info'] as Record<string, unknown>)?.['symbol'])
    const timestamp = toNumberOrNull(raw['timestamp'])

    if (externalId === null || rawSymbol === null || timestamp === null) return null

    const feeData = raw['fee'] as Record<string, unknown> | undefined
    const fee = feeData ? toNumber(feeData['cost']) : 0
    const takerOrMaker = toStringOrNull(raw['takerOrMaker'])

    return {
        externalId,
        symbol: normalizeSymbol(rawSymbol),
        side: String(raw['side']) === 'buy' ? 'buy' : 'sell',
        price: toNumber(raw['price']),
        qty: toNumber(raw['amount']),
        fee,
        // null berarti exchange tidak memberi tahu; bukan berarti taker.
        isMaker: takerOrMaker === null ? null : takerOrMaker === 'maker',
        filledAt: timestamp
    }
}

/**
 * Normalisasi catatan funding.
 *
 * Diverifikasi dari source ccxt `fetchFundingHistory` (baris ~4482-4511):
 * ```
 * {
 *   id: 7423910,
 *   symbol: 'BTC_USDT',
 *   positionType: 1,
 *   positionValue: 29.30024,
 *   funding: 0.00076180624,   // nominal biaya
 *   rate: -0.000026,
 *   settleTime: 1643299200000
 * }
 * ```
 */
export function mapFundingFee(raw: Record<string, unknown>): RawFundingFee | null {
    const info = (raw['info'] ?? raw) as Record<string, unknown>

    const externalId = toStringOrNull(info['id']) ?? toStringOrNull(raw['id'])
    const rawSymbol = toStringOrNull(info['symbol']) ?? toStringOrNull(raw['symbol'])
    const settleTime = toNumberOrNull(info['settleTime']) ?? toNumberOrNull(raw['timestamp'])

    if (externalId === null || rawSymbol === null || settleTime === null) return null

    // `funding` bisa negatif (dibayar) atau positif (diterima). Tanda harus
    // dipertahankan — brief §5.1/§6 menyebut funding sebagai biaya riil, dan
    // menghilangkan tandanya akan membuat total biaya salah arah.
    const amount = toNumberOrNull(info['funding']) ?? toNumber(raw['amount'])

    return {
        externalId,
        symbol: normalizeSymbol(rawSymbol),
        amount,
        rate: toNumberOrNull(info['rate']) ?? toNumberOrNull(raw['rate']),
        chargedAt: settleTime
    }
}
