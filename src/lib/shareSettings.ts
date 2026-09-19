/**
 * Konfigurasi dan Penyimpanan Terpusat untuk Kartu Share PnL.
 *
 * Mengelola preferensi avatar, handle, branding title/subtitle,
 * logo exchange, kode referral masing-masing exchange (MEXC & Bitunix),
 * template background, custom wallpaper, dan opsi teks adaptif.
 */

export const EXCHANGES = ['mexc', 'bitunix'] as const
export type ExchangeName = typeof EXCHANGES[number]

export interface BgTemplate {
    id: string
    label: string
    /** CSS value untuk background card */
    bg: string
    /** Warna aksen saat profit */
    accentProfit: string
    /** Warna aksen saat loss */
    accentLoss: string
    /** Warna teks sekunder / subteks */
    textSub: string
    /** Warna border card */
    border: string
    /** Mode transparan murni untuk export PNG tanpa backdrop solid */
    isTransparent: boolean
}

export const BG_TEMPLATES: BgTemplate[] = [
    {
        id: 'dark-navy',
        label: 'Dark Navy',
        bg: 'linear-gradient(145deg, #0d1117 0%, #0a0e1a 50%, #060912 100%)',
        accentProfit: '#38bdf8',
        accentLoss: '#f43f5e',
        textSub: 'rgba(255, 255, 255, 0.55)',
        border: 'rgba(255, 255, 255, 0.08)',
        isTransparent: false
    },
    {
        id: 'glass-transparent',
        label: 'Glass Transparan',
        bg: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(10, 15, 30, 0.9) 100%)',
        accentProfit: '#00f2fe',
        accentLoss: '#ff4b72',
        textSub: 'rgba(255, 255, 255, 0.65)',
        border: 'rgba(255, 255, 255, 0.18)',
        isTransparent: true
    },
    {
        id: 'cyberpunk',
        label: 'Cyberpunk',
        bg: 'radial-gradient(ellipse at 30% 20%, #1e0836 0%, #0a0014 60%, #000000 100%)',
        accentProfit: '#c084fc',
        accentLoss: '#fb7185',
        textSub: 'rgba(216, 180, 254, 0.6)',
        border: 'rgba(192, 132, 252, 0.25)',
        isTransparent: false
    },
    {
        id: 'emerald',
        label: 'Emerald Alpha',
        bg: 'linear-gradient(145deg, #064e3b 0%, #022c22 60%, #020617 100%)',
        accentProfit: '#34d399',
        accentLoss: '#f87171',
        textSub: 'rgba(167, 243, 208, 0.55)',
        border: 'rgba(52, 211, 153, 0.25)',
        isTransparent: false
    },
    {
        id: 'sunset',
        label: 'Sunset Horizon',
        bg: 'linear-gradient(145deg, #2e1065 0%, #1e0a30 40%, #0f172a 100%)',
        accentProfit: '#fbbf24',
        accentLoss: '#f43f5e',
        textSub: 'rgba(253, 224, 137, 0.55)',
        border: 'rgba(251, 191, 36, 0.25)',
        isTransparent: false
    },
    {
        id: 'obsidian',
        label: 'Obsidian Sleek',
        bg: 'linear-gradient(180deg, #18181b 0%, #09090b 60%, #000000 100%)',
        accentProfit: '#4ade80',
        accentLoss: '#f87171',
        textSub: 'rgba(255, 255, 255, 0.45)',
        border: 'rgba(255, 255, 255, 0.08)',
        isTransparent: false
    }
]

export const SHARE_STORAGE_KEYS = {
    AVATAR: 'trading_journal_share_avatar',
    HANDLE: 'trading_journal_share_handle',
    BRAND_TITLE: 'trading_journal_share_brand_title',
    BRAND_SUBTITLE: 'trading_journal_share_brand_subtitle',
    MEXC_LOGO: 'trading_journal_share_mexc_logo',
    MEXC_REF: 'trading_journal_share_mexc_referral',
    BITUNIX_LOGO: 'trading_journal_share_bitunix_logo',
    BITUNIX_REF: 'trading_journal_share_bitunix_referral',
    SHOW_REF: 'trading_journal_share_show_referral',
    BG_PRESET_ID: 'trading_journal_share_bg_preset_id',
    CUSTOM_BG: 'trading_journal_share_custom_bg',
    IS_CUSTOM_BG: 'trading_journal_share_is_custom_bg',
    BG_DIMMING: 'trading_journal_share_bg_dimming',
    FULL_TEXT: 'trading_journal_share_full_text'
} as const

export interface ShareSettings {
    avatarUrl: string | null
    traderHandle: string
    brandTitle: string
    brandSubtitle: string
    mexcLogoUrl: string | null
    mexcReferralCode: string
    bitunixLogoUrl: string | null
    bitunixReferralCode: string
    showReferral: boolean
    bgPresetId: string
    customBgUrl: string | null
    isCustomBg: boolean
    bgDimming: number
    showFullText: boolean
}

/** Membaca seluruh pengaturan share dari localStorage dengan fallback default */
export function loadShareSettings(): ShareSettings {
    return {
        avatarUrl: localStorage.getItem(SHARE_STORAGE_KEYS.AVATAR) || null,
        traderHandle: localStorage.getItem(SHARE_STORAGE_KEYS.HANDLE) || '@trader',
        brandTitle: localStorage.getItem(SHARE_STORAGE_KEYS.BRAND_TITLE) || 'SHARENYA',
        brandSubtitle: localStorage.getItem(SHARE_STORAGE_KEYS.BRAND_SUBTITLE) || 'JOURNAL',
        mexcLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.MEXC_LOGO) || null,
        mexcReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.MEXC_REF) || '',
        bitunixLogoUrl: localStorage.getItem(SHARE_STORAGE_KEYS.BITUNIX_LOGO) || null,
        bitunixReferralCode: localStorage.getItem(SHARE_STORAGE_KEYS.BITUNIX_REF) || '',
        showReferral: localStorage.getItem(SHARE_STORAGE_KEYS.SHOW_REF) !== 'false', // default true
        bgPresetId: localStorage.getItem(SHARE_STORAGE_KEYS.BG_PRESET_ID) || 'dark-navy',
        customBgUrl: localStorage.getItem(SHARE_STORAGE_KEYS.CUSTOM_BG) || null,
        isCustomBg: localStorage.getItem(SHARE_STORAGE_KEYS.IS_CUSTOM_BG) === 'true',
        bgDimming: Number(localStorage.getItem(SHARE_STORAGE_KEYS.BG_DIMMING)) || 75,
        showFullText: localStorage.getItem(SHARE_STORAGE_KEYS.FULL_TEXT) !== 'false' // default true
    }
}

/** Menyimpan seluruh atau sebagian pengaturan share ke localStorage */
export function saveShareSettings(settings: Partial<ShareSettings>): void {
    if (settings.avatarUrl !== undefined) {
        if (settings.avatarUrl) localStorage.setItem(SHARE_STORAGE_KEYS.AVATAR, settings.avatarUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.AVATAR)
    }
    if (settings.traderHandle !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.HANDLE, settings.traderHandle)
    }
    if (settings.brandTitle !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BRAND_TITLE, settings.brandTitle)
    }
    if (settings.brandSubtitle !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BRAND_SUBTITLE, settings.brandSubtitle)
    }
    if (settings.mexcLogoUrl !== undefined) {
        if (settings.mexcLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.MEXC_LOGO, settings.mexcLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.MEXC_LOGO)
    }
    if (settings.mexcReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.MEXC_REF, settings.mexcReferralCode)
    }
    if (settings.bitunixLogoUrl !== undefined) {
        if (settings.bitunixLogoUrl) localStorage.setItem(SHARE_STORAGE_KEYS.BITUNIX_LOGO, settings.bitunixLogoUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.BITUNIX_LOGO)
    }
    if (settings.bitunixReferralCode !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BITUNIX_REF, settings.bitunixReferralCode)
    }
    if (settings.showReferral !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.SHOW_REF, String(settings.showReferral))
    }
    if (settings.bgPresetId !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_PRESET_ID, settings.bgPresetId)
    }
    if (settings.customBgUrl !== undefined) {
        if (settings.customBgUrl) localStorage.setItem(SHARE_STORAGE_KEYS.CUSTOM_BG, settings.customBgUrl)
        else localStorage.removeItem(SHARE_STORAGE_KEYS.CUSTOM_BG)
    }
    if (settings.isCustomBg !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.IS_CUSTOM_BG, String(settings.isCustomBg))
    }
    if (settings.bgDimming !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.BG_DIMMING, String(settings.bgDimming))
    }
    if (settings.showFullText !== undefined) {
        localStorage.setItem(SHARE_STORAGE_KEYS.FULL_TEXT, String(settings.showFullText))
    }
}
