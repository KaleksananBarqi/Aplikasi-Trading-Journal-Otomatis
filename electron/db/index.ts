import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runMigrations, type MigrationResult } from './migrate'

/**
 * Koneksi SQLite lokal (better-sqlite3).
 *
 * Berjalan di MAIN PROCESS. `better-sqlite3` adalah native addon dengan prebuilt
 * N-API binary, jadi tidak perlu compile ulang per versi Electron (keputusan D1,
 * lihat plans/01-ARCHITECTURE.md §Koreksi D1).
 */

let db: Database.Database | null = null

/** Direktori data aplikasi: <userData>/data — di luar repo, ter-backup terpisah. */
export function getDataDir(): string {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return dir
}

export function getDbPath(): string {
    return join(getDataDir(), 'trading-journal.sqlite')
}

/**
 * Buka koneksi DB dan terapkan PRAGMA wajib.
 * Lihat plans/02-DATA-MODEL.md §8.
 */
export function openDb(path: string = getDbPath()): Database.Database {
    if (db) return db

    db = new Database(path)

    // WAL: memungkinkan baca saat tulis berjalan.
    db.pragma('journal_mode = WAL')
    // KRITIS: SQLite default-nya OFF. Tanpa ini semua deklarasi REFERENCES
    // (ON DELETE CASCADE, dsb) tidak ditegakkan sama sekali.
    db.pragma('foreign_keys = ON')
    // Aman dipakai bersama WAL.
    db.pragma('synchronous = NORMAL')

    return db
}

export function getDb(): Database.Database {
    if (!db) {
        throw new Error('Database belum dibuka. Panggil openDb() lebih dulu.')
    }
    return db
}

export function closeDb(): void {
    if (db) {
        db.close()
        db = null
    }
}

/** Buka DB lalu jalankan migrasi. Dipanggil sekali saat startup. */
export function initializeDb(path?: string): MigrationResult {
    const connection = openDb(path)
    return runMigrations(connection)
}

/**
 * Smoke test Fase 0: memverifikasi native addon berfungsi pada ABI Electron
 * dan PRAGMA benar-benar diterapkan.
 */
export function runSmokeTest(): { ok: boolean; details: string[] } {
    const details: string[] = []

    try {
        const testDb = new Database(':memory:')

        const selectOne = testDb.prepare('SELECT 1 AS value').get() as { value: number }
        details.push(`[ok] native addon termuat, SELECT 1 = ${selectOne.value}`)

        testDb.pragma('foreign_keys = ON')
        const fk = testDb.pragma('foreign_keys', { simple: true }) as number
        details.push(`[ok] PRAGMA foreign_keys = ${fk}${fk === 1 ? '' : ' (GAGAL: seharusnya 1)'}`)

        // Buktikan foreign key benar-benar DITEGAKKAN, bukan cuma dilaporkan aktif.
        testDb.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE
      );
    `)
        testDb.prepare('INSERT INTO parent (id) VALUES (1)').run()
        testDb.prepare('INSERT INTO child (id, parent_id) VALUES (1, 1)').run()
        testDb.prepare('DELETE FROM parent WHERE id = 1').run()

        const orphan = testDb.prepare('SELECT COUNT(*) AS n FROM child').get() as { n: number }
        details.push(
            `[ok] ON DELETE CASCADE bekerja: sisa baris anak = ${orphan.n}${orphan.n === 0 ? '' : ' (GAGAL: seharusnya 0)'}`
        )

        // Verifikasi skema nyata benar-benar terpasang di DB produksi.
        if (db) {
            const tables = db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .all() as { name: string }[]
            const tableNames = tables.map((t) => t.name).filter((n) => !n.startsWith('sqlite_'))
            details.push(`[ok] tabel terpasang: ${tableNames.join(', ')}`)

            const version = db
                .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
                .get() as { v: number }
            details.push(`[ok] schema version = ${version.v}`)
        }

        testDb.close()

        const failures = details.filter((line) => line.includes('GAGAL'))
        return { ok: failures.length === 0, details }
    } catch (error) {
        details.push(`[GAGAL] ${error instanceof Error ? error.message : String(error)}`)
        return { ok: false, details }
    }
}
