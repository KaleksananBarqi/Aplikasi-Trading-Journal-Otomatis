/**
 * Probe kapabilitas ccxt untuk MEXC dan Bitunix.
 *
 * Tujuan: menjawab pertanyaan [PERLU VERIFIKASI] di brief §4.1 dan §4.2 secara
 * EMPIRIS, bukan dari asumsi atau training data.
 *
 * Yang diperiksa:
 * 1. Apakah MEXC dan Bitunix terdaftar di ccxt?
 * 2. Method apa saja yang diimplementasikan (hasFlags)?
 * 3. Apakah method histori yang kita butuhkan tersedia?
 * 4. Seperti apa bentuk simbol market untuk futures?
 *
 * Jalankan: node scripts/probe-ccxt.cjs
 *
 * TIDAK memerlukan kredensial — semua pemeriksaan bersifat lokal/statis.
 */

let ccxt
try {
    ccxt = require('ccxt')
} catch (error) {
    console.error('GAGAL memuat ccxt:', error.message)
    process.exit(1)
}

console.log('ccxt version :', ccxt.version ?? 'tidak diketahui')
console.log('total exchange terdaftar:', Object.keys(ccxt.exchanges ?? {}).length)

/** Method histori yang kita butuhkan untuk trading journal read-only. */
const REQUIRED_METHODS = [
    'fetchMyTrades',
    'fetchOrders',
    'fetchClosedOrders',
    'fetchPositions',
    'fetchPositionHistory',
    'fetchFundingHistory',
    'fetchLedger',
    'fetchOHLCV',
    'fetchMarkets'
]

function checkExchange(id) {
    console.log('\n' + '='.repeat(64))
    console.log(`EXCHANGE: ${id.toUpperCase()}`)
    console.log('='.repeat(64))

    const Ctor = ccxt[id]
    if (!Ctor) {
        console.log(`  [TIDAK ADA] ccxt tidak mendukung "${id}"`)
        return { supported: false }
    }

    console.log('  [ADA] class tersedia di ccxt')

    let instance
    try {
        instance = new Ctor({ enableRateLimit: true })
    } catch (error) {
        console.log(`  [GAGAL] konstruksi instance: ${error.message}`)
        return { supported: true, instantiable: false }
    }

    console.log(`  id         : ${instance.id}`)
    console.log(`  nama       : ${instance.name}`)
    console.log(`  versi API  : ${instance.version}`)
    console.log(`  certified  : ${instance.certified ?? false}`)

    // Periksa apakah endpoint futures/swap didukung.
    console.log('\n  --- Dukungan pasar derivatif ---')
    const hasFlags = instance.has ?? {}
    const derivativeFlags = [
        'fetchMarkets',
        'fetchMyTrades',
        'fetchOrders',
        'fetchClosedOrders',
        'fetchPositions',
        'fetchPosition',
        'fetchFundingHistory',
        'fetchFundingRate',
        'fetchFundingRates',
        'fetchLedger',
        'fetchOHLCV',
        'fetchBalance'
    ]

    for (const flag of derivativeFlags) {
        const value = hasFlags[flag]
        const mark = value ? '[YA]' : '[TIDAK]'
        console.log(`    ${mark.padEnd(7)} ${flag}`)
    }

    // Simbol pasar futures: ccxt memakai notasi swap, mis. BTC/USDT:USDT
    console.log('\n  --- Opsi pasar (defaultType) ---')
    const options = instance.options ?? {}
    console.log(`    defaultType        : ${options.defaultType ?? '(tidak diset)'}`)
    console.log(`    defaultSubType     : ${options.defaultSubType ?? '(tidak diset)'}`)
    const broker = options.broker ?? '(tidak ada)'
    console.log(`    broker             : ${typeof broker === 'string' ? broker : 'object'}`)

    // Cek apakah ada method dan subclass khusus futures.
    console.log('\n  --- Method khusus ---')
    const specialMethods = [
        'fetchFundingHistory',
        'fetchPositionHistory',
        'setPositionMode',
        'setLeverage'
    ]
    for (const method of specialMethods) {
        const exists = typeof instance[method] === 'function'
        console.log(`    ${exists ? '[ADA]  ' : '[TIDAK]'} ${method}`)
    }

    // Cek rate limit terkonfigurasi.
    console.log('\n  --- Rate limit ---')
    console.log(`    rateLimit (ms) : ${instance.rateLimit ?? '(tidak diset)'}`)

    // Method wajib untuk kebutuhan kita.
    console.log('\n  --- Method yang dibutuhkan aplikasi ini ---')
    const missing = []
    for (const method of REQUIRED_METHODS) {
        const exists = typeof instance[method] === 'function'
        if (!exists) missing.push(method)
        console.log(`    ${exists ? '[ADA]  ' : '[TIDAK]'} ${method}`)
    }

    // Longgarkan: satu-satunya yang benar-benar WAJIB adalah fetchMarkets + salah
    // satu jalur histori. fetchPositionHistory tidak semua exchange punya.
    const criticalMissing = missing.filter((m) => m === 'fetchMarkets' || m === 'fetchMyTrades')

    console.log('\n  RINGKASAN:')
    if (criticalMissing.length === 0) {
        console.log('    [OK] Method kritis tersedia (fetchMarkets + fetchMyTrades)')
    } else {
        console.log(`    [PERHATIAN] Method kritis tidak ada: ${criticalMissing.join(', ')}`)
    }
    const optionalMissing = missing.filter((m) => !criticalMissing.includes(m))
    if (optionalMissing.length > 0) {
        console.log(`    Catatan: tidak ada (opsional): ${optionalMissing.join(', ')}`)
    }

    return {
        supported: true,
        instantiable: true,
        hasFlags,
        missing,
        criticalMissing,
        rateLimit: instance.rateLimit
    }
}

const mexc = checkExchange('mexc')
const bitunix = checkExchange('bitunix')

console.log('\n' + '='.repeat(64))
console.log('KESIMPULAN UNTUK KEPUTUSAN ADAPTER')
console.log('='.repeat(64))

console.log(`\nMEXC   : ${mexc.supported ? 'didukung ccxt' : 'TIDAK didukung'}`)
if (mexc.supported) {
    console.log(`         fetchMyTrades   : ${mexc.hasFlags?.fetchMyTrades ? 'YA' : 'TIDAK'}`)
    console.log(`         fetchPositions  : ${mexc.hasFlags?.fetchPositions ? 'YA' : 'TIDAK'}`)
    console.log(`         fetchFundingHistory : ${mexc.hasFlags?.fetchFundingHistory ? 'YA' : 'TIDAK'}`)
    console.log(`         rateLimit       : ${mexc.rateLimit} ms`)
}

console.log(`\nBitunix: ${bitunix.supported ? 'didukung ccxt' : 'TIDAK didukung ccxt'}`)
if (bitunix.supported) {
    console.log(`         fetchMyTrades   : ${bitunix.hasFlags?.fetchMyTrades ? 'YA' : 'TIDAK'}`)
    console.log(`         fetchPositions  : ${bitunix.hasFlags?.fetchPositions ? 'YA' : 'TIDAK'}`)
    console.log(`         fetchFundingHistory : ${bitunix.hasFlags?.fetchFundingHistory ? 'YA' : 'TIDAK'}`)
    console.log(`         rateLimit       : ${bitunix.rateLimit} ms`)
}

console.log('\nCatatan: hasil ini menjawab kelayakan SECARA UMUM.')
console.log('Bentuk response aktual tetap WAJIB diverifikasi ke dokumentasi resmi')
console.log('saat menulis mapper, karena ccxt bisa menormalkan field berbeda dari')
console.log('bentuk mentah exchange (brief §4 & §12).\n')
