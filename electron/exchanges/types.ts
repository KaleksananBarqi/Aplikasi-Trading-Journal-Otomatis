/**
 * Kontrak adapter exchange.
 *
 * Ini yang memungkinkan Fase 3 (Bitunix) tidak mengubah sync engine sama sekali.
 * Lihat plans/01-ARCHITECTURE.md §4.
 *
 * PENTING: tipe di file ini adalah BENTUK TERNORMALISASI INTERNAL kita.
 * Bentuk response mentah MEXC/Bitunix bisa berbeda total — tugas `mapper.ts`
 * yang menerjemahkan. Jangan pernah membocorkan response mentah exchange ke
 * lapisan DB.
 */

export type SupportedExchange = 'mexc' | 'bitunix'

/** Satu posisi tertutup yang sudah dinormalisasi. */
export interface RawClosedPosition {
    /** ID posisi dari exchange — kunci dedup idempotent. */
    externalId: string
    symbol: string
    direction: 'long' | 'short'
    entryPrice: number
    exitPrice: number
    /** Epoch ms UTC */
    entryTime: number
    /** Epoch ms UTC */
    exitTime: number
    /** Ukuran posisi dalam base asset. */
    size: number
    leverage: number
    marginMode: 'isolated' | 'cross' | null
    realizedPnl: number
    feeOpen: number
    feeClose: number
    fundingFee: number
    /**
     * Response mentah dari exchange, disimpan untuk audit.
     * Berguna saat ada selisih angka: bisa dibandingkan dengan sumber aslinya.
     */
    raw?: unknown
}

/** Satu fill (eksekusi) individual. */
export interface RawFill {
    externalId: string
    symbol: string
    side: 'buy' | 'sell'
    price: number
    qty: number
    fee: number
    isMaker: boolean | null
    filledAt: number
}

/** Satu catatan biaya funding. */
export interface RawFundingFee {
    externalId: string
    symbol: string
    amount: number
    rate: number | null
    chargedAt: number
}

/** Cursor incremental per exchange (brief §4.3). */
export interface SyncCursor {
    lastExitTime: number | null
    lastExternalId: string | null
}

/** Kredensial exchange. Tidak pernah disimpan plaintext (keputusan D2). */
export interface ExchangeCredentials {
    apiKey: string
    apiSecret: string
}

export interface FetchOptions {
    /** Batas jumlah data per panggilan. */
    limit?: number
    /** Batas bawah waktu (epoch ms UTC). */
    since?: number
    signal?: AbortSignal
}

import type { AccountBalance } from '../../shared/domain'

export interface ExchangeAdapter {
    readonly id: SupportedExchange
    /** Nama tampilan untuk UI. */
    readonly displayName: string

    /**
     * Ambil posisi tertutup.
     *
     * Saat `cursor.lastExitTime` null (sync pertama), adapter WAJIB menarik seluruh
     * histori — bukan hanya data baru. Ini supaya posisi yang dibuka manual di
     * exchange sebelum app ini dipakai tetap ter-capture (brief §5.1).
     */
    fetchClosedPositions(cursor: SyncCursor, options?: FetchOptions): Promise<RawClosedPosition[]>

    fetchFills(cursor: SyncCursor, options?: FetchOptions): Promise<RawFill[]>

    fetchFundingFees(cursor: SyncCursor, options?: FetchOptions): Promise<RawFundingFee[]>

    /**
     * Ambil saldo akun futures saat ini (misal USDT).
     */
    fetchBalances?(options?: FetchOptions): Promise<AccountBalance[]>
}


/** Error yang bisa dibedakan pemanggil — terutama untuk backoff vs abort. */
export class ExchangeError extends Error {
    constructor(
        message: string,
        readonly exchange: SupportedExchange,
        readonly kind: 'auth' | 'rate_limit' | 'network' | 'unsupported' | 'unknown',
        readonly retryable: boolean,
        readonly cause?: unknown
    ) {
        super(message)
        this.name = 'ExchangeError'
    }
}

/** Klasifikasi error agar sync engine tahu harus backoff atau berhenti. */
export function classifyError(
    error: unknown,
    exchange: SupportedExchange
): ExchangeError {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()

    // Rate limit: harus backoff, bukan abort.
    if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
        return new ExchangeError(message, exchange, 'rate_limit', true, error)
    }

    // Auth: tidak ada gunanya retry, user harus perbaiki kredensial.
    if (
        lower.includes('invalid api') ||
        lower.includes('signature') ||
        lower.includes('unauthorized') ||
        lower.includes('apikey') ||
        lower.includes('401')
    ) {
        return new ExchangeError(message, exchange, 'auth', false, error)
    }

    // Network: retry masuk akal.
    if (
        lower.includes('timeout') ||
        lower.includes('econnreset') ||
        lower.includes('enotfound') ||
        lower.includes('network') ||
        lower.includes('socket')
    ) {
        return new ExchangeError(message, exchange, 'network', true, error)
    }

    return new ExchangeError(message, exchange, 'unknown', false, error)
}

/** Utilitas backoff eksponensial dengan jitter. */
export function backoffDelayMs(attempt: number, baseMs = 500, maxMs = 30_000): number {
    const exponential = Math.min(baseMs * 2 ** attempt, maxMs)
    // Jitter mencegah thundering herd saat beberapa retry terjadi bersamaan.
    const jitter = Math.random() * 0.3 * exponential
    return Math.round(exponential + jitter)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Dibatalkan'))
            return
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)

        function onAbort(): void {
            clearTimeout(timer)
            reject(new Error('Dibatalkan'))
        }

        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

/**
 * Jalankan operasi dengan retry + backoff eksponensial.
 *
 * Hanya error yang `retryable` yang diulang. Error auth langsung dilempar —
 * mengulanginya hanya memperlambat tanpa kemungkinan berhasil.
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    exchange: SupportedExchange,
    options: { maxAttempts?: number; signal?: AbortSignal; onRetry?: (attempt: number, delay: number, error: ExchangeError) => void } = {}
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 5
    let lastError: ExchangeError | null = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await operation()
        } catch (error) {
            const classified = classifyError(error, exchange)
            lastError = classified

            if (!classified.retryable || attempt === maxAttempts - 1) {
                throw classified
            }

            const delay = backoffDelayMs(attempt)
            options.onRetry?.(attempt + 1, delay, classified)
            await sleep(delay, options.signal)
        }
    }

    throw lastError ?? new ExchangeError('Gagal tanpa error spesifik', exchange, 'unknown', false)
}
