import { useCallback, useEffect, useState } from 'react'
import type { CredentialStatusPayload, SyncableExchange } from '@shared/ipc-contract'
import { Badge, Button, ErrorNote, Field, TextInput } from './ui'
import { formatDateTime } from '../lib/format'

/**
 * Form kredensial exchange + wizard instruksi API key read-only.
 *
 * ===========================================================================
 * KENAPA FORM INI ADA DI SETTINGS, BUKAN DI DASHBOARD
 * ===========================================================================
 *
 * Brief §8 mewajibkan app memaksa user membuat API key dengan izin READ-ONLY,
 * dan menampilkan instruksinya di UI. Kredensial adalah konfigurasi sekali
 * pasang, bukan aksi harian — menaruhnya di Settings menjaga Dashboard tetap
 * fokus pada performa trading.
 *
 * ===========================================================================
 * ALUR KEAMANAN
 * ===========================================================================
 *
 * 1. User mengetik key + secret.
 * 2. Keduanya dikirim SEKALI ke main process lewat IPC.
 * 3. Main process mengenkripsi via safeStorage (DPAPI/Keychain/libsecret).
 * 4. Renderer TIDAK PERNAH menerima nilainya kembali. Yang dibaca hanya
 *    status + petunjuk kunci (mis. "a1b2…f9").
 *
 * Setelah disimpan, field input langsung dikosongkan dari state React —
 * supaya nilai rahasia tidak tertinggal di memori renderer lebih lama dari perlu.
 */

interface ExchangeConfig {
    id: SyncableExchange
    name: string
    /** Langkah pembuatan API key, spesifik per exchange. */
    steps: string[]
    keyUrl: string
    /** Catatan penting khusus exchange ini. */
    note?: string
}

const EXCHANGES: ExchangeConfig[] = [
    {
        id: 'mexc',
        name: 'MEXC Futures',
        keyUrl: 'https://www.mexc.com/user/openapi',
        steps: [
            'Masuk ke MEXC, buka halaman manajemen API (menu profil → API Management).',
            'Buat API key baru. Beri nama yang jelas, mis. "Trading Journal (read-only)".',
            'PENTING: aktifkan HANYA izin baca (View / Read). JANGAN aktifkan Spot Trading, Futures Trading, atau Withdraw.',
            'Jangan batasi IP bila IP Anda dinamis — pembatasan IP yang salah membuat sync gagal terus.',
            'Salin API Key dan Secret Key. Secret hanya ditampilkan sekali oleh MEXC.',
            'Tempel keduanya di form ini, lalu klik Simpan.'
        ],
        note:
            'Secret key MEXC hanya ditampilkan sekali saat dibuat. Kalau hilang, buat API key baru — tidak bisa dilihat ulang.'
    },
    {
        id: 'bitunix',
        name: 'Bitunix Futures',
        keyUrl: 'https://www.bitunix.com/account/apiManagement',
        steps: [
            'Masuk ke Bitunix, buka halaman API Management.',
            'Buat API key baru. Beri nama yang jelas, mis. "Trading Journal (read-only)".',
            'PENTING: aktifkan HANYA izin baca. JANGAN aktifkan izin trading atau withdraw.',
            'Salin API Key dan Secret Key. Bitunix hanya menampilkan Secret sekali.',
            'Tempel keduanya di form ini, lalu klik Simpan.'
        ],
        note:
            'Keterbatasan: Bitunix tidak menyediakan endpoint riwayat biaya funding per akun. ' +
            'Kolom funding fee untuk trade Bitunix akan bernilai 0 sampai Bitunix menyediakan ' +
            'endpoint tersebut. Aplikasi ini TIDAK mengira-ngira nilainya dari funding rate, ' +
            'karena itu akan menghasilkan angka karangan yang terlihat seperti data resmi.'
    }
]

interface ExchangeCredentialsProps {
    onChanged: () => Promise<void> | void
}

export function ExchangeCredentials({
    onChanged
}: ExchangeCredentialsProps): React.JSX.Element {
    const [statuses, setStatuses] = useState<CredentialStatusPayload[]>([])
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<SyncableExchange | null>(null)
    const [expandedWizard, setExpandedWizard] = useState<SyncableExchange | null>(null)

    // Input dikelola per exchange, dan dikosongkan setelah simpan berhasil.
    const [inputs, setInputs] = useState<
        Record<SyncableExchange, { apiKey: string; apiSecret: string }>
    >({
        mexc: { apiKey: '', apiSecret: '' },
        bitunix: { apiKey: '', apiSecret: '' }
    })

    const loadStatuses = useCallback(async (): Promise<void> => {
        try {
            setStatuses(await window.api.getCredentialStatuses())
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }, [])

    useEffect(() => {
        void loadStatuses()
    }, [loadStatuses])

    async function handleSave(exchange: SyncableExchange): Promise<void> {
        const input = inputs[exchange]
        if (input.apiKey.trim() === '' || input.apiSecret.trim() === '') {
            setError('API key dan secret harus diisi keduanya.')
            return
        }

        setBusy(exchange)
        setError(null)
        try {
            const result = await window.api.saveCredentials({
                exchange,
                apiKey: input.apiKey,
                apiSecret: input.apiSecret
            })
            if (!result.ok) {
                setError(result.error ?? 'Gagal menyimpan kredensial.')
                return
            }

            // Kosongkan input dari state React segera setelah tersimpan. Nilai
            // rahasia tidak perlu tinggal di memori renderer lebih lama dari perlu.
            setInputs((prev) => ({ ...prev, [exchange]: { apiKey: '', apiSecret: '' } }))
            await loadStatuses()
            await onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(null)
        }
    }

    async function handleDelete(exchange: SyncableExchange): Promise<void> {
        const confirmed = window.confirm(
            `Hapus kredensial ${exchange.toUpperCase()}?\n\n` +
            'Kredensial dihapus dari penyimpanan aman OS. Data trade yang sudah tersinkron TIDAK terhapus.'
        )
        if (!confirmed) return

        setBusy(exchange)
        try {
            const result = await window.api.deleteCredentials(exchange)
            if (!result.ok) {
                setError(result.error ?? 'Gagal menghapus kredensial.')
                return
            }
            await loadStatuses()
            await onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            {error && <ErrorNote message={error} />}

            {EXCHANGES.map((config) => {
                const status = statuses.find((s) => s.exchange === config.id)
                const input = inputs[config.id]
                const isBusy = busy === config.id
                const isExpanded = expandedWizard === config.id

                return (
                    <div key={config.id} className="rounded-md border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{config.name}</span>
                                {status?.configured ? (
                                    <Badge tone="profit">terkonfigurasi</Badge>
                                ) : (
                                    <Badge tone="muted">belum diisi</Badge>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setExpandedWizard(isExpanded ? null : config.id)}
                                className="text-[11px] text-primary hover:underline"
                            >
                                {isExpanded ? 'Sembunyikan panduan' : 'Cara membuat API key read-only'}
                            </button>
                        </div>

                        {status?.configured && (
                            <div className="mt-2 flex items-center justify-between gap-3 rounded border border-border bg-muted/30 px-2.5 py-1.5">
                                <div className="text-[11px]">
                                    <span className="text-muted-foreground">Kunci tersimpan: </span>
                                    <span className="tabular font-mono">{status.keyHint}</span>
                                    {status.updatedAt && (
                                        <span className="ml-2 text-muted-foreground">
                                            · {formatDateTime(status.updatedAt)}
                                        </span>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void handleDelete(config.id)}
                                    disabled={isBusy}
                                >
                                    Hapus
                                </Button>
                            </div>
                        )}

                        {isExpanded && (
                            <div className="mt-2 rounded border border-chart-3/40 bg-chart-3/10 p-3">
                                <p className="mb-1.5 text-[11px] font-medium">
                                    Langkah membuat API key (izin baca saja):
                                </p>
                                <ol className="ml-4 list-decimal space-y-1 text-[11px] text-muted-foreground">
                                    {config.steps.map((step) => (
                                        <li key={step}>{step}</li>
                                    ))}
                                </ol>
                                {config.note && (
                                    <p className="mt-2 border-t border-chart-3/30 pt-2 text-[11px]">
                                        {config.note}
                                    </p>
                                )}
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                    Halaman API:{' '}
                                    <span className="font-mono text-foreground">{config.keyUrl}</span>
                                </p>
                            </div>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <Field label="API Key">
                                <TextInput
                                    type="password"
                                    value={input.apiKey}
                                    onChange={(e) =>
                                        setInputs((prev) => ({
                                            ...prev,
                                            [config.id]: { ...prev[config.id], apiKey: e.target.value }
                                        }))
                                    }
                                    placeholder="tempel API key"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </Field>
                            <Field label="API Secret">
                                <TextInput
                                    type="password"
                                    value={input.apiSecret}
                                    onChange={(e) =>
                                        setInputs((prev) => ({
                                            ...prev,
                                            [config.id]: { ...prev[config.id], apiSecret: e.target.value }
                                        }))
                                    }
                                    placeholder="tempel secret key"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </Field>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-[10px] text-muted-foreground">
                                Disimpan terenkripsi lewat penyimpanan aman OS. Tidak pernah ditulis
                                ke file biasa atau database.
                            </p>
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void handleSave(config.id)}
                                disabled={isBusy}
                            >
                                {isBusy ? 'Menyimpan…' : 'Simpan'}
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
