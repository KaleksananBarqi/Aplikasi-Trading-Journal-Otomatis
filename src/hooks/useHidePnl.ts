import { useCallback, useEffect, useState } from 'react'

/**
 * Preferensi untuk menyembunyikan/menampilkan semua angka PnL.
 *
 * Persist lewat settings DB (key: 'hide_pnl').
 * Default false (angka PnL terlihat).
 */
export function useHidePnl(): {
    hidePnl: boolean
    setHidePnl: (value: boolean) => void
} {
    const [hidePnl, setHidePnlState] = useState<boolean>(false)

    // Muat preferensi saat mount
    useEffect(() => {
        window.api.getSettings()
            .then(settings => {
                setHidePnlState(settings.hide_pnl === true)
            })
            .catch(() => {
                // Lewati error, gunakan default false
            })
    }, [])

    // Persist perubahan ke settings
    const setHidePnl = useCallback((value: boolean) => {
        setHidePnlState(value)
        window.api.setSettings({ hidePnl: value })
            .catch(() => {
                // Lewati error, state lokal tetap diupdate
            })
    }, [])

    return { hidePnl, setHidePnl }
}