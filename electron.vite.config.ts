import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Konfigurasi build tiga target: main process, preload, dan renderer.
 *
 * KEPUTUSAN D1 (plans/01-ARCHITECTURE.md): `externalizeDepsPlugin()` menandai
 * semua isi `dependencies` sebagai external, sehingga `better-sqlite3` (native addon)
 * TIDAK di-bundle. Native addon wajib di-require apa adanya saat runtime.
 *
 * Tailwind v4 memakai plugin Vite (`@tailwindcss/vite`), BUKAN PostCSS.
 * Ini perubahan besar dari v3 — lihat skill tailwind-theme-builder.
 */
export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'out/main',
            lib: {
                entry: {
                    index: resolve(__dirname, 'electron/main.ts'),
                    // Skrip verifikasi. Terpisah dari entry aplikasi supaya kode
                    // test tidak pernah ikut ke jalur runtime normal.
                    'fase1-verify': resolve(__dirname, 'electron/tests/fase1-verify.ts'),
                    'fase2-verify': resolve(__dirname, 'electron/tests/fase2-verify.ts'),
                    'fase3-verify': resolve(__dirname, 'electron/tests/fase3-verify.ts'),
                    'metrics-verify': resolve(__dirname, 'electron/tests/metrics-verify.ts')
                }
            },
            rollupOptions: {
                // Sabuk pengaman ganda: eksplisit, tidak bergantung pada plugin saja.
                external: ['better-sqlite3']
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'out/preload',
            lib: {
                entry: { index: resolve(__dirname, 'electron/preload.ts') }
            }
        }
    },
    renderer: {
        root: resolve(__dirname, 'src'),
        // v4: plugin Vite, bukan PostCSS.
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src'),
                '@shared': resolve(__dirname, 'shared')
            }
        },
        build: {
            outDir: 'out/renderer',
            rollupOptions: {
                input: resolve(__dirname, 'src/index.html')
            }
        }
    }
})
