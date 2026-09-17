import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { AppShell, type RouteId } from './components/AppShell'
import { SyncPanel } from './components/SyncPanel'
import { Button } from './components/ui'
import { useTheme } from './hooks/useTheme'
import { useTrades } from './hooks/useTrades'
import { Analytics } from './routes/Analytics'
import { Dashboard } from './routes/Dashboard'
import { JournalEntry } from './routes/JournalEntry'
import { Settings } from './routes/Settings'
import { TradeEditor } from './routes/TradeEditor'
import { TradeLog } from './routes/TradeLog'

/**
 * Orkestrator aplikasi.
 *
 * Navigasi memakai state sederhana, bukan router. Aplikasi desktop dengan lima
 * halaman tidak butuh URL routing, dan menambahkannya berarti menambah
 * dependency serta kompleksitas yang tidak memberi manfaat.
 *
 * Editor trade ditampilkan sebagai overlay penuh, bukan halaman terpisah —
 * supaya konteks daftar trade tetap terasa dekat saat mengedit.
 */

export default function App(): React.JSX.Element {
    const [route, setRoute] = useState<RouteId>('dashboard')
    const [editing, setEditing] = useState<TradeDetail | null>(null)
    const [creating, setCreating] = useState(false)
    const [dbPath, setDbPath] = useState('')

    const { theme, colorblindSafe, isDark, setTheme, setColorblindSafe } = useTheme()
    const { trades, meta, loading, error, reload } = useTrades()

    // Ambil path DB untuk ditampilkan di Settings.
    useEffect(() => {
        window.api
            .getAppHealth()
            .then((health) => setDbPath(health.dbPath))
            .catch(() => setDbPath('tidak diketahui'))
    }, [])

    const isEditing = creating || editing !== null

    const closeEditor = useCallback(() => {
        setCreating(false)
        setEditing(null)
    }, [])

    const handleSaved = useCallback(async (): Promise<void> => {
        await reload()
        closeEditor()
    }, [reload, closeEditor])

    const handleDelete = useCallback(
        async (detail: TradeDetail): Promise<void> => {
            const confirmed = window.confirm(
                `Hapus trade ${detail.trade.symbol} #${detail.trade.id}?\n\n` +
                'Catatan jurnal dan checklist untuk trade ini ikut terhapus. ' +
                'Tindakan ini tidak bisa dibatalkan.'
            )
            if (!confirmed) return

            const result = await window.api.deleteTrade(detail.trade.id)
            if (!result.ok) {
                window.alert(result.error ?? 'Gagal menghapus trade.')
                return
            }
            await reload()
            if (editing?.trade.id === detail.trade.id) closeEditor()
        },
        [reload, editing, closeEditor]
    )

    const handleNavigate = useCallback((next: RouteId) => {
        setRoute(next)
        closeEditor()
    }, [closeEditor])

    /** Status ringkas + sync di kaki sidebar. */
    const statusSlot = useMemo(
        () => (
            <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                <div className="flex items-center justify-between">
                    <span>Total trade</span>
                    <span className="tabular font-medium text-foreground">{trades.length}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span>Database</span>
                    <span className={error ? 'text-loss' : 'text-profit'}>
                        {error ? 'error' : loading ? 'memuat' : 'siap'}
                    </span>
                </div>
                {/* Tombol sync tersedia dari mana saja, bukan hanya di Settings —
              supaya user tidak perlu berpindah halaman untuk menarik data baru. */}
                <div className="my-1">
                    <SyncPanel variant="compact" onSyncComplete={reload} />
                </div>
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 flex-1 px-1 text-[10px]"
                        onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    >
                        {isDark ? 'Terang' : 'Gelap'}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 flex-1 px-1 text-[10px]"
                        onClick={() => setColorblindSafe(!colorblindSafe)}
                        title="Mode colorblind-safe: tukar hijau/merah jadi biru/oranye"
                    >
                        {colorblindSafe ? 'Warna: CB' : 'Warna: Std'}
                    </Button>
                </div>
            </div>
        ),
        [trades.length, error, loading, isDark, colorblindSafe, setTheme, setColorblindSafe]
    )

    return (
        <AppShell active={route} onNavigate={handleNavigate} statusSlot={statusSlot}>
            {isEditing ? (
                <TradeEditor
                    detail={editing}
                    meta={meta}
                    onSaved={handleSaved}
                    onCancel={closeEditor}
                />
            ) : route === 'dashboard' ? (
                <Dashboard trades={trades} />
            ) : route === 'trades' ? (
                <TradeLog
                    trades={trades}
                    loading={loading}
                    error={error}
                    onEdit={setEditing}
                    onDelete={(detail) => void handleDelete(detail)}
                    onCreate={() => setCreating(true)}
                />
            ) : route === 'journal' ? (
                <JournalEntry trades={trades} onOpen={setEditing} />
            ) : route === 'analytics' ? (
                <Analytics trades={trades} />
            ) : (
                <Settings
                    theme={theme}
                    colorblindSafe={colorblindSafe}
                    isDark={isDark}
                    onThemeChange={setTheme}
                    onColorblindChange={setColorblindSafe}
                    dbPath={dbPath}
                    onChecklistTemplateSaved={reload}
                    onDataChanged={reload}
                />
            )}
        </AppShell>
    )
}
