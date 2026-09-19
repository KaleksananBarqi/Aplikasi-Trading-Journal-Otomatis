import { contextBridge, ipcRenderer } from 'electron'
import {
    IPC_CHANNELS,
    type AppHealth,
    type BackupRunResult,
    type BackupStatusPayload,
    type CredentialSavePayload,
    type CredentialStatusPayload,
    type AiConfigPayload,
    type AiConfigStatus,
    type JournalAnalysisResult,
    type LogEntry,
    type MutationResult,
    type PreloadApi,
    type ScreenshotUploadPayload,
    type SettingsPayload,
    type SyncProgressPayload,
    type SyncRunResult,
    type SyncStatePayload,
    type SyncableExchange,
    type TradeFilterPayload,
    type TradeMeta,
    type TradeSavePayload
} from '../shared/ipc-contract'
import type { TradeDetail } from '../shared/domain'

/**
 * Jembatan IPC renderer <-> main process.
 *
 * KEPUTUSAN (plans/01-ARCHITECTURE.md §2): renderer TIDAK PERNAH mengakses
 * database, kredensial, atau exchange secara langsung. Semua lewat channel
 * yang terdaftar eksplisit di bawah.
 *
 * DILARANG mengekspos `ipcRenderer` mentah ke renderer — itu membatalkan
 * seluruh isolasi yang dibangun. Setiap channel harus dideklarasikan satu per satu.
 */

/**
 * Buka hasil MutationResult<T>.
 *
 * Main process mengembalikan `{ ok, error, data }` supaya error tidak
 * menjatuhkan proses. Di sisi renderer, bentuk itu dilebihkan lagi jadi
 * throw biasa — supaya kode UI bisa memakai try/catch normal.
 */
function unwrap<T>(result: MutationResult<T>): T {
    if (!result.ok) {
        throw new Error(result.error ?? 'Operasi gagal tanpa pesan error')
    }
    return result.data as T
}

const api: PreloadApi = {
    getAppHealth: (): Promise<AppHealth> => ipcRenderer.invoke(IPC_CHANNELS.appHealth),

    listTrades: async (filter?: TradeFilterPayload): Promise<TradeDetail[]> =>
        unwrap<TradeDetail[]>(await ipcRenderer.invoke(IPC_CHANNELS.tradeList, filter)),

    getTrade: async (id: number): Promise<TradeDetail | null> =>
        unwrap<TradeDetail | null>(await ipcRenderer.invoke(IPC_CHANNELS.tradeGet, id)),

    createTrade: (payload: TradeSavePayload): Promise<MutationResult<number>> =>
        ipcRenderer.invoke(IPC_CHANNELS.tradeCreate, payload),

    updateTrade: (id: number, payload: TradeSavePayload): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.tradeUpdate, id, payload),

    deleteTrade: (id: number): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.tradeDelete, id),

    getTradeMeta: async (): Promise<TradeMeta> =>
        unwrap<TradeMeta>(await ipcRenderer.invoke(IPC_CHANNELS.tradeMeta)),

    getSettings: async (): Promise<Record<string, unknown>> =>
        unwrap<Record<string, unknown>>(await ipcRenderer.invoke(IPC_CHANNELS.settingsGetAll)),

    setSettings: (payload: SettingsPayload): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.settingsSet, payload),

    // --- Ekspor (fitur 4) ---
    exportJournal: (format: 'csv' | 'json' | 'pdf', filter?: TradeFilterPayload) =>
        ipcRenderer.invoke(IPC_CHANNELS.exportJournal, format, filter),

    // --- Backup Google Drive (fitur 5) ---
    getBackupStatus: (): Promise<BackupStatusPayload> =>
        ipcRenderer.invoke(IPC_CHANNELS.backupStatus),
    runBackup: (): Promise<MutationResult<BackupRunResult>> =>
        ipcRenderer.invoke(IPC_CHANNELS.backupRun),
    disconnectBackup: (): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.backupDisconnect),

    // --- Screenshot (fitur 1) ---
    uploadScreenshot: (payload: ScreenshotUploadPayload): Promise<MutationResult<string>> =>
        ipcRenderer.invoke(IPC_CHANNELS.uploadScreenshot, payload),

    getScreenshot: (relPath: string): Promise<MutationResult<string>> =>
        ipcRenderer.invoke(IPC_CHANNELS.getScreenshot, relPath),

    // --- AI Insights (fitur 6) ---
    getAiConfig: (): Promise<AiConfigStatus> =>
        ipcRenderer.invoke(IPC_CHANNELS.aiConfigStatus),

    saveAiConfig: (payload: AiConfigPayload): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.aiConfigSave, payload),

    deleteAiConfig: (): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.aiConfigDelete),

    analyzeJournal: (filter?: TradeFilterPayload): Promise<MutationResult<JournalAnalysisResult>> =>
        ipcRenderer.invoke(IPC_CHANNELS.analyzeJournal, filter),

    // --- Kredensial ---

    getCredentialStatuses: async (): Promise<CredentialStatusPayload[]> =>
        unwrap<CredentialStatusPayload[]>(await ipcRenderer.invoke(IPC_CHANNELS.credentialStatus)),

    saveCredentials: (payload: CredentialSavePayload): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.credentialSave, payload),

    deleteCredentials: (exchange: SyncableExchange): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.credentialDelete, exchange),

    // --- Sync ---

    getSyncStates: async (): Promise<SyncStatePayload[]> =>
        unwrap<SyncStatePayload[]>(await ipcRenderer.invoke(IPC_CHANNELS.syncState)),

    runSync: (): Promise<MutationResult<SyncRunResult>> => ipcRenderer.invoke(IPC_CHANNELS.syncRun),

    /**
     * Daftarkan listener progres sync.
     *
     * Mengembalikan fungsi pelepas listener. Tanpa ini, setiap kali komponen
     * yang memanggilnya di-mount ulang, listener lama akan menumpuk dan memori
     * bocor perlahan.
     */
    onSyncProgress: (callback: (progress: SyncProgressPayload) => void): (() => void) => {
        const listener = (_event: unknown, progress: SyncProgressPayload): void => callback(progress)
        ipcRenderer.on(IPC_CHANNELS.syncProgress, listener)
        return () => {
            ipcRenderer.removeListener(IPC_CHANNELS.syncProgress, listener)
        }
    },

    // --- Logs / Debugging ---
    getLogs: (limit?: number): Promise<MutationResult<LogEntry[]>> =>
        ipcRenderer.invoke(IPC_CHANNELS.logsGet, limit),

    clearLogs: (): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.logsClear),

    openLogFolder: (): Promise<MutationResult<void>> =>
        ipcRenderer.invoke(IPC_CHANNELS.logsOpenFolder),

    logError: (message: string, details?: unknown): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.logWrite, { message, details })
}

contextBridge.exposeInMainWorld('api', api)
