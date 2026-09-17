/**
 * Launcher smoke test.
 *
 * Kenapa ada file ini, bukan langsung `electron scripts/smoke-test.cjs`:
 * terminal VS Code di mesin ini menyetel `ELECTRON_RUN_AS_NODE=1` di environment.
 * Saat variabel itu aktif, electron.exe berjalan sebagai Node biasa — bukan
 * runtime Electron — sehingga `require('electron').app` jadi undefined dan
 * test apa pun yang butuh lifecycle Electron langsung gagal.
 *
 * Ini quirk environment, bukan bug aplikasi. Launcher ini menghapus variabel
 * tersebut dari environment anak sebelum menjalankan Electron.
 */
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const { existsSync } = require('node:fs')

const electronExe = join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
const electronExePosix = join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron')

const binary = process.platform === 'win32' ? electronExe : electronExePosix

if (!existsSync(binary)) {
    console.error(
        `Binary Electron tidak ditemukan di: ${binary}\n` +
        'Jalankan `npm install` lebih dulu.'
    )
    process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(binary, [join(__dirname, 'smoke-test.cjs')], {
    stdio: 'inherit',
    env
})

process.exit(result.status ?? 1)
