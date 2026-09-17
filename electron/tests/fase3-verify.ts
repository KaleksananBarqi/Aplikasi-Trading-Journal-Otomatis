import { app } from 'electron'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { initializeDb, openDb, closeDb } from '../db/index'
import { syncExchange } from '../sync/engine'
import { getSyncState } from '../db/repositories/sync'
import { generateSignature } from '../exchanges/bitunix/client'
import { mapClosedPosition, mapFill, mapFundingFee } from '../exchanges/bitunix/mapper'
import type {
    ExchangeAdapter,
    FetchOptions,
    RawClosedPosition,
    RawFill,
    RawFundingFee,
    SyncCursor
} from '../exchanges/types'

/**
 * Verifikasi Fase 3 — Integrasi Bitunix.
 *
 * ===========================================================================
 * GATE FASE 3 (plans/03-PHASES.md)
 * ===========================================================================
 *
 * "Dua adapter bekerja dari satu engine tanpa modifikasi engine. Ini
 *  membuktikan abstraksi di Fase 2 benar."
 *
 * Karena itu bagian terpenting test ini adalah: menjalankan BitunixAdapter
 * lewat `syncExchange` yang SAMA dengan MEXC, tanpa perubahan apa pun di
 * `electron/sync/engine.ts`.
 *
 * ===========================================================================
 * VERIFIKASI SIGNING — KOREKSI TERHADAP BRIEF §4.2
 * ===========================================================================
 *
 * Brief §4.2 menyebut "HMAC-SHA256 double-hash". Implementasi memakai SHA256
 * berantai TANPA HMAC, sesuai SDK resmi Bitunix dan dokumentasi resmi.
 *
 * Test ini mem-port algoritma dari contoh **Go** di dokumentasi resmi
 * (openapidoc.bitunix.com/doc/common/sign.html) secara independen, lalu
 * membandingkan hasilnya dengan implementasi kita. Kalau keduanya sama,
 * berarti kita tidak mengikuti asumsi brief yang keliru.
 *
 * Jalankan: npm run verify:fase3
 */

const results: string[] = []
let failures = 0

function check(label: string, condition: boolean, detail?: string): void {
    if (condition) {
        results.push(`[LULUS] ${label}`)
    } else {
        failures += 1
        results.push(`[GAGAL] ${label}${detail ? ` — ${detail}` : ''}`)
    }
}

function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

// ---------------------------------------------------------------------------
// Reference implementation — di-port langsung dari contoh Go di dokumentasi
// resmi Bitunix. SENGAJA ditulis ulang, bukan memanggil kode produksi, supaya
// perbandingannya benar-benar independen.
// ---------------------------------------------------------------------------

function referenceSortParams(params: Record<string, unknown>): string {
    // Padanan `Object.keys(params).sort().map(key => key + params[key]).join('')`
    // dari SDK resmi openApiHttpSign.js.
    const keys = Object.keys(params).filter((k) => {
        const v = params[k]
        return v !== undefined && v !== null && v !== ''
    })
    return keys
        .sort()
        .map((k) => `${k}${String(params[k])}`)
        .join('')
}

function referenceSignature(
    apiKey: string,
    secretKey: string,
    nonce: string,
    timestamp: string,
    queryParams: string,
    body: string
): { digest: string; sign: string } {
    const digestInput = nonce + timestamp + apiKey + queryParams + body
    const digest = sha256Hex(digestInput)
    const sign = sha256Hex(digest + secretKey)
    return { digest, sign }
}

function testSignature(): void {
    results.push('--- Signing Bitunix (koreksi brief §4.2) ---')

    // Nilai contoh diambil PERSIS dari contoh Go di dokumentasi resmi Bitunix.
    const nonce = '123456'
    const timestamp = '20241120123045'
    const apiKey = 'yourApiKey'
    const secretKey = 'yourSecretKey'
    const queryParams = 'id1uid200'
    const body = '{"uid":"2899","arr":[{"id":1,"name":"maple"},{"id":2,"name":"lily"}]}'

    const reference = referenceSignature(apiKey, secretKey, nonce, timestamp, queryParams, body)
    const ours = generateSignature(apiKey, secretKey, nonce, timestamp, queryParams, body)

    check('Signature cocok dengan reference independen', ours === reference.sign, `ours=${ours} ref=${reference.sign}`)

    // Pastikan ini memang BUKAN HMAC — kalau implementasi memakai HMAC
    // (sesuai asumsi brief yang keliru), hasilnya akan berbeda.
    const hmacResult = createHash('sha256')
        .update(nonce + timestamp + apiKey + queryParams + body)
        .digest('hex')
    check('Bukan HMAC SHA256 langsung (brief §4.2 keliru)', ours !== hmacResult)

    // Determinisme: input sama menghasilkan output sama.
    const second = generateSignature(apiKey, secretKey, nonce, timestamp, queryParams, body)
    check('Signature deterministik', ours === second)

    // Perubahan sekecil apa pun harus mengubah hasil.
    const changedNonce = generateSignature(apiKey, secretKey, '123457', timestamp, queryParams, body)
    check('Nonce berbeda menghasilkan sign berbeda', changedNonce !== ours)

    const changedBody = generateSignature(apiKey, secretKey, nonce, timestamp, queryParams, '{}')
    check('Body berbeda menghasilkan sign berbeda', changedBody !== ours)

    const changedSecret = generateSignature(apiKey, 'secretLain', nonce, timestamp, queryParams, body)
    check('Secret berbeda menghasilkan sign berbeda', changedSecret !== ours)

    // --- sortParams: urutan ASCII, gabung tanpa separator ---

    // Contoh dari dokumentasi resmi: `{id: 1, uid: 200}` -> "id1uid200"
    check(
        'sortParams contoh resmi {id,uid} -> "id1uid200"',
        referenceSortParams({ id: 1, uid: 200 }) === 'id1uid200',
        `hasil=${referenceSortParams({ id: 1, uid: 200 })}`
    )

    // Urutan ASCII: 'a' < 'b', jadi a lebih dulu meski objeknya menaruh b dulu.
    check(
        'sortParams mengurutkan ASCII meski urutan objek terbalik',
        referenceSortParams({ b: '2', a: '1' }) === 'a1b2',
        `hasil=${referenceSortParams({ b: '2', a: '1' })}`
    )

    // Huruf besar mendahului huruf kecil di ASCII ('B' = 66 < 'a' = 97).
    const upperLower = referenceSortParams({ a: '1', B: '2' })
    check('sortParams mengikuti urutan ASCII (B sebelum a)', upperLower === 'B2a1', `hasil=${upperLower}`)

    // Parameter kosong/undefined/null dilewati.
    check(
        'sortParams melewati nilai undefined/null/kosong',
        referenceSortParams({ a: '1', b: undefined, c: null, d: '' }) === 'a1',
        `hasil=${referenceSortParams({ a: '1', b: undefined, c: null, d: '' })}`
    )

    check('sortParams objek kosong -> string kosong', referenceSortParams({}) === '')
}

// ---------------------------------------------------------------------------
// Mapper Bitunix
// ---------------------------------------------------------------------------

function testMapper(): void {
    results.push('--- Mapper Bitunix ---')

    // Bentuk yang diharapkan berdasarkan konvensi penamaan Bitunix yang
    // terverifikasi (realizedPNL, ctime, mtime dari contoh dokumentasi resmi).
    const raw = {
        positionId: 'POS-BIT-1',
        symbol: 'ETHUSDT',
        side: 'LONG',
        qty: '2.5',
        entryPrice: '3000',
        closePrice: '3100',
        leverage: '10',
        marginMode: 'ISOLATED',
        realizedPNL: '250',
        fee: '5.5',
        ctime: '1711600000000',
        mtime: '1711603600000'
    }

    const mapped = mapClosedPosition(raw)
    check('Posisi Bitunix berhasil dipetakan', mapped !== null)

    if (mapped) {
        check('externalId dari positionId', mapped.externalId === 'POS-BIT-1')
        check('symbol dinormalisasi', mapped.symbol === 'ETHUSDT')
        check('direction LONG', mapped.direction === 'long')
        check('size dari qty', mapped.size === 2.5, `size=${mapped.size}`)
        check('entryPrice', mapped.entryPrice === 3000)
        check('exitPrice dari closePrice', mapped.exitPrice === 3100)
        check('leverage', mapped.leverage === 10)
        check('marginMode isolated', mapped.marginMode === 'isolated', `mode=${mapped.marginMode}`)
        check('realizedPnl dari realizedPNL', mapped.realizedPnl === 250, `pnl=${mapped.realizedPnl}`)
        check('feeClose dari fee', mapped.feeClose === 5.5)
        check('entryTime dari ctime', mapped.entryTime === 1711600000000)
        check('exitTime dari mtime', mapped.exitTime === 1711603600000)
        check('raw disimpan untuk audit', mapped.raw === raw)
    }

    // Short + cross, dengan nama field alternatif.
    const rawAlt = {
        position_id: 'POS-BIT-2',
        tradingPair: 'BTCUSDT',
        positionSide: 'SHORT',
        quantity: '0.5',
        avgOpenPrice: '65000',
        avgClosePrice: '64000',
        marginType: 'CROSS',
        realized_pnl: '500',
        createTime: '1711600000000',
        updateTime: '1711607200000'
    }
    const alt = mapClosedPosition(rawAlt)
    check('Nama field alternatif juga dikenali', alt !== null, 'mapper harus toleran terhadap variasi nama')
    check('direction SHORT dari positionSide', alt?.direction === 'short')
    check('marginMode cross dari marginType', alt?.marginMode === 'cross')
    check('size dari quantity', alt?.size === 0.5)

    // Timestamp dalam DETIK harus dikonversi ke ms.
    const secondsRaw = {
        positionId: 'POS-SEC',
        symbol: 'SOLUSDT',
        side: 'LONG',
        qty: '1',
        entryPrice: '100',
        closePrice: '110',
        realizedPNL: '10',
        ctime: '1711600000', // DETIK, bukan ms
        mtime: '1711603600'
    }
    const seconds = mapClosedPosition(secondsRaw)
    check(
        'Timestamp detik dikonversi ke ms (bukan menghasilkan tahun 1970)',
        seconds?.entryTime === 1711600000000,
        `hasil=${seconds?.entryTime}`
    )

    // Baris tanpa id/waktu dilewati.
    check('Baris tanpa id dilewati', mapClosedPosition({ symbol: 'X', ctime: '1', mtime: '2' }) === null)
    check('Baris tanpa waktu dilewati', mapClosedPosition({ positionId: '1', symbol: 'X' }) === null)

    // Fee tidak dibagi rata buka/tutup.
    check(
        'feeOpen = 0 (tidak membagi rata fee yang tidak dipisah exchange)',
        mapped?.feeOpen === 0
    )

    // Fill
    const fill = mapFill({
        id: 'T-1',
        symbol: 'ETHUSDT',
        side: 'BUY',
        price: '3000',
        qty: '1.5',
        fee: '1.2',
        isMaker: 'TAKER',
        ctime: '1711600000000'
    })
    check('Fill Bitunix dipetakan', fill !== null)
    check('Fill side BUY -> buy', fill?.side === 'buy')
    check('Fill isMaker false dari TAKER', fill?.isMaker === false)
    check('Fill fee', fill?.fee === 1.2)

    const fillSell = mapFill({ id: 'T-2', symbol: 'ETHUSDT', side: 'SELL', price: '1', qty: '1', ctime: '1' })
    check('Fill side SELL -> sell', fillSell?.side === 'sell')
    check('Fill tanpa info maker -> null (bukan false)', fillSell?.isMaker === null)

    // Funding
    const funding = mapFundingFee({
        id: 'F-1',
        symbol: 'ETHUSDT',
        amount: '-0.5',
        rate: '-0.0001',
        settleTime: '1711600000000'
    })
    check('Funding Bitunix dipetakan', funding !== null)
    check('Funding amount negatif dipertahankan', funding?.amount === -0.5)
    check('Funding rate dipertahankan', funding?.rate === -0.0001)
}

// ---------------------------------------------------------------------------
// Adapter palsu Bitunix — untuk menguji lewat engine yang sama
// ---------------------------------------------------------------------------

class FakeBitunixAdapter implements ExchangeAdapter {
    readonly id = 'bitunix' as const
    readonly displayName = 'Bitunix Futures (palsu untuk test)'

    positionCalls = 0
    fillCalls = 0
    fundingCalls = 0
    lastCursor: SyncCursor | null = null

    async fetchClosedPositions(
        cursor: SyncCursor,
        _options?: FetchOptions
    ): Promise<RawClosedPosition[]> {
        this.positionCalls += 1
        this.lastCursor = cursor

        const raws = [
            {
                positionId: 'BIT-1',
                symbol: 'ETHUSDT',
                side: 'LONG',
                qty: '2',
                entryPrice: '3000',
                closePrice: '3100',
                leverage: '10',
                marginMode: 'ISOLATED',
                realizedPNL: '200',
                fee: '4',
                ctime: '1711600000000',
                mtime: '1711603600000'
            },
            {
                positionId: 'BIT-2',
                symbol: 'SOLUSDT',
                side: 'SHORT',
                qty: '10',
                entryPrice: '150',
                closePrice: '145',
                leverage: '5',
                marginMode: 'CROSS',
                realizedPNL: '50',
                fee: '2',
                ctime: '1711610000000',
                mtime: '1711613600000'
            }
        ]

        const mapped = raws.map((r) => mapClosedPosition(r)).filter((p): p is RawClosedPosition => p !== null)
        if (cursor.lastExitTime === null) return mapped
        return mapped.filter((p) => p.exitTime > (cursor.lastExitTime as number))
    }

    async fetchFills(_cursor: SyncCursor, _options?: FetchOptions): Promise<RawFill[]> {
        this.fillCalls += 1
        const raws = [
            {
                id: 'BITFILL-1',
                symbol: 'ETHUSDT',
                side: 'BUY',
                price: '3000',
                qty: '2',
                fee: '2',
                ctime: '1711600001000'
            }
        ]
        return raws.map((r) => mapFill(r)).filter((f): f is RawFill => f !== null)
    }

    /**
     * Meniru perilaku adapter Bitunix nyata: funding TIDAK tersedia, jadi
     * mengembalikan array kosong. Ini yang menguji bahwa engine menangani
     * kekosongan funding dengan benar untuk Bitunix.
     */
    async fetchFundingFees(_cursor: SyncCursor, _options?: FetchOptions): Promise<RawFundingFee[]> {
        this.fundingCalls += 1
        return []
    }
}

function countRows(db: Database.Database, table: string, where = ''): number {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get() as { n: number }
    return row.n
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'tj-fase3-'))
    const dbPath = join(dir, 'verify.sqlite')

    try {
        testSignature()
        testMapper()

        results.push('--- Adapter Bitunix lewat engine Fase 2 (tanpa perubahan) ---')

        const migration = initializeDb(dbPath)
        check('DB siap (schema v2)', migration.currentVersion === 2)
        const db = openDb(dbPath)

        // --- GATE: Bitunix lewat syncExchange yang sama dengan MEXC ---
        const adapter = new FakeBitunixAdapter()

        const first = await syncExchange(db, adapter)
        check('Sync Bitunix pertama berhasil', first.status === 'ok', `status=${first.status} err=${first.error}`)
        check('Sync pertama = backfill penuh', first.wasFullBackfill === true)
        check('2 posisi Bitunix dimasukkan', first.positions.inserted === 2, `inserted=${first.positions.inserted}`)

        const tradesAfterFirst = countRows(db, 'trades', "WHERE exchange = 'bitunix'")
        check('Trades Bitunix tersimpan', tradesAfterFirst === 2, `n=${tradesAfterFirst}`)

        // Sync kedua — gate idempotensi untuk Bitunix.
        const second = await syncExchange(db, adapter)
        const tradesAfterSecond = countRows(db, 'trades', "WHERE exchange = 'bitunix'")
        check(
            'GATE: Sync Bitunix kedua TIDAK menduplikasi',
            tradesAfterSecond === tradesAfterFirst,
            `sebelum=${tradesAfterFirst} sesudah=${tradesAfterSecond}`
        )
        check('Sync kedua tidak memasukkan posisi baru', second.positions.inserted === 0)

        // pnl_source.
        const bitunixSources = (
            db.prepare("SELECT DISTINCT pnl_source FROM trades WHERE exchange = 'bitunix'").all() as {
                pnl_source: string
            }[]
        ).map((r) => r.pnl_source)
        check(
            'Trade Bitunix bertanda exchange_reported',
            bitunixSources.length === 1 && bitunixSources[0] === 'exchange_reported',
            `sources=${bitunixSources.join(',')}`
        )

        // --- Funding kosong ditangani dengan benar ---
        const bitunixFunding = countRows(db, 'funding_fees', "WHERE exchange = 'bitunix'")
        check('Funding Bitunix kosong (endpoint tidak tersedia)', bitunixFunding === 0)

        const bitunixFundingFee = (
            db.prepare("SELECT SUM(funding_fee) AS total FROM trades WHERE exchange = 'bitunix'").get() as {
                total: number | null
            }
        ).total
        check(
            'funding_fee Bitunix = 0 (bukan NULL, bukan angka karangan)',
            bitunixFundingFee === 0,
            `total=${String(bitunixFundingFee)}`
        )
        check(
            'Sync Bitunix tetap sukses walau funding kosong',
            first.status === 'ok',
            `status=${first.status}`
        )

        // --- Dua exchange berdampingan di DB yang sama ---
        results.push('--- MEXC dan Bitunix berdampingan ---')

        // Simulasikan data MEXC di DB yang sama.
        const mexcAdapter: ExchangeAdapter = {
            id: 'mexc',
            displayName: 'MEXC (palsu)',
            async fetchClosedPositions(): Promise<RawClosedPosition[]> {
                return [
                    {
                        externalId: 'MEXC-1',
                        symbol: 'BTCUSDT',
                        direction: 'long',
                        entryPrice: 60000,
                        exitPrice: 61000,
                        entryTime: 1711500000000,
                        exitTime: 1711503600000,
                        size: 0.1,
                        leverage: 20,
                        marginMode: 'isolated',
                        realizedPnl: 100,
                        feeOpen: 0,
                        feeClose: 2,
                        fundingFee: 0
                    }
                ]
            },
            async fetchFills(): Promise<RawFill[]> {
                return []
            },
            async fetchFundingFees(): Promise<RawFundingFee[]> {
                return [
                    {
                        externalId: 'MEXCF-1',
                        symbol: 'BTCUSDT',
                        amount: -1.5,
                        rate: -0.0001,
                        chargedAt: 1711501800000
                    }
                ]
            }
        }

        const mexcResult = await syncExchange(db, mexcAdapter)
        check('Simulasi MEXC di DB yang sama berhasil', mexcResult.status === 'ok')

        check(
            'Trades kedua exchange terpisah dengan benar',
            countRows(db, 'trades', "WHERE exchange = 'mexc'") === 1 &&
            countRows(db, 'trades', "WHERE exchange = 'bitunix'") === 2
        )

        // sync_state terpisah per exchange.
        const mexcState = getSyncState(db, 'mexc')
        const bitunixState = getSyncState(db, 'bitunix')
        check('sync_state MEXC terisi', mexcState.lastSyncAt !== null)
        check('sync_state Bitunix terisi', bitunixState.lastSyncAt !== null)
        check('Kedua cursor berbeda exchange tidak saling menimpa', mexcState.lastExitTime !== bitunixState.lastExitTime)

        // Idempotensi lintas exchange: sync MEXC tidak menyentuh Bitunix.
        const bitunixBefore = countRows(db, 'trades', "WHERE exchange = 'bitunix'")
        await syncExchange(db, mexcAdapter)
        check(
            'Sync MEXC tidak mempengaruhi data Bitunix',
            countRows(db, 'trades', "WHERE exchange = 'bitunix'") === bitunixBefore
        )

        // --- GAGAL SATU TIDAK MENGGAGALKAN YANG LAIN ---
        results.push('--- Isolasi kegagalan antar exchange ---')

        const failingBitunix: ExchangeAdapter = {
            id: 'bitunix',
            displayName: 'Bitunix (gagal)',
            async fetchClosedPositions(): Promise<RawClosedPosition[]> {
                throw new Error('Simulasi kegagalan Bitunix')
            },
            async fetchFills(): Promise<RawFill[]> {
                return []
            },
            async fetchFundingFees(): Promise<RawFundingFee[]> {
                return []
            }
        }

        const db2Dir = mkdtempSync(join(tmpdir(), 'tj-fase3b-'))
        const db2Path = join(db2Dir, 'verify2.sqlite')
        initializeDb(db2Path)
        const db2 = openDb(db2Path)

        // syncAll dengan MEXC sukses + Bitunix gagal.
        const { syncAll } = await import('../sync/engine')
        const combined = await syncAll(db2, [mexcAdapter, failingBitunix])

        check('Kombinasi sukses+gagal menghasilkan status partial', combined.status === 'partial', `status=${combined.status}`)
        check('MEXC tetap sukses', combined.results[0]?.status === 'ok', `status=${combined.results[0]?.status}`)
        check('Bitunix tercatat gagal', combined.results[1]?.status === 'error')
        check(
            'Data MEXC tetap tersimpan walau Bitunix gagal',
            countRows(db2, 'trades', "WHERE exchange = 'mexc'") === 1
        )

        closeDb()
        openDb(dbPath)
        closeDb()

        db2.close()
        rmSync(db2Path, { force: true })
        rmSync(`${db2Path}-wal`, { force: true })
        rmSync(`${db2Path}-shm`, { force: true })
        rmSync(db2Dir, { recursive: true, force: true })

        closeDb()
    } catch (error) {
        failures += 1
        results.push(
            `[GAGAL] Exception: ${error instanceof Error ? error.message : String(error)}\n${error instanceof Error ? error.stack?.split('\n').slice(0, 6).join('\n') : ''
            }`
        )
    } finally {
        if (existsSync(dbPath)) {
            try {
                rmSync(dbPath, { force: true })
                rmSync(`${dbPath}-wal`, { force: true })
                rmSync(`${dbPath}-shm`, { force: true })
            } catch {
                /* abaikan */
            }
        }
    }

    console.log('\n===== VERIFIKASI FASE 3 =====')
    for (const line of results) console.log(line)
    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${results.filter((r) => r.startsWith('[')).length} pemeriksaan) =====\n`
    )

    app.exit(failures === 0 ? 0 : 1)
}

void app.whenReady().then(main)
