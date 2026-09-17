import { useCallback, useEffect, useState } from 'react'

/**
 * Tema aplikasi: `dark` (default), `light`, atau `system`.
 *
 * Brief §7: dark mode adalah default karena preferensi umum trader dan kontras
 * tinggi untuk sesi panjang. Brief §7 juga meminta opsi colorblind-safe.
 *
 * Kelas diterapkan ke `<html>`:
 * - `.dark`            -> mengganti variabel CSS ke palet gelap
 * - `.colorblind-safe` -> menukar hijau/merah jadi biru/oranye
 *
 * Kelas di `<html>` (bukan di root React) supaya tidak ada kedipan tema saat
 * render pertama — lihat skrip inline di index.html.
 */

export type Theme = 'dark' | 'light' | 'system'

const THEME_KEY = 'trading-journal-theme'
const COLORBLIND_KEY = 'trading-journal-colorblind'

function prefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveIsDark(theme: Theme): boolean {
    return theme === 'dark' || (theme === 'system' && prefersDark())
}

function applyTheme(theme: Theme, colorblindSafe: boolean): void {
    const root = document.documentElement
    root.classList.toggle('dark', resolveIsDark(theme))
    root.classList.toggle('colorblind-safe', colorblindSafe)
}

export function useTheme(): {
    theme: Theme
    colorblindSafe: boolean
    isDark: boolean
    setTheme: (theme: Theme) => void
    setColorblindSafe: (value: boolean) => void
} {
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = window.localStorage.getItem(THEME_KEY)
        return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark'
    })

    const [colorblindSafe, setColorblindState] = useState<boolean>(
        () => window.localStorage.getItem(COLORBLIND_KEY) === 'true'
    )

    const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark(theme))

    useEffect(() => {
        applyTheme(theme, colorblindSafe)
        setIsDark(resolveIsDark(theme))
    }, [theme, colorblindSafe])

    // Ikuti perubahan tema OS saat mode `system` aktif.
    useEffect(() => {
        if (theme !== 'system') return
        const query = window.matchMedia('(prefers-color-scheme: dark)')
        const listener = (): void => {
            applyTheme('system', colorblindSafe)
            setIsDark(prefersDark())
        }
        query.addEventListener('change', listener)
        return () => query.removeEventListener('change', listener)
    }, [theme, colorblindSafe])

    const setTheme = useCallback((next: Theme) => {
        window.localStorage.setItem(THEME_KEY, next)
        setThemeState(next)
    }, [])

    const setColorblindSafe = useCallback((value: boolean) => {
        window.localStorage.setItem(COLORBLIND_KEY, String(value))
        setColorblindState(value)
    }, [])

    return { theme, colorblindSafe, isDark, setTheme, setColorblindSafe }
}
