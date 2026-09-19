import { useEffect, useState } from 'react'
import type { BackupStatusPayload, BackupRunResult } from '@shared/ipc-contract'
import { Badge, Button, Card, CardHeader, ErrorNote } from './ui'
import { formatDateTime } from '../lib/format'

/**
 * Panel backup Google Drive (fitur 5).
 *
 * Backup SATU ARAH: upload snapshot JSON + screenshot ke Google Drive.
 * Tidak ada restore otomatis — terlalu berbahaya untuk data finansial.
 */

interface BackupPanelProps {
    onSyncComplete: () => void
}

export function BackupPanel({ onSyncComplete }: BackupPanelProps): React.JSX.Element {
    const [status, setStatus] = useState<BackupStatusPayload | null>(null)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<BackupRunResult | null>(null)

    useEffect(() => {
        void loadStatus()
    }, [])

    async function loadStatus(): Promise<void> {
        try {
            const s = await window.api.getBackupStatus()
            setStatus(s)
        } catch {
            // Status gagal dimuat — tidak fatal.
        }
    }

    async function handleRunBackup(): Promise<void> {
        setRunning(true)
        setError(null)
        setResult(null)
        try {
            const res = await window.api.runBackup()
            if (!res.ok || !res.data) {
                setError(res.error ?? 'Gagal menjalankan backup.')
                return
            }
            setResult(res.data)
            await loadStatus()
            onSyncComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
        }
    }

    async function handleDisconnect(): Promise<void> {
        setRunning(true)
        setError(null)
        try {
            const res = await window.api.disconnectBackup()
            if (!res.ok) {
                setError(res.error ?? 'Gagal memutus koneksi.')
                return
            }
            await loadStatus()
            onSyncComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
        }
    }

    const connected = status?.connected ?? false
    const lastBackup = status?.lastBackupAt

    return (
        <Card>
            <CardHeader
                title="Backup Google Drive"
                description="Snapshot JSON semua trade + screenshot diunggah ke folder Google Drive pilihan Anda."
            />
            <div className="flex flex-col gap-3 p-4">
                {error && <ErrorNote message={error} />}

                <div className="flex items-center gap-2 text-xs">
                    <Badge tone={connected ? 'profit' : 'muted'}>
                        {connected ? 'Terhubung' : 'Belum terhubung'}
                    </Badge>
                    {status?.email && (
                        <span className="text-muted-foreground">{status.email}</span>
                    )}
                    {lastBackup && (
                        <span className="text-muted-foreground">
                            · Backup terakhir: {formatDateTime(lastBackup)}
                        </span>
                    )}
                </div>

                {result && (
                    <div className="rounded-md border border-profit/40 bg-profit/10 px-3 py-2 text-[11px]">
                        <p className="font-medium text-profit">Backup berhasil!</p>
                        <p className="mt-0.5 text-muted-foreground">
                            {result.filesUploaded} file · {(result.bytesUploaded / 1024).toFixed(1)} KB · {(result.durationMs / 1000).toFixed(1)}s
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {!connected ? (
                        <p className="text-[11px] text-muted-foreground">
                            Untuk menghubungkan Google Drive, set environment variable
                            <code className="mx-1 rounded bg-muted px-1 py-0.5">GDRIVE_CLIENT_ID</code>
                            lalu restart aplikasi. Klik tombol di bawah untuk memulai OAuth.
                        </p>
                    ) : (
                        <>
                            <Button
                                variant="primary"
                                onClick={() => void handleRunBackup()}
                                disabled={running}
                            >
                                {running ? 'Mem-backup…' : 'Backup Sekarang'}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => void handleDisconnect()}
                                disabled={running}
                            >
                                Putuskan
                            </Button>
                        </>
                    )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                    Backup satu arah: data diunggah ke Google Drive, tidak ada download
                    otomatis. Token disimpan terenkripsi via safeStorage OS.
                </p>
            </div>
        </Card>
    )
}
