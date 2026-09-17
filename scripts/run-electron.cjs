/**
 * Launcher Electron generik.
 *
 * Kenapa ada file ini: terminal VS Code di mesin ini menyetel
 * `ELECTRON_RUN_AS_NODE=1`. Saat variabel itu aktif, electron.exe berjalan
 * sebagai Node biasa — bukan runtime Electron — sehingga `require('electron').app`
 * jadi undefined dan skrip apa pun yang butuh lifecycle Electron langsung gagal.
 *
 * Launcher ini menghapus variabel tersebut dari environment anak sebelum spawn.
 *
 * Penggunaan: node scripts/run-electron.cjs <path-ke-skrip.js> [args...]
 */
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const { existsSync } = require('node:fs')

const args = process.argv.slice(2)

if (args.length === 0) {
    console.error('Penggunaan: node scripts/run-electron.cjs <path-ke-skrip.js> [args...]')
    process.exit(1)
}

const binary =
    process.platform === 'win32'
        ? join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
        : join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron')

if (!existsSync(binary)) {
    console.error(`Binary Electron tidak ditemukan di: ${binary}\nJalankan \`npm install\` lebih dulu.`)
    process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(binary, args, { stdio: 'inherit', env })
process.exit(result.status ?? 1)
