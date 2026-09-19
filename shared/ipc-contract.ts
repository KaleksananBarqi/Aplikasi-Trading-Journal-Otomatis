import type {
    ChecklistItem,
    ExecutionGrade,
    ExchangeId,
    TradeDetail,
    TradeDirection,
    MarginMode,
    PnlSource
} from './domain'

/**
 * Kontrak IPC bersama untuk main process, preload, dan renderer.
 *
 * File ini HARUS bebas dari API Node/Electron — ikut ter-bundle ke renderer.
 * Renderer tidak pernah meng-import apapun dari `electron/`
 * (batas keras di plans/01-ARCHITECTURE.md §2).
 */

/** Channel IPC yang tersedia. Satu tempat, supaya surface-nya mudah diaudit. */
export const IPC_CHANNELS = {
    appHealth: 'app:health',
    tradeList: 'trade:list',
    tradeGet: 'trade:get',
    tradeCreate: 'trade:create',
    tradeUpdate: 'trade:update',
    tradeDelete: 'trade:delete',
    tradeMeta: 'trade:meta',
    settingsGetAll: 'settings:getAll',
    settingsSet: 'settings:set',
    credentialStatus: 'credential:status',
    credentialSave: 'credential:save',
    credentialDelete: 'credential:delete',
    syncRun: 'sync:run',
    syncState: 'sync:state',
    syncProgress: 'sync:progress',
    logsGet: 'logs:get',
    logsClear: 'logs:clear',
    logsOpenFolder: 'logs:openFolder',
    logWrite: 'log:write',

    // --- Ekspor (fitur 4) ---
    exportJournal: 'journal:export',

    // --- Backup Google Drive (fitur 5) ---
    backupStatus: 'backup:status',
    backupRun: 'backup:run',
    backupDisconnect: 'backup:disconnect',

    // --- AI (fitur 6) ---
    analyzeJournal: 'journal:analyze',
    aiConfigStatus: 'ai:configStatus',
    aiConfigSave: 'ai:configSave',
    aiConfigDelete: 'ai:configDelete',

    // --- Screenshot (fitur 1) ---
    uploadScreenshot: 'screenshot:upload',
    getScreenshot: 'screenshot:get'
} as const

/** Exchange yang bisa disinkronkan. */
export type SyncableExchange = 'mexc' | 'bitunix'

// --- Backup Google Drive (fitur 5) ---

export interface BackupStatusPayload {
    connected: boolean
    email: string | null
    folder: string | null
    lastBackupAt: number | null
    nextBackupAt: number | null
}

export interface BackupRunResult {
    status: 'ok' | 'partial' | 'error'
    filesUploaded: number
    bytesUploaded: number
    durationMs: number
    error?: string
}

/** Status kredensial satu exchange. TIDAK memuat kredensialnya sendiri. */
export interface CredentialStatusPayload {
    exchange: SyncableExchange
    configured: boolean
    /** Petunjuk kunci, mis. "a1b2…f9". Bukan kredensial penuh. */
    keyHint: string | null
    updatedAt: number | null
}

/**
 * Payload simpan kredensial.
 *
 * CATATAN KEAMANAN: kredensial hanya melewati IPC SATU ARAH dari renderer ke
 * main, saat user mengetiknya. Tidak ada jalur untuk membacanya kembali ke
 * renderer — yang dibaca kembali hanya `CredentialStatusPayload` (tanpa nilai).
 */
export interface CredentialSavePayload {
    exchange: SyncableExchange
    apiKey: string
    apiSecret: string
}

export interface SyncStatePayload {
    exchange: SyncableExchange
    lastSyncAt: number | null
    lastStatus: 'ok' | 'partial' | 'error' | null
    lastError: string | null
    positionsSynced: number
    fillsSynced: number
    fundingSynced: number
}

export interface SyncRunResult {
    status: 'ok' | 'partial' | 'error'
    exchanges: {
        exchange: SyncableExchange
        status: 'ok' | 'partial' | 'error'
        inserted: number
        updated: number
        wasFullBackfill: boolean
        error?: string
    }[]
    durationMs: number
}

export interface SyncProgressPayload {
    exchange: SyncableExchange
    stage: 'positions' | 'fills' | 'funding' | 'reconcile' | 'done'
    message: string
}

export interface AppHealth {
    ok: boolean
    details: string[]
    dbPath: string
}

/** Entri log yang telah di-parse dari file log lokal. */
export interface LogEntry {
    timestamp: string
    level: 'INFO' | 'WARN' | 'ERROR'
    message: string
    details?: string
    raw: string
}

/** Hasil operasi tulis. `ok: false` disertai pesan yang bisa ditampilkan ke user. */
export interface MutationResult<T = void> {
    ok: boolean
    error?: string
    data?: T
}

// --- Trade ------------------------------------------------------------------

export interface TradeFilterPayload {
    exchange?: ExchangeId
    symbol?: string
    from?: number
    to?: number
    setupTag?: string
    limit?: number
    offset?: number
}

/** Payload trade dari formulir. Bentuknya cermin dari `TradeInput` di domain. */
export interface TradeFormPayload {
    exchange: ExchangeId
    externalId?: string | null
    symbol: string
    direction: TradeDirection
    entryPrice: number
    exitPrice: number
    entryTime: number
    exitTime: number
    size: number
    leverage: number
    marginMode: MarginMode | null
    realizedPnl: number
    feeOpen: number
    feeClose: number
    fundingFee: number
}

export interface JournalFormPayload {
    setupTag?: string | null
    preTradeThesis?: string | null
    postTradeReview?: string | null
    emotionTag?: string | null
    executionGrade?: ExecutionGrade | null
    screenshotPath?: string | null
    /** Tag kustom banyak nilai (fitur 3). */
    tags?: string[]
    checklist?: { label: string; checked: boolean }[]
}

export interface PlannedRiskFormPayload {
    plannedStop?: number | null
    plannedTarget?: number | null
    riskAmount?: number | null
    plannedRr?: number | null
}

export interface TradeSavePayload {
    trade: TradeFormPayload
    journal?: JournalFormPayload | null
    plannedRisk?: PlannedRiskFormPayload | null
}

/** Metadata untuk mengisi dropdown/autocomplete di UI. */
export interface TradeMeta {
    symbols: string[]
    setupTags: string[]
    emotionTags: string[]
    /** Tag kustom banyak nilai (fitur 3). */
    tags: string[]
    checklistTemplate: string[]
    totalTrades: number
}

// --- Settings ---------------------------------------------------------------

export interface SettingsPayload {
    theme?: 'dark' | 'light' | 'system'
    colorblindSafe?: boolean
    autoSyncEnabled?: boolean
    autoSyncIntervalMin?: number
    checklistTemplate?: string[]
    hidePnl?: boolean
    /** Nama model OpenAI untuk AI Insights (fitur 6). */
    aiModel?: string
    /** Base URL provider OpenAI-compatible (fitur 6). */
    aiBaseUrl?: string
}

/** Payload upload screenshot (fitur 1). */
export interface ScreenshotUploadPayload {
    /** Nama file asli (hanya untuk validasi ekstensi). */
    fileName: string
    /** Bytes gambar (ArrayBuffer dari renderer). */
    data: Uint8Array
}

// --- AI Insights (fitur 6) ---

/** Hasil analisa journal oleh AI (fitur 6). */
export interface JournalAnalysisResult {
    /** Ringkasan satu paragraf. */
    summary: string
    /** Pola kelemahan yang teridentifikasi. */
    weaknesses: string[]
    /** Saran perbaikan konkret. */
    suggestions: string[]
    /** Metrik utama yang disebut AI (opsional). */
    metrics?: { label: string; value: string }[]
}

export interface AiConfigPayload {
    apiKey: string
    model: string
    baseUrl?: string
}

export interface AiConfigStatus {
    configured: boolean
    model: string | null
    baseUrl: string | null
    keyHint: string | null
}

/** Bentuk `window.api` yang diekspos preload ke renderer. */
export interface PreloadApi {
    getAppHealth(): Promise<AppHealth>
    listTrades(filter?: TradeFilterPayload): Promise<TradeDetail[]>
    getTrade(id: number): Promise<TradeDetail | null>
    createTrade(payload: TradeSavePayload): Promise<MutationResult<number>>
    updateTrade(id: number, payload: TradeSavePayload): Promise<MutationResult<void>>
    deleteTrade(id: number): Promise<MutationResult<void>>
    getTradeMeta(): Promise<TradeMeta>
    getSettings(): Promise<Record<string, unknown>>
    setSettings(payload: SettingsPayload): Promise<MutationResult<void>>

    // --- Ekspor (fitur 4) ---
    exportJournal(format: 'csv' | 'json' | 'pdf', filter?: TradeFilterPayload): Promise<MutationResult<string>>

    // --- Backup Google Drive (fitur 5) ---
    getBackupStatus(): Promise<BackupStatusPayload>
    runBackup(): Promise<MutationResult<BackupRunResult>>
    disconnectBackup(): Promise<MutationResult<void>>

    // --- Screenshot (fitur 1) ---
    uploadScreenshot(payload: ScreenshotUploadPayload): Promise<MutationResult<string>>
    getScreenshot(relPath: string): Promise<MutationResult<string>>

    // --- AI Insights (fitur 6) ---
    getAiConfig(): Promise<AiConfigStatus>
    saveAiConfig(payload: AiConfigPayload): Promise<MutationResult<void>>
    deleteAiConfig(): Promise<MutationResult<void>>
    analyzeJournal(filter?: TradeFilterPayload): Promise<MutationResult<JournalAnalysisResult>>

    // --- Kredensial (Fase 2) ---
    getCredentialStatuses(): Promise<CredentialStatusPayload[]>
    saveCredentials(payload: CredentialSavePayload): Promise<MutationResult<void>>
    deleteCredentials(exchange: SyncableExchange): Promise<MutationResult<void>>

    // --- Sync (Fase 2) ---
    getSyncStates(): Promise<SyncStatePayload[]>
    runSync(): Promise<MutationResult<SyncRunResult>>
    /** Daftarkan listener progres sync. Kembalikan fungsi untuk melepas listener. */
    onSyncProgress(callback: (progress: SyncProgressPayload) => void): () => void

    // --- Logs / Debugging ---
    getLogs(limit?: number): Promise<MutationResult<LogEntry[]>>
    clearLogs(): Promise<MutationResult<void>>
    openLogFolder(): Promise<MutationResult<void>>
    logError(message: string, details?: unknown): Promise<void>
}

// Re-export tipe domain yang dipakai renderer, supaya renderer cukup
// meng-import dari satu tempat.
export type { ChecklistItem, ExecutionGrade, ExchangeId, TradeDetail, PnlSource }
