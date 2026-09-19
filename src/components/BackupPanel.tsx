import { useEffect, useState } from 'react'
import type { BackupStatusPayload, BackupRunResult } from '@shared/ipc-contract'
import { Badge, Button, Card, CardHeader, ErrorNote } from './ui'
import { formatDateTime } from '../lib/format'

/**
 * Panel backup Google Drive (fitur 4 & 5).
 *
 * Mendukung 2 mode sinkronisasi:
 * 1. FOLDER LOKAL GOOGLE DRIVE (Sangat Mudah / 1-Klik)
 *    Memanfaatkan aplikasi Google Drive for Desktop. File snapshot otomatis
 *    disimpan ke folder Google Drive lokal dan disinkronkan langsung ke cloud.
 * 2. CLOUD OAUTH DIRECT
 *    Koneksi langsung via OAuth Google Drive API dengan Client ID kustom.
 */

interface BackupPanelProps {
    onSyncComplete: () => void
}

export function BackupPanel({ onSyncComplete }: BackupPanelProps): React.JSX.Element {
    const [status, setStatus] = useState<BackupStatusPayload | null>(null)
    const [syncMode, setSyncMode] = useState<'folder' | 'oauth'>('folder')
    const [localFolder, setLocalFolder] = useState<string>('')
    const [clientId, setClientId] = useState<string>('')
    const [savingSettings, setSavingSettings] = useState(false)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<BackupRunResult | null>(null)

    useEffect(() => {
        void loadAll()
    }, [])

    async function loadAll(): Promise<void> {
        try {
            const [s, settings] = await Promise.all([
                window.api.getBackupStatus(),
                window.api.getSettings()
            ])
            setStatus(s)
            const mode = (settings['gdrive_sync_mode'] as 'folder' | 'oauth') || 'folder'
            setSyncMode(mode)
            setLocalFolder((settings['gdrive_local_folder'] as string) || '')
            setClientId((settings['gdrive_client_id'] as string) || '')
        } catch {
            // Status gagal dimuat — tidak fatal.
        }
    }

    async function handleSelectFolder(): Promise<void> {
        setError(null)
        try {
            const res = await window.api.selectBackupFolder()
            if (res.ok && res.data) {
                setLocalFolder(res.data)
                await window.api.setSettings({
                    gdriveLocalFolder: res.data,
                    gdriveSyncMode: 'folder'
                })
                setSyncMode('folder')
                await loadAll()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    async function handleSaveOAuthClientId(): Promise<void> {
        setSavingSettings(true)
        setError(null)
        try {
            await window.api.setSettings({
                gdriveClientId: clientId.trim(),
                gdriveSyncMode: 'oauth'
            })
            await loadAll()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSavingSettings(false)
        }
    }

    async function handleStartOAuth(): Promise<void> {
        setError(null)
        setRunning(true)
        try {
            const res = await window.api.startBackupOAuth()
            if (!res.ok) {
                setError(res.error ?? 'Gagal memulai proses OAuth Google Drive.')
                return
            }
            await loadAll()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setRunning(false)
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
            await loadAll()
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
            await loadAll()
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
                title="Sinkronisasi & Backup Google Drive"
                description="Simpan snapshot JSON semua riwayat trade dan gambar jurnal ke Google Drive secara mudah dan aman."
            />
            <div className="flex flex-col gap-4 p-4">
                {error && <ErrorNote message={error} />}

                {/* Status Bar */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={connected ? 'profit' : 'muted'}>
                        {connected ? 'Siap Sinkron' : 'Belum Terhubung'}
                    </Badge>
                    <span className="text-muted-foreground">
                        Mode aktif: <strong className="text-foreground">{syncMode === 'folder' ? 'Folder Google Drive Lokal' : 'Cloud OAuth Direct'}</strong>
                    </span>
                    {status?.email && <span className="text-muted-foreground">({status.email})</span>}
                    {lastBackup && (
                        <span className="text-muted-foreground">
                            · Terakhir: {formatDateTime(lastBackup)}
                        </span>
                    )}
                </div>

                {result && (
                    <div className="rounded-md border border-profit/40 bg-profit/10 px-3 py-2 text-[11px]">
                        <p className="font-medium text-profit">Backup berhasil disinkronkan!</p>
                        <p className="mt-0.5 text-muted-foreground">
                            {result.filesUploaded} file · {(result.bytesUploaded / 1024).toFixed(1)} KB · {(result.durationMs / 1000).toFixed(1)}s
                        </p>
                    </div>
                )}

                {/* Pilihan Metode Sinkronisasi */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {/* Metode 1: Folder Lokal Google Drive */}
                    <div
                        className={`flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
                            syncMode === 'folder'
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border bg-card hover:border-border/80'
                        }`}
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground">
                                    📁 Folder Google Drive Lokal
                                </span>
                                <Badge tone="profit">Rekomendasi (Termudah)</Badge>
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                                Cukup pilih folder di dalam Google Drive Anda (misal <code>G:\My Drive\TradingBackup</code>). Aplikasi akan otomatis menyalin backup ke sana, dan Google Drive for Desktop akan mengunggahnya secara instan. <strong>Tanpa perlu API key!</strong>
                            </p>
                            {localFolder ? (
                                <div className="mt-2.5 rounded bg-muted/60 p-2 font-mono text-[11px] text-foreground truncate">
                                    {localFolder}
                                </div>
                            ) : (
                                <p className="mt-2 text-[11px] text-amber-500 font-medium">
                                    ⚠️ Belum ada folder yang dipilih
                                </p>
                            )}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => void handleSelectFolder()}>
                                {localFolder ? 'Ganti Folder' : '📂 Pilih Folder Google Drive'}
                            </Button>
                            {syncMode !== 'folder' && localFolder && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setSyncMode('folder')
                                        void window.api.setSettings({ gdriveSyncMode: 'folder' })
                                    }}
                                >
                                    Gunakan Mode Ini
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Metode 2: Cloud OAuth Direct */}
                    <div
                        className={`flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
                            syncMode === 'oauth'
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border bg-card hover:border-border/80'
                        }`}
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground">
                                    ☁️ Cloud OAuth Direct (GCP)
                                </span>
                                <Badge tone="muted">Advanced</Badge>
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                                Hubungkan langsung dengan akun Google Anda menggunakan Google OAuth Client ID tanpa aplikasi desktop.
                            </p>
                            <div className="mt-2">
                                <label className="text-[10px] font-medium text-muted-foreground">
                                    Google OAuth Client ID
                                </label>
                                <div className="mt-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={clientId}
                                        onChange={(e) => setClientId(e.target.value)}
                                        placeholder="...apps.googleusercontent.com"
                                        className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs font-mono"
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => void handleSaveOAuthClientId()}
                                        disabled={savingSettings || !clientId.trim()}
                                    >
                                        Simpan
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            {!connected || syncMode !== 'oauth' ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleStartOAuth()}
                                    disabled={running || !clientId.trim()}
                                >
                                    {running ? 'Menghubungkan...' : '🔑 Hubungkan Akun Google'}
                                </Button>
                            ) : (
                                <Button size="sm" variant="ghost" onClick={() => void handleDisconnect()} disabled={running}>
                                    Putuskan
                                </Button>
                            )}
                            {syncMode !== 'oauth' && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setSyncMode('oauth')
                                        void window.api.setSettings({ gdriveSyncMode: 'oauth' })
                                    }}
                                >
                                    Gunakan Mode Ini
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tombol Eksekusi Backup Utama */}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-[11px] text-muted-foreground">
                        Semua data tetap berada di bawah kendali Anda. Token OAuth terenkripsi dengan aman via safeStorage OS.
                    </p>
                    <Button
                        variant="primary"
                        onClick={() => void handleRunBackup()}
                        disabled={running || !connected}
                    >
                        {running ? 'Sedang Menyinkronkan…' : '🚀 Backup Sekarang'}
                    </Button>
                </div>
            </div>
        </Card>
    )
}
