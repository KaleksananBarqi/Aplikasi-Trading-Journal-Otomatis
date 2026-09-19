import { useState } from 'react'
import type { JournalAnalysisResult } from '@shared/ipc-contract'
import { Button, ErrorNote } from './ui'
import type { TradeDetail } from '@shared/domain'

/**
 * Panel AI Insights (fitur 6) — tombol analisa + hasil.
 *
 * Mengirim data trade ke service AI di main process, menerima kembali
 * ringkasan, kelemahan, dan saran yang terstruktur.
 */

interface AiInsightsPanelProps {
    trades: TradeDetail[]
}

export function AiInsightsPanel({ trades }: AiInsightsPanelProps): React.JSX.Element | null {
    const [analyzing, setAnalyzing] = useState(false)
    const [result, setResult] = useState<JournalAnalysisResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function handleAnalyze(): Promise<void> {
        setAnalyzing(true)
        setError(null)
        setResult(null)
        try {
            const res = await window.api.analyzeJournal({})
            if (!res.ok || !res.data) {
                setError(res.error ?? 'Gagal menganalisis journal.')
                return
            }
            setResult(res.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setAnalyzing(false)
        }
    }

    if (trades.length === 0) return null

    return (
        <section className="mt-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                    <h2 className="text-sm font-semibold">Wawasan AI</h2>
                    <p className="text-[11px] text-muted-foreground">
                        Analisa otomatis pola kelemahan dan saran perbaikan dari data journal
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void handleAnalyze()}
                    disabled={analyzing}
                >
                    {analyzing ? 'Menganalisis…' : result ? 'Analisa Ulang' : 'Analisa dengan AI'}
                </Button>
            </div>

            <div className="p-4">
                {error && <ErrorNote message={error} />}

                {result && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <h3 className="text-xs font-semibold text-muted-foreground">Ringkasan</h3>
                            <p className="mt-1 text-sm">{result.summary}</p>
                        </div>

                        {result.metrics && result.metrics.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                                {result.metrics.map((metric, i) => (
                                    <div
                                        key={i}
                                        className="rounded-md border border-border bg-background px-3 py-2"
                                    >
                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                            {metric.label}
                                        </p>
                                        <p className="tabular text-sm font-medium">{metric.value}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div>
                            <h3 className="text-xs font-semibold text-muted-foreground">Pola Kelemahan</h3>
                            <ul className="mt-1 flex flex-col gap-1">
                                {result.weaknesses.map((weakness, i) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                        <span className="text-loss">⚠</span>
                                        <span>{weakness}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-xs font-semibold text-muted-foreground">Saran Perbaikan</h3>
                            <ul className="mt-1 flex flex-col gap-1">
                                {result.suggestions.map((suggestion, i) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                        <span className="text-profit">→</span>
                                        <span>{suggestion}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {!result && !error && !analyzing && (
                    <p className="text-[11px] text-muted-foreground">
                        Klik "Analisa dengan AI" untuk mengirim data journal ke OpenAI.
                        Hasil berisi ringkasan, pola kelemahan, dan saran perbaikan.
                        Bukan nasihat keuangan.
                    </p>
                )}
            </div>
        </section>
    )
}
