import { useEffect, useMemo, useState } from 'react'
import {
    DEFAULT_EMOTION_TAGS,
    computeRMultiple,
    type ExchangeId,
    type ExecutionGrade,
    type MarginMode,
    type TradeDetail,
    type TradeDirection
} from '@shared/domain'
import type { TradeSavePayload, TradeMeta } from '@shared/ipc-contract'
import { Button, Card, CardHeader, ErrorNote, Field, NumberInput, Select, TextArea, TextInput } from '../components/ui'
import { fromDateTimeLocalInput, formatR, toDateTimeLocalInput } from '../lib/format'

/**
 * Form trade + jurnal.
 *
 * Satu formulir untuk membuat dan mengedit, karena field-nya identik.
 *
 * PRINSIP PEMISAHAN (brief §5.3 & §12):
 * Field jurnal (setup, thesis, review, emosi, grade) disimpan di tabel yang
 * BERBEDA dari field P&L. Form ini menyatukan tampilannya untuk kenyamanan user,
 * tapi tidak pernah menggabungkan keduanya menjadi satu nilai/skor.
 *
 * PRINSIP R-MULTIPLE (brief §5.2):
 * Kalau stop loss tidak diisi, R ditampilkan sebagai "—" dan tombol simpan tetap
 * aktif. R bukan field wajib, dan tidak diestimasi dari data yang tidak ada.
 */

interface FormState {
    exchange: ExchangeId
    symbol: string
    direction: TradeDirection
    entryPrice: number | null
    exitPrice: number | null
    entryTime: string
    exitTime: string
    size: number | null
    leverage: number | null
    marginMode: MarginMode | null
    realizedPnl: number | null
    feeOpen: number | null
    feeClose: number | null
    fundingFee: number | null

    setupTag: string
    preTradeThesis: string
    postTradeReview: string
    emotionTag: string
    executionGrade: ExecutionGrade | null
    checklist: { label: string; checked: boolean }[]

    plannedStop: number | null
    plannedTarget: number | null
    riskAmount: number | null
}

function emptyForm(now: number, checklistTemplate: string[]): FormState {
    return {
        // Default `manual`: trade yang diinput tangan memang bukan dari exchange,
        // dan tidak boleh dipaksa mengaku berasal dari exchange tertentu.
        exchange: 'manual',
        symbol: '',
        direction: 'long',
        entryPrice: null,
        exitPrice: null,
        entryTime: toDateTimeLocalInput(now),
        exitTime: toDateTimeLocalInput(now),
        size: null,
        leverage: null,
        marginMode: null,
        realizedPnl: null,
        feeOpen: 0,
        feeClose: 0,
        fundingFee: 0,

        setupTag: '',
        preTradeThesis: '',
        postTradeReview: '',
        emotionTag: '',
        executionGrade: null,
        checklist: checklistTemplate.map((label) => ({ label, checked: false })),

        plannedStop: null,
        plannedTarget: null,
        riskAmount: null
    }
}

function toFormState(detail: TradeDetail): FormState {
    const { trade, journal, plannedRisk, checklist } = detail
    return {
        exchange: trade.exchange,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        entryTime: toDateTimeLocalInput(trade.entryTime),
        exitTime: toDateTimeLocalInput(trade.exitTime),
        size: trade.size,
        leverage: trade.leverage,
        marginMode: trade.marginMode,
        realizedPnl: trade.realizedPnl,
        feeOpen: trade.feeOpen,
        feeClose: trade.feeClose,
        fundingFee: trade.fundingFee,

        setupTag: journal?.setupTag ?? '',
        preTradeThesis: journal?.preTradeThesis ?? '',
        postTradeReview: journal?.postTradeReview ?? '',
        emotionTag: journal?.emotionTag ?? '',
        executionGrade: journal?.executionGrade ?? null,
        // Checklist dari trade TERSIMPAN apa adanya. Template hanya dipakai untuk
        // trade baru — mengubah template tidak boleh mengubah riwayat trade lama.
        checklist: checklist.map((item) => ({ label: item.label, checked: item.checked })),

        plannedStop: plannedRisk?.plannedStop ?? null,
        plannedTarget: plannedRisk?.plannedTarget ?? null,
        riskAmount: plannedRisk?.riskAmount ?? null
    }
}

interface TradeEditorProps {
    /** Trade yang diedit. `null` = mode buat baru. */
    detail: TradeDetail | null
    meta: TradeMeta | null
    onSaved: () => Promise<void> | void
    onCancel: () => void
}

export function TradeEditor({
    detail,
    meta,
    onSaved,
    onCancel
}: TradeEditorProps): React.JSX.Element {
    const checklistTemplate = meta?.checklistTemplate ?? []
    const [form, setForm] = useState<FormState>(() =>
        detail ? toFormState(detail) : emptyForm(Date.now(), checklistTemplate)
    )
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Muat ulang form saat trade yang diedit berubah.
    useEffect(() => {
        setForm(detail ? toFormState(detail) : emptyForm(Date.now(), checklistTemplate))
        setError(null)
    }, [detail, checklistTemplate])

    const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }

    /**
     * Handler khusus untuk Stop Loss Direncanakan.
     * Jika Entry Price dan Size sudah terisi, Nominal Risiko akan dihitung otomatis:
     * Nominal Risiko = |Entry Price − Stop Loss| × Size
     */
    function handlePlannedStopChange(v: number | null): void {
        setForm((prev) => {
            const updates: Partial<FormState> = { plannedStop: v }
            if (v !== null && prev.entryPrice !== null && prev.size !== null) {
                updates.riskAmount = Math.abs(prev.entryPrice - v) * prev.size
            }
            return { ...prev, ...updates }
        })
    }

    const validation = useMemo((): string | null => {
        if (form.symbol.trim() === '') return 'Symbol wajib diisi.'
        if (form.entryPrice === null) return 'Harga entry wajib diisi.'
        if (form.exitPrice === null) return 'Harga exit wajib diisi.'
        if (form.realizedPnl === null) return 'P&L wajib diisi.'

        const entryTime = fromDateTimeLocalInput(form.entryTime)
        const exitTime = fromDateTimeLocalInput(form.exitTime)
        if (entryTime === null) return 'Waktu entry tidak valid.'
        if (exitTime === null) return 'Waktu exit tidak valid.'
        if (exitTime < entryTime) return 'Waktu exit tidak boleh sebelum waktu entry.'

        // CATATAN: `plannedStop` sengaja TIDAK divalidasi wajib. R-multiple akan
        // bernilai NULL bila kosong, dan itu perilaku yang benar (brief §5.2).
        return null
    }, [form])

    async function handleSubmit(): Promise<void> {
        if (validation) {
            setError(validation)
            return
        }

        const entryTime = fromDateTimeLocalInput(form.entryTime)
        const exitTime = fromDateTimeLocalInput(form.exitTime)
        if (entryTime === null || exitTime === null) return

        const payload: TradeSavePayload = {
            trade: {
                exchange: form.exchange,
                externalId: detail?.trade.externalId ?? null,
                symbol: form.symbol.trim(),
                direction: form.direction,
                entryPrice: form.entryPrice as number,
                exitPrice: form.exitPrice as number,
                entryTime,
                exitTime,
                size: form.size ?? 0,
                leverage: form.leverage ?? 1,
                marginMode: form.marginMode,
                realizedPnl: form.realizedPnl as number,
                feeOpen: form.feeOpen ?? 0,
                feeClose: form.feeClose ?? 0,
                fundingFee: form.fundingFee ?? 0
            },
            journal: {
                setupTag: form.setupTag,
                preTradeThesis: form.preTradeThesis,
                postTradeReview: form.postTradeReview,
                emotionTag: form.emotionTag,
                executionGrade: form.executionGrade,
                checklist: form.checklist
            },
            plannedRisk: {
                plannedStop: form.plannedStop,
                plannedTarget: form.plannedTarget,
                riskAmount: form.riskAmount
            }
        }

        setSaving(true)
        setError(null)
        try {
            const result = detail
                ? await window.api.updateTrade(detail.trade.id, payload)
                : await window.api.createTrade(payload)
            if (!result.ok) {
                setError(result.error ?? 'Gagal menyimpan trade.')
                return
            }
            await onSaved()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }

    const rPreview = computeRMultiple(form.realizedPnl ?? 0, form.riskAmount)

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
                <div>
                    <h2 className="text-base font-semibold">
                        {detail ? `Edit Trade #${detail.trade.id}` : 'Trade Baru'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {detail
                            ? 'Perubahan P&L dan catatan jurnal disimpan terpisah.'
                            : 'Input manual untuk data historis atau trade di luar exchange.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={onCancel} disabled={saving}>
                        Batal
                    </Button>
                    <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving}>
                        {saving ? 'Menyimpan…' : 'Simpan'}
                    </Button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {error && (
                    <div className="mb-4">
                        <ErrorNote message={error} />
                    </div>
                )}

                <div className="flex flex-col gap-4">
                    {/* --- Data dari exchange / posisi --- */}
                    <Card>
                        <CardHeader title="Data Posisi" description="Angka dari exchange atau hasil input manual" />
                        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                            <Field label="Exchange">
                                <Select
                                    value={form.exchange}
                                    onChange={(e) => update('exchange', e.target.value as ExchangeId)}
                                >
                                    <option value="manual">Manual</option>
                                    <option value="mexc">MEXC</option>
                                    <option value="bitunix">Bitunix</option>
                                </Select>
                            </Field>

                            <Field label="Symbol" hint="mis. BTCUSDT">
                                <TextInput
                                    value={form.symbol}
                                    onChange={(e) => update('symbol', e.target.value)}
                                    placeholder="BTCUSDT"
                                    list="symbol-suggestions"
                                />
                                <datalist id="symbol-suggestions">
                                    {(meta?.symbols ?? []).map((s) => (
                                        <option key={s} value={s} />
                                    ))}
                                </datalist>
                            </Field>

                            <Field label="Arah">
                                <Select
                                    value={form.direction}
                                    onChange={(e) => update('direction', e.target.value as TradeDirection)}
                                >
                                    <option value="long">Long</option>
                                    <option value="short">Short</option>
                                </Select>
                            </Field>

                            <Field label="Margin Mode">
                                <Select
                                    value={form.marginMode ?? ''}
                                    onChange={(e) =>
                                        update('marginMode', e.target.value === '' ? null : (e.target.value as MarginMode))
                                    }
                                >
                                    <option value="">—</option>
                                    <option value="isolated">Isolated</option>
                                    <option value="cross">Cross</option>
                                </Select>
                            </Field>

                            <Field label="Harga Entry">
                                <NumberInput
                                    value={form.entryPrice}
                                    onValueChange={(v) => update('entryPrice', v)}
                                    placeholder="0.00"
                                />
                            </Field>

                            <Field label="Harga Exit">
                                <NumberInput
                                    value={form.exitPrice}
                                    onValueChange={(v) => update('exitPrice', v)}
                                    placeholder="0.00"
                                />
                            </Field>

                            <Field label="Size" hint="Qty base asset">
                                <NumberInput value={form.size} onValueChange={(v) => update('size', v)} />
                            </Field>

                            <Field label="Leverage">
                                <NumberInput value={form.leverage} onValueChange={(v) => update('leverage', v)} />
                            </Field>

                            <Field label="Waktu Entry" hint="Waktu lokal, disimpan UTC">
                                <TextInput
                                    type="datetime-local"
                                    value={form.entryTime}
                                    onChange={(e) => update('entryTime', e.target.value)}
                                />
                            </Field>

                            <Field label="Waktu Exit" hint="Waktu lokal, disimpan UTC">
                                <TextInput
                                    type="datetime-local"
                                    value={form.exitTime}
                                    onChange={(e) => update('exitTime', e.target.value)}
                                />
                            </Field>

                            <Field label="Realized P&L" className="md:col-span-2">
                                <NumberInput
                                    value={form.realizedPnl}
                                    onValueChange={(v) => update('realizedPnl', v)}
                                    placeholder="0.00"
                                />
                            </Field>

                            <Field label="Fee Buka">
                                <NumberInput value={form.feeOpen} onValueChange={(v) => update('feeOpen', v)} />
                            </Field>

                            <Field label="Fee Tutup">
                                <NumberInput value={form.feeClose} onValueChange={(v) => update('feeClose', v)} />
                            </Field>

                            <Field
                                label="Funding Fee"
                                hint="Total biaya funding selama posisi terbuka"
                                className="md:col-span-2"
                            >
                                <NumberInput
                                    value={form.fundingFee}
                                    onValueChange={(v) => update('fundingFee', v)}
                                />
                            </Field>
                        </div>
                    </Card>

                    {/* --- Rencana risiko --- */}
                    <Card>
                        <CardHeader
                            title="Rencana Risiko"
                            description="Opsional. Tanpa stop loss, R-multiple bernilai kosong — bukan nol."
                        />
                        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                            <Field
                                label="Stop Loss Direncanakan"
                                hint={
                                    form.entryPrice !== null && form.size !== null
                                        ? 'Akan menghitung nominal risiko otomatis'
                                        : 'Lengkapi entry & size untuk auto-hitung'
                                }
                            >
                                <NumberInput value={form.plannedStop} onValueChange={handlePlannedStopChange} />
                            </Field>
                            <Field label="Target Direncanakan">
                                <NumberInput
                                    value={form.plannedTarget}
                                    onValueChange={(v) => update('plannedTarget', v)}
                                />
                            </Field>
                            <Field
                                label="Nominal Risiko"
                                hint={
                                    form.plannedStop !== null &&
                                    form.entryPrice !== null &&
                                    form.size !== null
                                        ? 'Dihitung dari stop loss · bisa diubah manual'
                                        : 'Dasar perhitungan R'
                                }
                            >
                                <NumberInput value={form.riskAmount} onValueChange={(v) => update('riskAmount', v)} />
                            </Field>
                            <Field
                                label="R-Multiple"
                                hint={
                                    form.riskAmount === null
                                        ? 'Isi nominal risiko untuk menghitung R'
                                        : 'Dihitung otomatis'
                                }
                            >
                                <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3">
                                    <span className="tabular text-sm">{formatR(rPreview)}</span>
                                </div>
                            </Field>
                        </div>
                    </Card>

                    {/* --- Jurnal --- */}
                    <Card>
                        <CardHeader
                            title="Jurnal"
                            description="Catatan subjektif. Tidak pernah ditimpa oleh sync exchange."
                        />
                        <div className="flex flex-col gap-3 p-4">
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                <Field label="Setup / Strategi" hint="Bebas, mis. breakout, pullback">
                                    <TextInput
                                        value={form.setupTag}
                                        onChange={(e) => update('setupTag', e.target.value)}
                                        list="setup-suggestions"
                                    />
                                    <datalist id="setup-suggestions">
                                        {(meta?.setupTags ?? []).map((s) => (
                                            <option key={s} value={s} />
                                        ))}
                                    </datalist>
                                </Field>

                                <Field label="Tag Emosi" hint="Bebas — tambahkan sendiri bila perlu">
                                    <TextInput
                                        value={form.emotionTag}
                                        onChange={(e) => update('emotionTag', e.target.value)}
                                        list="emotion-suggestions"
                                    />
                                    <datalist id="emotion-suggestions">
                                        {[...new Set([...(meta?.emotionTags ?? []), ...DEFAULT_EMOTION_TAGS])].map((t) => (
                                            <option key={t} value={t} />
                                        ))}
                                    </datalist>
                                </Field>

                                <Field
                                    label="Grade Eksekusi"
                                    hint="Menilai PROSES, bukan hasil. Trade rugi bisa bergrade A."
                                >
                                    <Select
                                        value={form.executionGrade ?? ''}
                                        onChange={(e) =>
                                            update('executionGrade', e.target.value === '' ? null : (e.target.value as ExecutionGrade))
                                        }
                                    >
                                        <option value="">—</option>
                                        <option value="A">A — sesuai rencana</option>
                                        <option value="B">B — minor deviasi</option>
                                        <option value="C">C — banyak deviasi</option>
                                        <option value="D">D — melanggar aturan</option>
                                    </Select>
                                </Field>
                            </div>

                            <Field label="Tesis Pre-Trade">
                                <TextArea
                                    value={form.preTradeThesis}
                                    onChange={(e) => update('preTradeThesis', e.target.value)}
                                    placeholder="Kenapa entry ini diambil? Apa yang diharapkan terjadi?"
                                />
                            </Field>

                            <Field label="Review Post-Trade">
                                <TextArea
                                    value={form.postTradeReview}
                                    onChange={(e) => update('postTradeReview', e.target.value)}
                                    placeholder="Apa yang berjalan baik? Apa yang perlu diperbaiki?"
                                />
                            </Field>

                            <div>
                                <p className="mb-2 text-xs font-medium text-muted-foreground">Checklist Aturan</p>
                                <div className="flex flex-col gap-1.5">
                                    {form.checklist.map((item, index) => (
                                        <label key={`${item.label}-${index}`} className="flex items-center gap-2 text-xs">
                                            <input
                                                type="checkbox"
                                                checked={item.checked}
                                                onChange={(e) => {
                                                    const next = [...form.checklist]
                                                    next[index] = { ...item, checked: e.target.checked }
                                                    update('checklist', next)
                                                }}
                                                className="h-3.5 w-3.5 accent-[var(--primary)]"
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                    {form.checklist.length === 0 && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Template checklist belum diatur. Bisa diatur di Settings.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
