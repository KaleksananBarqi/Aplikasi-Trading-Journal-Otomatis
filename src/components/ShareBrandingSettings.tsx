import { useRef, useState } from 'react'
import { Card, CardHeader, Field } from './ui'
import {
    BG_TEMPLATES,
    loadShareSettings,
    saveShareSettings,
    type ShareSettings,
    type ExchangeName
} from '../lib/shareSettings'

export function ShareBrandingSettings(): React.JSX.Element {
    const [settings, setSettings] = useState<ShareSettings>(loadShareSettings)
    const [activeExchangeTab, setActiveExchangeTab] = useState<ExchangeName>('mexc')
    const [avatarFileError, setAvatarFileError] = useState<string | null>(null)
    const [bgFileError, setBgFileError] = useState<string | null>(null)
    const [mexcLogoError, setMexcLogoError] = useState<string | null>(null)
    const [bitunixLogoError, setBitunixLogoError] = useState<string | null>(null)

    const avatarInputRef = useRef<HTMLInputElement>(null)
    const bgInputRef = useRef<HTMLInputElement>(null)
    const mexcLogoInputRef = useRef<HTMLInputElement>(null)
    const bitunixLogoInputRef = useRef<HTMLInputElement>(null)

    const currentTemplate = BG_TEMPLATES.find((t) => t.id === settings.bgPresetId) || BG_TEMPLATES[0]!

    // Sinkronkan ke localStorage setiap ada perubahan state
    const updateSettings = (partial: Partial<ShareSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...partial }
            saveShareSettings(partial)
            return next
        })
    }

    // Helper upload gambar
    const handleImageUpload = (
        file: File | undefined,
        maxMb: number,
        onError: (err: string | null) => void,
        onSuccess: (dataUrl: string) => void
    ) => {
        onError(null)
        if (!file) return

        if (!file.type.startsWith('image/')) {
            onError('Harap pilih berkas gambar (PNG, JPG, SVG, WebP).')
            return
        }

        if (file.size > maxMb * 1024 * 1024) {
            onError(`Ukuran berkas maksimal ${maxMb}MB.`)
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            if (dataUrl) onSuccess(dataUrl)
        }
        reader.readAsDataURL(file)
    }

    return (
        <Card>
            <CardHeader
                title="Branding Kartu Share PnL"
                description="Kustomisasi nama brand, logo exchange, kode referral (MEXC & Bitunix), avatar, dan wallpaper kartu share."
            />

            <div className="flex flex-col gap-6 p-4">
                {/* ── BAGIAN 1: BRAND TITLE & SUBTITLE ── */}
                <div>
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                        1. Kustomisasi Judul Brand
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Nama Brand Utama" hint="Contoh: SHARENYA, CRYPTO JOURNAL, VIP TRADER">
                            <input
                                type="text"
                                value={settings.brandTitle}
                                onChange={(e) => updateSettings({ brandTitle: e.target.value.toUpperCase() })}
                                placeholder="SHARENYA"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-bold tracking-wider shadow-xs focus:border-primary focus:outline-none"
                            />
                        </Field>

                        <Field label="Sub-label Badge Brand" hint="Contoh: JOURNAL, PRO, FUTURES, ALPHA">
                            <input
                                type="text"
                                value={settings.brandSubtitle}
                                onChange={(e) => updateSettings({ brandSubtitle: e.target.value.toUpperCase() })}
                                placeholder="JOURNAL"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-semibold tracking-wide shadow-xs focus:border-primary focus:outline-none"
                            />
                        </Field>
                    </div>
                </div>

                {/* ── BAGIAN 2: LOGO EXCHANGE & KODE REFERRAL (MEXC & BITUNIX) ── */}
                <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                2. Exchange & Kode Referral
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Upload logo khusus dan masukkan kode referral untuk masing-masing exchange.
                            </p>
                        </div>

                        {/* Toggle Global Referral */}
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                            <input
                                type="checkbox"
                                checked={settings.showReferral}
                                onChange={(e) => updateSettings({ showReferral: e.target.checked })}
                                className="h-3.5 w-3.5 rounded border-border text-primary accent-primary"
                            />
                            <span className="font-medium text-foreground">Tampilkan Kode Reff di Kartu</span>
                        </label>
                    </div>

                    {/* Tabs Exchange: MEXC & Bitunix */}
                    <div className="flex gap-2 mb-3">
                        {(['mexc', 'bitunix'] as const).map((ex) => (
                            <button
                                key={ex}
                                type="button"
                                onClick={() => setActiveExchangeTab(ex)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${activeExchangeTab === ex
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {ex}
                            </button>
                        ))}
                    </div>

                    {/* Form Konfigurasi Exchange Aktif */}
                    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
                        {activeExchangeTab === 'mexc' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Logo MEXC" hint="PNG transparan disarankan (opsional)">
                                    <div className="flex items-center gap-3 mt-1">
                                        <input
                                            ref={mexcLogoInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) =>
                                                handleImageUpload(
                                                    e.target.files?.[0],
                                                    4,
                                                    setMexcLogoError,
                                                    (dataUrl) => updateSettings({ mexcLogoUrl: dataUrl })
                                                )
                                            }
                                            className="hidden"
                                        />

                                        {/* Preview Logo MEXC */}
                                        <div
                                            onClick={() => mexcLogoInputRef.current?.click()}
                                            title="Klik untuk upload logo MEXC"
                                            className="h-10 px-3 rounded-lg border border-border/80 flex items-center justify-center cursor-pointer bg-background/80 hover:opacity-85 transition-opacity"
                                        >
                                            {settings.mexcLogoUrl ? (
                                                <img src={settings.mexcLogoUrl} alt="MEXC Logo" className="h-6 max-w-[100px] object-contain" />
                                            ) : (
                                                <span className="text-xs font-bold text-foreground/80 tracking-wider">MEXC</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => mexcLogoInputRef.current?.click()}
                                                className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                            >
                                                {settings.mexcLogoUrl ? 'Ganti Logo' : 'Upload Logo MEXC'}
                                            </button>
                                            {settings.mexcLogoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => updateSettings({ mexcLogoUrl: null })}
                                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    Reset ke Teks
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {mexcLogoError && <p className="text-[11px] text-destructive mt-1">{mexcLogoError}</p>}
                                </Field>

                                <Field label="Kode Referral MEXC" hint="Akan tampil di bawah logo exchange pada kartu">
                                    <input
                                        type="text"
                                        value={settings.mexcReferralCode}
                                        onChange={(e) => updateSettings({ mexcReferralCode: e.target.value.trim() })}
                                        placeholder="Contoh: MEXC888"
                                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                                    />
                                </Field>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Logo Bitunix" hint="PNG transparan disarankan (opsional)">
                                    <div className="flex items-center gap-3 mt-1">
                                        <input
                                            ref={bitunixLogoInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) =>
                                                handleImageUpload(
                                                    e.target.files?.[0],
                                                    4,
                                                    setBitunixLogoError,
                                                    (dataUrl) => updateSettings({ bitunixLogoUrl: dataUrl })
                                                )
                                            }
                                            className="hidden"
                                        />

                                        {/* Preview Logo Bitunix */}
                                        <div
                                            onClick={() => bitunixLogoInputRef.current?.click()}
                                            title="Klik untuk upload logo Bitunix"
                                            className="h-10 px-3 rounded-lg border border-border/80 flex items-center justify-center cursor-pointer bg-background/80 hover:opacity-85 transition-opacity"
                                        >
                                            {settings.bitunixLogoUrl ? (
                                                <img src={settings.bitunixLogoUrl} alt="Bitunix Logo" className="h-6 max-w-[100px] object-contain" />
                                            ) : (
                                                <span className="text-xs font-bold text-foreground/80 tracking-wider">BITUNIX</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => bitunixLogoInputRef.current?.click()}
                                                className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                            >
                                                {settings.bitunixLogoUrl ? 'Ganti Logo' : 'Upload Logo Bitunix'}
                                            </button>
                                            {settings.bitunixLogoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => updateSettings({ bitunixLogoUrl: null })}
                                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    Reset ke Teks
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {bitunixLogoError && <p className="text-[11px] text-destructive mt-1">{bitunixLogoError}</p>}
                                </Field>

                                <Field label="Kode Referral Bitunix" hint="Akan tampil di bawah logo exchange pada kartu">
                                    <input
                                        type="text"
                                        value={settings.bitunixReferralCode}
                                        onChange={(e) => updateSettings({ bitunixReferralCode: e.target.value.trim() })}
                                        placeholder="Contoh: BITUNIX100"
                                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                                    />
                                </Field>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── BAGIAN 3: IDENTITAS TRADER ── */}
                <div className="pt-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                        3. Profil & Identitas Trader
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Foto Avatar Trader" hint="PNG/JPG/WebP, tampil di footer kartu">
                            <div className="flex items-center gap-3 mt-1">
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                        handleImageUpload(
                                            e.target.files?.[0],
                                            5,
                                            setAvatarFileError,
                                            (dataUrl) => updateSettings({ avatarUrl: dataUrl })
                                        )
                                    }
                                    className="hidden"
                                />

                                <div
                                    onClick={() => avatarInputRef.current?.click()}
                                    title="Klik untuk upload foto avatar"
                                    className="w-13 h-13 rounded-full border-2 flex items-center justify-center cursor-pointer overflow-hidden bg-muted/40 hover:opacity-85 transition-all shadow-md flex-shrink-0"
                                    style={{ borderColor: currentTemplate.accentProfit }}
                                >
                                    {settings.avatarUrl ? (
                                        <img src={settings.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-bold text-foreground/70">
                                            {settings.traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => avatarInputRef.current?.click()}
                                            className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                                        >
                                            {settings.avatarUrl ? 'Ganti Foto' : 'Upload Foto'}
                                        </button>
                                        {settings.avatarUrl && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateSettings({ avatarUrl: null })
                                                    if (avatarInputRef.current) avatarInputRef.current.value = ''
                                                }}
                                                className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1 py-1"
                                            >
                                                Hapus
                                            </button>
                                        )}
                                    </div>
                                    {avatarFileError && <p className="text-[11px] text-destructive">{avatarFileError}</p>}
                                </div>
                            </div>
                        </Field>

                        <Field label="Handle / Nama Trader" hint="Ditampilkan di footer kartu share">
                            <input
                                type="text"
                                value={settings.traderHandle}
                                onChange={(e) => updateSettings({ traderHandle: e.target.value })}
                                placeholder="@username"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                            />
                        </Field>
                    </div>
                </div>

                {/* ── BAGIAN 4: LATAR BELAKANG KARTU ── */}
                <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                4. Tema Background Default
                            </p>
                            <p className="text-[11px] text-muted-foreground">Pilih preset atau gunakan gambar latar kustom</p>
                        </div>

                        {settings.isCustomBg && settings.customBgUrl && (
                            <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-1 rounded-md">
                                <span className="text-[11px] font-medium text-foreground">
                                    Dimming Overlay: {settings.bgDimming}%
                                </span>
                                <input
                                    type="range"
                                    min="30"
                                    max="95"
                                    value={settings.bgDimming}
                                    onChange={(e) => updateSettings({ bgDimming: Number(e.target.value) })}
                                    className="w-20 h-1.5 accent-primary cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        updateSettings({ isCustomBg: false, customBgUrl: null })
                                        if (bgInputRef.current) bgInputRef.current.value = ''
                                    }}
                                    className="text-[11px] text-destructive hover:underline ml-1 font-medium"
                                >
                                    Hapus BG
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {BG_TEMPLATES.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => updateSettings({ bgPresetId: t.id, isCustomBg: false })}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!settings.isCustomBg && settings.bgPresetId === t.id
                                    ? 'border-primary bg-primary/15 text-foreground font-semibold shadow-xs ring-1 ring-primary/40'
                                    : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <span
                                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                    style={{
                                        background: t.isTransparent
                                            ? 'linear-gradient(45deg, #38bdf8 0%, #a855f7 100%)'
                                            : t.accentProfit,
                                        boxShadow: (!settings.isCustomBg && settings.bgPresetId === t.id)
                                            ? `0 0 8px ${t.accentProfit}`
                                            : 'none'
                                    }}
                                />
                                <span>{t.label}</span>
                                {t.isTransparent && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 font-bold ml-0.5">
                                        PNG Transparan
                                    </span>
                                )}
                            </button>
                        ))}

                        {/* Upload Custom BG */}
                        <input
                            ref={bgInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                                handleImageUpload(
                                    e.target.files?.[0],
                                    8,
                                    setBgFileError,
                                    (dataUrl) => updateSettings({ customBgUrl: dataUrl, isCustomBg: true })
                                )
                            }
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => bgInputRef.current?.click()}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${settings.isCustomBg && settings.customBgUrl
                                ? 'border-primary bg-primary/20 text-foreground font-semibold shadow-xs'
                                : 'border-dashed border-border bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border/80'
                                }`}
                        >
                            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <rect x="3" y="3" width="14" height="14" rx="2" />
                                <circle cx="7.5" cy="7.5" r="1.5" />
                                <path d="M3 14l4-4 3 3 4-4 3 3" />
                            </svg>
                            <span>{settings.customBgUrl ? 'Ganti BG Kustom' : '+ Upload Background Kustom'}</span>
                        </button>
                    </div>
                    {bgFileError && <p className="text-[11px] text-destructive">{bgFileError}</p>}
                </div>

                {/* ── BAGIAN 5: PREFERENSI TEKS JURNAL ── */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={settings.showFullText}
                            onChange={(e) => updateSettings({ showFullText: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
                        />
                        <div>
                            <span className="text-xs font-semibold text-foreground">
                                Tampilkan Semua Thesis & Review (Tanpa Terpotong)
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Seluruh kalimat jurnal ditampilkan utuh tanpa terpotong elipsis. Ukuran kartu otomatis memanjang menyesuaikan teks Anda.
                            </p>
                        </div>
                    </label>
                </div>

                {/* ── PRATINJAU MINI LIVE PREVIEW ── */}
                <div className="pt-2 border-t border-border/50">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-2">
                        Pratinjau Hasil Desain ({activeExchangeTab.toUpperCase()}):
                    </p>
                    <div
                        className="relative overflow-hidden rounded-xl p-4 border transition-all"
                        style={{
                            background: settings.isCustomBg && settings.customBgUrl
                                ? `linear-gradient(rgba(0,0,0,${settings.bgDimming / 100}), rgba(0,0,0,${settings.bgDimming / 100})), url(${settings.customBgUrl}) center / cover`
                                : currentTemplate.bg,
                            borderColor: currentTemplate.border,
                        }}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white tracking-wider">
                                    {settings.brandTitle || 'SHARENYA'}
                                </span>
                                <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
                                    style={{ background: currentTemplate.accentProfit }}
                                >
                                    {settings.brandSubtitle || 'JOURNAL'}
                                </span>
                            </div>

                            {/* Exchange Logo & Referral Badge Preview */}
                            <div className="flex flex-col items-end gap-1">
                                {activeExchangeTab === 'mexc' ? (
                                    settings.mexcLogoUrl ? (
                                        <img src={settings.mexcLogoUrl} alt="MEXC" className="h-5 max-w-[80px] object-contain" />
                                    ) : (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                                            MEXC
                                        </span>
                                    )
                                ) : (
                                    settings.bitunixLogoUrl ? (
                                        <img src={settings.bitunixLogoUrl} alt="Bitunix" className="h-5 max-w-[80px] object-contain" />
                                    ) : (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                                            BITUNIX
                                        </span>
                                    )
                                )}

                                {settings.showReferral && (
                                    <span className="text-[9px] font-semibold text-sky-400 bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.2 rounded">
                                        Ref: {activeExchangeTab === 'mexc' ? (settings.mexcReferralCode || '—') : (settings.bitunixReferralCode || '—')}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="text-2xl font-extrabold tracking-tight" style={{ color: currentTemplate.accentProfit }}>
                            +124.50%
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                            <div className="flex items-center gap-2">
                                {settings.avatarUrl ? (
                                    <img
                                        src={settings.avatarUrl}
                                        alt="Avatar"
                                        className="w-6 h-6 rounded-full object-cover"
                                        style={{ border: `1.5px solid ${currentTemplate.accentProfit}` }}
                                    />
                                ) : (
                                    <div
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                        style={{ background: `${currentTemplate.accentProfit}44` }}
                                    >
                                        {settings.traderHandle.replace('@', '').slice(0, 2).toUpperCase() || 'TR'}
                                    </div>
                                )}
                                <span className="text-xs font-semibold text-white">{settings.traderHandle}</span>
                            </div>
                            <span className="text-[10px] text-white/50">sharenya.app</span>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    )
}
