/**
 * Gemini Vision API 経由の各種AI機能
 *
 * 主な使い分け:
 * - 身分証OCR     : extractIdDocumentInfo / extractBackAddress
 * - 市場相場調査    : researchMarketPrice
 * - 買取査定      : appraiseForPurchase
 * - 動画要約      : summarizeVideo
 * - 顔照合       : compareFaces
 *
 * エラー時は GeminiError をスローします。`reason` で原因を判別可能。
 *   - 'no-key'      : GEMINI_API_KEY 未設定
 *   - 'api-error'   : Gemini API 呼び出し失敗（認証 / クォータ / モデル名 等）
 *   - 'parse-error' : レスポンスを JSON として解釈できない
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL_ID = 'gemini-2.5-flash'

export class GeminiError extends Error {
  reason: 'no-key' | 'api-error' | 'parse-error'
  detail?: string

  constructor(reason: 'no-key' | 'api-error' | 'parse-error', message: string, detail?: string) {
    super(message)
    this.name = 'GeminiError'
    this.reason = reason
    this.detail = detail
  }
}

/** 環境変数から APIキーを取得（無ければ throw） */
function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiError('no-key', 'GEMINI_API_KEY が設定されていません')
  }
  return apiKey
}

/** Gemini に投げて JSON テキストとしてパースして返す共通ヘルパー */
export async function callGeminiJson(parts: (string | { inlineData: { mimeType: string; data: string } })[]): Promise<unknown> {
  const apiKey = getApiKey()
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      // Gemini に JSON 形式での回答を強制（前置文や Markdown 装飾を防ぐ）
      responseMimeType: 'application/json',
    },
  })

  let rawText: string
  try {
    const result = await model.generateContent(parts)
    rawText = result.response.text().trim()
  } catch (err: any) {
    const detail = err?.message ?? String(err)
    console.error('[gemini] API呼び出し失敗:', detail)
    throw new GeminiError('api-error', `Gemini API エラー: ${detail}`, detail)
  }

  try {
    // responseMimeType=application/json で素のJSONが返るはずだが、
    // 念のため code fence を剥がしてからパース
    const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(jsonStr)
  } catch (err: any) {
    const detail = err?.message ?? String(err)
    console.error('[gemini] JSON パース失敗:', detail, '\nraw:', rawText.slice(0, 500))
    throw new GeminiError('parse-error', `Gemini レスポンスの JSON パースに失敗: ${detail}`, rawText.slice(0, 500))
  }
}

/* ─── 身分証 OCR ──────────────────────────────────────── */

export type IdDocumentOcrResult = {
  idDocumentType:  string | null
  idName:          string | null
  idBirthDate:     string | null
  idAddress:       string | null
  idLicenseNumber: string | null
  idExpiryDate:    string | null
}

const ID_DOCUMENT_PROMPT = `この画像は日本の身分証明書です。以下の情報を正確に読み取り、JSON形式で返してください。

抽出する項目:
- documentType: 書類の種類（「運転免許証」「パスポート」「マイナンバーカード」「健康保険証」「在留カード」など）
- name: 氏名（漢字フルネーム）
- birthDate: 生年月日（「YYYY-MM-DD」形式。和暦は西暦に変換。例: 昭和45年3月15日→1970-03-15）
- address: 住所（記載の通りに）
- idNumber: 免許番号/旅券番号/証明書番号など（書類の種類に応じた番号）
- expiryDate: 有効期限（「YYYY-MM-DD」形式。和暦は西暦に変換）

読み取れない・該当しない項目はnullにしてください。
マイナンバー（12桁の個人番号）は絶対に含めないでください。
例: {"documentType":"運転免許証","name":"山田太郎","birthDate":"1985-06-20","address":"東京都新宿区西新宿1-1-1","idNumber":"123456789012","expiryDate":"2028-06-20"}`

export async function extractIdDocumentInfo(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<IdDocumentOcrResult> {
  const parsed = await callGeminiJson([
    ID_DOCUMENT_PROMPT,
    { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
  ]) as Record<string, unknown>

  return {
    idDocumentType:  (parsed.documentType  as string) ?? null,
    idName:          (parsed.name          as string) ?? null,
    idBirthDate:     (parsed.birthDate     as string) ?? null,
    idAddress:       (parsed.address       as string) ?? null,
    idLicenseNumber: (parsed.idNumber      as string) ?? null,
    idExpiryDate:    (parsed.expiryDate    as string) ?? null,
  }
}

const BACK_ADDRESS_PROMPT = `この身分証明書の裏面画像から、新住所（住所変更記載）を読み取ってください。新住所の記載がない場合はnullを返してください。JSON形式で {"newAddress": string | null} を返してください。`

export async function extractBackAddress(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const parsed = await callGeminiJson([
    BACK_ADDRESS_PROMPT,
    { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
  ]) as Record<string, unknown>

  return (parsed.newAddress as string) ?? null
}

/* ─── 市場相場調査 ────────────────────────────────────── */

export type MarketResearchResult = {
  productDetail: string
  estimatedCondition: string
  maxPrice: string
  minPrice: string
  platforms: string
  supplement: string
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

すべての値は文字列型で返してください（配列やオブジェクトは使わないでください）。
価格は日本円で、現在の市場相場に基づいて現実的な金額を記載してください。`

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

export async function researchMarketPrice(
  itemName: string,
  category: string,
  images: ImageData[] = [],
): Promise<MarketResearchResult> {
  const userPrompt = images.length > 0
    ? `商品名: ${itemName}\nカテゴリー: ${category}\n\n添付の${images.length}枚の画像を分析し、商品を正確に特定してください。ロゴ、型番、ラベル、シリアルナンバーなどを注意深く読み取ってください。`
    : `商品名: ${itemName}\nカテゴリー: ${category}\n\n（画像なし。商品名とカテゴリーから推測してください）`

  const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [
    MARKET_RESEARCH_PROMPT,
    userPrompt,
  ]
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.buffer.toString('base64') } })
  }

  const parsed = await callGeminiJson(parts) as Record<string, unknown>
  return {
    productDetail:      stringify(parsed.productDetail),
    estimatedCondition: stringify(parsed.estimatedCondition),
    maxPrice:           stringify(parsed.maxPrice),
    minPrice:           stringify(parsed.minPrice),
    platforms:          stringify(parsed.platforms),
    supplement:         stringify(parsed.supplement),
  }
}

/* ─── 買取査定 ────────────────────────────────────────── */

export type PurchaseAppraisalResult = {
  productDetail: string
  offerPrice: string
  offerReason: string
  supplement: string
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

すべての値は文字列型で返してください（配列やオブジェクトは使わないでください）。
価格は日本円で、現在の市場相場に基づいて現実的な金額を記載してください。`

export async function appraiseForPurchase(
  title: string,
  description: string | null,
  images: ImageData[] = [],
): Promise<PurchaseAppraisalResult> {
  let userPrompt = `品名: ${title}`
  if (description) userPrompt += `\n詳細説明: ${description}`
  userPrompt += images.length > 0
    ? `\n\n添付の${images.length}枚の画像を分析し、商品を正確に特定してください。ロゴ、型番、ラベル、シリアルナンバーなどを注意深く読み取ってください。`
    : `\n\n（画像なし。品名と説明から推測してください）`

  const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [
    PURCHASE_APPRAISAL_PROMPT,
    userPrompt,
  ]
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.buffer.toString('base64') } })
  }

  const parsed = await callGeminiJson(parts) as Record<string, unknown>
  return {
    productDetail: stringify(parsed.productDetail),
    offerPrice:    stringify(parsed.offerPrice),
    offerReason:   stringify(parsed.offerReason),
    supplement:    stringify(parsed.supplement),
  }
}

/* ─── 動画要約 ────────────────────────────────────────── */

export type VideoSummaryResult = {
  summary: string
  keyPoints: string[]
}

const VIDEO_SUMMARY_PROMPT = `あなたは企業研修の専門家です。以下のYouTube動画の内容を分析し、研修資料として活用できるよう要約してください。

【出力形式】JSON形式で以下の項目を返してください。すべて文字列で返してください（keyPointsのみ文字列の配列）。

- summary: 動画の内容を500〜1000文字程度で要約。研修を受ける人が事前に読んで概要を把握できる内容にしてください。段落分けして読みやすくしてください。
- keyPoints: 動画の重要ポイントを5〜10項目の配列で。各項目は1〜2文の簡潔な説明。

「対象」「難易度」「所要時間」などのメタ情報は含めないでください。
日本語で回答してください。`

export async function summarizeVideo(
  youtubeUrl: string,
  title: string,
  description?: string | null,
): Promise<VideoSummaryResult> {
  let userPrompt = `動画タイトル: ${title}\nYouTube URL: ${youtubeUrl}`
  if (description) userPrompt += `\n動画説明: ${description}`
  userPrompt += '\n\nこの動画の内容を分析し、研修資料として要約してください。'

  const parsed = await callGeminiJson([VIDEO_SUMMARY_PROMPT, userPrompt]) as Record<string, unknown>
  return {
    summary:   typeof parsed.summary === 'string' ? parsed.summary : '要約を取得できませんでした',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
  }
}

/* ─── 顔照合 ──────────────────────────────────────────── */

export type FaceComparisonResult = {
  match: boolean
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

const FACE_COMPARISON_PROMPT = `あなたは本人確認の専門家です。以下の2枚の顔写真を比較し、同一人物かどうかを判定してください。

【判定基準】
1. 顔の輪郭、目、鼻、口、眉毛などの特徴を総合的に比較する
2. 髪型、メガネの有無、化粧の違いなどは考慮しない（同一人物でも変わりうるため）
3. 撮影角度や照明の違いも考慮する

【1枚目】身分証明書から抽出した顔写真
【2枚目】本人が撮影したセルフィー写真

以下のJSON形式で回答してください:
- match: 同一人物と判定した場合 true、そうでない場合 false（真偽値）
- confidence: 判定の確信度（"high"=高い確信 / "medium"=中程度 / "low"=低い確信）
- reason: 判定理由の説明（日本語で簡潔に）

例: {"match":true,"confidence":"high","reason":"顔の輪郭・目・鼻の特徴が一致しており、同一人物と判定しました。"}`

export async function compareFaces(
  idFaceImageUrl: string,
  selfieImageUrl: string,
): Promise<FaceComparisonResult> {
  // 2枚の画像をダウンロードしてbase64に変換
  const [idFaceRes, selfieRes] = await Promise.all([
    fetch(idFaceImageUrl),
    fetch(selfieImageUrl),
  ])
  if (!idFaceRes.ok || !selfieRes.ok) {
    throw new GeminiError('api-error', '顔画像のダウンロードに失敗しました')
  }

  const idFaceBuffer = Buffer.from(await idFaceRes.arrayBuffer())
  const selfieBuffer = Buffer.from(await selfieRes.arrayBuffer())
  const idFaceMime = idFaceRes.headers.get('content-type') || 'image/jpeg'
  const selfieMime = selfieRes.headers.get('content-type') || 'image/jpeg'

  const parsed = await callGeminiJson([
    FACE_COMPARISON_PROMPT,
    { inlineData: { mimeType: idFaceMime, data: idFaceBuffer.toString('base64') } },
    { inlineData: { mimeType: selfieMime, data: selfieBuffer.toString('base64') } },
  ]) as Record<string, unknown>

  const confidence = ['high', 'medium', 'low'].includes(parsed.confidence as string)
    ? (parsed.confidence as 'high' | 'medium' | 'low')
    : 'low'

  return {
    match:      Boolean(parsed.match),
    confidence,
    reason:     typeof parsed.reason === 'string' ? parsed.reason : '判定理由を取得できませんでした',
  }
}
