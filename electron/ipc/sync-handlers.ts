import { ipcMain, type BrowserWindow } from 'electron'
import {
    IPC_CHANNELS,
    type CredentialSavePayload,
    type CredentialStatusPayload,
    type MutationResult,
    type SyncProgressPayload,
    type SyncRunResult,
    type SyncStatePayload,
    type SyncableExchange
} from '../../shared/ipc-contract'
import { getDb } from '../db/index'
import { getSyncState } from '../db/repositories/sync'
import {
    deleteCredentials,
    getAllStatuses,
    isSecureStorageAvailable,
    loadCredentials,
    saveCredentials
} from '../credentials/keystore'
import { MexcAdapter } from '../exchanges/mexc/index'
import { BitunixAdapter } from '../exchanges/bitunix/index'
import { syncAll } from '../sync/engine'
import type { ExchangeAdapter, SupportedExchange } from '../exchanges/types'
import { logger } from '../utils/logger'

/**
 * Handler IPC untuk kredensial dan sync (Fase 2).
 *
 * ===========================================================================
 * ATURAN KEAMANAN YANG DITEGAKKAN DI FILE INI
 * ===========================================================================
 *
 * 1. Kredensial hanya mengalir SATU ARAH: renderer -> main. Tidak ada handler
 *    yang mengembalikan apiKey/apiSecret ke renderer. Yang dikembalikan hanya
 *    `CredentialStatusPayload` (status + petunjuk kunci, tanpa nilai).
 *
 * 2. Pemuatan kredensial (`loadCredentials`) HANYA terjadi di dalam handler
 *    sync, di main process. Hasilnya tidak pernah keluar dari blok ini.
 *
 * 3. Kalau safeStorage tidak tersedia, simpan kredensial DITOLAK. Tidak ada
 *    fallback ke file plaintext — itu akan melanggar brief §8 & §11.
 */

/**
 * Buat adapter untuk exchange yang punya kredensial.
 *
 * Exchange tanpa kredensial DILEWATI, bukan digagalkan — user mungkin hanya
 * memakai MEXC dulu dan Bitunix menyusul.
 *
 * Fase 2: hanya MEXC. Fase 3 menambahkan Bitunix di sini, dan sync engine
 * TIDAK perlu diubah.
 */
function buildAdapters(): { adapters: ExchangeAdapter[]; skipped: SupportedExchange[] } {
    const adapters: ExchangeAdapter[] = []
    const skipped: SupportedExchange[] = []

    // --- MEXC ---
    const mexcCreds = loadCredentials('mexc')
    if (mexcCreds) {
        adapters.push(new MexcAdapter(mexcCreds))
    } else {
        skipped.push('mexc')
    }

    // --- Bitunix ---
    const bitunixCreds = loadCredentials('bitunix')
    if (bitunixCreds) {
        adapters.push(
            new BitunixAdapter(bitunixCreds, {
                onDebug: (message) => console.log(message)
            })
        )
    } else {
        skipped.push('bitunix')
    }

    return { adapters, skipped }
}

export function registerSyncHandlers(getWindow: () => BrowserWindow | null): void {
    // --- Kredensial ---------------------------------------------------------

    ipcMain.handle(
        IPC_CHANNELS.credentialStatus,
        (): MutationResult<CredentialStatusPayload[]> => {
            const statuses = getAllStatuses()
            const secureAvailable = isSecureStorageAvailable()

            if (!secureAvailable) {
                console.warn('[ipc:sync] safeStorage tidak tersedia di sistem ini')
            }

            return {
                ok: true,
                data: statuses.map((s) => ({
                    exchange: s.exchange,
                    configured: s.configured,
                    keyHint: s.keyHint,
                    updatedAt: s.updatedAt
                }))
            }
        }
    )

    ipcMain.handle(
        IPC_CHANNELS.credentialSave,
        (_event, payload: CredentialSavePayload): MutationResult<void> => {
            try {
                // Validasi bentuk payload sebelum menyentuh safeStorage.
                if (payload.exchange !== 'mexc' && payload.exchange !== 'bitunix') {
                    throw new Error(`Exchange tidak dikenal: ${String(payload.exchange)}`)
                }
                if (typeof payload.apiKey !== 'string' || typeof payload.apiSecret !== 'string') {
                    throw new Error('API key dan secret harus berupa teks.')
                }

                saveCredentials(payload.exchange, {
                    apiKey: payload.apiKey,
                    apiSecret: payload.apiSecret
                })

                // PENTING: jangan pernah mencatat payload di log. Log yang mencatat
                // kredensial adalah kebocoran yang sama buruknya dengan plaintext.
                console.log(`[ipc:sync] kredensial ${payload.exchange} tersimpan (nilai tidak dicatat)`)

                return { ok: true }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                console.error('[ipc:sync] gagal menyimpan kredensial:', message)
                return { ok: false, error: message }
            }
        }
    )

    ipcMain.handle(
        IPC_CHANNELS.credentialDelete,
        (_event, exchange: SyncableExchange): MutationResult<void> => {
            try {
                deleteCredentials(exchange)
                console.log(`[ipc:sync] kredensial ${exchange} dihapus`)
                return { ok: true }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                return { ok: false, error: message }
            }
        }
    )

    // --- Sync ---------------------------------------------------------------

    ipcMain.handle(IPC_CHANNELS.syncState, (): MutationResult<SyncStatePayload[]> => {
        const db = getDb()
        const exchanges: SupportedExchange[] = ['mexc', 'bitunix']

        return {
            ok: true,
            data: exchanges.map((exchange) => {
                const state = getSyncState(db, exchange)
                return {
                    exchange,
                    lastSyncAt: state.lastSyncAt,
                    lastStatus: state.lastStatus,
                    lastError: state.lastError,
                    positionsSynced: state.positionsSynced,
                    fillsSynced: state.fillsSynced,
                    fundingSynced: state.fundingSynced
                }
            })
        }
    })

    ipcMain.handle(IPC_CHANNELS.syncRun, async (): Promise<MutationResult<SyncRunResult>> => {
        const startedAt = Date.now()

        try {
            const { adapters, skipped } = buildAdapters()

            if (adapters.length === 0) {
                return {
                    ok: false,
                    error: skipped.length > 0
                        ? `Belum ada kredensial exchange yang tersimpan (${skipped.join(', ')}). ` +
                        'Isi API key read-only di halaman Settings terlebih dahulu.'
                        : 'Tidak ada exchange yang bisa disinkronkan.'
                }
            }

            const window = getWindow()

            // Progress dikirim ke renderer lewat channel terpisah, supaya UI bisa
            // menampilkan tahap yang sedang berjalan saat sync lama (backfill pertama).
            const onProgress = (progress: { stage: SyncProgressPayload['stage']; message: string }): void => {
                window?.webContents.send(IPC_CHANNELS.syncProgress, {
                    exchange: adapters[0]?.id ?? 'mexc',
                    stage: progress.stage,
                    message: progress.message
                } satisfies SyncProgressPayload)
            }

            const { results, status } = await syncAll(getDb(), adapters, { onProgress })

            const payload: SyncRunResult = {
                status,
                exchanges: results.map((result) => ({
                    exchange: result.exchange as SyncableExchange,
                    status: result.status,
                    inserted: result.positions.inserted,
                    updated: result.positions.updated,
                    wasFullBackfill: result.wasFullBackfill,
                    error: result.error
                })),
                durationMs: Date.now() - startedAt
            }

            return { ok: true, data: payload }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error('[ipc:sync] sync gagal:', error)
            return { ok: false, error: message }
        }
    })
}
