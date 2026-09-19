/**
 * Service AI Insights — analisa journal via OpenAI API (fitur 6).
 *
 * ===========================================================================
 * DESAIN
 * ===========================================================================
 *
 * - Memakai OpenAI Chat Completions API (compatibel dengan provider OpenAI-compatible).
 * - API key disimpan via safeStorage (lihat `ai-keystore.ts`).
 * - Model name dan base URL disimpan di tabel settings (bukan kredensial).
 * - Prompt terstruktur dalam Bahasa Indonesia, meminta output JSON stabil.
 * - Data trade di-serialisasi ringkas: hanya field yang relevan untuk analisis.
 *
 * KEAMANAN:
 * - API key TIDAK PERNAH dikirim ke renderer.
 * - Request ke API dilakukan dari main process, bukan renderer.
 * - Tidak ada data PII yang dikirim selain yang sudah ada di journal trade user.
 */

import { getDb } from '../db/index'
import { getSetting, setSetting, SETTING_KEYS } from '../db/repositories/settings'
import { listTrades } from '../db/repositories/trades'
import { loadAiApiKey, saveAiApiKey, deleteAiApiKey, getAiKeyHint, isSecureStorageAvailable } from '../credentials/ai-keystore'
import type { AiConfigPayload, AiConfigStatus, JournalAnalysisResult, TradeFilterPayload } from '../../shared/ipc-contract'
import type { TradeDetail } from '../../shared/domain'
import { logger } from '../utils/logger'

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

export function getAiConfig(): AiConfigStatus {
    const db = getDb()
    const model = getSetting<string>(db, SETTING_KEYS.aiModel, DEFAULT_MODEL)
    const baseUrl = getSetting<string>(db, SETTING_KEYS.aiBaseUrl, DEFAULT_BASE_URL)
    const keyHint = getAiKeyHint()
    return {
        configured: keyHint !== null,
        model,
        baseUrl,
        keyHint
    }
}

export function saveAiConfig(payload: AiConfigPayload): void {
    if (!isSecureStorageAvailable()) {
        throw new Error('Penyimpanan aman OS tidak tersedia. API key tidak disimpan.')
    }
    saveAiApiKey(payload.apiKey)
    const db = getDb()
    if (payload.model) {
        setSetting(db, SETTING_KEYS.aiModel, payload.model)
    }
    if (payload.baseUrl) {
        setSetting(db, SETTING_KEYS.aiBaseUrl, payload.baseUrl)
    }
    logger.info('[ai] Konfigurasi AI disimpan.')
}

export function deleteAiConfig(): void {
    deleteAiApiKey()
    logger.info('[ai] Konfigurasi AI dihapus.')
}

// ---------------------------------------------------------------------------
// Analisa journal
// -----------------------------------------------------------------------

export async function analyzeJournal(filter?: TradeFilterPayload): Promise<JournalAnalysisResult> {
    const apiKey = loadAiApiKey()
    if (!apiKey) {
        throw new Error('API key AI belum dikonfigurasi. Atur di Settings terlebih dahulu.')
    }

    const db = getDb()
    const model = getSetting<string>(db, SETTING_KEYS.aiModel, DEFAULT_MODEL)
    const baseUrl = getSetting<string>(db, SETTING_KEYS.aiBaseUrl, DEFAULT_BASE_URL)
    const trades = listTrades(db, filter ?? {})

    if (trades.length === 0) {
        throw new Error('Tidak ada trade untuk dianalisis.')
    }

    const prompt = buildPrompt(trades)
    const response = await callOpenAI(apiKey, model, baseUrl, prompt)
    return parseResponse(response)
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(trades: TradeDetail[]): string {
    const tradeData = trades.map((d) => {
        const { trade, journal, plannedRisk, tags, rMultiple } = d
        return {
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice,
            realizedPnl: trade.realizedPnl,
            rMultiple,
            plannedRr: plannedRisk?.plannedRr ?? null,
            feeTotal: trade.feeOpen + trade.feeClose + trade.fundingFee,
            setupTag: journal?.setupTag ?? null,
            emotionTag: journal?.emotionTag ?? null,
            executionGrade: journal?.executionGrade ?? null,
            tags: tags.map((t) => t.name),
            thesis: journal?.preTradeThesis ?? null,
            review: journal?.postTradeReview ?? null
        }
    })

    const stats = {
        totalTrades: trades.length,
        wins: trades.filter((d) => d.trade.realizedPnl > 0).length,
        losses: trades.filter((d) => d.trade.realizedPnl < 0).length,
        netPnl: trades.reduce((s, d) => s + d.trade.realizedPnl, 0),
        avgR: trades.filter((d) => d.rMultiple !== null).length > 0
            ? trades.filter((d) => d.rMultiple !== null).reduce((s, d) => s + (d.rMultiple ?? 0), 0) / trades.filter((d) => d.rMultiple !== null).length
            : null
    }

    return `Anda adalah analis trading profesional. Analisa journal trading berikut dan berikan wawasan dalam Bahasa Indonesia.

STATISTIK RINGKAS:
- Total trade: ${stats.totalTrades}
- Win/Loss: ${stats.wins}/${stats.losses}
- P&L bersih total: ${stats.netPnl.toFixed(2)}
- Rata-rata R-multiple: ${stats.avgR !== null ? stats.avgR.toFixed(2) : 'tidak tersedia'}

DATA TRADE:
${JSON.stringify(tradeData, null, 2)}

Instruksi:
1. Identifikasi pola kelemahan (mis. sering revenge trade setelah loss, win rate rendah di sesi tertentu, grade eksekusi buruk).
2. Berikan saran perbaikan yang konkret dan dapat ditindaklanjuti.
3. Jangan mengulang teori umum — fokus pada pola yang terlihat di data.

Format respons WAJIB JSON:
{
  "summary": "Ringkasan satu paragraf",
  "weaknesses": ["Kelemahan 1", "Kelemahan 2", ...],
  "suggestions": ["Saran 1", "Saran 2", ...],
  "metrics": [{"label": "Win Rate", "value": "45%"}, ...]
}`
}

// ---------------------------------------------------------------------------
// OpenAI API call
// -----------------------------------------------------------------------

async function callOpenAI(apiKey: string, model: string, baseUrl: string, prompt: string): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = {
        model,
        messages: [
            {
                role: 'system',
                content: 'Anda adalah asisten analisis trading journal. Selalu respons dengan JSON yang valid sesuai format yang diminta.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API error ${response.status}: ${errorText}`)
    }

    const data = await response.json() as {
        choices: { message: { content: string } }[]
    }

    if (!data.choices || data.choices.length === 0) {
        throw new Error('Respons API tidak memiliki choices.')
    }

    const choice = data.choices[0]
    if (!choice?.message?.content) {
        throw new Error('Respons API tidak memiliki content.')
    }
    return choice.message.content
}

// ---------------------------------------------------------------------------
// Parse response
// -----------------------------------------------------------------------

function parseResponse(content: string): JournalAnalysisResult {
    try {
        const parsed = JSON.parse(content) as JournalAnalysisResult
        if (!parsed.summary || !Array.isArray(parsed.weaknesses) || !Array.isArray(parsed.suggestions)) {
            throw new Error('Struktur JSON tidak sesuai.')
        }
        return {
            summary: parsed.summary,
            weaknesses: parsed.weaknesses,
            suggestions: parsed.suggestions,
            metrics: parsed.metrics
        }
    } catch {
        // Fallback: bila model tidak mengembalikan JSON valid, bungkus content mentah.
        return {
            summary: content.slice(0, 500),
            weaknesses: ['Respons AI tidak terstruktur dengan benar.'],
            suggestions: ['Coba model lain atau ulangi analisis.']
        }
    }
}
