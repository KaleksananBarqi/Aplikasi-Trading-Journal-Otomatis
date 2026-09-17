import { app } from 'electron'
import { existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * File logger terpusat untuk Main Process dan skrip pengujian.
 *
 * Mengapa file logger penting:
 * Pada aplikasi Electron yang sudah di-build (`npm run dist` -> packaged executable),
 * `console.log` / `console.error` tidak terlihat di layar GUI.
 * Logger ini memastikan semua log dan error tercatat dengan timestamp di file log lokal:
 *   1. `%APPDATA%/Aplikasi Trading Journal Otomatis/logs/app.log` (pada Windows)
 *   2. `logs/test-real-sync.log` di root proyek saat menguji via CLI.
 */

let customLogFilePath: string | null = null

export function setLogFilePath(filePath: string): void {
    customLogFilePath = filePath
}

export function getLogFilePath(): string {
    if (customLogFilePath) return customLogFilePath

    let baseDir: string
    try {
        if (app && app.isReady()) {
            baseDir = join(app.getPath('userData'), 'logs')
        } else {
            baseDir = join(process.cwd(), 'logs')
        }
    } catch {
        baseDir = join(process.cwd(), 'logs')
    }

    if (!existsSync(baseDir)) {
        mkdirSync(baseDir, { recursive: true })
    }

    return join(baseDir, 'app.log')
}

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: unknown): void {
    const timestamp = new Date().toISOString()
    let logLine = `[${timestamp}] [${level}] ${message}`

    if (details !== undefined) {
        if (details instanceof Error) {
            logLine += `\n  Stack: ${details.stack ?? details.message}`
        } else if (typeof details === 'object') {
            try {
                logLine += `\n  Data: ${JSON.stringify(details, null, 2)}`
            } catch {
                logLine += `\n  Data: ${String(details)}`
            }
        } else {
            logLine += `\n  Details: ${String(details)}`
        }
    }

    // Output ke konsol bawaan
    if (level === 'ERROR') {
        console.error(logLine)
    } else if (level === 'WARN') {
        console.warn(logLine)
    } else {
        console.log(logLine)
    }

    // Append ke file log
    try {
        const filePath = getLogFilePath()
        const parentDir = join(filePath, '..')
        if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true })
        }
        appendFileSync(filePath, logLine + '\n', 'utf8')
    } catch (err) {
        console.error('[logger] Gagal menulis ke file log:', err)
    }
}

export const logger = {
    info(message: string, details?: unknown): void {
        writeLog('INFO', message, details)
    },
    warn(message: string, details?: unknown): void {
        writeLog('WARN', message, details)
    },
    error(message: string, details?: unknown): void {
        writeLog('ERROR', message, details)
    },
    getLogPath(): string {
        return getLogFilePath()
    },
    initGlobalErrorHandlers(): void {
        process.on('uncaughtException', (error) => {
            writeLog('ERROR', 'Uncaught Exception di Main Process:', error)
        })

        process.on('unhandledRejection', (reason) => {
            writeLog('ERROR', 'Unhandled Rejection di Main Process:', reason)
        })
    }
}
