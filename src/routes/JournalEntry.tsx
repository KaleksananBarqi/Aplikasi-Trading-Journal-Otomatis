import { useMemo, useState } from 'react'
import type { ExecutionGrade, TradeDetail } from '@shared/domain'
import { PageHeader } from '../components/AppShell'
import { Badge, Button, EmptyState } from '../components/ui'
import { SharePnlModal } from '../components/SharePnlModal'
import { formatDateTime, formatPnl, formatR, pnlColorClass, rColorClass } from '../lib/format'
import { cn } from '../lib/utils'

/**
 * Journal Entry — daftar trade untuk diisi/ditinjau catatannya.
 *
 * Halaman ini fokus pada SISI SUBJEKTIF trade, bukan angka. Tujuannya supaya
 * review bisa dilakukan sebagai satu sesi terpisah tanpa terganggu angka P&L
 * (brief §5.3).
 *
 * Prinsip yang ditampilkan eksplisit di UI (brief §5.3 & §12):
 * grade eksekusi menilai PROSES, dan sengaja ditampilkan berdampingan dengan
 * hasil supaya user bisa melihat sendiri kapan keduanya tidak sejalan.
 */

type Filter = 'all' | 'needs-review' | 'graded'

interface JournalEntryProps {
    trades: TradeDetail[]
    onOpen: (detail: TradeDetail) => void
}

export function JournalEntry({ trades, onOpen }: JournalEntryProps): React.JSX.Element {
    const [filter, setFilter] = useState<Filter>('all')
    const [sharePnlDetail, setSharePnlDetail] = useState<TradeDetail | null>(null)

    const filtered = useMemo(() => {
        const sorted = [...trades].sort((a, b) => b.trade.exitTime - a.trade.exitTime)
        if (filter === 'needs-review') {
            // "Perlu review" = belum ada review post-trade.
            return sorted.filter((d) => !d.journal?.postTradeReview)
        }
        if (filter === 'graded') {
            return sorted.filter((d) => d.journal?.executionGrade)
        }
        return sorted
    }, [trades, filter])

    const needsReviewCount = trades.filter((d) => !d.journal?.postTradeReview).length

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title="Journal Entry"
                description="Tesis, review, dan grading eksekusi per trade"
                actions={
                    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                        {(
                            [
                                { id: 'all', label: 'Semua' },
                                { id: 'needs-review', label: `Perlu Review (${needsReviewCount})` },
                                { id: 'graded', label: 'Sudah Digrade' }
                            ] as { id: Filter; label: string }[]
                        ).map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setFilter(option.id)}
                                className={cn(
                                    'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                                    filter === option.id
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {filtered.length === 0 ? (
                    <EmptyState
                        title={filter === 'needs-review' ? 'Semua trade sudah direview' : 'Tidak ada trade'}
                        description={
                            filter === 'needs-review'
                                ? 'Semua trade sudah punya review post-trade. Kerja bagus.'
                                : 'Tambahkan trade di Trade Log untuk mulai mengisi jurnal.'
                        }
                    />
                ) : (
                    <div className="flex flex-col gap-2">
                        {filtered.map((detail) => {
                            const hasThesis = Boolean(detail.journal?.preTradeThesis)
                            const hasReview = Boolean(detail.journal?.postTradeReview)
                            return (
                                <article
                                    key={detail.trade.id}
                                    className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge tone={detail.trade.direction === 'long' ? 'profit' : 'loss'}>
                                                    {detail.trade.direction === 'long' ? 'Long' : 'Short'}
                                                </Badge>
                                                <span className="text-sm font-medium">{detail.trade.symbol}</span>
                                                {detail.journal?.setupTag && (
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                        {detail.journal.setupTag}
                                                    </span>
                                                )}
                                                {detail.journal?.emotionTag && (
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                        {detail.journal.emotionTag}
                                                    </span>
                                                )}
                                                {detail.tags.length > 0 && detail.tags.map((tag) => (
                                                    <span
                                                        key={tag.id}
                                                        className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                                    >
                                                        #{tag.name}
                                                    </span>
                                                ))}
                                                {detail.journal?.screenshotPath && (
                                                    <span className="text-[10px] text-muted-foreground" title="Punya lampiran screenshot">
                                                        gambar
                                                    </span>
                                                )}
                                                {!hasThesis && <Badge tone="warning">tanpa tesis</Badge>}
                                                {!hasReview && <Badge tone="warning">tanpa review</Badge>}
                                            </div>

                                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                                                Exit {formatDateTime(detail.trade.exitTime)}
                                            </p>

                                            {detail.journal?.preTradeThesis && (
                                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                                    <span className="font-medium text-foreground">Tesis: </span>
                                                    {detail.journal.preTradeThesis}
                                                </p>
                                            )}
                                            {detail.journal?.postTradeReview && (
                                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                    <span className="font-medium text-foreground">Review: </span>
                                                    {detail.journal.postTradeReview}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                                            <span
                                                className={cn(
                                                    'tabular text-sm font-medium',
                                                    pnlColorClass(detail.trade.realizedPnl)
                                                )}
                                            >
                                                {formatPnl(detail.trade.realizedPnl)}
                                            </span>
                                            <span className={cn('tabular text-[11px]', rColorClass(detail.rMultiple))}>
                                                {formatR(detail.rMultiple)}
                                            </span>
                                            <GradeDisplay grade={detail.journal?.executionGrade ?? null} />
                                            <div className="flex items-center gap-1 mt-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 px-2 text-[11px] text-primary hover:bg-primary/10"
                                                    onClick={() => setSharePnlDetail(detail)}
                                                >
                                                    ✨ Pamer
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => onOpen(detail)}>
                                                    Buka Jurnal
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Modal Pamer PnL Per Trade */}
            {sharePnlDetail && (
                <SharePnlModal
                    isOpen={Boolean(sharePnlDetail)}
                    onClose={() => setSharePnlDetail(null)}
                    detail={sharePnlDetail}
                />
            )}
        </div>
    )
}

/**
 * Tampilan grade eksekusi.
 *
 * Sengaja BUKAN skor gabungan dengan P&L. Grade tinggi tidak berarti profit,
 * dan sebaliknya. Menggabungkan keduanya akan membuat user salah belajar dari
 * datanya sendiri (brief §5.3, §12).
 */
function GradeDisplay({ grade }: { grade: ExecutionGrade | null }): React.JSX.Element {
    if (!grade) {
        return <span className="text-[10px] text-muted-foreground">belum digrade</span>
    }

    const description: Record<ExecutionGrade, string> = {
        A: 'sesuai rencana',
        B: 'deviasi minor',
        C: 'banyak deviasi',
        D: 'melanggar aturan'
    }

    const tone = grade === 'A' ? 'profit' : grade === 'D' ? 'loss' : 'muted'

    return (
        <div className="flex items-center gap-1.5" title={`Eksekusi: ${description[grade]}`}>
            <Badge tone={tone}>Grade {grade}</Badge>
            <span className="text-[10px] text-muted-foreground">{description[grade]}</span>
        </div>
    )
}
