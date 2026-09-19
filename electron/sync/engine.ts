import type Database from 'better-sqlite3'
import type { ExchangeAdapter, SyncCursor, SupportedExchange } from '../exchanges/types'
import { ExchangeError } from '../exchanges/types'
import {
    applyFundingToTrades,
    getSyncState,
    linkFillsToTrades,
    updateSyncState,
    upsertFills,
    upsertFundingFees,
    upsertPositions,
    type UpsertResult
} from '../db/repositories/sync'
import { upsertBalances } from '../db/repositories/balance'


/**
 * Sync engine — orkestrator.
 *
 * ===========================================================================
 * KONTRAK YANG HARUS DIPERTAHANKAN SAMPAI FASE 3
 * ===========================================================================
 *
 * File ini TIDAK BOLEH tahu exchange mana yang sedang di-sync. Semua perbedaan
 * MEXC vs Bitunix harus tersembunyi di balik interface `ExchangeAdapter`
 * (plans/01-ARCHITECTURE.md §4).
 *
 * Di Fase 3, kalau file ini butuh diubah untuk mengakomodasi Bitunix, itu tanda
 * abstraksi adapternya kurang tepat — laporkan, jangan tambal di sini.
 *
 * ===========================================================================
 * URUTAN OPERASI (penting)
 * ===========================================================================
 *
 * 1. Posisi  -> bikin/menjaga baris `trades`
 * 2. Fills   -> bukti audit granular
 * 3. Funding -> catatan biaya
 * 4. Akumulasi funding ke trade -> HARUS setelah langkah 1 dan 3
 *
 * Langkah 4 dihitung ulang dari nol di SQL, jadi idempotent.
 */

export interface SyncProgress {
    stage: 'positions' | 'fills' | 'funding' | 'reconcile' | 'done'
    message: string
}

export interface SyncResult {
    exchange: SupportedExchange
    status: 'ok' | 'partial' | 'error'
    positions: UpsertResult
    fills: UpsertResult
    funding: UpsertResult
    /** true bila ini sync pertama (backfill penuh). */
    wasFullBackfill: boolean
    durationMs: number
    error?: string
}

export interface SyncOptions {
    signal?: AbortSignal
    onProgress?: (progress: SyncProgress) => void
}

const EMPTY_RESULT: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 }

function emptyResult(): UpsertResult {
    return { ...EMPTY_RESULT }
}

/**
 * Jalankan sync untuk satu exchange.
 *
 * Status akhir:
 * - `ok`      : semua tahap berhasil
 * - `partial` : posisi berhasil tapi fills/funding gagal — data utama sudah masuk
 * - `error`   : posisi gagal, tidak ada data baru
 *
 * `partial` penting supaya kegagalan di data pelengkap tidak membuang hasil
 * yang sudah didapat, dan tidak menyembunyikan masalah dari user.
 */
export async function syncExchange(
    db: Database.Database,
    adapter: ExchangeAdapter,
    options: SyncOptions = {}
): Promise<SyncResult> {
    const startedAt = Date.now()
    const exchange = adapter.id
    const report = options.onProgress ?? ((): void => { })

    const state = getSyncState(db, exchange)
    const cursor: SyncCursor = {
        lastExitTime: state.lastExitTime,
        lastExternalId: state.lastExternalId
    }
    // Backfill penuh saat cursor belum ada = sync pertama seumur hidup app ini.
    const wasFullBackfill = cursor.lastExitTime === null

    const positions = emptyResult()
    const fills = emptyResult()
    const funding = emptyResult()

    // --- Tahap 1: posisi (data utama) ----------------------------------------
    let maxExitTime = cursor.lastExitTime
    let maxExternalId = cursor.lastExternalId

    try {
        report({
            stage: 'positions',
            message: wasFullBackfill
                ? 'Menarik seluruh histori posisi (sync pertama)…'
                : 'Menarik posisi baru…'
        })

        const rawPositions = await adapter.fetchClosedPositions(cursor, { signal: options.signal })

        report({ stage: 'positions', message: `Menyimpan ${rawPositions.length} posisi…` })
        const positionResult = upsertPositions(db, exchange, rawPositions)
        Object.assign(positions, positionResult)

        for (const position of rawPositions) {
            if (maxExitTime === null || position.exitTime > maxExitTime) {
                maxExitTime = position.exitTime
                maxExternalId = position.externalId
            }
        }

        // Simpan cursor SEGERA setelah posisi berhasil. Kalau tahap berikutnya
        // gagal, sync berikutnya tetap melanjutkan dari titik ini, bukan mengulang
        // backfill penuh.
        updateSyncState(db, exchange, {
            lastExitTime: maxExitTime,
            lastExternalId: maxExternalId,
            positionsSynced: state.positionsSynced + positionResult.inserted
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateSyncState(db, exchange, {
            lastSyncAt: Date.now(),
            lastStatus: 'error',
            lastError: message
        })
        return {
            exchange,
            status: 'error',
            positions,
            fills,
            funding,
            wasFullBackfill,
            durationMs: Date.now() - startedAt,
            error: message
        }
    }

    // --- Tahap 2: fills ------------------------------------------------------
    // Kegagalan di sini tidak membatalkan posisi yang sudah tersimpan.
    let partialError: string | undefined
    try {
        report({ stage: 'fills', message: 'Menarik riwayat eksekusi…' })
        const rawFills = await adapter.fetchFills(cursor, { signal: options.signal })
        Object.assign(fills, upsertFills(db, exchange, rawFills))
        updateSyncState(db, exchange, {
            fillsSynced: state.fillsSynced + fills.inserted
        })
    } catch (error) {
        partialError = `Fills gagal: ${error instanceof Error ? error.message : String(error)}`
        console.warn(`[sync:${exchange}]`, partialError)
    }

    // --- Tahap 3: funding ----------------------------------------------------
    try {
        report({ stage: 'funding', message: 'Menarik catatan funding…' })
        const rawFunding = await adapter.fetchFundingFees(cursor, { signal: options.signal })
        Object.assign(funding, upsertFundingFees(db, exchange, rawFunding))
        updateSyncState(db, exchange, {
            fundingSynced: state.fundingSynced + funding.inserted
        })
    } catch (error) {
        const message = `Funding gagal: ${error instanceof Error ? error.message : String(error)}`
        partialError = partialError ? `${partialError}; ${message}` : message
        console.warn(`[sync:${exchange}]`, message)
    }

    // --- Tahap 4: rekonsiliasi ------------------------------------------------
    // WAJIB setelah posisi, fills, dan funding tersimpan.
    // Keduanya idempotent: dihitung/dinilai ulang dari nol setiap kali.
    //
    // CATATAN: tahap ini TIDAK berubah saat Bitunix ditambahkan di Fase 3.
    // Bitunix mengembalikan array funding kosong (lihat catatan di
    // electron/exchanges/bitunix/index.ts), dan `applyFundingToTrades` menangani
    // itu dengan benar: COALESCE(..., 0). Ini bukti abstraksi adapternya bekerja.
    try {
        report({ stage: 'reconcile', message: 'Menghitung ulang funding per posisi…' })
        applyFundingToTrades(db, exchange)

        // Tautkan fill ke trade (bukti audit). Tidak mengubah angka P&L apapun.
        report({ stage: 'reconcile', message: 'Menautkan fill ke posisi…' })
        const linkResult = linkFillsToTrades(db, exchange)
        if (linkResult.linked > 0) {
            console.log(`[sync:${exchange}] ${linkResult.linked} fill ditautkan ke posisi`)
        }
    } catch (error) {
        const message = `Rekonsiliasi gagal: ${error instanceof Error ? error.message : String(error)}`
        partialError = partialError ? `${partialError}; ${message}` : message
        console.warn(`[sync:${exchange}]`, message)
    }

    // --- Tahap 5: Saldo akun (ekstensi) --------------------------------------
    if (typeof adapter.fetchBalances === 'function') {
        try {
            const balances = await adapter.fetchBalances({ signal: options.signal })
            upsertBalances(db, balances)
        } catch (error) {
            console.warn(`[sync:${exchange}] Saldo gagal diperbarui:`, error)
        }
    }

    const finalStatus: SyncResult['status'] = partialError ? 'partial' : 'ok'


    updateSyncState(db, exchange, {
        lastSyncAt: Date.now(),
        lastStatus: finalStatus,
        lastError: partialError ?? null
    })

    report({ stage: 'done', message: 'Selesai' })

    return {
        exchange,
        status: finalStatus,
        positions,
        fills,
        funding,
        wasFullBackfill,
        durationMs: Date.now() - startedAt,
        error: partialError
    }
}

/** Ringkas hasil sync jadi satu baris untuk log/UI. */
export function describeSyncResult(result: SyncResult): string {
    const parts: string[] = []
    if (result.positions.inserted > 0) parts.push(`${result.positions.inserted} posisi baru`)
    if (result.positions.updated > 0) parts.push(`${result.positions.updated} posisi diperbarui`)
    if (result.fills.inserted > 0) parts.push(`${result.fills.inserted} fill baru`)
    if (result.funding.inserted > 0) parts.push(`${result.funding.inserted} catatan funding`)

    const duration = `${(result.durationMs / 1000).toFixed(1)}s`

    if (parts.length === 0) {
        return `Tidak ada data baru (${duration})`
    }
    return `${parts.join(', ')} · ${duration}`
}

/**
 * Jalankan sync untuk beberapa exchange secara berurutan.
 *
 * Sengaja SEKUENSIAL, bukan paralel: beberapa exchange membatasi jumlah koneksi
 * bersamaan, dan menjalankannya berurutan membuat log jauh lebih mudah dibaca
 * saat ada masalah. Untuk aplikasi personal, kecepatan bukan prioritas di sini.
 *
 * Satu exchange gagal TIDAK menghentikan yang lain — hasilnya digabung dengan
 * status keseluruhan `partial` bila ada yang gagal.
 */
export async function syncAll(
    db: Database.Database,
    adapters: ExchangeAdapter[],
    options: SyncOptions = {}
): Promise<{ results: SyncResult[]; status: 'ok' | 'partial' | 'error' }> {
    const results: SyncResult[] = []

    for (const adapter of adapters) {
        try {
            results.push(await syncExchange(db, adapter, options))
        } catch (error) {
            // syncExchange sudah menangani error internalnya sendiri; ini jaring
            // pengaman untuk error tak terduga (mis. adapter gagal dikonstruksi).
            const message =
                error instanceof ExchangeError
                    ? `${error.kind}: ${error.message}`
                    : error instanceof Error
                        ? error.message
                        : String(error)

            results.push({
                exchange: adapter.id,
                status: 'error',
                positions: emptyResult(),
                fills: emptyResult(),
                funding: emptyResult(),
                wasFullBackfill: false,
                durationMs: 0,
                error: message
            })
        }
    }

    const hasError = results.some((r) => r.status === 'error')
    const hasPartial = results.some((r) => r.status === 'partial')
    const status: 'ok' | 'partial' | 'error' = hasError ? (results.every((r) => r.status === 'error') ? 'error' : 'partial') : hasPartial ? 'partial' : 'ok'

    return { results, status }
}
