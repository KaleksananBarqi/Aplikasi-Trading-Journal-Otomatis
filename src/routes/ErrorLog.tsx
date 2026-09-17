import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LogEntry } from '@shared/ipc-contract'
import { PageHeader } from '../components/AppShell'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Select, TextInput } from '../components/ui'

export function ErrorLog(): React.JSX.Element {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [filterLevel, setFilterLevel] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL')
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
    const [copied, setCopied] = useState<boolean>(false)

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await window.api.getLogs(1000)
            if (result.ok && result.data) {
                setLogs(result.data)
            } else {
                setError(result.error ?? 'Gagal memuat log sistem')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void fetchLogs()
    }, [fetchLogs])

    const handleClearLogs = async () => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus seluruh log sistem? Tindakan ini tidak bisa dibatalkan.')) {
            return
        }
        try {
            const result = await window.api.clearLogs()
            if (!result.ok) {
                alert(result.error ?? 'Gagal menghapus log.')
            } else {
                await fetchLogs()
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err))
        }
    }

    const handleOpenFolder = async () => {
        try {
            const result = await window.api.openLogFolder()
            if (!result.ok) {
                alert(result.error ?? 'Gagal membuka folder log.')
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err))
        }
    }

    const handleCopyAll = async () => {
        if (logs.length === 0) return
        const text = logs.map((l) => l.raw).join('\n')
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            alert('Gagal menyalin log ke clipboard.')
        }
    }

    // Filter log berdasarkan level & search query
    const filteredLogs = useMemo(() => {
        return logs.filter((item) => {
            if (filterLevel !== 'ALL' && item.level !== filterLevel) {
                return false
            }
            if (searchQuery.trim() !== '') {
                const query = searchQuery.toLowerCase()
                const matchMsg = item.message.toLowerCase().includes(query)
                const matchDetail = item.details?.toLowerCase().includes(query) ?? false
                const matchTs = item.timestamp.toLowerCase().includes(query)
                return matchMsg || matchDetail || matchTs
            }
            return true
        })
    }, [logs, filterLevel, searchQuery])

    const stats = useMemo(() => {
        let errors = 0
        let warnings = 0
        let infos = 0
        for (const l of logs) {
            if (l.level === 'ERROR') errors++
            else if (l.level === 'WARN') warnings++
            else if (l.level === 'INFO') infos++
        }
        return { total: logs.length, errors, warnings, infos }
    }, [logs])

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            <PageHeader
                title="Error Logs & Debugging"
                description="Catatan log terpusat dari Main Process dan Renderer untuk diagnosa kendala aplikasi."
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void fetchLogs()} disabled={loading}>
                            {loading ? 'Memuat...' : 'Refresh'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleCopyAll()} disabled={logs.length === 0}>
                            {copied ? 'Tersalin!' : 'Copy Logs'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleOpenFolder()}>
                            Buka Folder Log
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void handleClearLogs()} disabled={logs.length === 0}>
                            Clear Logs
                        </Button>
                    </div>
                }
            />

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
                {error && <ErrorNote message={error} />}

                {/* Ringkasan Statistik */}
                <div className="grid grid-cols-4 gap-3">
                    <Card className="p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Total Entri</p>
                        <p className="mt-1 text-lg font-bold">{stats.total}</p>
                    </Card>
                    <Card className="p-3">
                        <p className="text-[11px] font-medium text-loss">Error</p>
                        <p className="mt-1 text-lg font-bold text-loss">{stats.errors}</p>
                    </Card>
                    <Card className="p-3">
                        <p className="text-[11px] font-medium text-amber-500">Warning</p>
                        <p className="mt-1 text-lg font-bold text-amber-500">{stats.warnings}</p>
                    </Card>
                    <Card className="p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Info</p>
                        <p className="mt-1 text-lg font-bold">{stats.infos}</p>
                    </Card>
                </div>

                {/* Filter Controls */}
                <Card>
                    <CardHeader title="Filter Log" description="Cari kata kunci atau saring berdasarkan tingkat keparahan" />
                    <div className="flex flex-wrap items-center gap-3 p-4">
                        <div className="w-64">
                            <TextInput
                                placeholder="Cari pesan atau stack trace..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="w-40">
                            <Select
                                value={filterLevel}
                                onChange={(e) => setFilterLevel(e.target.value as 'ALL' | 'ERROR' | 'WARN' | 'INFO')}
                            >
                                <option value="ALL">Semua Level</option>
                                <option value="ERROR">ERROR saja</option>
                                <option value="WARN">WARN saja</option>
                                <option value="INFO">INFO saja</option>
                            </Select>
                        </div>
                        {searchQuery && (
                            <Button size="sm" variant="ghost" onClick={() => setSearchQuery('')}>
                                Reset Cari
                            </Button>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                            Menampilkan {filteredLogs.length} dari {logs.length} entri
                        </span>
                    </div>
                </Card>

                {/* List Log */}
                <Card className="flex-1">
                    <CardHeader title="Daftar Entri Log" description="Diurutkan berdasarkan waktu terbaru (Terbaru di atas)" />
                    {loading && logs.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">Memuat file log lokal...</div>
                    ) : filteredLogs.length === 0 ? (
                        <EmptyState
                            title="Tidak ada log yang cocok"
                            description={
                                logs.length === 0
                                    ? 'Belum ada catatan log yang terekam atau file log masih kosong.'
                                    : 'Tidak ada baris log yang sesuai dengan kata kunci atau filter yang dipilih.'
                            }
                        />
                    ) : (
                        <div className="divide-y divide-border overflow-x-auto">
                            {filteredLogs.map((entry, index) => {
                                const isExpanded = expandedIndex === index
                                const badgeTone =
                                    entry.level === 'ERROR' ? 'loss' : entry.level === 'WARN' ? 'warning' : 'muted'

                                return (
                                    <div key={`${entry.timestamp}-${index}`} className="flex flex-col p-3 hover:bg-accent/40 transition-colors">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Badge tone={badgeTone}>{entry.level}</Badge>
                                                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                                    {entry.timestamp}
                                                </span>
                                            </div>
                                            {entry.details && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2 text-[10px]"
                                                    onClick={() => setExpandedIndex(isExpanded ? null : index)}
                                                >
                                                    {isExpanded ? 'Sembunyikan Detail' : 'Lihat Detail'}
                                                </Button>
                                            )}
                                        </div>

                                        <div className="mt-1.5 font-mono text-xs font-medium text-foreground break-all">
                                            {entry.message}
                                        </div>

                                        {entry.details && isExpanded && (
                                            <div className="mt-2 rounded bg-muted/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all overflow-x-auto">
                                                {entry.details}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    )
}
