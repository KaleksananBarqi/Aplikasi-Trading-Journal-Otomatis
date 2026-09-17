/**
 * Smoke test native addon — dijalankan DI DALAM Electron, bukan Node.
 *
 * Tujuan: menjawab satu pertanyaan secara empiris dan terisolasi:
 * apakah `better-sqlite3` (prebuilt N-API) bisa dimuat oleh ABI Electron 44
 * tanpa perlu compile ulang via MSVC?
 *
 * Sengaja TIDAK mengimpor kode aplikasi sama sekali, supaya hasilnya bersih
 * dari variabel lain (build pipeline, Vite, dsb).
 *
 * Jalankan: npx electron scripts/smoke-test.cjs
 */
const { app } = require('electron')

function main() {
    const results = []
    let failed = false

    try {
        results.push(`electron: ${process.versions.electron}`)
        results.push(`node: ${process.versions.node}`)
        results.push(`node ABI (modules): ${process.versions.modules}`)
        results.push(`napi: ${process.versions.napi ?? 'n/a'}`)
        results.push('---')

        // Titik kritis: require() memicu dlopen pada binary native.
        // Kegagalan NODE_MODULE_VERSION mismatch / missing binary muncul DI SINI.
        const Database = require('better-sqlite3')
        results.push('[ok] require(better-sqlite3) berhasil')

        const db = new Database(':memory:')
        results.push(`[ok] Database(':memory:') terbuka, sqlite ${db.prepare('SELECT sqlite_version() AS v').get().v}`)

        const pragma = db.pragma('foreign_keys', { simple: true })
        results.push(`[ok] PRAGMA foreign_keys awal = ${pragma}`)

        db.pragma('foreign_keys = ON')
        const fk = db.pragma('foreign_keys', { simple: true })
        results.push(`[ok] PRAGMA foreign_keys setelah ON = ${fk}`)

        // Buktikan FK benar-benar DITEGAKKAN, bukan cuma dilaporkan aktif.
        db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE
      );
    `)
        db.prepare('INSERT INTO parent (id) VALUES (1)').run()
        db.prepare('INSERT INTO child (id, parent_id) VALUES (1, 1)').run()
        db.prepare('DELETE FROM parent WHERE id = 1').run()
        const remaining = db.prepare('SELECT COUNT(*) AS n FROM child').get().n
        results.push(`[ok] ON DELETE CASCADE -> sisa baris anak = ${remaining}`)

        // Verifikasi unique partial index (pola dedup di plans/02-DATA-MODEL.md §3).
        db.exec(`
      CREATE TABLE trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange TEXT NOT NULL,
        external_id TEXT
      );
      CREATE UNIQUE INDEX idx_dedup ON trades(exchange, external_id)
        WHERE external_id IS NOT NULL;
    `)
        db.prepare('INSERT INTO trades (exchange, external_id) VALUES (?, ?)').run('mexc', 'X1')
        let dedupWorks = false
        try {
            db.prepare('INSERT INTO trades (exchange, external_id) VALUES (?, ?)').run('mexc', 'X1')
        } catch (error) {
            dedupWorks = String(error.message).includes('UNIQUE')
        }
        results.push(`[ok] partial unique index menolak duplikat = ${dedupWorks}`)

        // NULL tidak boleh dianggap duplikat — ini yang bikin trade manual (?)
        // bisa berkali-kali tanpa perlu external_id.
        db.prepare('INSERT INTO trades (exchange, external_id) VALUES (?, NULL)').run('manual')
        db.prepare('INSERT INTO trades (exchange, external_id) VALUES (?, NULL)').run('manual')
        const manualCount = db.prepare("SELECT COUNT(*) AS n FROM trades WHERE external_id IS NULL").get().n
        results.push(`[ok] baris external_id NULL boleh berulang = ${manualCount} baris`)

        // WAL hanya berlaku untuk file DB, bukan :memory:. Uji dengan file temporer.
        db.close()
        const testPath = require('node:path').join(app.getPath('temp'), 'tj-smoke-test.sqlite')
        const fileDb = new Database(testPath)
        fileDb.pragma('journal_mode = WAL')
        const wal = fileDb.pragma('journal_mode', { simple: true })
        results.push(`[ok] journal_mode = ${wal}`)
        fileDb.close()
        require('node:fs').rmSync(testPath, { force: true })

        const checks = [
            { label: 'foreign_keys aktif', pass: fk === 1 },
            { label: 'CASCADE ditegakkan', pass: remaining === 0 },
            { label: 'dedup bekerja', pass: dedupWorks },
            { label: 'NULL repeatable', pass: manualCount === 2 },
            { label: 'WAL aktif', pass: String(wal).toLowerCase() === 'wal' }
        ]

        results.push('---')
        for (const check of checks) {
            results.push(`${check.pass ? '[LULUS]' : '[GAGAL]'} ${check.label}`)
            if (!check.pass) failed = true
        }
    } catch (error) {
        failed = true
        results.push('---')
        results.push(`[GAGAL] ${error && error.message ? error.message : String(error)}`)
        if (error && error.stack) {
            results.push(error.stack.split('\n').slice(0, 6).join('\n'))
        }
    }

    console.log('\n===== HASIL SMOKE TEST =====')
    for (const line of results) console.log(line)
    console.log(`===== ${failed ? 'GAGAL' : 'SEMUA LULUS'} =====\n`)

    app.exit(failed ? 1 : 0)
}

app.whenReady().then(main)
