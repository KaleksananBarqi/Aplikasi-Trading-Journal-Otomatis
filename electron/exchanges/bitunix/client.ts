import { createHash, randomBytes } from 'node:crypto'
import type { ExchangeCredentials } from '../types'
import { ExchangeError } from '../types'

/**
 * Klien HTTP Bitunix Futures — implementasi manual langsung ke REST resmi.
 *
 * ===========================================================================
 * KENAPA MANUAL, BUKAN ccxt
 * ===========================================================================
 *
 * Diverifikasi empiris 2026-09-17 (scripts/probe-ccxt.cjs): dari 104 exchange
 * yang didukung ccxt 4.5.78, **Bitunix TIDAK ADA**. Ini mengonfirmasi prediksi
 * brief §4.2.
 *
 * Brief §4.2 juga melarang memakai library unofficial pihak ketiga yang tidak
 * terawat. Karena itu klien ini ditulis langsung terhadap REST resmi.
 *
 * ===========================================================================
 * SUMBER OTORITATIF YANG DIPAKAI
 * ===========================================================================
 *
 * Dokumentasi resmi: https://openapidoc.bitunix.com/doc/common/introduction.html
 * SDK resmi Node.js: github.com/BitunixOfficial/open-api → Demo/Node/
 *   - openApiHttpSign.js            -> algoritma signing
 *   - openApiHttpFuturePrivate.js   -> path endpoint + header
 *
 * ===========================================================================
 * ALGORITMA SIGNING — KOREKSI PENTING TERHADAP BRIEF §4.2
 * ===========================================================================
 *
 * Brief §4.2 menyebut "HMAC-SHA256 double-hash". **Itu keliru.** Diverifikasi
 * dari SDK resmi (openApiHttpSign.js) dan dokumentasi resmi:
 *
 *   digest = SHA256(nonce + timestamp + apiKey + queryParams + body)   <- hex string
 *   sign   = SHA256(digest + secretKey)                                <- hex string
 *
 * Ini **bukan HMAC** — tidak ada penggunaan HMAC sama sekali. Ini SHA256
 * berantai dengan penggabungan string biasa. Kalau implementasi mengikuti
 * asumsi brief (HMAC), seluruh request akan ditolak exchange.
 *
 * Detail lain yang diverifikasi:
 * - `nonce` = 16 byte acak sebagai hex (32 karakter), lihat `getNonce()`
 * - `queryParams` = key diurutkan ASCII, digabung LANGSUNG tanpa separator:
 *   `{b:'2', a:'1'}` -> `"a1b2"`
 * - Untuk POST, body di-JSON.stringify TANPA spasi; queryParams DIKOSONGKAN
 * - Header memakai huruf kecil dengan tanda hubung: `api-key`, `sign`, `nonce`, `timestamp`
 *
 * ===========================================================================
 * GUARDRAIL BRIEF §12 — READ-ONLY
 * ===========================================================================
 *
 * Kelas ini hanya mengekspos method GET untuk pembacaan. DILARANG menambahkan
 * `place_order`, `cancel_orders`, `adjust_margin`, atau endpoint apa pun yang
 * mengubah state. Kalau kebutuhan itu muncul, HENTIKAN dan tanyakan ke user.
 */

const BASE_URL = 'https://fapi.bitunix.com'

/** Header umum non-autentikasi, dari SDK resmi. */
const COMMON_HEADERS: Record<string, string> = {
    'language': 'en-US',
    'Content-Type': 'application/json'
}

/** Bentuk response standar Bitunix. */
interface BitunixResponse<T> {
    code: number
    msg?: string
    data?: T
}

/** Response dari endpoint posisi/order historis berbentuk paginasi. */
export interface BitunixPagedData<T> {
    list?: T[]
    total?: number
}

/**
 * Nonce: 16 byte acak sebagai hex = 32 karakter.
 * Persis seperti SDK resmi: `crypto.randomBytes(16).toString('hex')`.
 */
function getNonce(): string {
    return randomBytes(16).toString('hex')
}

function getTimestamp(): string {
    return Date.now().toString()
}

/**
 * Urutkan query params secara ASCII lalu gabung TANPA separator.
 *
 * Diverifikasi dari `OpenApiHttpSign.sortParams` di SDK resmi:
 *   Object.keys(params).sort().map(key => key + params[key]).join('')
 *
 * Contoh: `{ symbol: 'BTCUSDT', pageSize: 10 }` -> `"pageSize10symbolBTCUSDT"`
 *
 * NILAI KOSONG: parameter dengan nilai undefined/null/kosong DILEWATI, karena
 * menyertakannya akan menghasilkan string tanda tangan yang tidak cocok dengan
 * yang dikirim sebagai query string.
 */
function sortParams(params: Record<string, unknown>): string {
    const keys = Object.keys(params).filter((key) => {
        const value = params[key]
        return value !== undefined && value !== null && value !== ''
    })

    if (keys.length === 0) return ''

    return keys
        .sort()
        .map((key) => `${key}${String(params[key])}`)
        .join('')
}

function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

/**
 * Hitung tanda tangan Bitunix.
 *
 * `digest = SHA256(nonce + timestamp + apiKey + queryParams + body)`
 * `sign   = SHA256(digest + secretKey)`
 *
 * Diekspor supaya bisa diuji langsung tanpa memanggil jaringan.
 */
export function generateSignature(
    apiKey: string,
    secretKey: string,
    nonce: string,
    timestamp: string,
    queryParams = '',
    body = ''
): string {
    const digest = sha256Hex(nonce + timestamp + apiKey + queryParams + body)
    return sha256Hex(digest + secretKey)
}

export function buildAuthHeaders(
    apiKey: string,
    secretKey: string,
    queryParams: Record<string, unknown> = {},
    body = ''
): Record<string, string> {
    const nonce = getNonce()
    const timestamp = getTimestamp()
    const queryString = sortParams(queryParams)

    return {
        'api-key': apiKey,
        'sign': generateSignature(apiKey, secretKey, nonce, timestamp, queryString, body),
        'nonce': nonce,
        'timestamp': timestamp
    }
}

/** Klasifikasi kode error Bitunix menjadi pesan yang bisa ditindaklanjuti. */
function describeCode(code: number, msg: string | undefined): string {
    // Kode umum yang perlu penanganan khusus. Selain ini, pesannya diteruskan apa adanya.
    if (code === 10001 || code === 10002 || code === 10003) {
        return `Autentikasi gagal (code ${code})${msg ? `: ${msg}` : ''} — periksa API key dan secret.`
    }
    if (code === 10005) {
        return `Izin API tidak cukup (code ${code})${msg ? `: ${msg}` : ''} — pastikan API key punya izin baca.`
    }
    return `Bitunix error code ${code}${msg ? `: ${msg}` : ''}`
}

export interface BitunixClientOptions {
    /** Batas waktu request dalam ms. */
    timeoutMs?: number
    /** Callback log untuk diagnosis (jangan mencatat kredensial!). */
    onDebug?: (message: string) => void
}

export class BitunixClient {
    private readonly apiKey: string
    private readonly secretKey: string
    private readonly timeoutMs: number
    private readonly onDebug: (message: string) => void

    constructor(credentials: ExchangeCredentials, options: BitunixClientOptions = {}) {
        this.apiKey = credentials.apiKey
        this.secretKey = credentials.apiSecret
        // Timeout 30 detik, sama seperti konfigurasi ccxt untuk MEXC.
        this.timeoutMs = options.timeoutMs ?? 30_000
        this.onDebug = options.onDebug ?? ((): void => { })
    }

    /**
     * Kirim request GET bertanda tangan.
     *
     * Hanya GET yang diekspos — lihat catatan guardrail di atas.
     */
    async get<T>(path: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
        const queryString = sortParams(params)
        const url = queryString === '' ? `${BASE_URL}${path}` : `${BASE_URL}${path}?${this.buildQueryString(params)}`

        const authHeaders = buildAuthHeaders(this.apiKey, this.secretKey, params, '')

        this.onDebug(`[bitunix] GET ${path} (params: ${Object.keys(params).join(',') || 'tanpa parameter'})`)

        // Terapkan timeout. Tanpa ini, request yang menggantung akan menahan
        // seluruh proses sync tanpa batas — dan tidak ada backoff yang bisa
        // menolong, karena operasinya tidak pernah selesai maupun gagal.
        //
        // `AbortSignal.any` menggabungkan timeout kita dengan signal pembatalan
        // dari pemanggil, sehingga user tetap bisa membatalkan sync.
        const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
        const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
        let dispatcher: unknown = undefined
        if (proxyUrl) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { ProxyAgent } = require('undici') as { ProxyAgent: new (url: string) => unknown }
                dispatcher = new ProxyAgent(proxyUrl)
            } catch { }
        }

        let response: Response
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: { ...COMMON_HEADERS, ...authHeaders },
                signal: combinedSignal,
                ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {})
            })
        } catch (error) {
            // Kegagalan jaringan dilempar apa adanya supaya `classifyError` di
            // sync engine bisa mengklasifikasikannya sebagai retryable.
            const message = error instanceof Error ? error.message : String(error)
            throw new ExchangeError(`Gagal menghubungi Bitunix: ${message}`, 'bitunix', 'network', true, error)
        }

        if (response.status === 429) {
            throw new ExchangeError('Rate limit Bitunix tercapai (HTTP 429)', 'bitunix', 'rate_limit', true)
        }
        if (response.status === 401 || response.status === 403) {
            throw new ExchangeError(
                `Bitunix menolak autentikasi (HTTP ${response.status}) — periksa API key dan secret.`,
                'bitunix',
                'auth',
                false
            )
        }
        if (!response.ok) {
            throw new ExchangeError(
                `Bitunix mengembalikan HTTP ${response.status}`,
                'bitunix',
                response.status >= 500 ? 'network' : 'unknown',
                response.status >= 500
            )
        }

        let payload: BitunixResponse<T>
        try {
            payload = (await response.json()) as BitunixResponse<T>
        } catch (error) {
            throw new ExchangeError('Response Bitunix bukan JSON yang valid', 'bitunix', 'unknown', false, error)
        }

        // Bitunix memakai `code: 0` untuk sukses. Kode selain itu adalah error bisnis,
        // bukan error HTTP — response bisa HTTP 200 tapi body-nya error.
        if (payload.code !== 0) {
            const description = describeCode(payload.code, payload.msg)
            const isAuth = payload.code === 10001 || payload.code === 10002 || payload.code === 10003 || payload.code === 10005
            throw new ExchangeError(description, 'bitunix', isAuth ? 'auth' : 'unknown', false)
        }

        return payload.data as T
    }

    /**
     * Bangun query string asli dari params.
     *
     * PENTING: urutan di sini juga diurutkan ASCII supaya query string yang
     * DIKIRIM identik dengan string yang DITANDATANGANI. Kalau urutannya berbeda,
     * server akan menghitung tanda tangan yang berbeda dan menolak request.
     */
    private buildQueryString(params: Record<string, unknown>): string {
        return Object.keys(params)
            .filter((key) => {
                const value = params[key]
                return value !== undefined && value !== null && value !== ''
            })
            .sort()
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
            .join('&')
    }
}
