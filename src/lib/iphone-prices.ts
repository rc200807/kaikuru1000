import { prisma } from '@/lib/prisma'
import { IPHONE_SERIES } from '@/lib/iphone-models'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// 1シリーズ分の価格をGeminiに問い合わせる
async function fetchSeriesPrices(seriesName: string, models: { model: string; storages: string[] }[]): Promise<{
  model: string; storage: string; gradeA: number; gradeB: number; gradeC: number
}[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')

  const modelList = models.map(m =>
    `${m.model}（${m.storages.join('/')}）`
  ).join('\n')

  const prompt = `あなたは日本の中古スマートフォン市場の専門家です。
以下のiPhoneモデルの日本国内における中古買取相場価格（円）を教えてください。

対象モデル:
${modelList}

以下のJSON形式のみで回答してください。説明文や他のテキストは一切不要です。

[
  {
    "model": "モデル名",
    "storage": "容量",
    "gradeA": 買取相場（A評価・美品）の数値,
    "gradeB": 買取相場（B評価・並品）の数値,
    "gradeC": 買取相場（C評価・難あり）の数値
  }
]

注意:
- 価格は日本円の整数で返してください（¥マークや「円」は不要）
- 実際に流通している相場に基づいた現実的な価格にしてください
- 古すぎて市場価値がほぼないモデルは 500〜2000 程度にしてください`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    }
  )

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)

  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // JSONを抽出
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`JSON parse error: ${text.substring(0, 200)}`)

  return JSON.parse(jsonMatch[0])
}

// 全iPhoneシリーズの価格を取得してDBに保存
export async function refreshAllIPhonePrices(): Promise<{
  success: boolean
  saved: number
  errors: string[]
}> {
  const errors: string[] = []
  let saved = 0

  for (const series of IPHONE_SERIES) {
    try {
      const prices = await fetchSeriesPrices(series.series, series.models)

      for (const p of prices) {
        await prisma.phoneMarketPrice.upsert({
          where: { model_storage: { model: p.model, storage: p.storage } },
          create: {
            model: p.model,
            series: series.series,
            storage: p.storage,
            gradeA: p.gradeA,
            gradeB: p.gradeB,
            gradeC: p.gradeC,
            source: 'gemini',
            fetchedAt: new Date(),
          },
          update: {
            gradeA: p.gradeA,
            gradeB: p.gradeB,
            gradeC: p.gradeC,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        saved++
      }

      // Rate limit: 各シリーズ間に1秒待機
      await new Promise(r => setTimeout(r, 1000))
    } catch (e: any) {
      errors.push(`${series.series}: ${e.message}`)
    }
  }

  return { success: errors.length === 0, saved, errors }
}
