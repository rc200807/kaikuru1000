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
