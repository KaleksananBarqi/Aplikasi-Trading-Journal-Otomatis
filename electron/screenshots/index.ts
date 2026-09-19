/**
 * Manajemen file screenshot lokal.
 *
 * Screenshot disimpan di folder terkelola `userData/data/screenshots` dengan
 * nama generik `trade-<timestamp>.png`. Renderer TIDAK pernah mengirim path
 * absolut atau akses filesystem — ia hanya mengirim bytes + nama file untuk
 * validasi ekstensi. Path yang tersimpan di DB adalah nama relatif (filename),
 * bukan path absolut.
 *
 * Keamanan:
 * - Validasi ekstensi (.png/.jpg/.jpeg/.webp/.gif).
 * - Validasi magic bytes agar file yang bukan gambar tidak bisa disisipkan.
 * - Batas ukuran (5 MB).
 * - Selalu gunakan nama generik, bukan nama asli user (cegah path traversal).
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

/** Map ekstensi -> magic bytes (awalan) untuk validasi gambar. */
const MAGIC_BYTES: Record<string, number[]> = {
    '.png': [0x89, 0x50, 0x4e, 0x47],
    '.jpg': [0xff, 0xd8],
    '.jpeg': [0xff, 0xd8],
    '.webp': [0x52, 0x49, 0x46, 0x46], // RIFF
    '.gif': [0x47, 0x49, 0x46] // GIF
}

/** Direktori tempat screenshot disimpan. */
export function getScreenshotDir(): string {
    const dir = join(app.getPath('userData'), 'data', 'screenshots')
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

function hasMagicBytes(ext: string, data: Uint8Array): boolean {
    const magic = MAGIC_BYTES[ext]
    if (!magic) return false
    if (data.length < magic.length) return false
    return magic.every((byte, index) => data[index] === byte)
}

/**
 * Simpan screenshot dari bytes yang dikirim renderer.
 *
 * @returns nama file relatif (hanya filename) atau throws.
 */
export function saveScreenshot(input: {
    fileName: string
    data: Uint8Array
}): string {
    const ext = extname(input.fileName).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error('File harus berupa gambar (PNG, JPG, JPEG, WebP, atau GIF).')
    }
    if (input.data.byteLength > MAX_BYTES) {
        throw new Error('Ukuran screenshot melebihi batas maksimal 4 MB.')
    }
    if (!hasMagicBytes(ext, input.data)) {
        throw new Error('File yang dipilih bukan gambar yang valid.')
    }

    const fileName = `trade-${Date.now()}${ext}`
    const filePath = join(getScreenshotDir(), fileName)
    writeFileSync(filePath, Buffer.from(input.data))
    return fileName
}

/** Hapus file screenshot berdasarkan nama file (relatif). */
export function deleteScreenshot(fileName: string): void {
    if (!fileName) return
    // Cegah path traversal: hanya terima nama file tanpa separator.
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return
    }
    const filePath = join(getScreenshotDir(), fileName)
    if (existsSync(filePath)) {
        try {
            unlinkSync(filePath)
        } catch {
            // Tidak menjatuhkan aplikasi jika file sudah terhapus.
        }
    }
}

/**
 * Baca screenshot sebagai data URL agar renderer bisa menampilkannya tanpa
 * akses filesystem.
 *
 * @returns data URL (mis. `data:image/png;base64,...`) atau throws.
 */
export function readScreenshotDataUrl(fileName: string): string {
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        throw new Error('Nama file screenshot tidak valid.')
    }
    const filePath = join(getScreenshotDir(), fileName)
    if (!existsSync(filePath)) {
        throw new Error('File screenshot tidak ditemukan.')
    }
    const buffer = readFileSync(filePath)
    const ext = extname(fileName).toLowerCase()
    const mime =
        ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                    ? 'image/webp'
                    : ext === '.gif'
                        ? 'image/gif'
                        : 'application/octet-stream'
    return `data:${mime};base64,${buffer.toString('base64')}`
}