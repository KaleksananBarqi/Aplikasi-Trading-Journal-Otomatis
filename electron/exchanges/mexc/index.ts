import type {
    ExchangeAdapter,
    ExchangeCredentials,
    FetchOptions,
    RawClosedPosition,
    RawFill,
    RawFundingFee,
    SyncCursor
} from '../types'
import type { AccountBalance } from '../../../shared/domain'
import { ExchangeError, withRetry } from '../types'

import { mapClosedPosition, mapFill, mapFundingFee } from './mapper'

/**
 * Adapter MEXC Futures.
 *
 * ===========================================================================
 * KENAPA MEMAKAI ccxt UNTUK MEXC (diverifikasi 2026-09-17)
 * ===========================================================================
 *
 * Brief §4.1 meminta pengecekan apakah `ccxt` mendukung MEXC futures. Hasil
 * verifikasi terhadap ccxt 4.5.78:
 *
 * - `mexc` terdaftar dengan `certified: true` (tier kualitas tertinggi ccxt)
 * - `fetchMyTrades`          : native (YA)
 * - `fetchPositionsHistory`  : native (YA) -> endpoint `position_list_history_positions`
 * - `fetchFundingHistory`    : native (YA) -> endpoint `position_funding_records`
 * - `rateLimit`              : 50 ms
 *
 * Yang ccxt tangani untuk kita — dan bagian yang paling rawan salah kalau
 * ditulis manual: HMAC-SHA256 signing, manajemen timestamp, header, routing
 * endpoint, normalisasi simbol, dan rate limiting.
 *
 * Yang ccxt TIDAK tangani dengan benar: normalisasi FIELD posisi tertutup.
 * Lihat catatan panjang di `mapper.ts` — kita membaca `position.info` (raw),
 * bukan field ternormalisasi, karena ccxt memakai `holdVol` (= '0' saat closed)
 * dan field `margin_mode` yang tidak ada di response MEXC.
 *
 * ===========================================================================
 * GUARDRAIL BRIEF §12 — READ-ONLY
 * ===========================================================================
 *
 * Adapter ini HANYA memanggil method fetch. DILARANG memanggil `createOrder`,
 * `cancelOrder`, `editOrder`, `setLeverage`, `setMarginMode`, atau method
 * apa pun yang mengubah state di exchange. Kalau ada kebutuhan menambah method
 * semacam itu, HENTIKAN dan tanyakan ke user — itu di luar scope.
 */

/** Batas halaman untuk mencegah loop tak berujung saat backfill. */
const MAX_PAGES = 200

/** Ukuran halaman default yang diminta ke MEXC. */
const DEFAULT_PAGE_SIZE = 100

export class MexcAdapter implements ExchangeAdapter {
    readonly id = 'mexc' as const
    readonly displayName = 'MEXC Futures'

    /** Instance ccxt. Tipe `any` karena ccxt tidak menyediakan tipe per-exchange. */
    private client: unknown

    constructor(credentials: ExchangeCredentials) {
        this.client = createClient(credentials)
    }

    /**
     * Ambil posisi tertutup.
     *
     * Saat `cursor.lastExitTime` null (sync pertama), WAJIB memaginasi seluruh
     * histori — bukan hanya data baru. Ini yang memastikan posisi yang dibuka
     * manual di exchange sebelum app ini dipakai tetap ter-capture (brief §5.1).
     */
    async fetchClosedPositions(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawClosedPosition[]> {
        const pageSize = options.limit ?? DEFAULT_PAGE_SIZE
        const collected: RawClosedPosition[] = []
        // Backfill penuh hanya saat cursor kosong. Sync berikutnya cukup beberapa
        // halaman pertama karena data terbaru ada di halaman awal.
        const maxPages = cursor.lastExitTime === null ? MAX_PAGES : 3

        for (let page = 1; page <= maxPages; page += 1) {
            const positions = await this.fetchPositionPage(page, pageSize, options)

            // Halaman kosong = tidak ada lagi data.
            if (positions.length === 0) break

            let reachedCursor = false
            for (const position of positions) {
                const mapped = mapClosedPosition(position as Record<string, unknown>)
                if (mapped === null) continue

                // Berhenti saat mencapai data yang sudah kita punya.
                if (cursor.lastExitTime !== null && mapped.exitTime <= cursor.lastExitTime) {
                    reachedCursor = true
                    continue
                }
                collected.push(mapped)
            }

            // Kalau halaman ini sudah menyentuh cursor, halaman berikutnya pasti lebih tua.
            if (reachedCursor) break
            if (positions.length < pageSize) break
        }

        return collected
    }

    private async fetchPositionPage(
        page: number,
        pageSize: number,
        options: FetchOptions
    ): Promise<unknown[]> {
        const client = this.client as {
            fetchPositionsHistory: (
                symbols?: string[],
                since?: number,
                limit?: number,
                params?: Record<string, unknown>
            ) => Promise<unknown[]>
        }

        return withRetry(
            async () => {
                if (options.signal?.aborted) throw new Error('Dibatalkan')
                // Parameter paginasi MEXC: page_num + page_size.
                const result = await client.fetchPositionsHistory(undefined, undefined, undefined, {
                    page_num: page,
                    page_size: pageSize
                })
                return Array.isArray(result) ? result : []
            },
            'mexc',
            { signal: options.signal, onRetry: logRetry }
        )
    }

    async fetchFills(cursor: SyncCursor, options: FetchOptions = {}): Promise<RawFill[]> {
        const client = this.client as {
            fetchMyTrades: (
                symbol?: string,
                since?: number,
                limit?: number
            ) => Promise<unknown[]>
        }

        // Brief §4.3: incremental. `since` memakai cursor exitTime sebagai batas bawah.
        const since = cursor.lastExitTime ?? undefined

        const raw = await withRetry(
            async () => {
                if (options.signal?.aborted) throw new Error('Dibatalkan')
                const result = await client.fetchMyTrades(undefined, since, options.limit)
                return Array.isArray(result) ? result : []
            },
            'mexc',
            { signal: options.signal, onRetry: logRetry }
        )

        return raw
            .map((item) => mapFill(item as Record<string, unknown>))
            .filter((fill): fill is RawFill => fill !== null)
    }

    async fetchFundingFees(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawFundingFee[]> {
        const client = this.client as {
            fetchFundingHistory: (
                symbol?: string,
                since?: number,
                limit?: number,
                params?: Record<string, unknown>
            ) => Promise<unknown[]>
        }

        const pageSize = options.limit ?? DEFAULT_PAGE_SIZE
        // Funding bisa banyak dan tercatat per 8 jam. Backfill perlu lebih banyak halaman.
        const maxPages = cursor.lastExitTime === null ? MAX_PAGES : 3
        const collected: RawFundingFee[] = []

        for (let page = 1; page <= maxPages; page += 1) {
            const raw = await withRetry(
                async () => {
                    if (options.signal?.aborted) throw new Error('Dibatalkan')
                    const result = await client.fetchFundingHistory(undefined, undefined, undefined, {
                        page_num: page,
                        page_size: pageSize
                    })
                    return Array.isArray(result) ? result : []
                },
                'mexc',
                { signal: options.signal, onRetry: logRetry }
            )

            if (raw.length === 0) break

            for (const item of raw) {
                const mapped = mapFundingFee(item as Record<string, unknown>)
                if (mapped === null) continue
                // Funding tidak punya kaitan langsung ke exitTime, jadi cursor dipakai
                // sebagai batas bawah waktu pencatatan.
                if (cursor.lastExitTime !== null && mapped.chargedAt <= cursor.lastExitTime) continue
                collected.push(mapped)
            }

            if (raw.length < pageSize) break
        }

        return collected
    }

    /**
     * Ambil saldo akun futures MEXC saat ini (USDT/USDC).
     */
    async fetchBalances(options: FetchOptions = {}): Promise<AccountBalance[]> {
        const client = this.client as {
            fetchBalance: (params?: Record<string, unknown>) => Promise<Record<string, unknown>>
        }

        const raw = await withRetry(
            async () => {
                if (options.signal?.aborted) throw new Error('Dibatalkan')
                return await client.fetchBalance({ type: 'swap' })
            },
            'mexc',
            { signal: options.signal, onRetry: logRetry }
        )

        const totalMap = (raw.total as Record<string, unknown>) ?? {}
        const freeMap = (raw.free as Record<string, unknown>) ?? {}
        const now = Date.now()
        const result: AccountBalance[] = []

        // Prioritaskan USDT jika ada, atau aset lain yang bernilai > 0
        const assets = Object.keys(totalMap).filter((asset) => {
            const val = Number(totalMap[asset])
            return Number.isFinite(val) && (val > 0 || asset === 'USDT')
        })

        for (const asset of assets) {
            const total = Number(totalMap[asset]) || 0
            const available = Number(freeMap[asset]) || 0
            // Cari unrealized PnL dari info jika disediakan ccxt
            let unrealizedPnl = 0
            if (raw.info && typeof raw.info === 'object') {
                const info = raw.info as Record<string, unknown>
                const dataList = Array.isArray(info.data) ? info.data : []
                const found = dataList.find((item: Record<string, unknown>) => item.currency === asset)
                if (found && found.unrealisedPnl !== undefined) {
                    unrealizedPnl = Number(found.unrealisedPnl) || 0
                }
            }

            result.push({
                exchange: 'mexc',
                asset,
                total,
                available,
                unrealizedPnl,
                updatedAt: now
            })
        }

        // Jika result kosong (misal saldo baru 0), sediakan entri USDT default
        if (result.length === 0) {
            result.push({
                exchange: 'mexc',
                asset: 'USDT',
                total: 0,
                available: 0,
                unrealizedPnl: 0,
                updatedAt: now
            })
        }

        return result
    }
}


/** Log percobaan ulang, supaya backoff terlihat saat diagnosis. */
function logRetry(attempt: number, delay: number, error: ExchangeError): void {
    console.warn(
        `[mexc] percobaan ${attempt} gagal (${error.kind}): ${error.message}. ` +
        `Mencoba lagi dalam ${delay} ms.`
    )
}

/**
 * Buat instance ccxt untuk MEXC futures.
 *
 * `defaultType: 'swap'` WAJIB — default ccxt adalah `'spot'`, dan tanpa ini
 * semua panggilan akan mengarah ke pasar spot, bukan futures.
 */
function createClient(credentials: ExchangeCredentials): unknown {
    // Import dinamis via require agar ccxt (paket besar) tidak ikut ter-bundle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ccxt = require('ccxt') as Record<string, unknown>

    const MexcClass = ccxt['mexc'] as
        | (new (config: Record<string, unknown>) => unknown)
        | undefined

    if (!MexcClass) {
        throw new ExchangeError(
            'ccxt tidak mengenali exchange "mexc". Periksa versi ccxt yang terpasang.',
            'mexc',
            'unsupported',
            false
        )
    }

    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy

    return new MexcClass({
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        // WAJIB: tanpa ini ccxt mengarah ke spot, bukan futures.
        defaultType: 'swap',
        ...(proxy ? { proxy, httpsProxy: proxy, httpProxy: proxy } : {}),
        // Wajib untuk futures MEXC — menentukan sub-tipe kontrak.
        options: {
            defaultType: 'swap',
            // Batasi retry internal ccxt; kita punya backoff sendiri di withRetry
            // supaya log dan perilakunya seragam antar exchange.
            maxRetries: 0
        },
        // Hormati rate limit 50 ms yang ccxt ketahui untuk MEXC.
        enableRateLimit: true,
        timeout: 30_000
    })
}
