import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import {
    badgeClass,
    buttonClass,
    cardClass,
    inputClass,
    labelClass,
    selectClass,
    textareaClass,
    type ButtonSize,
    type ButtonVariant
} from '../lib/ui'
import { cn } from '../lib/utils'

/**
 * Primitif UI.
 *
 * Gaya visual ditulis eksplisit di `src/lib/ui.ts`, bukan memakai default
 * komponen library — brief §7 melarang tampilan template admin-dashboard generik.
 */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
}

export function Button({
    variant = 'secondary',
    size = 'md',
    className,
    ...props
}: ButtonProps): React.JSX.Element {
    return <button className={buttonClass(variant, size, className)} {...props} />
}

interface FieldProps {
    label: string
    htmlFor?: string
    hint?: string
    error?: string
    children: ReactNode
    className?: string
}

/** Pembungkus field form: label + kontrol + hint/error. */
export function Field({
    label,
    htmlFor,
    hint,
    error,
    children,
    className
}: FieldProps): React.JSX.Element {
    return (
        <div className={cn('flex flex-col gap-1', className)}>
            <label className={labelClass()} htmlFor={htmlFor}>
                {label}
            </label>
            {children}
            {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
            {error && <p className="text-[11px] text-loss">{error}</p>}
        </div>
    )
}

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number | null
    onValueChange: (value: number | null) => void
    /** Jumlah desimal saat menampilkan ulang. Presisi bebas saat user mengetik. */
    decimals?: number
}

/**
 * Input angka.
 *
 * Menyimpan nilai sebagai number|null, bukan string. `null` berarti kosong —
 * penting agar field opsional (mis. stop loss) benar-benar bisa kosong dan
 * menghasilkan R = NULL, bukan 0 (brief §5.2).
 */
export function NumberInput({
    value,
    onValueChange,
    decimals,
    className,
    ...props
}: NumberInputProps): React.JSX.Element {
    const display = value === null || Number.isNaN(value) ? '' : String(value)

    return (
        <input
            type="text"
            inputMode="decimal"
            value={display}
            onChange={(event) => {
                const raw = event.target.value.trim()
                if (raw === '') {
                    onValueChange(null)
                    return
                }
                // Hanya izinkan angka, minus, dan satu titik desimal.
                if (!/^-?\d*\.?\d*$/.test(raw)) return
                const parsed = Number(raw)
                onValueChange(Number.isNaN(parsed) ? null : parsed)
            }}
            onBlur={() => {
                // Rapikan tampilan saat blur, tapi jangan ubah nilainya.
                if (value !== null && decimals !== undefined) {
                    onValueChange(Number(value.toFixed(decimals)))
                }
            }}
            className={inputClass(className, true)}
            {...props}
        />
    )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    numeric?: boolean
}

export function TextInput({ numeric, className, ...props }: TextInputProps): React.JSX.Element {
    return <input className={inputClass(className, numeric)} {...props} />
}

export function TextArea({
    className,
    ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
    return <textarea className={textareaClass(className)} {...props} />
}

export function Select({
    className,
    children,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
    return (
        <select className={selectClass(className)} {...props}>
            {children}
        </select>
    )
}

export function Card({
    className,
    children
}: {
    className?: string
    children: ReactNode
}): React.JSX.Element {
    return <div className={cardClass(className)}>{children}</div>
}

export function CardHeader({
    title,
    description,
    action
}: {
    title: string
    description?: string
    action?: ReactNode
}): React.JSX.Element {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
            <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {action}
        </div>
    )
}

export function Badge({
    tone = 'default',
    children,
    className
}: {
    tone?: 'default' | 'profit' | 'loss' | 'muted' | 'warning'
    children: ReactNode
    className?: string
}): React.JSX.Element {
    return <span className={badgeClass(tone, className)}>{children}</span>
}

/** Keadaan kosong. Brief §7 tidak menyebut ini, tapi UI trading tanpa empty
 * state akan tampak rusak saat pertama kali dibuka. */
export function EmptyState({
    title,
    description,
    action
}: {
    title: string
    description: string
    action?: ReactNode
}): React.JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-medium">{title}</p>
            <p className="max-w-md text-xs text-muted-foreground">{description}</p>
            {action}
        </div>
    )
}

/** Pesan error inline — dipakai untuk menampilkan error dari main process. */
export function ErrorNote({ message }: { message: string }): React.JSX.Element {
    return (
        <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
            {message}
        </div>
    )
}

/** Komponen Modal / Dialog overlay modern */
export function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md'
}: {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    children: ReactNode
    footer?: ReactNode
    size?: 'sm' | 'md' | 'lg' | 'xl'
}): React.JSX.Element | null {
    if (!isOpen) return null

    const maxWidthClass = {
        sm: 'max-w-md',
        md: 'max-w-xl',
        lg: 'max-w-3xl',
        xl: 'max-w-5xl'
    }[size]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Dialog Box */}
            <div
                className={cn(
                    'relative z-50 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95',
                    maxWidthClass
                )}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{title}</h2>
                        {description && <p className="text-xs text-muted-foreground">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        ✕
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6">{children}</div>

                {/* Modal Footer */}
                {footer && (
                    <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}
