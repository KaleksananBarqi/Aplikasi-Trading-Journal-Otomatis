/**
 * Launcher verifikasi aplikasi terpaket.
 *
 * Menjalankan `verify-packaged.cjs` memakai binary Electron dev. Kenapa binary
 * dev dan bukan `release/win-unpacked/*.exe`:
 *
 * Aplikasi Electron yang SUDAH DIPAKETKAN selalu menjalankan `main` dari
 * package.json di dalam asar dan MENGABAIKAN argumen skrip. Jadi menunjuk
 * `win-unpacked/*.exe` ke skrip verifikasi hanya akan membuka aplikasi normal.
 *
 * Yang penting bukan binary-nya, melainkan MODUL YANG DIUJI. Skrip verifikasi
 * sengaja me-`require` modul lewat junction ke
 * `release/win-unpacked/resources/app.asar.unpacked/node_modules`, yaitu modul
 * yang benar-benar dikirim ke user. Lihat catatan panjang di verify-packaged.cjs.
 *
 * Satu pemeriksaan tetap memerlukan Electron: `safeStorage`, yang menguji
 * enkripsi kredensial lewat OS keychain. Itu tersedia di binary dev maupun
 * terpaket dengan perilaku identik, karena bergantung pada OS, bukan pada
 * apakah aplikasi sudah dipaketkan.
 *
 * Jalankan: npm run verify:packaged   (perlu `npm run dist:dir` lebih dulu)
 */
const { spawnSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const { existsSync } = require('node:fs')

// Pastikan artefak packaging ada sebelum menjalankan verifikasi.
const unpackedCandidates = [
    join(__dirname, '..', 'release', 'win-unpacked'),
    join(__dirname, '..', 'release', 'linux-unpacked'),
    join(__dirname, '..', 'release', 'mac')
]

const unpacked = unpackedCandidates.find((dir) => existsSync(dir))

if (!unpacked) {
    console.error(
        'Artefak packaging tidak ditemukan di folder release/.\n\n' +
        'Jalankan `npm run dist:dir` lebih dulu untuk membuat folder terpaket.'
    )
    process.exit(1)
}

const asarPath = join(unpacked, 'resources', 'app.asar')
if (!existsSync(asarPath)) {
    console.error(`app.asar tidak ditemukan: ${asarPath}\nJalankan \`npm run dist:dir\` lebih dulu.`)
    process.exit(1)
}

const electronBinary =
    process.platform === 'win32'
        ? join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
        : join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron')

if (!existsSync(electronBinary)) {
    console.error(`Binary Electron tidak ditemukan: ${electronBinary}`)
    process.exit(1)
}

const script = resolve(__dirname, 'verify-packaged.cjs')

if (!existsSync(script)) {
    console.error(`Skrip verifikasi tidak ditemukan: ${script}`)
    process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(electronBinary, [script], { stdio: 'inherit', env })

process.exit(result.status ?? 1)
