import { app, shell } from 'electron'
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { LogEntry } from '../../shared/ipc-contract'

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
        const parentDir = dirname(filePath)
        if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true })
        }
        appendFileSync(filePath, logLine + '\n', 'utf8')
    } catch (err) {
        console.error('[logger] Gagal menulis ke file log:', err)
    }
}

export function readLogs(limit: number = 500): LogEntry[] {
    const filePath = getLogFilePath()
    if (!existsSync(filePath)) return []

    try {
        const content = readFileSync(filePath, 'utf8')
        if (!content.trim()) return []

        const lines = content.split(/\r?\n/)
        const entries: LogEntry[] = []
        let currentEntry: LogEntry | null = null

        const headerRegex = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\s+\[(INFO|WARN|ERROR)\]\s+(.*)$/

        for (const line of lines) {
            const match = line.match(headerRegex)
            if (match) {
                if (currentEntry) {
                    entries.push(currentEntry)
                }
                currentEntry = {
                    timestamp: match[1] ?? new Date().toISOString(),
                    level: (match[2] ?? 'INFO') as 'INFO' | 'WARN' | 'ERROR',
                    message: match[3] ?? '',
                    details: '',
                    raw: line
                }
            } else if (currentEntry) {
                if (line.trim()) {
                    currentEntry.details = currentEntry.details
                        ? currentEntry.details + '\n' + line
                        : line
                }
                currentEntry.raw += '\n' + line
            }
        }
        if (currentEntry) {
            entries.push(currentEntry)
        }

        entries.forEach((e) => {
            if (e.details && e.details.trim()) {
                e.details = e.details.trim()
            } else {
                delete e.details
            }
        })

        return entries.reverse().slice(0, limit)
    } catch (err) {
        console.error('[logger] Gagal membaca file log:', err)
        return []
    }
}

export function clearLogs(): void {
    const filePath = getLogFilePath()
    try {
        if (existsSync(filePath)) {
            writeFileSync(filePath, '', 'utf8')
        }
    } catch (err) {
        console.error('[logger] Gagal membersihkan file log:', err)
    }
}

export async function openLogFolder(): Promise<void> {
    const filePath = getLogFilePath()
    const folderPath = dirname(filePath)
    if (!existsSync(folderPath)) {
        mkdirSync(folderPath, { recursive: true })
    }
    await shell.openPath(folderPath)
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
    readLogs(limit?: number): LogEntry[] {
        return readLogs(limit)
    },
    clearLogs(): void {
        clearLogs()
    },
    async openLogFolder(): Promise<void> {
        await openLogFolder()
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
