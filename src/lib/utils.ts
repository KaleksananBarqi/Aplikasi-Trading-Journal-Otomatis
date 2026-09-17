import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Gabungkan class Tailwind dengan benar.
 *
 * `clsx` menangani conditional class, `twMerge` menyelesaikan konflik antar
 * utility (mis. `p-2` + `p-4` → `p-4`). Tanpa twMerge, urutan class di dalam
 * string menentukan hasil — sumber bug styling yang sulit dilacak.
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}
