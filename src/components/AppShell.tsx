import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Kerangka aplikasi: sidebar navigasi + area konten.
 *
 * Struktur navigasi mengikuti brief §7:
 * Dashboard / Trade Log / Journal Entry / Analytics / Settings
 *
 * Gaya sengaja ditulis sendiri (bukan komponen library default) supaya tidak
 * terlihat seperti template admin-dashboard generik (brief §7).
 */

export type RouteId = 'dashboard' | 'trades' | 'journal' | 'analytics' | 'settings'

export interface NavItem {
    id: RouteId
    label: string
    hint: string
}

const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', hint: 'Ringkasan performa' },
    { id: 'trades', label: 'Trade Log', hint: 'Daftar transaksi' },
    { id: 'journal', label: 'Journal Entry', hint: 'Catatan & grading' },
    { id: 'analytics', label: 'Analytics', hint: 'Breakdown mendalam' },
    { id: 'settings', label: 'Settings', hint: 'Preferensi & koneksi' }
]

interface AppShellProps {
    active: RouteId
    onNavigate: (route: RouteId) => void
    /** Info status di bagian bawah sidebar. */
    statusSlot?: ReactNode
    children: ReactNode
}

export function AppShell({
    active,
    onNavigate,
    statusSlot,
    children
}: AppShellProps): React.JSX.Element {
    return (
        <div className="flex h-full w-full overflow-hidden bg-background">
            <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
                <div className="border-b border-border px-4 py-4">
                    <h1 className="text-sm font-semibold leading-tight">Trading Journal</h1>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">MEXC & Bitunix · read-only</p>
                </div>

                <nav className="flex-1 overflow-y-auto p-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = item.id === active
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onNavigate(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    'group relative mb-0.5 flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors',
                                    isActive
                                        ? 'bg-primary/15 text-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                )}
                            >
                                {/* Penanda aktif: garis vertikal, bukan sekadar warna latar —
                    supaya tetap terlihat jelas di mode colorblind-safe. */}
                                {isActive && (
                                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
                                )}
                                <span className="text-[13px] font-medium">{item.label}</span>
                                <span className="text-[10px] opacity-70">{item.hint}</span>
                            </button>
                        )
                    })}
                </nav>

                {statusSlot && <div className="border-t border-border p-3">{statusSlot}</div>}
            </aside>

            <main className="flex-1 overflow-hidden">{children}</main>
        </div>
    )
}

/** Header halaman konsisten dengan slot aksi di kanan. */
export function PageHeader({
    title,
    description,
    actions
}: {
    title: string
    description?: string
    actions?: ReactNode
}): React.JSX.Element {
    return (
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    )
}
