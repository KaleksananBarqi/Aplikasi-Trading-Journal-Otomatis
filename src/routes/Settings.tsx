import { useEffect, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { AiConfigPanel } from '../components/AiConfigPanel'
import { BackupPanel } from '../components/BackupPanel'
import { ExchangeCredentials } from '../components/ExchangeCredentials'
import { SyncPanel } from '../components/SyncPanel'
import { ShareBrandingSettings } from '../components/ShareBrandingSettings'
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Select, TextArea } from '../components/ui'
import type { Theme } from '../hooks/useTheme'
import { cn } from '../lib/utils'

/**
 * Settings — preferensi tampilan, template checklist, dan (nanti) koneksi exchange.
 *
 * Fase 1: tema, mode colorblind-safe, template checklist, dan status sistem.
 * Fase 2+: input API key read-only untuk MEXC & Bitunix lewat safeStorage.
 *
 * CATATAN KEAMANAN: form API key SENGAJA belum ada di sini. Menampilkan field
 * kredensial sebelum penyimpanan aman (safeStorage) terpasang akan mendorong
 * user menaruh kredensial di jalur yang belum terbukti aman.
 */

interface SettingsProps {
    theme: Theme
    colorblindSafe: boolean
    isDark: boolean
    onThemeChange: (theme: Theme) => void
    onColorblindChange: (value: boolean) => void
    dbPath: string
    onChecklistTemplateSaved: () => Promise<void> | void
    /** Dipanggil setelah sync/kredensial berubah supaya daftar trade dimuat ulang. */
    onDataChanged: () => Promise<void> | void
}

export function Settings({
    theme,
    colorblindSafe,
    isDark,
    onThemeChange,
    onColorblindChange,
    dbPath,
    onChecklistTemplateSaved,
    onDataChanged
}: SettingsProps): React.JSX.Element {
    const [template, setTemplate] = useState('')
    const [savingTemplate, setSavingTemplate] = useState(false)
    const [templateSaved, setTemplateSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        window.api
            .getSettings()
            .then((settings) => {
                const stored = settings['checklist_template']
                if (Array.isArray(stored)) {
                    setTemplate((stored as string[]).join('\n'))
                }
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }, [])

    async function saveTemplate(): Promise<void> {
        setSavingTemplate(true)
        setError(null)
        try {
            const lines = template
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line !== '')

            const result = await window.api.setSettings({ checklistTemplate: lines })
            if (!result.ok) {
                setError(result.error ?? 'Gagal menyimpan template.')
                return
            }
            setTemplateSaved(true)
            setTimeout(() => setTemplateSaved(false), 2500)
            await onChecklistTemplateSaved()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSavingTemplate(false)
        }
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader title="Settings" description="Preferensi tampilan dan konfigurasi aplikasi" />

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {error && (
                    <div className="mb-4">
                        <ErrorNote message={error} />
                    </div>
                )}

                <div className="flex max-w-3xl flex-col gap-4">
                    <Card>
                        <CardHeader title="Tampilan" description="Brief §7 — dark mode default, ada opsi colorblind-safe" />
                        <div className="grid grid-cols-2 gap-4 p-4">
                            <Field label="Tema" hint="System mengikuti pengaturan OS">
                                <Select value={theme} onChange={(e) => onThemeChange(e.target.value as Theme)}>
                                    <option value="dark">Gelap (default)</option>
                                    <option value="light">Terang</option>
                                    <option value="system">Ikuti sistem</option>
                                </Select>
                            </Field>

                            <Field
                                label="Mode Colorblind-Safe"
                                hint="Menukar hijau/merah menjadi biru/oranye"
                            >
                                <label className="flex h-9 items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={colorblindSafe}
                                        onChange={(e) => onColorblindChange(e.target.checked)}
                                        className="h-4 w-4 accent-[var(--primary)]"
                                    />
                                    <span className="text-sm">
                                        {colorblindSafe ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                </label>
                            </Field>

                            {/* Pratinjau: memperlihatkan hasil perubahan tanpa harus pindah halaman. */}
                            <div className="col-span-2 rounded-md border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                                    Pratinjau warna profit/loss
                                    {colorblindSafe && ' (biru/oranye)'}
                                    {isDark ? ' — tema gelap' : ' — tema terang'}
                                </p>
                                <div className="flex items-center gap-6">
                                    <div>
                                        <p className="text-[10px] uppercase text-muted-foreground">Profit</p>
                                        <p className="tabular text-lg font-semibold text-profit">+1,240.50</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-muted-foreground">Loss</p>
                                        <p className="tabular text-lg font-semibold text-loss">-842.00</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-muted-foreground">Netral</p>
                                        <p className="tabular text-lg font-semibold text-flat">0.00</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                    <ShareBrandingSettings />
                    <Card>
                        <CardHeader
                            title="Template Checklist"
                            description="Satu aturan per baris. Di-copy ke trade baru — mengubah template tidak mengubah trade lama."
                        />
                        <div className="flex flex-col gap-3 p-4">
                            <TextArea
                                value={template}
                                onChange={(e) => setTemplate(e.target.value)}
                                placeholder={'Sesuai rencana risk %\nTidak entry saat news besar'}
                                className="min-h-[120px] font-mono text-xs"
                            />
                            <div className="flex items-center gap-3">
                                <Button variant="primary" onClick={() => void saveTemplate()} disabled={savingTemplate}>
                                    {savingTemplate ? 'Menyimpan…' : 'Simpan Template'}
                                </Button>
                                {templateSaved && <Badge tone="profit">Tersimpan</Badge>}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Template di-copy ke setiap trade baru, bukan direferensikan. Ini
                                supaya mengubah template di masa depan tidak mengubah riwayat
                                checklist trade yang sudah tercatat.
                            </p>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            title="Koneksi Exchange"
                            description="API key read-only saja — tersimpan terenkripsi di penyimpanan aman OS"
                        />
                        <div className="p-4">
                            <div className="mb-3 rounded-md border border-chart-3/40 bg-chart-3/10 px-3 py-2 text-[11px]">
                                <p className="font-medium">Aplikasi ini read-only.</p>
                                <p className="mt-0.5 text-muted-foreground">
                                    Jangan aktifkan izin trading atau withdraw pada API key yang Anda
                                    masukkan. Aplikasi tidak pernah memanggil endpoint yang bisa
                                    membuat, mengubah, atau membatalkan order — sekalipun Anda
                                    memberinya izin tersebut.
                                </p>
                            </div>
                            <ExchangeCredentials onChanged={onDataChanged} />
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            title="Sinkronisasi"
                            description="Tarik histori dari exchange secara manual"
                        />
                        <div className="p-4">
                            <SyncPanel onSyncComplete={onDataChanged} variant="full" />
                        </div>
                    </Card>

                    <BackupPanel onSyncComplete={onDataChanged} />

                    <AiConfigPanel onSaved={() => onDataChanged} />

                    <Card>
                        <CardHeader title="Status Sistem" description="Diagnostik koneksi database" />
                        <div className="flex flex-col gap-2 p-4 text-xs">
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Lokasi database</span>
                                <span className="tabular truncate font-mono text-[11px]" title={dbPath}>
                                    {dbPath}
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Mode colorblind-safe</span>
                                <span className={cn(colorblindSafe ? 'text-profit' : 'text-muted-foreground')}>
                                    {colorblindSafe ? 'aktif' : 'nonaktif'}
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Auto-sync</span>
                                {/* Brief §4.3: default OFF supaya tidak spam API tanpa sepengetahuan user. */}
                                <span className="text-muted-foreground">nonaktif (default)</span>
                            </div>
                        </div>
                    </Card>

                    <p className="text-[11px] text-muted-foreground">
                        Pengaturan auto-sync interval akan ditambahkan bersama integrasi
                        exchange. Tombol Sync Now juga muncul di halaman Dashboard setelah
                        Fase 2 selesai.
                    </p>
                </div>
            </div>
        </div>
    )
}
