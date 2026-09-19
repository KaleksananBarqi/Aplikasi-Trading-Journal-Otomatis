import type Database from 'better-sqlite3'
import migration001 from './migrations/001_init.sql?raw'
import migration002 from './migrations/002_sync_support.sql?raw'
import migration003 from './migrations/003_custom_tags.sql?raw'
import migration004 from './migrations/004_account_balances.sql?raw'

/**
 * Runner migrasi.
 *
 * Aturan (plans/02-DATA-MODEL.md §9):
 * - Migrasi dijalankan otomatis saat app start, di dalam transaksi.
 * - Migrasi yang SUDAH DIRILIS tidak boleh di-edit. Perubahan = migrasi baru.
 *   Kalau file lama diubah, user yang sudah punya DB akan mendapat skema berbeda
 *   dari user baru — sumber bug yang sangat sulit dilacak.
 *
 * Kalau butuh mengubah skema: TAMBAHKAN entri baru di akhir array MIGRATIONS,
 * jangan sentuh file migrasi yang sudah ada.
 */

interface Migration {
    version: number
    name: string
    sql: string
}

/** Daftar migrasi berurutan. Tambahkan entri baru di akhir, jangan edit yang lama. */
const MIGRATIONS: Migration[] = [
    { version: 1, name: '001_init', sql: migration001 },
    { version: 2, name: '002_sync_support', sql: migration002 },
    { version: 3, name: '003_custom_tags', sql: migration003 },
    { version: 4, name: '004_account_balances', sql: migration004 }
]


export interface MigrationResult {
    applied: number[]
    currentVersion: number
}

function ensureMigrationsTable(db: Database.Database): void {
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)
}

function getAppliedVersions(db: Database.Database): Set<number> {
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        version: number
    }[]
    return new Set(rows.map((row) => row.version))
}

/**
 * Jalankan semua migrasi yang belum diterapkan.
 * Setiap migrasi dibungkus transaksi sendiri: kalau satu gagal, yang sudah
 * berhasil sebelumnya tetap tercatat dan tidak diulang.
 */
export function runMigrations(db: Database.Database): MigrationResult {
    ensureMigrationsTable(db)

    const applied = getAppliedVersions(db)
    const appliedNow: number[] = []

    for (const migration of MIGRATIONS) {
        if (applied.has(migration.version)) continue

        const execute = db.transaction(() => {
            db.exec(migration.sql)
            db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
                migration.version,
                migration.name,
                Date.now()
            )
        })

        execute()
        appliedNow.push(migration.version)
    }

    const current = db
        .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
        .get() as { v: number }

    return { applied: appliedNow, currentVersion: current.v }
}
