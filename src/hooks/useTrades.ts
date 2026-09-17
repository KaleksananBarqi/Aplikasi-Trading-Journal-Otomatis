import { useCallback, useEffect, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import type { TradeFilterPayload, TradeMeta } from '@shared/ipc-contract'

/**
 * Pemuatan data trade dari main process lewat IPC.
 *
 * Semua data diambil ulang (reload) setelah mutasi, bukan diperbarui di tempat.
 * Untuk skala data aplikasi personal, reload penuh lebih sederhana dan pasti
 * konsisten daripada menyinkronkan state di beberapa tempat.
 */

export interface UseTradesResult {
    trades: TradeDetail[]
    meta: TradeMeta | null
    loading: boolean
    error: string | null
    reload: () => Promise<void>
}

export function useTrades(filter?: TradeFilterPayload): UseTradesResult {
    const [trades, setTrades] = useState<TradeDetail[]>([])
    const [meta, setMeta] = useState<TradeMeta | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Serialisasi filter supaya useEffect tidak re-run hanya karena identitas objek baru.
    const filterKey = JSON.stringify(filter ?? {})

    const reload = useCallback(async (): Promise<void> => {
        setLoading(true)
        try {
            const parsed = JSON.parse(filterKey) as TradeFilterPayload
            const [loadedTrades, loadedMeta] = await Promise.all([
                window.api.listTrades(parsed),
                window.api.getTradeMeta()
            ])
            setTrades(loadedTrades)
            setMeta(loadedMeta)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [filterKey])

    useEffect(() => {
        void reload()
    }, [reload])

    return { trades, meta, loading, error, reload }
}
