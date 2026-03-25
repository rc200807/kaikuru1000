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

/**
 * 身分証明書の裏面画像から新住所を抽出する
 *
 * @param imageBuffer  画像のバイナリデータ
 * @param mimeType     画像のMIMEタイプ（image/jpeg, image/png など）
 * @returns 新住所文字列。記載がない場合やエラー時は null
 */
export async function extractBackAddress(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[gemini] GEMINI_API_KEY が未設定のため裏面OCRをスキップします')
    return null
  }

  const BACK_PROMPT = `この身分証明書の裏面画像から、新住所（住所変更記載）を読み取ってください。新住所の記載がない場合はnullを返してください。JSON形式で {"newAddress": string | null} を返してください。`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContent([
      BACK_PROMPT,
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString('base64'),
        },
      },
    ])

    const text = result.response.text().trim()
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr)

    return parsed.newAddress ?? null
  } catch (err) {
    console.error('[gemini] 裏面OCR失敗:', err)
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

/* ─── 買取相談メモ AI 査定 ─── */

export type PurchaseAppraisalResult = {
  productDetail: string     // 商品の詳細情報
  offerPrice: string        // 買取提示額
  offerReason: string       // 提示額の根拠
  supplement: string        // 補足情報
}

const PURCHASE_APPRAISAL_PROMPT = `あなたは中古品の買取業者の査定専門家です。以下の商品について、買取業者として買い取れる金額を算出してください。

【査定ルール】
1. 中古市場での販売相場を調査し、その30〜50%程度を買取提示額として算出する
2. 提示額の根拠を分かりやすく説明する
3. 買取業者の立場で、現実的な買取可能金額を提示する

【重要】画像が添付されている場合は、画像を注意深く分析してください。
画像から以下を読み取ってください:
- メーカー名・ブランド名（ロゴ、刻印、ラベルなど）
- 型番・モデル名（本体やラベルに記載されている英数字）
- 製造年・年式（ラベル、シリアルナンバーなどから推測）
- 商品の状態・コンディション（傷、汚れ、使用感の程度）
- 色、サイズ、素材などの特徴

回答する項目（すべて文字列で返してください）:
- productDetail: 商品の詳細情報（メーカー名、正式な商品名、型番、発売年、色、サイズなど。画像から読み取れた情報をすべて含める）
- offerPrice: 買取提示額（"¥XX,XXX" の形式で単一の金額。買取業者が買い取れる現実的な金額）
- offerReason: 提示額の根拠（市場相場からどのように算出したか、簡潔に説明）
- supplement: 補足情報（査定時の注意点、付属品の有無による価格変動、コンディションによる変動幅など）

必ずJSONのみ返してください。説明文は不要です。
すべての値は文字列型で返してください（配列やオブジェクトは使わないでください）。
価格は日本円で、現在の市場相場に基づいて現実的な金額を記載してください。`

/**
 * 買取相談メモのAI査定を行う（画像解析対応）
 *
 * @param title       品名タイトル
 * @param description 詳細説明（任意）
 * @param images      商品画像データ（任意）
 * @returns 査定結果。APIキー未設定またはエラー時は null
 */
export async function appraiseForPurchase(
  title: string,
  description: string | null,
  images: ImageData[] = [],
): Promise<PurchaseAppraisalResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[gemini] GEMINI_API_KEY が未設定のためAI査定をスキップします')
    return null
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    let userPrompt = `品名: ${title}`
    if (description) userPrompt += `\n詳細説明: ${description}`

    if (images.length > 0) {
      userPrompt += `\n\n添付の${images.length}枚の画像を分析し、商品を正確に特定してください。ロゴ、型番、ラベル、シリアルナンバーなどを注意深く読み取ってください。`
    } else {
      userPrompt += `\n\n（画像なし。品名と説明から推測してください）`
    }

    const contents: (string | { inlineData: { mimeType: string; data: string } })[] = [
      PURCHASE_APPRAISAL_PROMPT,
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
      productDetail:   stringify(parsed.productDetail),
      offerPrice:      stringify(parsed.offerPrice),
      offerReason:     stringify(parsed.offerReason),
      supplement:      stringify(parsed.supplement),
    }
  } catch (err) {
    console.error('[gemini] AI査定失敗:', err)
    return null
  }
}

/* ─── 研修動画 AI 要約 ─── */

export type VideoSummaryResult = {
  summary: string        // 動画の要約（500〜1000文字程度）
  keyPoints: string[]    // 重要ポイント（5〜10項目）
}

const VIDEO_SUMMARY_PROMPT = `あなたは企業研修の専門家です。以下のYouTube動画の内容を分析し、研修資料として活用できるよう要約してください。

【出力形式】JSON形式で以下の項目を返してください。すべて文字列で返してください（keyPointsのみ文字列の配列）。

- summary: 動画の内容を500〜1000文字程度で要約。研修を受ける人が事前に読んで概要を把握できる内容にしてください。段落分けして読みやすくしてください。
- keyPoints: 動画の重要ポイントを5〜10項目の配列で。各項目は1〜2文の簡潔な説明。

必ずJSONのみ返してください。説明文は不要です。
「対象」「難易度」「所要時間」などのメタ情報は含めないでください。
日本語で回答してください。`

/**
 * YouTube動画の内容をAIで要約する
 *
 * @param youtubeUrl YouTube動画のURL
 * @param title      動画のタイトル（補助情報）
 * @param description 動画の説明（補助情報）
 * @returns 要約結果。APIキー未設定またはエラー時は null
 */
export async function summarizeVideo(
  youtubeUrl: string,
  title: string,
  description?: string | null,
): Promise<VideoSummaryResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[gemini] GEMINI_API_KEY が未設定のため動画要約をスキップします')
    return null
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    let userPrompt = `動画タイトル: ${title}\nYouTube URL: ${youtubeUrl}`
    if (description) {
      userPrompt += `\n動画説明: ${description}`
    }
    userPrompt += '\n\nこの動画の内容を分析し、研修資料として要約してください。'

    const result = await model.generateContent([
      VIDEO_SUMMARY_PROMPT,
      userPrompt,
    ])

    const text = result.response.text().trim()
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(jsonStr)

    return {
      summary:        typeof parsed.summary === 'string' ? parsed.summary : '要約を取得できませんでした',
      keyPoints:      Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
    }
  } catch (err) {
    console.error('[gemini] 動画要約失敗:', err)
    return null
  }
}
