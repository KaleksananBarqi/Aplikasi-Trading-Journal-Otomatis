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
import { withRetry } from '../types'

import { BitunixClient, type BitunixPagedData } from './client'
import { mapClosedPosition, mapFill, mapFundingFee } from './mapper'

/**
 * Adapter Bitunix Futures.
 *
 * ===========================================================================
 * KENAPA IMPLEMENTASI MANUAL (brief §4.2)
 * ===========================================================================
 *
 * Diverifikasi empiris: ccxt 4.5.78 mendukung 104 exchange dan **Bitunix tidak
 * termasuk**. Ini mengonfirmasi prediksi brief §4.2.
 *
 * Brief §4.2 juga melarang library unofficial pihak ketiga yang tidak terawat.
 * Karena itu adapter ini berbicara langsung ke REST resmi Bitunix via
 * `BitunixClient` (di `client.ts`), yang menangani signing sesuai SDK resmi.
 *
 * ===========================================================================
 * KONTRAK YANG HARUS DIPERTAHANKAN
 * ===========================================================================
 *
 * Adapter ini TIDAK BOLEH mengubah `electron/sync/engine.ts`. Kalau engine
 * butuh diubah untuk mengakomodasi Bitunix, berarti abstraksi `ExchangeAdapter`
 * kurang tepat — laporkan, jangan tambal.
 *
 * ===========================================================================
 * GUARDRAIL BRIEF §12 — READ-ONLY
 * ===========================================================================
 *
 * HANYA method GET pembacaan. DILARANG memanggil endpoint place_order,
 * cancel_orders, adjust_margin, atau apa pun yang mengubah state exchange.
 * `BitunixClient` sengaja hanya mengekspos `get()` supaya pelanggaran ini
 * tidak mungkin terjadi secara tidak sengaja.
 */

/** Ukuran halaman default. */
const DEFAULT_PAGE_SIZE = 100

/** Batas halaman untuk mencegah loop tak berujung saat backfill. */
const MAX_PAGES = 200

/** Path endpoint — diverifikasi dari SDK resmi `openApiHttpFuturePrivate.js`. */
const ENDPOINTS = {
    historyPositions: '/api/v1/futures/position/get_history_positions',
    historyOrders: '/api/v1/futures/trade/get_history_orders'
} as const

export class BitunixAdapter implements ExchangeAdapter {
    readonly id = 'bitunix' as const
    readonly displayName = 'Bitunix Futures'

    private readonly client: BitunixClient

    constructor(credentials: ExchangeCredentials, options: { onDebug?: (message: string) => void } = {}) {
        this.client = new BitunixClient(credentials, { onDebug: options.onDebug })
    }

    /**
     * Ambil posisi tertutup.
     *
     * Saat cursor kosong (sync pertama), memaginasi seluruh histori — supaya
     * posisi yang dibuka sebelum app ini dipakai tetap ter-capture (brief §5.1).
     */
    async fetchClosedPositions(
        cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawClosedPosition[]> {
        const pageSize = options.limit ?? DEFAULT_PAGE_SIZE
        // Backfill penuh hanya saat cursor kosong. Sync berikutnya cukup beberapa
        // halaman awal, karena data terbaru ada di halaman depan.
        const maxPages = cursor.lastExitTime === null ? MAX_PAGES : 3
        const collected: RawClosedPosition[] = []

        for (let page = 1; page <= maxPages; page += 1) {
            const items = await this.fetchPositionPage(page, pageSize, options)

            if (items.length === 0) break

            let reachedCursor = false
            for (const item of items) {
                const mapped = mapClosedPosition(item)
                if (mapped === null) continue

                if (cursor.lastExitTime !== null && mapped.exitTime <= cursor.lastExitTime) {
                    reachedCursor = true
                    continue
                }
                collected.push(mapped)
            }

            if (reachedCursor) break
            if (items.length < pageSize) break
        }

        return collected
    }

    private async fetchPositionPage(
        page: number,
        pageSize: number,
        options: FetchOptions
    ): Promise<Record<string, unknown>[]> {
        return withRetry(
            async () => {
                if (options.signal?.aborted) throw new Error('Dibatalkan')

                // Bitunix memakai pageSize + page (dikonfirmasi dari pola SDK:
                // parameter string sederhana, diurutkan sebelum ditandatangani).
                const data = await this.client.get<BitunixPagedData<Record<string, unknown>>>(
                    ENDPOINTS.historyPositions,
                    { page, pageSize },
                    options.signal
                )

                return extractList(data)
            },
            'bitunix',
            { signal: options.signal, onRetry: logRetry }
        )
    }

    async fetchFills(cursor: SyncCursor, options: FetchOptions = {}): Promise<RawFill[]> {
        const pageSize = options.limit ?? DEFAULT_PAGE_SIZE
        const maxPages = cursor.lastExitTime === null ? MAX_PAGES : 3
        const since = cursor.lastExitTime ?? undefined
        const collected: RawFill[] = []

        for (let page = 1; page <= maxPages; page += 1) {
            const items = await withRetry(
                async () => {
                    if (options.signal?.aborted) throw new Error('Dibatalkan')

                    const params: Record<string, unknown> = { page, pageSize }
                    // Bitunix memakai `startTime` untuk batas bawah waktu pada beberapa
                    // endpoint riwayat. Dikirim hanya bila kita sudah punya cursor.
                    if (since !== undefined) params['startTime'] = since

                    const data = await this.client.get<BitunixPagedData<Record<string, unknown>>>(
                        ENDPOINTS.historyOrders,
                        params,
                        options.signal
                    )
                    return extractList(data)
                },
                'bitunix',
                { signal: options.signal, onRetry: logRetry }
            )

            if (items.length === 0) break

            for (const item of items) {
                const mapped = mapFill(item)
                if (mapped === null) continue
                if (since !== undefined && mapped.filledAt <= since) continue
                collected.push(mapped)
            }

            if (items.length < pageSize) break
        }

        return collected
    }

    /**
     * Funding fee.
     *
     * ===========================================================================
     * KETERBATASAN YANG DILAPORKAN, BUKAN DISEMBUNYIKAN (brief §12)
     * ===========================================================================
     *
     * Dari daftar endpoint resmi Bitunix yang terverifikasi, TIDAK ADA endpoint
     * riwayat biaya funding per akun. Yang tersedia hanya:
     *   /api/v1/futures/market/get_funding_rate_history
     * yaitu riwayat RATE funding publik per simbol — bukan biaya yang benar-benar
     * dibayar akun user.
     *
     * Mengalikan rate dengan nilai posisi akan menghasilkan angka KARANGAN yang
     * terlihat seperti data exchange. Itu lebih buruk daripada tidak ada data:
     * user akan memakai angka palsu untuk keputusan trading. Karena itu method ini
     * mengembalikan array kosong.
     *
     * Alternatifnya: partial close/open dalam satu interval funding membuat
     * perhitungan dari rate saja TIDAK PERNAH akurat, bahkan secara teori.
     *
     * Konsekuensi yang harus terlihat di UI: kolom funding fee untuk trade
     * Bitunix akan bernilai 0 hingga Bitunix menyediakan endpoint yang sesuai.
     */
    async fetchFundingFees(
        _cursor: SyncCursor,
        options: FetchOptions = {}
    ): Promise<RawFundingFee[]> {
        if (options.signal?.aborted) throw new Error('Dibatalkan')

        // Sengaja diam, bukan throw: kekosongan funding bukan kegagalan sync.
        // Status sync tetap `ok`, dan keterbatasan ini dinyatakan di UI Settings.
        return []
    }

    /**
     * Ambil saldo akun futures Bitunix (USDT).
     * Endpoint resmi: /api/v1/futures/account
     */
    async fetchBalances(options: FetchOptions = {}): Promise<AccountBalance[]> {
        return withRetry(
            async () => {
                if (options.signal?.aborted) throw new Error('Dibatalkan')

                let data: unknown
                try {
                    data = await this.client.get<unknown>(
                        '/api/v1/futures/account',
                        {},
                        options.signal
                    )
                } catch {
                    // Fallback alternatif endpoint akun futures
                    try {
                        data = await this.client.get<unknown>(
                            '/api/v1/futures/account/get_account',
                            {},
                            options.signal
                        )
                    } catch {
                        data = null
                    }
                }

                const now = Date.now()
                const result: AccountBalance[] = []

                if (data && typeof data === 'object') {
                    const obj = data as Record<string, unknown>
                    // Kasus 1: data adalah objek akun tunggal (USDT)
                    const total = Number(obj.marginBalance ?? obj.equity ?? obj.totalBalance ?? obj.balance ?? 0)
                    const available = Number(obj.availableBalance ?? obj.free ?? obj.available ?? total)
                    const unrealizedPnl = Number(obj.unrealizedProfitLoss ?? obj.unrealizedPnl ?? obj.upl ?? 0)
                    const asset = String(obj.asset ?? obj.currency ?? 'USDT')

                    if (Number.isFinite(total)) {
                        result.push({
                            exchange: 'bitunix',
                            asset,
                            total,
                            available,
                            unrealizedPnl,
                            updatedAt: now
                        })
                    }

                    // Kasus 2: data memiliki list aset di dalamnya
                    const list = extractList(data)
                    for (const item of list) {
                        const itemAsset = String(item.asset ?? item.currency ?? item.coin ?? 'USDT')
                        const itemTotal = Number(item.marginBalance ?? item.equity ?? item.totalBalance ?? item.balance ?? 0)
                        const itemAvailable = Number(item.availableBalance ?? item.free ?? item.available ?? itemTotal)
                        const itemUnrealized = Number(item.unrealizedProfitLoss ?? item.unrealizedPnl ?? 0)

                        if (!result.some((r) => r.asset === itemAsset)) {
                            result.push({
                                exchange: 'bitunix',
                                asset: itemAsset,
                                total: itemTotal,
                                available: itemAvailable,
                                unrealizedPnl: itemUnrealized,
                                updatedAt: now
                            })
                        }
                    }
                }

                if (result.length === 0) {
                    result.push({
                        exchange: 'bitunix',
                        asset: 'USDT',
                        total: 0,
                        available: 0,
                        unrealizedPnl: 0,
                        updatedAt: now
                    })
                }

                return result
            },
            'bitunix',
            { signal: options.signal, onRetry: logRetry }
        )
    }
}


/** Log percobaan ulang, supaya backoff terlihat saat diagnosis. */
function logRetry(attempt: number, delay: number, error: Error): void {
    console.warn(
        `[bitunix] percobaan ${attempt} gagal: ${error.message}. Mencoba lagi dalam ${delay} ms.`
    )
}

/**
 * Ambil array dari response yang bisa berbentuk beberapa variasi.
 *
 * Bitunix membungkus list dalam `data.list` (dikonfirmasi dari SDK resmi:
 * handler mengembalikan `data`, dan operasi list memakai `.list`). Tapi
 * beberapa endpoint bisa mengembalikan array langsung. Fungsi ini menangani
 * keduanya supaya mapper tidak perlu tahu bentuk amplopnya.
 */
function extractList(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>
        const list = obj.positionList ?? obj.orderList ?? obj.list ?? obj.data
        if (Array.isArray(list)) return list as Record<string, unknown>[]
    }
    return []
}

/** Diekspor untuk pengujian tanda tangan tanpa memanggil jaringan. */
export { mapClosedPosition, mapFill, mapFundingFee }
