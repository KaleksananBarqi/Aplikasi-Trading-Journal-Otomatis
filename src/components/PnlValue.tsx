import { cn } from '../lib/utils'

/**
 * Komponen untuk menampilkan angka PnL / R dengan opsi penyamaran.
 *
 * Caller bertanggung jawab menghasilkan string via `formatPnl` / `formatR` dan
 * meneruskan kelas warna (mis. `pnlColorClass(realizedPnl)`). Saat `hide` aktif,
 * angka diganti `••••` dan warna dinetralkan agar tidak menimbulkan isyarat
 * visual profit/loss yang masih membocorkan informasi.
 *
 * @param value - Angka yang sudah diformat (mis. '+12.34', '+2.00R').
 * @param hide - Jika true, angka disamarkan menjadi '••••'.
 * @param className - Kelas styling tambahan, biasanya membawa warna arah nilai.
 */
export function PnlValue({
    value,
    hide = false,
    className,
}: {
    value: string
    hide?: boolean
    className?: string
}): React.JSX.Element {
    return (
        <span className={cn('tabular', hide ? 'text-muted-foreground' : className)}>
            {hide ? '••••' : value}
        </span>
    )
}