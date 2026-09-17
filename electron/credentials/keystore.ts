import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ExchangeCredentials, SupportedExchange } from '../exchanges/types'

/**
 * Penyimpanan kredensial lewat safeStorage bawaan Electron.
 *
 * KEPUTUSAN D2 (plans/01-ARCHITECTURE.md): `safeStorage`, BUKAN `keytar`.
 * Alasan: `keytar` sudah deprecated oleh maintainer-nya dan menambah native addon
 * kedua yang memperbesar risiko kegagalan build. `safeStorage` memakai:
 *   - Windows : DPAPI
 *   - macOS   : Keychain
 *   - Linux   : libsecret
 *
 * ATURAN KEAMANAN (brief §8 & §11):
 * - Kredensial TIDAK PERNAH ditulis ke source code, file .env, atau database SQLite.
 * - Ciphertext disimpan di file terpisah di direktori userData, di luar repo.
 * - Kredensial TIDAK PERNAH dikirim ke renderer. Renderer hanya mengirim
 *   kredensial SEKALI saat user mengetiknya, dan hanya menerima status boolean.
 */

const CREDENTIALS_DIR = 'credentials'

interface StoredCredentialFile {
    /** Ciphertext base64 dari safeStorage.encryptString(). */
    payload: string
    /** Terakhir diperbarui, epoch ms. Untuk ditampilkan di UI. */
    updatedAt: number
    /** Hanya untuk ditampilkan ke user (mis. "a1b2…f9"), BUKAN kredensial penuh. */
    keyHint: string
}

function credentialsDir(): string {
    const dir = join(app.getPath('userData'), CREDENTIALS_DIR)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

function credentialPath(exchange: SupportedExchange): string {
    return join(credentialsDir(), `${exchange}.bin`)
}

/**
 * Cek apakah penyimpanan aman benar-benar tersedia.
 *
 * Di Linux, `safeStorage` bergantung pada libsecret yang mungkin tidak terpasang.
 * Memanggilnya tanpa cek akan melempar error yang membingungkan.
 */
export function isSecureStorageAvailable(): boolean {
    try {
        return safeStorage.isEncryptionAvailable()
    } catch {
        return false
    }
}

/** Sembunyikan kredensial: hanya tampilkan 4 karakter awal dan 4 akhir. */
function makeKeyHint(apiKey: string): string {
    if (apiKey.length <= 8) return '••••'
    return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

export interface CredentialStatus {
    exchange: SupportedExchange
    configured: boolean
    keyHint: string | null
    updatedAt: number | null
}

/** Apakah kredensial untuk exchange ini sudah tersimpan. */
export function getStatus(exchange: SupportedExchange): CredentialStatus {
    const path = credentialPath(exchange)
    if (!existsSync(path)) {
        return { exchange, configured: false, keyHint: null, updatedAt: null }
    }

    try {
        const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredCredentialFile
        return {
            exchange,
            configured: true,
            keyHint: stored.keyHint,
            updatedAt: stored.updatedAt
        }
    } catch {
        // File rusak: anggap belum terkonfigurasi, jangan crash.
        return { exchange, configured: false, keyHint: null, updatedAt: null }
    }
}

/**
 * Simpan kredensial terenkripsi.
 * Melempar error bila safeStorage tidak tersedia — lebih baik gagal jelas
 * daripada diam-diam menyimpan plaintext.
 */
export function saveCredentials(
    exchange: SupportedExchange,
    credentials: ExchangeCredentials
): void {
    if (!isSecureStorageAvailable()) {
        throw new Error(
            'Penyimpanan aman OS tidak tersedia. Kredensial tidak disimpan — ' +
            'tidak ada jalur penyimpanan plaintext sebagai fallback.'
        )
    }

    const apiKey = credentials.apiKey.trim()
    const apiSecret = credentials.apiSecret.trim()

    if (apiKey === '' || apiSecret === '') {
        throw new Error('API key dan secret tidak boleh kosong.')
    }

    // Yang dienkripsi adalah gabungan keduanya, sehingga dua nilai tersimpan
    // dalam satu ciphertext — tidak ada bagian yang tertinggal plaintext.
    const serialized = JSON.stringify({ apiKey, apiSecret })
    const encrypted = safeStorage.encryptString(serialized)

    const stored: StoredCredentialFile = {
        payload: encrypted.toString('base64'),
        updatedAt: Date.now(),
        keyHint: makeKeyHint(apiKey)
    }

    // Tulis dengan mode 0600 di POSIX (di Windows diabaikan).
    writeFileSync(credentialPath(exchange), JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
}

/**
 * Baca kredensial terdekripsi.
 * HANYA boleh dipanggil dari main process, dan hasilnya tidak boleh dikirim
 * ke renderer.
 */
export function loadCredentials(exchange: SupportedExchange): ExchangeCredentials | null {
    const path = credentialPath(exchange)
    if (!existsSync(path)) return null

    try {
        const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredCredentialFile
        const decrypted = safeStorage.decryptString(Buffer.from(stored.payload, 'base64'))
        const parsed = JSON.parse(decrypted) as ExchangeCredentials

        if (!parsed.apiKey || !parsed.apiSecret) return null
        return parsed
    } catch {
        // Gagal dekripsi biasanya berarti: profil OS berubah, atau file dipindah ke
        // mesin lain. Kredensial tidak bisa dipulihkan — user harus input ulang.
        return null
    }
}

export function deleteCredentials(exchange: SupportedExchange): void {
    const path = credentialPath(exchange)
    if (existsSync(path)) {
        rmSync(path, { force: true })
    }
}

/** Status semua exchange sekaligus, untuk ditampilkan di Settings. */
export function getAllStatuses(): CredentialStatus[] {
    return [getStatus('mexc'), getStatus('bitunix')]
}
