/**
 * Utilitas kelas Tailwind untuk primitif UI.
 *
 * Gaya visual app ini SENGAJA ditulis sendiri, bukan memakai default komponen
 * library (brief §7: "hindari tampilan default komponen UI library tanpa
 * kustomisasi — jangan biarkan terlihat seperti template admin-dashboard generik").
 *
 * Konsekuensinya gaya ditulis eksplisit di sini supaya konsisten antar komponen,
 * alih-alih tersebar sebagai string kelas yang berbeda-beda.
 */

import { cn } from './utils'

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'icon'

const buttonBase =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ' +
    'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ' +
    'select-none whitespace-nowrap'

const buttonVariants: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground'
}

const buttonSizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
    icon: 'h-9 w-9'
}

export function buttonClass(
    variant: ButtonVariant = 'secondary',
    size: ButtonSize = 'md',
    className?: string
): string {
    return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)
}

// ---------------------------------------------------------------------------
// Input & form
// ---------------------------------------------------------------------------

/** Kelas dasar untuk input teks/angka. Angka memakai font monospace (brief §7). */
export function inputClass(className?: string, isNumeric = false): string {
    return cn(
        'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isNumeric && 'tabular text-right',
        className
    )
}

export function textareaClass(className?: string): string {
    return cn(
        'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground resize-y min-h-[80px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        className
    )
}

export function labelClass(className?: string): string {
    return cn('text-xs font-medium text-muted-foreground', className)
}

export function selectClass(className?: string): string {
    return cn(
        'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
    )
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

export function cardClass(className?: string): string {
    return cn('rounded-lg border border-border bg-card text-card-foreground', className)
}

export function badgeClass(
    tone: 'default' | 'profit' | 'loss' | 'muted' | 'warning' = 'default',
    className?: string
): string {
    const tones = {
        default: 'bg-primary/15 text-primary border-primary/30',
        profit: 'bg-profit/15 text-profit border-profit/30',
        loss: 'bg-loss/15 text-loss border-loss/30',
        muted: 'bg-muted text-muted-foreground border-border',
        warning: 'bg-chart-3/15 text-chart-3 border-chart-3/30'
    } as const

    return cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tones[tone],
        className
    )
}

// ---------------------------------------------------------------------------
// Tabel data-dense (brief §7)
// ---------------------------------------------------------------------------

export const tableClass = 'w-full border-collapse text-sm'

export function tableHeadClass(className?: string): string {
    return cn(
        'sticky top-0 z-10 bg-card border-b border-border',
        'text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
        className
    )
}

export function tableHeadCellClass(className?: string): string {
    return cn('px-3 py-2 whitespace-nowrap', className)
}

export function tableRowClass(className?: string): string {
    return cn('border-b border-border/60 hover:bg-accent/40 transition-colors', className)
}

export function tableCellClass(className?: string): string {
    return cn('px-3 py-1.5 whitespace-nowrap', className)
}
