import { useCallback, useEffect, useState } from 'react'
import type { SyncProgressPayload, SyncStatePayload } from '@shared/ipc-contract'
import { Badge, Button, ErrorNote } from './ui'
import { formatDateTime } from '../lib/format'
import { cn } from '../lib/utils'

/**
 * Panel sync: tombol Sync Now + indikator status per exchange.
 *
 * ===========================================================================
 * KENAPA AUTO-SYNC DEFAULT OFF (brief §4.3)
 * ===========================================================================
 *
 * Sync otomatis dimatikan secara default supaya aplikasi tidak memanggil API
 * exchange berulang tanpa sepengetahuan user. Memanggil API exchange terus-
 * menerus tanpa izin eksplisit berisiko rate limit, dan pada exchange tertentu
 * bisa memicu peninjauan akun.
 *
 * User mengaktifkannya sendiri, dan tombol manual selalu tersedia.
 */

interface SyncPanelProps {
    /** Dipanggil setelah sync selesai supaya daftar trade dimuat ulang. */
    onSyncComplete: () => Promise<void> | void
    /** Tampilkan versi ringkas (untuk sidebar) atau lengkap (Settings). */
    variant?: 'full' | 'compact'
}

export function SyncPanel({
    onSyncComplete,
    variant = 'full'
}: SyncPanelProps): React.JSX.Element {
    const [states, setStates] = useState<SyncStatePayload[]>([])
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [lastSummary, setLastSummary] = useState<string | null>(null)

    const loadStates = useCallback(async (): Promise<void> => {
        try {
            setStates(await window.api.getSyncStates())
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }, [])

    useEffect(() => {
        void loadStates()
    }, [loadStates])

    // Dengarkan progres dari main process. Fungsi pelepas listener dipanggil saat
    // unmount — tanpa itu listener menumpuk setiap kali komponen di-mount ulang.
    useEffect(() => {
        const unsubscribe = window.api.onSyncProgress((payload: SyncProgressPayload) => {
            setProgress(payload.message)
        })
        return unsubscribe
    }, [])

    async function handleSync(): Promise<void> {
        setRunning(true)
        setError(null)
        setLastSummary(null)
        setProgress('Memulai…')

        try {
            const result = await window.api.runSync()

            if (!result.ok) {
                setError(result.error ?? 'Sync gagal.')
                return
            }

            const data = result.data
            if (!data) return

            const parts = data.exchanges.map((ex) => {
                const label = ex.exchange.toUpperCase()
                if (ex.status === 'error') return `${label}: gagal`
                if (ex.inserted === 0 && ex.updated === 0) return `${label}: tidak ada data baru`
                return `${label}: ${ex.inserted} baru, ${ex.updated} diperbarui`
            })

            setLastSummary(
                `${parts.join(' · ')} · ${(data.durationMs / 1000).toFixed(1)}s` +
                (data.exchanges.some((ex) => ex.wasFullBackfill) ? ' · backfill penuh' : '')
            )

            if (data.status === 'partial') {
                const details = data.exchanges
                    .filter((ex) => ex.error)
                    .map((ex) => `${ex.exchange}: ${ex.error}`)
                    .join('; ')
                setError(`Selesai dengan catatan — ${details}`)
            }

            await loadStates()
            await onSyncComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
            setProgress(null)
        }
    }

    if (variant === 'compact') {
        return (
            <div className="flex flex-col gap-1.5">
                <Button
                    size="sm"
                    variant="primary"
                    className="w-full"
                    onClick={() => void handleSync()}
                    disabled={running}
                >
                    {running ? 'Menyinkron…' : 'Sync Now'}
                </Button>
                {progress && (
                    <p className="text-[10px] text-muted-foreground" title={progress}>
                        {progress}
                    </p>
                )}
                {error && <p className="text-[10px] text-loss">{error}</p>}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                    Sync otomatis nonaktif secara default — tombol manual tidak pernah
                    memanggil API tanpa Anda minta.
                </p>
                <Button variant="primary" onClick={() => void handleSync()} disabled={running}>
                    {running ? 'Menyinkron…' : 'Sync Now'}
                </Button>
            </div>

            {progress && (
                <div className="rounded border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px]">
                    {progress}
                </div>
            )}

            {lastSummary && (
                <div className="rounded border border-profit/30 bg-profit/10 px-2.5 py-1.5 text-[11px]">
                    {lastSummary}
                </div>
            )}

            {error && <ErrorNote message={error} />}

            <div className="flex flex-col gap-1.5">
                {states.map((state) => (
                    <div
                        key={state.exchange}
                        className="rounded-md border border-border bg-background px-3 py-2"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium uppercase">{state.exchange}</span>
                                <SyncStatusBadge status={state.lastStatus} />
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                                {state.lastSyncAt ? formatDateTime(state.lastSyncAt) : 'belum pernah sync'}
                            </span>
                        </div>

                        {(state.positionsSynced > 0 || state.fillsSynced > 0 || state.fundingSynced > 0) && (
                            <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                                <span>
                                    Posisi: <span className="tabular">{state.positionsSynced}</span>
                                </span>
                                <span>
                                    Fill: <span className="tabular">{state.fillsSynced}</span>
                                </span>
                                <span>
                                    Funding: <span className="tabular">{state.fundingSynced}</span>
                                </span>
                            </div>
                        )}

                        {state.lastError && (
                            <p className={cn('mt-1 text-[10px]', 'text-loss')} title={state.lastError}>
                                {state.lastError}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * Badge status sync.
 *
 * `partial` penting ditampilkan berbeda dari `error`: data utama sudah masuk,
 * hanya bagian pelengkap yang gagal. Menyamakannya dengan `error` akan membuat
 * user mengira sync-nya gagal total padahal trade-nya sudah tersimpan.
 */
function SyncStatusBadge({
    status
}: {
    status: 'ok' | 'partial' | 'error' | null
}): React.JSX.Element {
    if (status === null) return <Badge tone="muted">belum sync</Badge>
    if (status === 'ok') return <Badge tone="profit">ok</Badge>
    if (status === 'partial') return <Badge tone="warning">sebagian</Badge>
    return <Badge tone="loss">gagal</Badge>
}
