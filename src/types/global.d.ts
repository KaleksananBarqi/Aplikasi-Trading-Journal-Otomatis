import type { PreloadApi } from '../../shared/ipc-contract'

/**
 * Deklarasi tipe untuk `window.api` yang disuntikkan oleh preload script.
 * Renderer mengandalkan ini; implementasi aslinya di electron/preload.ts.
 */
declare global {
    interface Window {
        api: PreloadApi
    }
}

export { }
