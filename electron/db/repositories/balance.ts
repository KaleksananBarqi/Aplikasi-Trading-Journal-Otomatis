import type Database from 'better-sqlite3'
import type { AccountBalance, ExchangeId } from '../../../shared/domain'

/**
 * Repository penyimpanan saldo akun exchange.
 */

interface BalanceRow {
    exchange: string
    asset: string
    total: number
    available: number
    unrealized_pnl: number
    updated_at: number
}

function mapRow(row: BalanceRow): AccountBalance {
    return {
        exchange: row.exchange as ExchangeId,
        asset: row.asset,
        total: row.total,
        available: row.available,
        unrealizedPnl: row.unrealized_pnl,
        updatedAt: row.updated_at
    }
}

/**
 * Simpan atau perbarui daftar saldo akun.
 * Idempotent berdasarkan (exchange, asset).
 */
export function upsertBalances(db: Database.Database, balances: AccountBalance[]): void {
    if (balances.length === 0) return

    const stmt = db.prepare(`
        INSERT INTO account_balances (exchange, asset, total, available, unrealized_pnl, updated_at)
        VALUES (@exchange, @asset, @total, @available, @unrealizedPnl, @updatedAt)
        ON CONFLICT(exchange, asset) DO UPDATE SET
            total = excluded.total,
            available = excluded.available,
            unrealized_pnl = excluded.unrealized_pnl,
            updated_at = excluded.updated_at
    `)

    const runMany = db.transaction((items: AccountBalance[]) => {
        for (const item of items) {
            stmt.run({
                exchange: item.exchange,
                asset: item.asset,
                total: item.total,
                available: item.available,
                unrealizedPnl: item.unrealizedPnl,
                updatedAt: item.updatedAt
            })
        }
    })

    runMany(balances)
}

/**
 * Ambil semua saldo akun yang tersimpan.
 */
export function getAllBalances(db: Database.Database): AccountBalance[] {
    const rows = db.prepare('SELECT * FROM account_balances ORDER BY exchange ASC, asset ASC').all() as BalanceRow[]
    return rows.map(mapRow)
}

/**
 * Ambil saldo untuk exchange tertentu.
 */
export function getBalancesByExchange(db: Database.Database, exchange: string): AccountBalance[] {
    const rows = db.prepare('SELECT * FROM account_balances WHERE exchange = ? ORDER BY asset ASC').all(exchange) as BalanceRow[]
    return rows.map(mapRow)
}
