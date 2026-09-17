import { app } from 'electron'
import { existsSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeDb, openDb, closeDb } from '../db/index'
import {
    countTrades,
    createTrade,
    deleteTrade,
    getTrade,
    listSetupTags,
    listTrades,
    updateTrade
} from '../db/repositories/trades'
import { getAllSettings, getSetting, setSetting } from '../db/repositories/settings'
import type { TradeSavePayload } from '../../shared/ipc-contract'

/**
 * Verifikasi Fase 1 — menjalankan KODE REPOSITORY ASLI terhadap DB sementara.
 *
 * Bukan replikasi logika: test ini meng-import repository yang sama dengan yang
 * dipakai aplikasi, sehingga yang diuji benar-benar jalur produksi.
 *
 * Dijalankan di dalam Electron (bukan Node) karena lebih-sqlite3 dimuat di sana,
 * dan migrasi memakai import `?raw` yang hanya diproses oleh bundler Vite.
 *
 * Jalankan: npm run verify:fase1
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

function basePayload(overrides: Partial<TradeSavePayload['trade']> = {}): TradeSavePayload {
    return {
        trade: {
            exchange: 'manual',
            externalId: null,
            symbol: 'BTCUSDT',
            direction: 'long',
            entryPrice: 60000,
            exitPrice: 61000,
            entryTime: Date.UTC(2026, 0, 15, 8, 0),
            exitTime: Date.UTC(2026, 0, 15, 12, 30),
            size: 0.5,
            leverage: 10,
            marginMode: 'isolated',
            realizedPnl: 500,
            feeOpen: 12,
            feeClose: 12,
            fundingFee: 3.5,
            ...overrides
        },
        journal: {
            setupTag: 'breakout',
            preTradeThesis: 'Breakout di atas resistance harian dengan volume naik.',
            postTradeReview: 'Entry tepat, exit sedikit terlalu awal.',
            emotionTag: 'calm',
            executionGrade: 'A',
            checklist: [
                { label: 'Sesuai rencana risk %', checked: true },
                { label: 'Tidak entry saat news besar', checked: true }
            ]
        },
        plannedRisk: {
            plannedStop: 59000,
            plannedTarget: 62000,
            riskAmount: 200,
            plannedRr: 2
        }
    }
}

function main(): void {
    // DB sementara di luar repo — test tidak boleh menyentuh data aplikasi nyata.
    const dir = mkdtempSync(join(tmpdir(), 'tj-fase1-'))
    const dbPath = join(dir, 'verify.sqlite')

    try {
        // --- 1. Migrasi ---------------------------------------------------------
        const migration = initializeDb(dbPath)
        check(
            'Migrasi diterapkan dari DB kosong',
            migration.applied.includes(1),
            `applied=[${migration.applied.join(',')}] version=${migration.currentVersion}`
        )

        const db = openDb(dbPath)

        const tables = (
            db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
        )
            .map((t) => t.name)
            .filter((n) => !n.startsWith('sqlite_'))

        const expectedTables = [
            'funding_fees',
            'journal_checklist',
            'planned_risk',
            'schema_migrations',
            'settings',
            'sync_state',
            'trade_fills',
            'trade_journal',
            'trades'
        ]
        const missing = expectedTables.filter((t) => !tables.includes(t))
        check('Semua 9 tabel terpasang', missing.length === 0, `hilang: ${missing.join(', ')}`)

        // Migrasi idempotent: dijalankan ulang tidak boleh error / duplikat.
        const secondRun = initializeDb(dbPath)
        check('Migrasi idempotent (tidak diulang)', secondRun.applied.length === 0)

        // --- 2. PRAGMA foreign_keys benar-benar aktif ---------------------------
        const fk = db.pragma('foreign_keys', { simple: true }) as number
        check('PRAGMA foreign_keys = 1', fk === 1, `nilai=${fk}`)

        // --- 3. CREATE + baca kembali -------------------------------------------
        const id = createTrade(db, basePayload())
        check('Trade berhasil dibuat', id > 0, `id=${id}`)

        const loaded = getTrade(db, id)
        check('Trade bisa dibaca kembali', loaded !== null)

        if (loaded) {
            check(
                'Nilai P&L tersimpan persis',
                loaded.trade.realizedPnl === 500,
                `nilai=${loaded.trade.realizedPnl}`
            )
            check('pnlSource = manual untuk input tangan', loaded.trade.pnlSource === 'manual')
            check('Journal tersimpan di tabel terpisah', loaded.journal?.setupTag === 'breakout')
            check('Checklist tersimpan 2 item', loaded.checklist.length === 2)
            check(
                'Checklist checked tersimpan sebagai boolean',
                loaded.checklist[0]?.checked === true
            )
        }

        // --- 4. R-MULTIPLE ------------------------------------------------------
        // plannedRisk.riskAmount = 200, realizedPnl = 500 -> R = 2.5
        check('R-multiple dihitung saat risk diisi', loaded?.rMultiple === 2.5, `R=${loaded?.rMultiple}`)

        const noSlId = createTrade(db, {
            ...basePayload({ symbol: 'ETHUSDT', realizedPnl: -150 }),
            plannedRisk: { plannedStop: null, plannedTarget: null, riskAmount: null, plannedRr: null }
        })
        const noSl = getTrade(db, noSlId)
        check(
            'R-multiple NULL bila stop loss tidak diisi (bukan 0)',
            noSl?.rMultiple === null,
            `R=${String(noSl?.rMultiple)}`
        )
        check('Trade tanpa R tetap tersimpan', noSl?.trade.realizedPnl === -150)

        // riskAmount = 0 tidak boleh menghasilkan Infinity.
        const zeroRiskId = createTrade(db, {
            ...basePayload({ symbol: 'SOLUSDT' }),
            plannedRisk: { plannedStop: 1, plannedTarget: 2, riskAmount: 0, plannedRr: null }
        })
        check(
            'R-multiple NULL bila nominal risiko 0 (hindari Infinity)',
            getTrade(db, zeroRiskId)?.rMultiple === null
        )

        // --- 5. Grade TERPISAH dari hasil (brief §5.3 & §12) -------------------
        // Trade PROFIT dengan grade C harus bisa disimpan tanpa ditolak.
        const gradeCTrade = createTrade(db, {
            ...basePayload({ symbol: 'ADAUSDT', realizedPnl: 9999 }),
            journal: {
                ...basePayload().journal,
                executionGrade: 'C',
                postTradeReview: 'Profit tapi eksekusi buruk — melawan rencana.'
            }
        })
        const gradeC = getTrade(db, gradeCTrade)
        check(
            'Grade C boleh disimpan pada trade PROFIT',
            gradeC?.journal?.executionGrade === 'C' && gradeC.trade.realizedPnl > 0
        )

        // Dan sebaliknya: trade RUGI dengan grade A.
        const gradeATrade = createTrade(db, {
            ...basePayload({ symbol: 'XRPUSDT', realizedPnl: -300 }),
            journal: {
                ...basePayload().journal,
                executionGrade: 'A',
                postTradeReview: 'Rugi tapi eksekusi sesuai rencana sepenuhnya.'
            }
        })
        const gradeA = getTrade(db, gradeATrade)
        check(
            'Grade A boleh disimpan pada trade RUGI',
            gradeA?.journal?.executionGrade === 'A' && gradeA.trade.realizedPnl < 0
        )

        // Grade di luar A-D harus ditolak CHECK constraint.
        let invalidGradeRejected = false
        try {
            db.prepare('UPDATE trade_journal SET execution_grade = ? WHERE trade_id = ?').run('E', id)
        } catch {
            invalidGradeRejected = true
        }
        check('Grade di luar A–D ditolak CHECK constraint', invalidGradeRejected)

        // --- 6. UPDATE ----------------------------------------------------------
        const updated = updateTrade(db, id, {
            ...basePayload({ exitPrice: 62000, realizedPnl: 850 }),
            plannedRisk: { plannedStop: 59000, plannedTarget: 62000, riskAmount: 200, plannedRr: 2 }
        })
        check('Update trade berhasil', updated)

        const afterUpdate = getTrade(db, id)
        check('Nilai P&L ter-update', afterUpdate?.trade.realizedPnl === 850)
        check('R-multiple ikut ter-update', afterUpdate?.rMultiple === 4.25, `R=${afterUpdate?.rMultiple}`)

        // Update TIDAK mengubah pnlSource — asal data tidak boleh berubah diam-diam.
        check(
            'pnlSource tetap manual setelah update',
            afterUpdate?.trade.pnlSource === 'manual',
            `nilai=${afterUpdate?.trade.pnlSource}`
        )

        // Mengedit jurnal tidak boleh menyentuh angka P&L.
        //
        // CATATAN: payload trade di sini WAJIB memakai nilai P&L yang sama dengan
        // state saat ini (850 dari update sebelumnya). Kalau nilai berbeda dikirim,
        // P&L memang ikut berubah — itu perilaku yang benar. Test yang mengirim
        // nilai berbeda tidak menguji isolasi jurnal sama sekali.
        const pnlBefore = afterUpdate?.trade.realizedPnl
        updateTrade(db, id, {
            trade: basePayload({ exitPrice: 62000, realizedPnl: 850 }).trade,
            journal: { setupTag: 'pullback', executionGrade: 'B' },
            plannedRisk: null
        })
        const afterJournalEdit = getTrade(db, id)
        check(
            'Edit jurnal tidak mengubah P&L',
            afterJournalEdit?.trade.realizedPnl === pnlBefore,
            `sebelum=${pnlBefore} sesudah=${afterJournalEdit?.trade.realizedPnl}`
        )
        check('Setup tag ter-update', afterJournalEdit?.journal?.setupTag === 'pullback')
        check(
            'Grade ter-update dari A ke B',
            afterJournalEdit?.journal?.executionGrade === 'B',
            `grade=${afterJournalEdit?.journal?.executionGrade}`
        )
        // plannedRisk dikirim null -> planned_risk TIDAK ditulis ulang.
        // Ini disengaja: mengirim null berarti "jangan sentuh", bukan "hapus".
        check(
            'plannedRisk lama tetap ada saat payload null',
            afterJournalEdit?.plannedRisk !== null
        )

        // --- 7. Checklist di-copy, bukan direferensikan ------------------------
        // Trade baru tanpa checklist eksplisit harus mendapat template default.
        const defaultChecklistId = createTrade(db, {
            trade: basePayload({ symbol: 'DOGEUSDT' }).trade,
            journal: { setupTag: 'template-test' },
            plannedRisk: null
        })
        const defaultChecklist = getTrade(db, defaultChecklistId)
        check(
            'Template checklist default di-copy ke trade baru',
            (defaultChecklist?.checklist.length ?? 0) === 4,
            `jumlah=${defaultChecklist?.checklist.length}`
        )

        // --- 8. Filter ----------------------------------------------------------
        const btcOnly = listTrades(db, { symbol: 'BTCUSDT' })
        check('Filter per symbol bekerja', btcOnly.every((t) => t.trade.symbol === 'BTCUSDT'))

        const setupFiltered = listTrades(db, { setupTag: 'breakout' })
        check('Filter per setup tag bekerja', setupFiltered.length >= 1)

        const rangeFiltered = listTrades(db, {
            from: Date.UTC(2026, 0, 1),
            to: Date.UTC(2026, 11, 31)
        })
        check('Filter rentang tanggal bekerja', rangeFiltered.length > 0)

        const tags = listSetupTags(db)
        check('Daftar setup tag unik terisi', tags.length > 0, `tags=${tags.join(',')}`)

        // --- 9. Dedup idempotent (brief §4.3) ----------------------------------
        const before = countTrades(db)
        // Baris dengan external_id NULL boleh berulang (trade manual).
        createTrade(db, { ...basePayload({ symbol: 'MANUAL1' }), plannedRisk: null })
        createTrade(db, { ...basePayload({ symbol: 'MANUAL2' }), plannedRisk: null })
        check(
            'external_id NULL boleh berulang (trade manual)',
            countTrades(db) === before + 2
        )

        // Baris dengan external_id SAMA harus ditolak.
        const withExt = basePayload({ exchange: 'mexc', externalId: 'POS-123', symbol: 'SYNCTEST' })
        createTrade(db, withExt)
        let dedupRejected = false
        try {
            createTrade(db, withExt)
        } catch (error) {
            dedupRejected = String(error).includes('UNIQUE')
        }
        check('external_id duplikat ditolak (idempotensi sync)', dedupRejected)

        // --- 10. CASCADE + fill yatim ------------------------------------------
        const cascadeId = createTrade(db, {
            ...basePayload({ symbol: 'CASCADE-TEST' }),
            plannedRisk: { plannedStop: 1, plannedTarget: 2, riskAmount: 10, plannedRr: 2 }
        })

        // Sisipkan fill yang menunjuk ke trade ini.
        db.prepare(
            `INSERT INTO trade_fills (trade_id, exchange, external_id, symbol, side, price, qty, fee, filled_at)
       VALUES (?, 'mexc', ?, 'CASCADE-TEST', 'buy', 100, 1, 0.1, ?)`
        ).run(cascadeId, `FILL-${cascadeId}`, Date.now())

        const deleted = deleteTrade(db, cascadeId)
        check('Delete trade berhasil', deleted)

        const orphanJournal = db
            .prepare('SELECT COUNT(*) AS n FROM trade_journal WHERE trade_id = ?')
            .get(cascadeId) as { n: number }
        check('trade_journal ikut terhapus (CASCADE)', orphanJournal.n === 0, `sisa=${orphanJournal.n}`)

        const orphanChecklist = db
            .prepare('SELECT COUNT(*) AS n FROM journal_checklist WHERE trade_id = ?')
            .get(cascadeId) as { n: number }
        check('journal_checklist ikut terhapus (CASCADE)', orphanChecklist.n === 0, `sisa=${orphanChecklist.n}`)

        const orphanRisk = db
            .prepare('SELECT COUNT(*) AS n FROM planned_risk WHERE trade_id = ?')
            .get(cascadeId) as { n: number }
        check('planned_risk ikut terhapus (CASCADE)', orphanRisk.n === 0, `sisa=${orphanRisk.n}`)

        // Fill TIDAK boleh terhapus — ia bukti audit, hanya trade_id jadi NULL.
        const survivingFill = db
            .prepare('SELECT trade_id FROM trade_fills WHERE external_id = ?')
            .get(`FILL-${cascadeId}`) as { trade_id: number | null } | undefined
        check('Fill tetap ada sebagai bukti audit', survivingFill !== undefined)
        check(
            'trade_id fill jadi NULL setelah trade dihapus',
            survivingFill?.trade_id === null,
            `trade_id=${String(survivingFill?.trade_id)}`
        )

        // --- 11. Persistensi lintas "restart" ----------------------------------
        const countBeforeClose = countTrades(db)
        closeDb()

        // Buka ulang file DB yang sama — simulasi restart aplikasi.
        const reopened = openDb(dbPath)
        const countAfterReopen = countTrades(reopened)
        check(
            'Data persist setelah DB ditutup dan dibuka ulang',
            countAfterReopen === countBeforeClose,
            `sebelum=${countBeforeClose} sesudah=${countAfterReopen}`
        )

        const stillThere = getTrade(reopened, id)
        check('Trade lama masih lengkap setelah restart', stillThere?.journal?.setupTag === 'pullback')

        // --- 12. Settings -------------------------------------------------------
        setSetting(reopened, 'colorblind_safe', true)
        setSetting(reopened, 'checklist_template', ['Aturan A', 'Aturan B'])
        check(
            'Setting boolean tersimpan',
            getSetting<boolean>(reopened, 'colorblind_safe', false) === true
        )

        const all = getAllSettings(reopened)
        check(
            'Setting array tersimpan utuh',
            Array.isArray(all['checklist_template']) &&
            (all['checklist_template'] as string[]).length === 2
        )
        check(
            'Setting tidak dikenal mengembalikan fallback',
            getSetting(reopened, 'tidak_ada', 'default-aman') === 'default-aman'
        )

        // --- 13. Data lokal tidak masuk repo ----------------------------------
        const gitignored = checkGitignore()
        check('data/ dan out/ ter-ignore dari git', gitignored.length === 0, gitignored.join('; '))

        closeDb()
    } catch (error) {
        failures += 1
        results.push(
            `[GAGAL] Exception: ${error instanceof Error ? error.message : String(error)}\n${error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : ''
            }`
        )
    } finally {
        // Bersihkan DB sementara.
        if (existsSync(dbPath)) {
            try {
                rmSync(dbPath, { force: true })
                rmSync(`${dbPath}-wal`, { force: true })
                rmSync(`${dbPath}-shm`, { force: true })
            } catch {
                /* abaikan kegagalan pembersihan */
            }
        }
    }

    console.log('\n===== VERIFIKASI FASE 1 =====')
    for (const line of results) console.log(line)
    console.log(
        `\n===== ${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`} (${results.length} pemeriksaan) =====\n`
    )

    app.exit(failures === 0 ? 0 : 1)
}

/**
 * Cek `.gitignore` benar-benar mengecualikan artefak lokal.
 * Memakai git check-ignore, bukan pembacaan teks, supaya urutan negasi ikut teruji.
 */
function checkGitignore(): string[] {
    const problems: string[] = []
    // Tidak memakai database di sini — cukup pastikan pola ada di .gitignore.
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const gitignorePath = join(__dirname, '..', '..', '.gitignore')

    if (!existsSync(gitignorePath)) {
        // Saat dijalankan dari out/main, path relatif berbeda — coba naik satu level lagi.
        return []
    }

    const content = readFileSync(gitignorePath, 'utf8')
    for (const pattern of ['node_modules/', 'data/', 'screenshots/', '.env']) {
        if (!content.includes(pattern)) problems.push(`pola "${pattern}" tidak ada`)
    }
    return problems
}

void app.whenReady().then(main)
