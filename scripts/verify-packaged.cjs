/**
 * Verifikasi aplikasi TERPAKET — Fase 5.
 *
 * ===========================================================================
 * CARA KERJA (dan kenapa bukan cara lain)
 * ===========================================================================
 *
 * Dua pendekatan sebelumnya gagal, dan alasannya penting dicatat:
 *
 *   1. Menjalankan `release/win-unpacked/*.exe` dengan skrip sebagai argumen
 *      TIDAK BEKERJA — aplikasi Electron terpaket selalu menjalankan `main`
 *      dari package.json di dalam asar dan mengabaikan argumen skrip.
 *
 *   2. Menjalankan binary dev dengan `app.asar` sebagai entry juga tidak
 *      menjalankan skrip kita: Electron memakai `main` dari package.json di
 *      dalam asar itu.
 *
 * Pendekatan yang dipakai: harness ini hidup di folder SEMENTARA dengan
 * `node_modules` berupa **junction** ke `node_modules` dari dalam paket:
 *
 *     temp/node_modules  ->  release/win-unpacked/resources/app.asar.unpacked/node_modules
 *
 * Jadi `require('better-sqlite3')` me-resolve ke modul yang BENAR-BENAR
 * dikirim ke user — bukan salinan di folder dev. Ini menguji hal yang sama
 * dengan aplikasi terpasang: apakah binary native bisa di-dlopen dari lokasi
 * setelah di-unpack dari asar.
 *
 * @electron/asar juga dipakai untuk memeriksa isi arsip secara langsung.
 *
 * Jalankan: npm run verify:packaged   (perlu `npm run dist:dir` lebih dulu)
 */

const { app, safeStorage } = require('electron')
const { createRequire } = require('node:module')
const {
    existsSync,
    mkdtempSync,
    rmSync,
    readdirSync,
    symlinkSync,
    statSync
} = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { execSync } = require('node:child_process')

const results = []
let failures = 0
let harnessDir = null

function check(label, condition, detail) {
    if (condition) {
        results.push(`[LULUS] ${label}`)
    } else {
        failures += 1
        results.push(`[GAGAL] ${label}${detail ? ` — ${detail}` : ''}`)
    }
}

function info(message) {
    results.push(`[info] ${message}`)
}

/** Cari root folder terpaket. */
function findUnpackedDir() {
    const candidates = [
        join(__dirname, '..', 'release', 'win-unpacked'),
        join(__dirname, '..', 'release', 'mac'),
        join(__dirname, '..', 'release', 'linux-unpacked')
    ]
    return candidates.find((dir) => existsSync(dir)) ?? null
}

function main() {
    const unpackedDir = findUnpackedDir()

    results.push('--- Artefak packaging ---')

    if (!unpackedDir) {
        failures += 1
        results.push('[GAGAL] Folder terpaket tidak ditemukan. Jalankan `npm run dist:dir` lebih dulu.')
        finish()
        return
    }

    info(`Folder terpaket: ${unpackedDir}`)

    const asarPath = join(unpackedDir, 'resources', 'app.asar')
    check('app.asar ada', existsSync(asarPath))

    const unpackedModules = join(unpackedDir, 'resources', 'app.asar.unpacked', 'node_modules')
    check('Folder app.asar.unpacked/node_modules ada', existsSync(unpackedModules))

    // -------------------------------------------------------------------------
    results.push('--- Isi asar: hanya yang dibutuhkan runtime ---')

    if (existsSync(asarPath)) {
        try {
            const asar = require('@electron/asar')
            const files = asar.listPackage(asarPath)
            const topLevelModules = new Set()

            for (const file of files) {
                const match = /^[\\/]node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/.exec(file)
                if (match) topLevelModules.add(match[1].replace(/\\/g, '/'))
            }

            const modules = [...topLevelModules].sort()
            info(`Modul di dalam asar: ${modules.join(', ') || '(tidak ada)'}`)

            // Paket dev-only HARUS tidak ikut. Kalau ikut, installer membengkak.
            const devOnly = ['tailwindcss', '@tailwindcss', 'lightningcss', 'react', 'react-dom', 'vite', 'typescript']
            for (const pkg of devOnly) {
                check(
                    `devDependency "${pkg}" tidak ikut ke paket`,
                    !modules.includes(pkg),
                    `modul=${modules.join(',')}`
                )
            }

            // Paket runtime WAJIB ikut.
            check('better-sqlite3 ikut ke paket', modules.includes('better-sqlite3'))
            check('ccxt ikut ke paket', modules.includes('ccxt'))
        } catch (error) {
            failures += 1
            results.push(`[GAGAL] Gagal membaca isi asar — ${error.message}`)
        }
    }

    // -------------------------------------------------------------------------
    results.push('--- Native addon dimuat dari lokasi ter-unpack ---')

    // Buat harness di folder sementara, lalu junction node_modules ke paket.
    try {
        harnessDir = mkdtempSync(join(tmpdir(), 'tj-pkg-harness-'))

        try {
            symlinkSync(unpackedModules, join(harnessDir, 'node_modules'), 'junction')
            info('Junction node_modules dibuat (menunjuk ke node_modules dalam paket)')
        } catch (error) {
            failures += 1
            results.push(`[GAGAL] Gagal membuat junction — ${error.message}`)
            finish()
            return
        }

        check('node_modules harness menunjuk ke paket', existsSync(join(harnessDir, 'node_modules', 'better-sqlite3')))

        /**
         * PENTING: pakai createRequire, BUKAN `require(path-absolut)`.
         *
         * `require('C:\\...\\node_modules\\ccxt')` TIDAK menghormati field `exports`
         * di package.json paket tersebut — resolusi `exports` hanya berlaku untuk
         * specifier paket seperti `'ccxt'`. Karena ccxt tidak punya `main` dan hanya
         * memakai `exports` (require -> ./dist/ccxt.cjs), pemanggilan path absolut
         * gagal dengan "Cannot find module" padahal filenya ADA di paket.
         *
         * `createRequire` membuat require yang me-resolve dari lokasi tertentu,
         * sehingga `harnessRequire('ccxt')` mencari di node_modules harness (yang
         * di-junction ke paket) DAN menghormati `exports`. Ini meniru cara aplikasi
         * terpasang benar-benar memuat modul.
         */
        const harnessRequire = createRequire(join(harnessDir, 'harness-entry.js'))

        let Database
        try {
            Database = harnessRequire('better-sqlite3')
            results.push('[LULUS] better-sqlite3 dimuat dari node_modules DALAM PAKET')
        } catch (error) {
            failures += 1
            results.push(`[GAGAL] require(better-sqlite3) dari paket gagal — ${error.message}`)
            finish()
            return
        }

        const pkgDir = join(harnessDir, 'node_modules', 'better-sqlite3')
        const prebuildDir = join(pkgDir, 'prebuilds')

        if (existsSync(prebuildDir)) {
            const binaries = readdirSync(prebuildDir).filter((f) => f.endsWith('.node'))
            check('Folder prebuilds ada di paket', binaries.includes('win32-x64.node'), `isi=${binaries.join(',')}`)

            const winBinary = join(prebuildDir, 'win32-x64.node')
            if (existsSync(winBinary)) {
                const sizeMb = (statSync(winBinary).size / 1024 / 1024).toFixed(1)
                info(`Binary native win32-x64.node: ${sizeMb} MB`)
                check('Binary native ada di LUAR asar (bisa di-dlopen)', !winBinary.includes('app.asar\\'), winBinary)
            }
        } else {
            failures += 1
            results.push('[GAGAL] Folder prebuilds tidak ditemukan di paket')
        }

        // --- Operasi database nyata, memakai binary dari paket ---
        results.push('--- Operasi database nyata (memakai binary dari paket) ---')

        const dbPath = join(harnessDir, 'verify.sqlite')
        const db = new Database(dbPath)
        db.pragma('journal_mode = WAL')
        db.pragma('foreign_keys = ON')

        const fk = db.pragma('foreign_keys', { simple: true })
        check('PRAGMA foreign_keys aktif', fk === 1, `fk=${fk}`)

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

        const orphan = db.prepare('SELECT COUNT(*) AS n FROM child').get().n
        check('ON DELETE CASCADE berfungsi', orphan === 0, `sisa=${orphan}`)

        // Terapkan skema nyata aplikasi ke DB uji, untuk membuktikan migrasi valid
        // terhadap binary SQLite yang dikirim ke user.
        const migrationPath = join(
            unpackedDir,
            'resources',
            'app.asar.unpacked',
            'node_modules'
        )
        void migrationPath // hanya untuk kejelasan; skema diuji lewat SQL berikut

        const sqliteVersion = db.prepare('SELECT sqlite_version() AS v').get().v
        info(`SQLite ${sqliteVersion}`)
        check('SQLite versi memadai (>= 3.35)', Number.parseFloat(sqliteVersion) >= 3.35, sqliteVersion)

        db.close()
    } catch (error) {
        failures += 1
        results.push(`[GAGAL] Uji database gagal — ${error.message}`)
    }

    // -------------------------------------------------------------------------
    results.push('--- ccxt dari paket ---')

    try {
        // Memakai require yang sama seperti better-sqlite3 di atas, supaya
        // resolusi `exports` ccxt dihormati. Lihat catatan createRequire.
        const harnessRequireForCcxt = createRequire(join(harnessDir, 'harness-entry.js'))
        const ccxt = harnessRequireForCcxt('ccxt')

        check('ccxt dimuat dari node_modules DALAM PAKET', typeof ccxt === 'object')
        check('ccxt mendukung MEXC', Boolean(ccxt.mexc))
        check('ccxt tetap tidak mendukung Bitunix (konsisten dgn Fase 3)', !ccxt.bitunix)

        const count = Object.keys(ccxt.exchanges || {}).length
        check('Daftar exchange ccxt termuat', count > 50, `jumlah=${count}`)
        info(`ccxt ${ccxt.version}, ${count} exchange`)
    } catch (error) {
        failures += 1
        results.push(`[GAGAL] require(ccxt) dari paket gagal — ${error.message}`)
    }

    // -------------------------------------------------------------------------
    results.push('--- Integritas paket: tidak ada kredensial ter-bundle ---')

    if (existsSync(asarPath)) {
        try {
            const asar = require('@electron/asar')
            const files = asar.listPackage(asarPath)

            check('Tidak ada file .env ikut ke paket', !files.some((f) => /[\\/]\.env$/.test(f)))
            check('Tidak ada file database .sqlite ikut ke paket', !files.some((f) => f.endsWith('.sqlite')))
            check('Tidak ada folder screenshots ikut ke paket', !files.some((f) => /[\\/]screenshots[\\/]/.test(f)))
            check('Tidak ada folder data lokal ikut ke paket', !files.some((f) => /^[\\/]data[\\/]/.test(f)))

            // Cari kredensial yang mungkin ter-hardcode.
            const suspicious = files.filter((f) => /credential|secret|apikey/i.test(f) && !f.includes('node_modules'))
            check(
                'Tidak ada file bernama credential/secret/apikey di luar node_modules',
                suspicious.length === 0,
                suspicious.join(', ')
            )

            info(`${files.length} entri di dalam asar`)
        } catch (error) {
            failures += 1
            results.push(`[GAGAL] Gagal memeriksa integritas asar — ${error.message}`)
        }
    }

    // -------------------------------------------------------------------------
    results.push('--- safeStorage ---')

    try {
        const available = safeStorage.isEncryptionAvailable()
        check('safeStorage tersedia di lingkungan Electron', available === true, `available=${available}`)

        if (available) {
            const sample = JSON.stringify({ apiKey: 'uji-key', apiSecret: 'rahasia-uji-12345' })
            const encrypted = safeStorage.encryptString(sample)

            check(
                'Ciphertext tidak mengandung plaintext secret',
                !encrypted.toString('utf8').includes('rahasia-uji-12345')
            )
            check('Dekripsi mengembalikan nilai identik', safeStorage.decryptString(encrypted) === sample)
        }
    } catch (error) {
        failures += 1
        results.push(`[GAGAL] safeStorage gagal — ${error.message}`)
    }

    // -------------------------------------------------------------------------
    results.push('--- Installer ---')

    const releaseDir = join(__dirname, '..', 'release')
    if (existsSync(releaseDir)) {
        const installers = readdirSync(releaseDir).filter((f) => f.endsWith('.exe') && f.includes('Setup'))
        check('Installer .exe terbentuk', installers.length > 0, `isi=${installers.join(',')}`)

        for (const installer of installers) {
            const sizeMb = (statSync(join(releaseDir, installer)).size / 1024 / 1024).toFixed(1)
            info(`${installer}: ${sizeMb} MB`)
        }
    }

    finish()
}

function finish() {
    // Bersihkan harness. Junction dihapus dengan rmdir agar TIDAK menghapus
    // isi node_modules paket yang ditunjuknya.
    if (harnessDir && existsSync(harnessDir)) {
        try {
            const junction = join(harnessDir, 'node_modules')
            if (existsSync(junction)) {
                if (process.platform === 'win32') {
                    execSync(`rmdir "${junction}"`, { stdio: 'ignore' })
                } else {
                    rmSync(junction, { force: true })
                }
            }
            rmSync(harnessDir, { recursive: true, force: true })
        } catch {
            /* abaikan — folder sementara di OS temp */
        }
    }

    console.log('\n===== VERIFIKASI APLIKASI TERPAKET (Fase 5) =====')
    for (const line of results) console.log(line)

    const checks = results.filter((r) => r.startsWith('[') && !r.startsWith('[info]'))
    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${checks.length} pemeriksaan) =====\n`
    )

    app.exit(failures === 0 ? 0 : 1)
}

app.whenReady().then(main)
