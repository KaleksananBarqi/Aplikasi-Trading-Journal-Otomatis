import { app } from 'electron'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeDb, closeDb, getDb } from '../db/index'
import { syncExchange } from '../sync/engine'
import { MexcAdapter } from '../exchanges/mexc/index'
import { BitunixAdapter } from '../exchanges/bitunix/index'
import { saveCredentials, isSecureStorageAvailable } from '../credentials/keystore'
import { logger, setLogFilePath } from '../utils/logger'
import type Database from 'better-sqlite3'

/**
 * SKRIP UJI API KEY ASLI SEBELUM BUILD.
 *
 * Jalankan: npm run test:real-sync
 *
 * Skrip ini membaca kredensial asli dari `.env` di root proyek,
 * lalu menguji koneksi & penarikan data dari MEXC Futures dan/atau Bitunix Futures.
 *
 * Log lengkap dengan timestamp disimpan di: `logs/test-real-sync.log`
 */

function parseDotEnv(filePath: string): Record<string, string> {
    const envVars: Record<string, string> = {}
    if (!existsSync(filePath)) return envVars

    try {
        const content = readFileSync(filePath, 'utf8')
        const lines = content.split(/\r?\n/)
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const eqIdx = trimmed.indexOf('=')
            if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx).trim()
                let value = trimmed.slice(eqIdx + 1).trim()
                // Strip quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1)
                }
                envVars[key] = value
            }
        }
    } catch (err) {
        logger.warn(`Gagal membaca file .env di ${filePath}`, err)
    }
    return envVars
}

function maskKey(key: string | undefined): string {
    if (!key || key.trim() === '') return '[KOSONG]'
    const trimmed = key.trim()
    if (trimmed.length <= 8) return '••••'
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

async function runTest(): Promise<void> {
    const logPath = join(process.cwd(), 'logs', 'test-real-sync.log')
    setLogFilePath(logPath)

    logger.info('===================================================================')
    logger.info('   SKRIP UJI SINKRONISASI API KEY ASLI (.env) SEBELUM BUILD        ')
    logger.info('===================================================================')
    logger.info(`Waktu eksekusi: ${new Date().toLocaleString('id-ID')}`)
    logger.info(`File Log      : ${logPath}`)

    // Load .env
    const envPath = join(process.cwd(), '.env')
    const envLocalPath = join(process.cwd(), '.env.local')
    const env = { ...parseDotEnv(envPath), ...parseDotEnv(envLocalPath), ...process.env }

    if (env.TRADING_JOURNAL_DEBUG === '1') {
        process.env.TRADING_JOURNAL_DEBUG = '1'
    }

    const mexcKey = env.MEXC_API_KEY?.trim() ?? ''
    const mexcSecret = env.MEXC_API_SECRET?.trim() ?? ''
    const bitunixKey = env.BITUNIX_API_KEY?.trim() ?? ''
    const bitunixSecret = env.BITUNIX_API_SECRET?.trim() ?? ''

    const hasMexc = mexcKey !== '' && mexcSecret !== ''
    const hasBitunix = bitunixKey !== '' && bitunixSecret !== ''

    logger.info('\n--- [1/4] Status Kredensial .env ---')
    logger.info(`MEXC Futures    : ${hasMexc ? 'TERSEDIA' : 'TIDAK TERSEDIA'} (Key: ${maskKey(mexcKey)})`)
    logger.info(`Bitunix Futures : ${hasBitunix ? 'TERSEDIA' : 'TIDAK TERSEDIA'} (Key: ${maskKey(bitunixKey)})`)

    if (!hasMexc && !hasBitunix) {
        logger.error(
            '\n[ERROR] Tidak ada API Key yang terdeteksi di file .env!\n' +
            'PETUNJUK:\n' +
            '1. Salin file `.env.example` menjadi `.env` di root proyek.\n' +
            '2. Buka file `.env` lalu isi `MEXC_API_KEY` & `MEXC_API_SECRET` atau `BITUNIX_API_KEY` & `BITUNIX_API_SECRET`.\n' +
            '3. Jalankan kembali `npm run test:real-sync`.'
        )
        process.exit(1)
    }

    // Storage setup
    const saveToKeystore = env.TEST_SAVE_TO_KEYSTORE === '1'
    const useRealDb = env.TEST_USE_REAL_DB === '1'

    if (saveToKeystore) {
        logger.info('\n--- [Keystore Option] Menyimpan kredensial .env ke safeStorage OS ---')
        if (isSecureStorageAvailable()) {
            if (hasMexc) {
                saveCredentials('mexc', { apiKey: mexcKey, apiSecret: mexcSecret })
                logger.info('Kredensial MEXC berhasil disimpan ke safeStorage OS.')
            }
            if (hasBitunix) {
                saveCredentials('bitunix', { apiKey: bitunixKey, apiSecret: bitunixSecret })
                logger.info('Kredensial Bitunix berhasil disimpan ke safeStorage OS.')
            }
        } else {
            logger.warn('safeStorage OS tidak tersedia di lingkungan ini. Penyimpanan keystore dilewati.')
        }
    }

    // Database Setup
    logger.info('\n--- [2/4] Inisialisasi Database ---')
    let db: Database.Database
    let tempDir: string | null = null

    if (useRealDb) {
        logger.info('Menggunakan DB Produksi aplikasi (data/trading-journal.sqlite).')
        initializeDb()
        db = getDb()
    } else {
        tempDir = mkdtempSync(join(tmpdir(), 'trading-journal-test-'))
        const testDbPath = join(tempDir, 'test-sync.sqlite')
        logger.info(`Menggunakan DB Temporary: ${testDbPath}`)
        initializeDb(testDbPath)
        db = getDb()
    }

    let overallSuccess = true

    // MEXC Sync Test
    if (hasMexc) {
        logger.info('\n--- [3/4] Testing MEXC Futures Sync ---')
        try {
            const adapter = new MexcAdapter({ apiKey: mexcKey, apiSecret: mexcSecret })
            logger.info('Memulai syncExchange MEXC...')

            const res = await syncExchange(db, adapter, {
                onProgress: (p) => logger.info(`[MEXC Progress] ${p.stage.toUpperCase()}: ${p.message}`)
            })

            logger.info('Hasil Sync MEXC:', {
                status: res.status,
                wasFullBackfill: res.wasFullBackfill,
                durationMs: res.durationMs,
                positions: res.positions,
                fills: res.fills,
                funding: res.funding,
                error: res.error ?? 'None'
            })

            if (res.status === 'error') {
                overallSuccess = false
                logger.error(`[MEXC ERROR] Sync gagal: ${res.error}`)
            } else {
                logger.info(`[MEXC SUCCESS] Berhasil menarik data MEXC! Status: ${res.status}`)
            }
        } catch (err) {
            overallSuccess = false
            logger.error('[MEXC CRASH] Terjadi exception saat menguji MEXC:', err)
        }
    }

    // Bitunix Sync Test
    if (hasBitunix) {
        logger.info('\n--- [4/4] Testing Bitunix Futures Sync ---')
        try {
            const adapter = new BitunixAdapter(
                { apiKey: bitunixKey, apiSecret: bitunixSecret },
                { onDebug: (msg) => logger.info(`[Bitunix Debug] ${msg}`) }
            )
            logger.info('Memulai syncExchange Bitunix...')

            const res = await syncExchange(db, adapter, {
                onProgress: (p) => logger.info(`[Bitunix Progress] ${p.stage.toUpperCase()}: ${p.message}`)
            })

            logger.info('Hasil Sync Bitunix:', {
                status: res.status,
                wasFullBackfill: res.wasFullBackfill,
                durationMs: res.durationMs,
                positions: res.positions,
                fills: res.fills,
                funding: res.funding,
                error: res.error ?? 'None'
            })

            if (res.status === 'error') {
                overallSuccess = false
                logger.error(`[Bitunix ERROR] Sync gagal: ${res.error}`)
            } else {
                logger.info(`[Bitunix SUCCESS] Berhasil menarik data Bitunix! Status: ${res.status}`)
            }
        } catch (err) {
            overallSuccess = false
            logger.error('[Bitunix CRASH] Terjadi exception saat menguji Bitunix:', err)
        }
    }

    // Cleanup
    closeDb()
    if (tempDir && existsSync(tempDir)) {
        try {
            rmSync(tempDir, { recursive: true, force: true })
        } catch { }
    }

    logger.info('\n===================================================================')
    if (overallSuccess) {
        logger.info('   [LULUS] PENGUJIAN API KEY SELESAI TANPA ERROR ERROR UTAMA      ')
    } else {
        logger.error('   [GAGAL] DIPEROLAH ERROR SAAT SINKRONISASI API KEY              ')
    }
    logger.info(`File Log Lengkap Hasil Tes : ${logPath}`)
    logger.info('===================================================================\n')

    process.exit(overallSuccess ? 0 : 1)
}

app.whenReady().then(() => {
    runTest().catch((err) => {
        logger.error('Fatal Test Runner Exception:', err)
        process.exit(1)
    })
})
