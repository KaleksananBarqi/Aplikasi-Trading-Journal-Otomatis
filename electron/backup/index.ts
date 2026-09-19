/**
 * Backup ke Google Drive (fitur 5).
 *
 * ===========================================================================
 * DESAIN
 * ===========================================================================
 *
 * OAuth 2.0 PKCE dengan loopback redirect (http://localhost:PORT).
 * Token disimpan via safeStorage (pola keystore.ts).
 *
 * Alur:
 * 1. User klik "Hubungkan Google Drive" di Settings.
 * 2. App buka browser ke URL OAuth Google dengan state PKCE.
 * 3. Google redirect ke localhost:PORT?code=...
 * 4. App tukar code dengan access_token + refresh_token.
 * 5. Token disimpan terenkripsi.
 * 6. Backup: snapshot JSON semua trade + screenshot + manifest.
 *
 * SATU ARAH: upload saja, tidak ada download/restore otomatis.
 * Alasan: restore otomatis bisa menimpa data lokal tanpa konfirmasi user,
 * yang berbahaya untuk data finansial.
 *
 * CATATAN: Client ID adalah "Desktop App" type dari Google Cloud Console.
 * Tidak ada client_secret — PKCE flow untuk installed apps tidak butuh secret.
 */

import { app, dialog, safeStorage, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { getDb } from '../db/index'
import { getSetting, setSetting, SETTING_KEYS } from '../db/repositories/settings'
import { listTrades } from '../db/repositories/trades'
import { getScreenshotDir } from '../screenshots/index'
import type { BackupStatusPayload, BackupRunResult } from '../../shared/ipc-contract'
import { logger } from '../utils/logger'

const CREDENTIALS_DIR = 'credentials'
const GDRIVE_TOKEN_FILE = 'gdrive_token.bin'
const DEFAULT_REDIRECT_PORT = 17380
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/**
 * Dapatkan Client ID Google Cloud OAuth yang aktif.
 * Prioritas: DB settings -> environment variable GDRIVE_CLIENT_ID.
 */
export function getEffectiveClientId(): string {
    const db = getDb()
    const configured = getSetting<string>(db, SETTING_KEYS.gdriveClientId, '')
    return configured || process.env.GDRIVE_CLIENT_ID || ''
}


// ---------------------------------------------------------------------------
// Token storage (safeStorage)
// -----------------------------------------------------------------------

interface StoredToken {
    payload: string
    updatedAt: number
    email: string | null
}

function credentialsDir(): string {
    const dir = join(app.getPath('userData'), CREDENTIALS_DIR)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

function tokenPath(): string {
    return join(credentialsDir(), GDRIVE_TOKEN_FILE)
}

function isSafeStorageAvailable(): boolean {
    try {
        return safeStorage.isEncryptionAvailable()
    } catch {
        return false
    }
}

interface TokenData {
    access_token: string
    refresh_token: string | null
    expiry_date: number | null
    email: string | null
}

function saveToken(token: TokenData): void {
    if (!isSafeStorageAvailable()) {
        throw new Error('Penyimpanan aman OS tidak tersedia. Token Google Drive tidak disimpan.')
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(token))
    const stored: StoredToken = {
        payload: encrypted.toString('base64'),
        updatedAt: Date.now(),
        email: token.email
    }
    writeFileSync(tokenPath(), JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
}

function loadToken(): TokenData | null {
    const path = tokenPath()
    if (!existsSync(path)) return null
    try {
        const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredToken
        const decrypted = safeStorage.decryptString(Buffer.from(stored.payload, 'base64'))
        return JSON.parse(decrypted) as TokenData
    } catch {
        return null
    }
}

function deleteToken(): void {
    const path = tokenPath()
    if (existsSync(path)) {
        rmSync(path, { force: true })
    }
}

// ---------------------------------------------------------------------------
// OAuth flow
// -----------------------------------------------------------------------

function generatePkce(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString('base64url')
    // Challenge = base64url(SHA256(verifier))
    const hash = createHash('sha256').update(verifier).digest('base64url')
    return { verifier, challenge: hash }
}

function buildAuthUrl(challenge: string, port: number, state: string, clientId: string): string {
    const redirectUri = `http://localhost:${port}`
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: OAUTH_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function exchangeCodeForToken(code: string, verifier: string, port: number, clientId: string): Promise<TokenData> {
    const redirectUri = `http://localhost:${port}`
    const body = new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
    })

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Token exchange failed: ${errorText}`)
    }

    const token = await response.json() as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        id_token?: string
    }

    // Dapatkan email dari id_token (JWT decode tanpa verifikasi — hanya untuk display).
    let email: string | null = null
    if (token.id_token) {
        try {
            const parts = token.id_token.split('.')
            if (parts.length < 2) throw new Error('Invalid id_token format')
            const part = parts[1] ?? ''
            const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'))
            email = payload.email ?? null
        } catch {
            // Ignore — email hanya untuk display.
        }
    }

    return {
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        expiry_date: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
        email
    }
}

export async function startOAuthFlow(clientIdOverride?: string): Promise<void> {
    const db = getDb()
    if (clientIdOverride && clientIdOverride.trim()) {
        setSetting(db, SETTING_KEYS.gdriveClientId, clientIdOverride.trim())
    }

    const clientId = clientIdOverride?.trim() || getEffectiveClientId()

    if (!clientId) {
        throw new Error(
            'Google Drive Client ID belum dikonfigurasi. ' +
            'Silakan masukkan Client ID di menu Pengaturan atau gunakan opsi Folder Sync lokal.'
        )
    }
    if (!isSafeStorageAvailable()) {
        throw new Error('Penyimpanan aman OS tidak tersedia.')
    }

    const port = DEFAULT_REDIRECT_PORT
    const { verifier, challenge } = generatePkce()
    const state = randomBytes(16).toString('hex')

    const authUrl = buildAuthUrl(challenge, port, state, clientId)

    // Jalankan server redirect sementara.
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`)
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Autentikasi dibatalkan.</h2><p>Anda bisa menutup jendela ini.</p></body></html>')
            server.close()
            return
        }

        if (returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>State mismatch — kemungkinan CSRF.</h2></body></html>')
            server.close()
            return
        }

        if (code) {
            try {
                const token = await exchangeCodeForToken(code, verifier, port, clientId)
                saveToken(token)

                setSetting(db, SETTING_KEYS.gdriveEmail, token.email ?? '')
                setSetting(db, SETTING_KEYS.gdriveFolderId, '')
                setSetting(db, SETTING_KEYS.gdriveLastBackupAt, 0)
                setSetting(db, SETTING_KEYS.gdriveSyncMode, 'oauth')

                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<html><body><h2>Google Drive terhubung!</h2><p>Anda bisa menutup jendela ini dan kembali ke aplikasi.</p></body></html>')
                logger.info('[backup] Google Drive berhasil terhubung via OAuth.')
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' })
                res.end(`<html><body><h2>Gagal menghubungkan.</h2><p>${err instanceof Error ? err.message : String(err)}</p></body></html>`)
            }
            server.close()
        } else {
            res.writeHead(404, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Permintaan tidak dikenali.</h2></body></html>')
        }
    })

    await new Promise<void>((resolve, reject) => {
        server.on('error', reject)
        server.listen(port, () => {
            logger.info(`[backup] Server redirect OAuth mendengarkan di port ${port}`)
            resolve()
        })
    })

    await shell.openExternal(authUrl)

    // Tutup server setelah 5 menit kalau tidak ada response.
    setTimeout(() => {
        if (server.listening) {
            server.close()
            logger.warn('[backup] Server redirect OAuth ditutup setelah timeout.')
        }
    }, 5 * 60 * 1000)
}

/**
 * Dialog pemilih folder Google Drive lokal di PC pengguna.
 */
export async function selectLocalFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
        title: 'Pilih Folder Sinkronisasi Google Drive / Cadangan',
        properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
        return null
    }

    const chosen = result.filePaths[0]
    const db = getDb()
    setSetting(db, SETTING_KEYS.gdriveLocalFolder, chosen)
    setSetting(db, SETTING_KEYS.gdriveSyncMode, 'folder')
    logger.info(`[backup] Folder lokal disetel ke: ${chosen}`)
    return chosen ?? null
}


// ---------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------

export function getBackupStatus(): BackupStatusPayload {
    const db = getDb()
    const token = loadToken()
    const email = getSetting<string>(db, SETTING_KEYS.gdriveEmail, '')
    const folder = getSetting<string>(db, SETTING_KEYS.gdriveFolderId, '')
    const lastBackupAt = getSetting<number>(db, SETTING_KEYS.gdriveLastBackupAt, 0)
    const localFolder = getSetting<string>(db, SETTING_KEYS.gdriveLocalFolder, '')
    const syncMode = getSetting<'folder' | 'oauth'>(db, SETTING_KEYS.gdriveSyncMode, localFolder ? 'folder' : 'oauth')
    const clientId = getEffectiveClientId()

    return {
        connected: token !== null || Boolean(localFolder),
        email: email || null,
        folder: folder || null,
        lastBackupAt: lastBackupAt || null,
        nextBackupAt: null,
        syncMode,
        localFolder: localFolder || null,
        clientIdConfigured: Boolean(clientId)
    }
}

export function disconnectBackup(): void {
    deleteToken()
    const db = getDb()
    setSetting(db, SETTING_KEYS.gdriveEmail, '')
    setSetting(db, SETTING_KEYS.gdriveFolderId, '')
    setSetting(db, SETTING_KEYS.gdriveLocalFolder, '')
    setSetting(db, SETTING_KEYS.gdriveLastBackupAt, 0)
    logger.info('[backup] Koneksi backup diputus / dibersihkan.')
}

// ---------------------------------------------------------------------------
// Backup engine
// -----------------------------------------------------------------------

export async function runBackup(): Promise<BackupRunResult> {
    const db = getDb()
    const token = loadToken()
    const localFolder = getSetting<string>(db, SETTING_KEYS.gdriveLocalFolder, '')

    if (!token && !localFolder) {
        throw new Error(
            'Google Drive belum terhubung. ' +
            'Silakan pilih Folder Google Drive di komputer atau hubungkan akun Google Drive via OAuth.'
        )
    }

    const start = Date.now()
    const trades = listTrades(db, {})

    // Snapshot JSON trade
    const snapshot = JSON.stringify({
        exportedAt: Date.now(),
        version: 1,
        trades
    }, null, 2)

    let filesUploaded = 0
    let bytesUploaded = 0

    // Mode A: Sinkron ke Folder Google Drive lokal (1-klik)
    if (localFolder) {
        if (!existsSync(localFolder)) {
            mkdirSync(localFolder, { recursive: true })
        }

        const dateStr = new Date().toISOString().slice(0, 10)
        const jsonPath = join(localFolder, `trading-journal-${dateStr}.json`)
        writeFileSync(jsonPath, snapshot, 'utf8')
        filesUploaded++
        bytesUploaded += Buffer.byteLength(snapshot, 'utf8')

        // Backup database SQLite fisik jika ada
        const dbPath = join(app.getPath('userData'), 'trades.db')
        if (existsSync(dbPath)) {
            const destDb = join(localFolder, 'trading-journal-database.db')
            copyFileSync(dbPath, destDb)
            const stat = statSync(destDb)
            filesUploaded++
            bytesUploaded += stat.size
        }

        // Backup screenshot
        const screenshotDir = getScreenshotDir()
        if (existsSync(screenshotDir)) {
            const destScreenshots = join(localFolder, 'screenshots')
            if (!existsSync(destScreenshots)) mkdirSync(destScreenshots, { recursive: true })
            const files = readdirSync(screenshotDir)
            for (const file of files) {
                const srcPath = join(screenshotDir, file)
                const dstPath = join(destScreenshots, file)
                copyFileSync(srcPath, dstPath)
                const stat = statSync(srcPath)
                filesUploaded++
                bytesUploaded += stat.size
            }
        }
    }

    // Mode B: Upload ke Cloud Google Drive via token OAuth (jika ada)
    if (token) {
        try {
            const folderId = await ensureBackupFolder(token.access_token)
            const snapshotName = `trading-journal-${new Date().toISOString().slice(0, 10)}.json`
            await uploadFile(token.access_token, folderId, snapshotName, snapshot, 'application/json')
            filesUploaded++
            bytesUploaded += Buffer.byteLength(snapshot, 'utf8')

            const screenshotDir = getScreenshotDir()
            if (existsSync(screenshotDir)) {
                const files = readdirSync(screenshotDir)
                for (const fileName of files) {
                    const filePath = join(screenshotDir, fileName)
                    const stat = statSync(filePath)
                    const data = readFileSync(filePath)
                    await uploadFile(token.access_token, folderId, fileName, data, 'application/octet-stream')
                    filesUploaded++
                    bytesUploaded += stat.size
                }
            }

            setSetting(db, SETTING_KEYS.gdriveFolderId, folderId)
        } catch (cloudErr) {
            // Jika mode folder lokal sudah berhasil, catat warning daripada gagalkan seluruh backup
            if (localFolder) {
                logger.warn('[backup] Cloud upload gagal namun folder lokal sukses:', cloudErr)
            } else {
                throw cloudErr
            }
        }
    }

    setSetting(db, SETTING_KEYS.gdriveLastBackupAt, Date.now())

    return {
        status: 'ok',
        filesUploaded,
        bytesUploaded,
        durationMs: Date.now() - start
    }
}


async function ensureBackupFolder(accessToken: string): Promise<string> {
    // Cari folder "Trading Journal Backup" yang sudah ada.
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files')
    searchUrl.searchParams.set('q', "name='Trading Journal Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false")
    searchUrl.searchParams.set('fields', 'files(id,name)')

    const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files: { id: string }[] }
        if (searchData.files && searchData.files.length > 0) {
            const file = searchData.files[0]
            if (file) return file.id
        }
    }

    // Buat folder baru.
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'Trading Journal Backup',
            mimeType: 'application/vnd.google-apps.folder'
        })
    })

    if (!createResponse.ok) {
        throw new Error('Gagal membuat folder backup di Google Drive.')
    }

    const created = await createResponse.json() as { id: string }
    return created.id
}

async function uploadFile(
    accessToken: string,
    folderId: string,
    name: string,
    content: string | Buffer,
    mimeType: string
): Promise<void> {
    // Gunakan multipart upload API.
    const boundary = '----formdata-' + randomBytes(8).toString('hex')
    const metadata = JSON.stringify({ name, parents: [folderId] })

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\n`),
        Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'),
        Buffer.from(metadata),
        Buffer.from('\r\n--${boundary}\r\n'),
        Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
        typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ])

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gagal upload ${name}: ${errorText}`)
    }
}
