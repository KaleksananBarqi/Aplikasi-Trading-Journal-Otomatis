import { useEffect, useState } from 'react'
import type { AiConfigStatus } from '@shared/ipc-contract'
import { Badge, Button, Card, CardHeader, ErrorNote, Field, TextInput } from './ui'

/**
 * Panel konfigurasi AI Insights (fitur 6).
 *
 * API key disimpan via safeStorage di main process — renderer hanya mengirim
 * SEKALI saat user mengetiknya, dan hanya menerima status boolean + key hint.
 * Tidak ada jalur untuk membaca API key kembali ke renderer.
 */

interface AiConfigPanelProps {
    onSaved: () => void
}

export function AiConfigPanel({ onSaved }: AiConfigPanelProps): React.JSX.Element {
    const [status, setStatus] = useState<AiConfigStatus | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [model, setModel] = useState('')
    const [baseUrl, setBaseUrl] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        void loadStatus()
    }, [])

    async function loadStatus(): Promise<void> {
        try {
            const s = await window.api.getAiConfig()
            setStatus(s)
            setModel(s.model ?? '')
            setBaseUrl(s.baseUrl ?? '')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    async function handleSave(): Promise<void> {
        setSaving(true)
        setError(null)
        try {
            const result = await window.api.saveAiConfig({
                apiKey,
                model: model.trim() || 'gpt-4o',
                baseUrl: baseUrl.trim() || undefined
            })
            if (!result.ok) {
                setError(result.error ?? 'Gagal menyimpan konfigurasi AI.')
                return
            }
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
            setApiKey('')
            await loadStatus()
            onSaved()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(): Promise<void> {
        setSaving(true)
        setError(null)
        try {
            const result = await window.api.deleteAiConfig()
            if (!result.ok) {
                setError(result.error ?? 'Gagal menghapus konfigurasi AI.')
                return
            }
            await loadStatus()
            onSaved()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }

    const isConfigured = status?.configured ?? false

    return (
        <Card>
            <CardHeader
                title="Wawasan AI"
                description="Analisa journal dengan OpenAI. API key disimpan terenkripsi di OS."
            />
            <div className="flex flex-col gap-3 p-4">
                {error && <ErrorNote message={error} />}

                {isConfigured && (
                    <div className="flex items-center gap-2 text-xs">
                        <Badge tone="profit">Terhubung</Badge>
                        <span className="text-muted-foreground">
                            Key: {status?.keyHint} · Model: {status?.model}
                        </span>
                    </div>
                )}

                <Field
                    label="API Key"
                    hint={
                        isConfigured
                            ? `Sudah disimpan (${status?.keyHint}). Isi ulang untuk mengganti.`
                            : 'Dapatkan di platform.openai.com/api-keys'
                    }
                >
                    <TextInput
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={isConfigured ? '••••••••••••' : 'sk-...'}
                    />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Model" hint="mis. gpt-4o, gpt-4o-mini">
                        <TextInput
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="gpt-4o"
                        />
                    </Field>
                    <Field label="Base URL (opsional)" hint="Provider OpenAI-compatible">
                        <TextInput
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                        />
                    </Field>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="primary" onClick={() => void handleSave()} disabled={saving || apiKey.trim() === ''}>
                        {saving ? 'Menyimpan…' : 'Simpan'}
                    </Button>
                    {isConfigured && (
                        <Button variant="ghost" onClick={() => void handleDelete()} disabled={saving}>
                            Hapus
                        </Button>
                    )}
                    {saved && <Badge tone="profit">Tersimpan</Badge>}
                </div>

                <p className="text-[11px] text-muted-foreground">
                    AI menerima data trade (symbol, P&L, tag, review) untuk dianalisis.
                    Tidak ada data PII yang dikirim. Hasil analisa bukan nasihat keuangan.
                </p>
            </div>
        </Card>
    )
}
