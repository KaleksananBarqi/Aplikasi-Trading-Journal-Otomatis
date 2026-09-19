/**
 * Penyimpanan aman untuk kredensial AI (fitur 6).
 *
 * Memakai pola yang sama dengan `electron/credentials/keystore.ts`:
 * - safeStorage (DPAPI di Windows, Keychain di macOS, libsecret di Linux)
 * - Ciphertext di file `.bin` di `userData/credentials/`
 * - TIDAK PERNAH dikirim ke renderer (hanya status boolean)
 */

import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const CREDENTIALS_DIR = 'credentials'
const AI_KEY_FILE = 'ai_api_key.bin'

interface StoredAiKey {
    payload: string
    updatedAt: number
    keyHint: string
}

function credentialsDir(): string {
    const dir = join(app.getPath('userData'), CREDENTIALS_DIR)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

function aiKeyPath(): string {
    return join(credentialsDir(), AI_KEY_FILE)
}

function makeKeyHint(apiKey: string): string {
    if (apiKey.length <= 8) return '••••'
    return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

export function isSecureStorageAvailable(): boolean {
    try {
        return safeStorage.isEncryptionAvailable()
    } catch {
        return false
    }
}

export function saveAiApiKey(apiKey: string): void {
    if (!isSecureStorageAvailable()) {
        throw new Error('Penyimpanan aman OS tidak tersedia. API key tidak disimpan.')
    }
    const key = apiKey.trim()
    if (key === '') {
        throw new Error('API key tidak boleh kosong.')
    }
    const encrypted = safeStorage.encryptString(key)
    const stored: StoredAiKey = {
        payload: encrypted.toString('base64'),
        updatedAt: Date.now(),
        keyHint: makeKeyHint(key)
    }
    writeFileSync(aiKeyPath(), JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
}

export function loadAiApiKey(): string | null {
    const path = aiKeyPath()
    if (!existsSync(path)) return null
    try {
        const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredAiKey
        const decrypted = safeStorage.decryptString(Buffer.from(stored.payload, 'base64'))
        return decrypted
    } catch {
        return null
    }
}

export function getAiKeyHint(): string | null {
    const path = aiKeyPath()
    if (!existsSync(path)) return null
    try {
        const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredAiKey
        return stored.keyHint
    } catch {
        return null
    }
}

export function deleteAiApiKey(): void {
    const path = aiKeyPath()
    if (existsSync(path)) {
        rmSync(path, { force: true })
    }
}
