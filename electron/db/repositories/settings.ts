import type Database from 'better-sqlite3'

/**
 * Repository settings — penyimpanan key-value untuk konfigurasi NON-KREDENSIAL.
 *
 * KREDENSIAL TIDAK PERNAH DISIMPAN DI SINI. API key & secret disimpan lewat
 * safeStorage bawaan Electron (keputusan D2, plans/01-ARCHITECTURE.md).
 *
 * Nilai disimpan sebagai JSON string supaya bisa menampung object/array
 * (mis. `session_bounds`, `checklist_template`) tanpa perlu tabel tambahan.
 */

export function getSetting<T>(db: Database.Database, key: string, fallback: T): T {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined

    if (!row) return fallback

    try {
        return JSON.parse(row.value) as T
    } catch {
        // Nilai rusak / bukan JSON valid: kembalikan fallback daripada crash.
        // Data yang tidak terbaca tidak boleh menjatuhkan aplikasi.
        return fallback
    }
}

export function setSetting(db: Database.Database, key: string, value: unknown): void {
    db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, JSON.stringify(value))
}

export function deleteSetting(db: Database.Database, key: string): void {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

/** Semua settings sebagai objek. Dipakai UI untuk memuat preferensi sekaligus. */
export function getAllSettings(db: Database.Database): Record<string, unknown> {
    const rows = db.prepare('SELECT key, value FROM settings').all() as {
        key: string
        value: string
    }[]
    const result: Record<string, unknown> = {}
    for (const row of rows) {
        try {
            result[row.key] = JSON.parse(row.value)
        } catch {
            // Lewati nilai yang rusak, jangan gagalkan seluruh pemuatan.
        }
    }
    return result
}

// ---------------------------------------------------------------------------
// Kunci settings yang dipakai aplikasi — terpusat supaya tidak ada typo string
// ---------------------------------------------------------------------------

export const SETTING_KEYS = {
    /** Batas sesi trading (UTC). Lihat plans/01-ARCHITECTURE.md §5. */
    sessionBounds: 'session_bounds',
    /** Tema: 'dark' | 'light' | 'system'. Default gelap (brief §7). */
    theme: 'theme',
    /** Mode colorblind-safe (brief §7). */
    colorblindSafe: 'colorblind_safe',
    /** Auto-sync: DEFAULT OFF, user mengaktifkan sendiri (brief §4.3). */
    autoSyncEnabled: 'auto_sync_enabled',
    autoSyncIntervalMin: 'auto_sync_interval_min',
    /** Template checklist default untuk trade baru. */
    checklistTemplate: 'checklist_template'
} as const

export interface SessionBounds {
    startUtcMinutes: number
    endUtcMinutes: number
}

/**
 * Batas sesi trading default, basis UTC (menit dari tengah malam).
 *
 * CATATAN PENTING: London (07:00–16:00) dan New York (12:00–21:00) OVERLAP pada
 * 12:00–16:00 UTC. Ini disengaja (plans/01-ARCHITECTURE.md §5), tapi UI wajib
 * menampilkan catatan agar user tidak menjumlahkan persentase lintas sesi dan
 * mengira totalnya 100%.
 */
export const DEFAULT_SESSION_BOUNDS: Record<'asia' | 'london' | 'newyork', SessionBounds> = {
    asia: { startUtcMinutes: 0, endUtcMinutes: 9 * 60 },
    london: { startUtcMinutes: 7 * 60, endUtcMinutes: 16 * 60 },
    newyork: { startUtcMinutes: 12 * 60, endUtcMinutes: 21 * 60 }
}
