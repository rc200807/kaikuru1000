/**
 * Gemini Vision API を使った身分証明書OCR
 *
 * 抽出フィールド:
 *   - idDocumentType  書類種別（運転免許証/パスポート/マイナンバーカードなど）
 *   - idName          氏名
 *   - idBirthDate     生年月日
 *   - idAddress       住所
 *   - idLicenseNumber 免許番号・旅券番号など
 *   - idExpiryDate    有効期限
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export type IdDocumentOcrResult = {
  idDocumentType:  string | null
  idName:          string | null
  idBirthDate:     string | null
  idAddress:       string | null
  idLicenseNumber: string | null
  idExpiryDate:    string | null
}

const PROMPT = `この画像は日本の身分証明書です。以下の情報を正確に読み取り、JSON形式で返してください。

抽出する項目:
- documentType: 書類の種類（「運転免許証」「パスポート」「マイナンバーカード」「健康保険証」「在留カード」など）
- name: 氏名（漢字フルネーム）
- birthDate: 生年月日（「YYYY-MM-DD」形式。和暦は西暦に変換。例: 昭和45年3月15日→1970-03-15）
- address: 住所（記載の通りに）
- idNumber: 免許番号/旅券番号/証明書番号など（書類の種類に応じた番号）
- expiryDate: 有効期限（「YYYY-MM-DD」形式。和暦は西暦に変換）

読み取れない・該当しない項目はnullにしてください。
マイナンバー（12桁の個人番号）は絶対に含めないでください。

必ずJSONのみ返してください。説明文は不要です。
例: {"documentType":"運転免許証","name":"山田太郎","birthDate":"1985-06-20","address":"東京都新宿区西新宿1-1-1","idNumber":"123456789012","expiryDate":"2028-06-20"}`

/**
 * 身分証明書画像からテキスト情報を抽出する
 *
 * @param imageBuffer  画像のバイナリデータ
 * @param mimeType     画像のMIMEタイプ（image/jpeg, image/png など）
 * @returns 抽出結果。APIキー未設定またはエラー時は null
 */
export async function extractIdDocumentInfo(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<IdDocumentOcrResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[gemini] GEMINI_API_KEY が未設定のためOCRをスキップします')
    return null
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContent([
      PROMPT,
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString('base64'),
        },
      },
    ])

    const text = result.response.text().trim()

    // ```json ... ``` で囲まれている場合に対応
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr)

    return {
      idDocumentType:  parsed.documentType  ?? null,
      idName:          parsed.name          ?? null,
      idBirthDate:     parsed.birthDate     ?? null,
      idAddress:       parsed.address       ?? null,
      idLicenseNumber: parsed.idNumber      ?? null,
      idExpiryDate:    parsed.expiryDate    ?? null,
    }
  } catch (err) {
    console.error('[gemini] OCR失敗:', err)
    return null
  }
}

/* ─── 中古市場 AI 調査 ─── */

export type MarketResearchResult = {
  productDetail: string    // 商品名や型番などの詳細
  estimatedCondition: string // 想定コンディション
  maxPrice: string         // 中古市場での最高値
  minPrice: string         // 中古市場での最安値
  platforms: string        // 主な取引プラットフォーム
  supplement: string       // 補足情報
}

export type ImageData = {
  buffer: Buffer
  mimeType: string
}

const MARKET_RESEARCH_PROMPT = `あなたは中古品の買取査定の専門家です。以下の商品について、日本の中古市場における取引相場を調査し、JSON形式で回答してください。

【重要】画像が添付されている場合は、画像を注意深く分析してください。
画像から以下を読み取ってください:
- メーカー名・ブランド名（ロゴ、刻印、ラベルなど）
- 型番・モデル名（本体やラベルに記載されている英数字）
- 製造年・年式（ラベル、シリアルナンバーなどから推測）
- 商品の状態・コンディション（傷、汚れ、使用感の程度）
- 色、サイズ、素材などの特徴

画像から特定できた情報をもとに、できるだけ具体的な商品を特定し、正確な市場相場を回答してください。

回答する項目（すべて文字列で返してください）:
- productDetail: 商品の詳細情報（メーカー名、正式な商品名、型番、発売年、色、サイズなど。画像から読み取れた情報をすべて含める）
- estimatedCondition: 画像から判断した商品のコンディション（S/A/B/C/Dランクで判定し、具体的な状態の説明も付ける）
- maxPrice: 中古市場での最高値の目安（良品〜美品の場合。"¥XX,XXX〜¥XX,XXX" の形式で）
- minPrice: 中古市場での最安値の目安（難あり・ジャンク品の場合。"¥XX,XXX〜¥XX,XXX" の形式で）
- platforms: 主な取引プラットフォーム（カンマ区切りの文字列で。例: "メルカリ、ヤフオク、楽天ラクマ"）
- supplement: 補足情報（査定時の注意点、付属品の有無による価格差、市場トレンドなど）

必ずJSONのみ返してください。説明文は不要です。
すべての値は文字列型で返してください（配列やオブジェクトは使わないでください）。
価格は日本円で、現在の市場相場に基づいて現実的な金額を記載してください。`

/**
 * 中古市場のAI調査を行う（画像解析対応）
 *
 * @param itemName   品名（例: "ルイヴィトン ネヴァーフル MM"）
 * @param category   カテゴリー（例: "バッグ"）
 * @param images     商品画像データ（最大3枚）
 * @returns 調査結果。APIキー未設定またはエラー時は null
 */
export async function researchMarketPrice(
  itemName: string,
  category: string,
  images: ImageData[] = [],
): Promise<MarketResearchResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[gemini] GEMINI_API_KEY が未設定のためAI調査をスキップします')
    return null
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const userPrompt = images.length > 0
      ? `商品名: ${itemName}\nカテゴリー: ${category}\n\n添付の${images.length}枚の画像を分析し、商品を正確に特定してください。ロゴ、型番、ラベル、シリアルナンバーなどを注意深く読み取ってください。`
      : `商品名: ${itemName}\nカテゴリー: ${category}\n\n（画像なし。商品名とカテゴリーから推測してください）`

    // プロンプト + 画像データを組み立て
    const contents: (string | { inlineData: { mimeType: string; data: string } })[] = [
      MARKET_RESEARCH_PROMPT,
      userPrompt,
    ]

    for (const img of images) {
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.buffer.toString('base64'),
        },
      })
    }

    const result = await model.generateContent(contents)

    const text = result.response.text().trim()
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr)

    // 値がオブジェクトや配列の場合は文字列に変換
    const stringify = (v: unknown): string => {
      if (v == null) return '不明'
      if (typeof v === 'string') return v
      if (Array.isArray(v)) return v.join('、')
      if (typeof v === 'object') {
        return Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val && val !== '（不明）' && val !== '不明')
          .map(([, val]) => String(val))
          .join(' / ') || '不明'
      }
      return String(v)
    }

    return {
      productDetail:      stringify(parsed.productDetail),
      estimatedCondition: stringify(parsed.estimatedCondition),
      maxPrice:           stringify(parsed.maxPrice),
      minPrice:           stringify(parsed.minPrice),
      platforms:          stringify(parsed.platforms),
      supplement:         stringify(parsed.supplement),
    }
  } catch (err) {
    console.error('[gemini] 市場調査失敗:', err)
    return null
  }
}
