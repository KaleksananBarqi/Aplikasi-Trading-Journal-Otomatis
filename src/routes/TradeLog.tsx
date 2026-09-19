import { useMemo, useState } from 'react'
import type { TradeDetail } from '@shared/domain'
import { Badge, Button, EmptyState, ErrorNote } from '../components/ui'
import { PageHeader } from '../components/AppShell'
import { PnlValue } from '../components/PnlValue'
import {
    formatDateTime,
    formatDuration,
    formatNumber,
    formatPnl,
    formatPrice,
    formatR,
    pnlColorClass,
    rColorClass
} from '../lib/format'
import { tableCellClass, tableClass, tableHeadCellClass, tableHeadClass, tableRowClass } from '../lib/ui'
import { cn } from '../lib/utils'
import { SharePnlModal } from '../components/SharePnlModal'

/**
 * Trade Log — tabel data-dense.
 *
 * Brief §7: angka & tabel memakai font monospace agar digit sejajar dan mudah
 * di-scan. Semua kolom angka memakai kelas `tabular`.
 */

type SortKey =
    | 'exitTime'
    | 'symbol'
    | 'direction'
    | 'realizedPnl'
    | 'rMultiple'
    | 'duration'
    | 'executionGrade'
type SortDirection = 'asc' | 'desc'

interface Column {
    key: SortKey | 'setup' | 'tags' | 'actions'
    label: string
    sortable: boolean
    align?: 'left' | 'right'
    /** Lebar minimum dalam px supaya tabel tidak "melompat" saat data berubah. */
    width?: number
}

const COLUMNS: Column[] = [
    { key: 'exitTime', label: 'Exit', sortable: true, width: 150 },
    { key: 'symbol', label: 'Symbol', sortable: true, width: 110 },
    { key: 'direction', label: 'Arah', sortable: true, width: 70 },
    { key: 'duration', label: 'Durasi', sortable: true, align: 'right', width: 80 },
    { key: 'setup', label: 'Setup', sortable: false, width: 120 },
    { key: 'tags', label: 'Tag', sortable: false, width: 140 },
    { key: 'executionGrade', label: 'Grade', sortable: true, width: 70 },
    { key: 'rMultiple', label: 'R', sortable: true, align: 'right', width: 80 },
    { key: 'realizedPnl', label: 'P&L', sortable: true, align: 'right', width: 120 },
    { key: 'actions', label: '', sortable: false, width: 160 }
]

function getSortValue(detail: TradeDetail, key: SortKey): number | string {
    switch (key) {
        case 'exitTime':
            return detail.trade.exitTime
        case 'symbol':
            return detail.trade.symbol
        case 'direction':
            return detail.trade.direction
        case 'realizedPnl':
            return detail.trade.realizedPnl
        case 'rMultiple':
            // Trade tanpa stop loss punya R = null. Diurutkan paling akhir, bukan
            // diperlakukan sebagai 0 — nilai itu memang tidak diketahui.
            return detail.rMultiple ?? Number.NEGATIVE_INFINITY
        case 'duration':
            return detail.trade.exitTime - detail.trade.entryTime
        case 'executionGrade':
            return detail.journal?.executionGrade ?? ''
    }
}

/** Grade A dipetakan jadi 1 agar urutan A→D masuk akal secara numerik. */
function gradeRank(grade: string | null | undefined): number {
    if (!grade) return Number.POSITIVE_INFINITY
    return { A: 1, B: 2, C: 3, D: 4 }[grade] ?? Number.POSITIVE_INFINITY
}

interface TradeLogProps {
    trades: TradeDetail[]
    loading: boolean
    error: string | null
    onEdit: (detail: TradeDetail) => void
    onDelete: (detail: TradeDetail) => void
    onCreate: () => void
    hidePnl: boolean
    onExport: (format: 'csv' | 'json' | 'pdf') => void
}

export function TradeLog({
    trades,
    loading,
    error,
    onEdit,
    onDelete,
    onCreate,
    hidePnl,
    onExport
}: TradeLogProps): React.JSX.Element {
    const [sortKey, setSortKey] = useState<SortKey>('exitTime')
    const [sortDir, setSortDir] = useState<SortDirection>('desc')
    const [sharePnlDetail, setSharePnlDetail] = useState<TradeDetail | null>(null)

    const sorted = useMemo(() => {
        const copy = [...trades]
        copy.sort((a, b) => {
            let left: number | string
            let right: number | string

            if (sortKey === 'executionGrade') {
                left = gradeRank(a.journal?.executionGrade)
                right = gradeRank(b.journal?.executionGrade)
            } else {
                left = getSortValue(a, sortKey)
                right = getSortValue(b, sortKey)
            }

            let comparison: number
            if (typeof left === 'number' && typeof right === 'number') {
                comparison = left - right
            } else {
                comparison = String(left).localeCompare(String(right))
            }

            // Tie-breaker id: menjaga urutan tetap stabil saat nilai sama.
            if (comparison === 0) comparison = a.trade.id - b.trade.id
            return sortDir === 'asc' ? comparison : -comparison
        })
        return copy
    }, [trades, sortKey, sortDir])

    function toggleSort(key: SortKey): void {
        if (key === sortKey) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
                title="Trade Log"
                description={`${trades.length} trade tercatat`}
                actions={
                    <div className="flex items-center gap-2">
                        {trades.length > 0 && (
                            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onExport('csv')}>
                                    CSV
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onExport('json')}>
                                    JSON
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onExport('pdf')}>
                                    PDF
                                </Button>
                            </div>
                        )}
                        <Button variant="primary" onClick={onCreate}>
                            + Trade Baru
                        </Button>
                    </div>
                }
            />

            {error && (
                <div className="px-6 py-3">
                    <ErrorNote message={error} />
                </div>
            )}

            <div className="flex-1 overflow-auto px-6 py-4">
                {loading ? (
                    <p className="text-sm text-muted-foreground">Memuat…</p>
                ) : sorted.length === 0 ? (
                    <EmptyState
                        title="Belum ada trade"
                        description="Tambahkan trade manual untuk mulai membangun jurnal. Trade dari MEXC dan Bitunix akan otomatis masuk setelah integrasi sync aktif."
                        action={
                            <Button variant="primary" onClick={onCreate}>
                                + Trade Baru
                            </Button>
                        }
                    />
                ) : (
                    <table className={tableClass}>
                        <thead className={tableHeadClass()}>
                            <tr>
                                {COLUMNS.map((column) => (
                                    <th
                                        key={column.key}
                                        className={tableHeadCellClass(
                                            cn(column.align === 'right' && 'text-right', column.sortable && 'cursor-pointer select-none')
                                        )}
                                        style={column.width ? { minWidth: column.width } : undefined}
                                        onClick={column.sortable ? () => toggleSort(column.key as SortKey) : undefined}
                                    >
                                        {column.label}
                                        {column.sortable && sortKey === column.key && (
                                            <span className="ml-1 text-primary">{sortDir === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((detail) => {
                                const { trade, journal, rMultiple } = detail
                                return (
                                    <tr key={trade.id} className={tableRowClass()}>
                                        <td className={tableCellClass('tabular text-xs text-muted-foreground')}>
                                            {formatDateTime(trade.exitTime)}
                                        </td>
                                        <td className={tableCellClass('font-medium')}>{trade.symbol}</td>
                                        <td className={tableCellClass()}>
                                            <Badge tone={trade.direction === 'long' ? 'profit' : 'loss'}>
                                                {trade.direction === 'long' ? 'Long' : 'Short'}
                                            </Badge>
                                        </td>
                                        <td className={tableCellClass('tabular text-right text-xs')}>
                                            {formatDuration(trade.entryTime, trade.exitTime)}
                                        </td>
                                        <td className={tableCellClass('text-xs')}>
                                            {journal?.setupTag ? (
                                                <span className="text-muted-foreground">{journal.setupTag}</span>
                                            ) : (
                                                <span className="text-muted-foreground/50">—</span>
                                            )}
                                        </td>
                                        <td className={tableCellClass('text-xs')}>
                                            {detail.tags.length > 0 ? (
                                                <div className="flex flex-wrap gap-0.5">
                                                    {detail.tags.slice(0, 3).map((tag) => (
                                                        <span
                                                            key={tag.id}
                                                            className="rounded border border-primary/30 bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary"
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                    {detail.tags.length > 3 && (
                                                        <span className="text-[9px] text-muted-foreground">
                                                            +{detail.tags.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/50">—</span>
                                            )}
                                        </td>
                                        <td className={tableCellClass('text-center')}>
                                            {journal?.executionGrade ? (
                                                <Badge
                                                    tone={
                                                        journal.executionGrade === 'A'
                                                            ? 'profit'
                                                            : journal.executionGrade === 'D'
                                                                ? 'loss'
                                                                : 'muted'
                                                    }
                                                >
                                                    {journal.executionGrade}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground/50">—</span>
                                            )}
                                        </td>
                                        <td
                                            className={tableCellClass(
                                                cn('tabular text-right text-xs', rColorClass(rMultiple))
                                            )}
                                            title={
                                                rMultiple === null
                                                    ? 'Stop loss tidak diisi, R tidak dapat dihitung'
                                                    : undefined
                                            }
                                        >
                                            <PnlValue
                                                value={formatR(rMultiple)}
                                                hide={hidePnl}
                                                className={rColorClass(rMultiple)}
                                            />
                                        </td>
                                        <td
                                            className={tableCellClass(
                                                cn('tabular text-right font-medium', pnlColorClass(trade.realizedPnl))
                                            )}
                                        >
                                            <PnlValue
                                                value={formatPnl(trade.realizedPnl)}
                                                hide={hidePnl}
                                                className={pnlColorClass(trade.realizedPnl)}
                                            />
                                        </td>
                                        <td className={tableCellClass('text-right')}>
                                            <div className="flex justify-end items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10"
                                                    onClick={() => setSharePnlDetail(detail)}
                                                >
                                                    ✨ Pamer
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => onEdit(detail)}>
                                                    Edit
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => onDelete(detail)}>
                                                    Hapus
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Ringkasan bawah: memberi konteks cepat tanpa harus membuka Analytics. */}
            {sorted.length > 0 && (
                <footer className="shrink-0 border-t border-border bg-card px-6 py-2">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                            Total P&L:{' '}
                            <span
                                className={cn(
                                    'tabular font-medium',
                                    pnlColorClass(sorted.reduce((sum, d) => sum + d.trade.realizedPnl, 0))
                                )}
                            >
                                <PnlValue value={formatPnl(sorted.reduce((sum, d) => sum + d.trade.realizedPnl, 0))} hide={hidePnl} className={pnlColorClass(sorted.reduce((sum, d) => sum + d.trade.realizedPnl, 0))} />
                            </span>
                        </span>
                        <span>
                            Funding fee:{' '}
                            <span className="tabular text-loss">
                                {formatNumber(
                                    sorted.reduce((sum, d) => sum + d.trade.fundingFee, 0),
                                    2
                                )}
                            </span>
                        </span>
                        <span>
                            Trade dengan R valid:{' '}
                            <span className="tabular">
                                {sorted.filter((d) => d.rMultiple !== null).length} / {sorted.length}
                            </span>
                        </span>
                        <span className="text-muted-foreground/70">
                            Harga entry terakhir: {sorted[0] ? formatPrice(sorted[0].trade.entryPrice) : '—'}
                        </span>
                    </div>
                </footer>
            )}

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
