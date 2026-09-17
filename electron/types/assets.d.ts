/**
 * Deklarasi tipe untuk import aset Vite.
 *
 * Diperlukan karena tsconfig.node.json (yang meng-cover main process) tidak
 * memuat `vite/client`, sehingga import seperti `import sql from './x.sql?raw'`
 * tidak dikenali TypeScript.
 */

declare module '*.sql?raw' {
    const content: string
    export default content
}

declare module '*.sql' {
    const content: string
    export default content
}
