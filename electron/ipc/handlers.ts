import { ipcMain } from 'electron'
import {
    IPC_CHANNELS,
    type AppHealth,
    type LogEntry,
    type MutationResult,
    type SettingsPayload,
    type TradeFilterPayload,
    type TradeMeta,
    type TradeSavePayload
} from '../../shared/ipc-contract'
import { getDb, getDbPath, runSmokeTest } from '../db/index'
import { logger } from '../utils/logger'
import {
    countTrades,
    createTrade,
    deleteTrade,
    getTrade,
    listEmotionTags,
    listSetupTags,
    listTrades,
    updateTrade
} from '../db/repositories/trades'
import { getAllSettings, SETTING_KEYS, setSetting } from '../db/repositories/settings'
import { DEFAULT_CHECKLIST_TEMPLATE, type TradeDetail } from '../../shared/domain'

/**
 * Registrasi semua handler IPC di satu tempat.
 *
 * ATURAN: setiap handler yang menyentuh exchange/database HARUS di main process.
 * Renderer tidak pernah memanggil DB langsung — lihat preload.ts.
 *
 * Setiap handler dibungkus `safe()` supaya error dari repository tidak
 * menjatuhkan proses main, dan pesannya tetap bisa ditampilkan ke user.
 */

/** Bungkus handler supaya error jadi MutationResult, bukan crash. */
function safe<T>(fn: () => T): MutationResult<T> {
    try {
        return { ok: true, data: fn() }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[ipc] error:', message)
        return { ok: false, error: message }
    }
}

export function registerIpcHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.appHealth, (): AppHealth => {
        const result = runSmokeTest()
        return { ok: result.ok, details: result.details, dbPath: getDbPath() }
    })

    // --- Trade --------------------------------------------------------------

    ipcMain.handle(
        IPC_CHANNELS.tradeList,
        (_event, filter: TradeFilterPayload = {}): MutationResult<TradeDetail[]> =>
            safe(() => listTrades(getDb(), filter))
    )

    ipcMain.handle(
        IPC_CHANNELS.tradeGet,
        (_event, id: number): MutationResult<TradeDetail | null> => safe(() => getTrade(getDb(), id))
    )

    ipcMain.handle(
        IPC_CHANNELS.tradeCreate,
        (_event, payload: TradeSavePayload): MutationResult<number> =>
            safe(() => createTrade(getDb(), payload))
    )

    ipcMain.handle(
        IPC_CHANNELS.tradeUpdate,
        (_event, id: number, payload: TradeSavePayload): MutationResult<void> =>
            safe(() => {
                const updated = updateTrade(getDb(), id, payload)
                if (!updated) throw new Error(`Trade dengan id ${id} tidak ditemukan`)
            })
    )

    ipcMain.handle(
        IPC_CHANNELS.tradeDelete,
        (_event, id: number): MutationResult<void> =>
            safe(() => {
                const deleted = deleteTrade(getDb(), id)
                if (!deleted) throw new Error(`Trade dengan id ${id} tidak ditemukan`)
            })
    )

    ipcMain.handle(IPC_CHANNELS.tradeMeta, (): MutationResult<TradeMeta> =>
        safe(() => {
            const db = getDb()
            const symbols = db
                .prepare('SELECT DISTINCT symbol FROM trades ORDER BY symbol COLLATE NOCASE')
                .all() as { symbol: string }[]

            const stored = getAllSettings(db)[SETTING_KEYS.checklistTemplate]
            const checklistTemplate: string[] = Array.isArray(stored)
                ? (stored as string[])
                : [...DEFAULT_CHECKLIST_TEMPLATE]

            return {
                symbols: symbols.map((s) => s.symbol),
                setupTags: listSetupTags(db),
                emotionTags: listEmotionTags(db),
                checklistTemplate,
                totalTrades: countTrades(db)
            }
        })
    )

    // --- Settings -----------------------------------------------------------

    ipcMain.handle(IPC_CHANNELS.settingsGetAll, (): MutationResult<Record<string, unknown>> =>
        safe(() => getAllSettings(getDb()))
    )

    ipcMain.handle(
        IPC_CHANNELS.settingsSet,
        (_event, payload: SettingsPayload): MutationResult<void> =>
            safe(() => {
                const db = getDb()
                // Iterasi eksplisit, bukan Object.entries langsung, supaya hanya kunci
                // yang dikenal yang bisa ditulis. Mencegah renderer menulis settings
                // sembarangan ke DB.
                if (payload.theme !== undefined) setSetting(db, SETTING_KEYS.theme, payload.theme)
                if (payload.colorblindSafe !== undefined)
                    setSetting(db, SETTING_KEYS.colorblindSafe, payload.colorblindSafe)
                if (payload.autoSyncEnabled !== undefined)
                    setSetting(db, SETTING_KEYS.autoSyncEnabled, payload.autoSyncEnabled)
                if (payload.autoSyncIntervalMin !== undefined)
                    setSetting(db, SETTING_KEYS.autoSyncIntervalMin, payload.autoSyncIntervalMin)
                if (payload.checklistTemplate !== undefined)
                    setSetting(db, SETTING_KEYS.checklistTemplate, payload.checklistTemplate)
                if (payload.hidePnl !== undefined)
                    setSetting(db, SETTING_KEYS.hidePnl, payload.hidePnl)
            })
    )

    // --- Logs / Debugging ----------------------------------------------------

    ipcMain.handle(
        IPC_CHANNELS.logsGet,
        (_event, limit?: number): MutationResult<LogEntry[]> =>
            safe(() => logger.readLogs(limit))
    )

    ipcMain.handle(IPC_CHANNELS.logsClear, (): MutationResult<void> =>
        safe(() => logger.clearLogs())
    )

    ipcMain.handle(IPC_CHANNELS.logsOpenFolder, async (): Promise<MutationResult<void>> => {
        try {
            await logger.openLogFolder()
            return { ok: true }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { ok: false, error: message }
        }
    })

    ipcMain.handle(
        IPC_CHANNELS.logWrite,
        (_event, { message, details }: { message: string; details?: unknown }): void => {
            logger.error(`[Renderer] ${message}`, details)
        }
    )
}
