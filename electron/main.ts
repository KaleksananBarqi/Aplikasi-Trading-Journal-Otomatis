import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { closeDb, getDbPath, initializeDb } from './db/index'
import { registerIpcHandlers } from './ipc/handlers'
import { registerSyncHandlers } from './ipc/sync-handlers'

/**
 * Entry point main process.
 *
 * Fase 1: aplikasi membuka DB, menjalankan migrasi, lalu menampilkan UI jurnal.
 * Belum ada integrasi exchange (itu Fase 2+).
 */

const APP_NAME = 'Aplikasi Trading Journal Otomatis'

/**
 * WAJIB dipanggil SEBELUM app.whenReady().
 *
 * Tanpa ini, Electron memakai nama default "Electron", sehingga `userData` jatuh ke
 * `%APPDATA%\Electron`. Akibatnya SEMUA aplikasi Electron lain di mesin ini berbagi
 * folder data yang sama — berbahaya untuk data jurnal finansial.
 */
app.setName(APP_NAME)

/** Referensi jendela aktif, dipakai handler sync untuk mengirim progres. */
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        title: APP_NAME,
        // Latar gelap sejak awal supaya tidak ada kedipan putih saat load,
        // mengingat app ini dark-mode-first (brief §7).
        backgroundColor: '#0f141c',
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            // Renderer tidak punya akses Node sama sekali.
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    })

    // Tampilkan hanya setelah render siap — mencegah layar putih berkedip.
    window.once('ready-to-show', () => window.show())

    window.on('closed', () => {
        if (mainWindow === window) mainWindow = null
    })

    mainWindow = window

    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        void window.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

/**
 * Kunci single-instance.
 *
 * Dua instance yang menulis ke file SQLite yang sama berisiko korupsi data.
 * Instance kedua langsung keluar dan memfokuskan jendela yang sudah ada.
 */
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        const [existing] = BrowserWindow.getAllWindows()
        if (existing) {
            if (existing.isMinimized()) existing.restore()
            existing.focus()
        }
    })

    app.whenReady().then(() => {
        // Buka DB + jalankan migrasi. Kalau native addon rusak atau SQL invalid,
        // error muncul SEKARANG — saat startup — bukan nanti saat user menyimpan trade.
        try {
            const result = initializeDb()
            console.log('[db] koneksi terbuka:', getDbPath())
            if (result.applied.length > 0) {
                console.log(`[db] migrasi diterapkan: ${result.applied.join(', ')}`)
            }
            console.log(`[db] schema version: ${result.currentVersion}`)
        } catch (error) {
            console.error('[db] GAGAL menginisialisasi database:', error)
            throw error
        }

        registerIpcHandlers()
        registerSyncHandlers(() => mainWindow)
        createWindow()

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            }
        })
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    app.on('before-quit', () => {
        closeDb()
    })
}
