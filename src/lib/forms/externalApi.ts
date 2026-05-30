/**
 * フォーム回答を外部API（汎用Webhook）へ送信するためのユーティリティ。
 *
 * - 固定送信フィールド(JSON)を土台に、項目マッピングでフォーム値をドット記法でネスト代入する
 *   （例: 出力キー "hearing_json.customize_137" → { hearing_json: { customize_137: 値 } }）
 * - ヘッダー/固定フィールドのJSON内に書かれた {{API_KEY}} は、復号したAPIキーへ置換する
 *
 * Apollon/39CLOUD CRM の customerDataImport（顧客カラム直下 + hearing_json.customize_NNN）にも、
 * 任意の外部APIにも対応できる汎用設計。
 */

import type { FormField, FormSchema } from './types'

export const API_KEY_PLACEHOLDER = '{{API_KEY}}'

/** 文字列中の {{API_KEY}} を実値へ置換（正規表現を使わずリテラル置換） */
export function substituteApiKey(input: string, apiKey: string): string {
  if (!input) return input
  return input.split(API_KEY_PLACEHOLDER).join(apiKey ?? '')
}

/** "a.b.c" のドットパスでネストしてオブジェクトへ値を代入する */
export function setByPath(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split('.').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {}
    cur = cur[k]
  }
  cur[parts[parts.length - 1]] = value
}

/** 回答値を文字列化（formatAnswersForDisplay と同じ整形ルール） */
function stringifyAnswer(field: FormField | undefined, value: unknown): string {
  if (field && field.type === 'name' && value && typeof value === 'object') {
    const nv = value as { last?: string; first?: string }
    return `${nv.last ?? ''} ${nv.first ?? ''}`.trim()
  }
  if (field && field.type === 'checkbox' && Array.isArray(value)) {
    return value.join(', ')
  }
  if (Array.isArray(value)) return value.join(', ')
  return value == null ? '' : String(value)
}

function fmtDateTimeJst(d: Date): string {
  // 例: "2026/05/30 12:34"
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(/ /g, ' ')
}

function fmtDateJst(d: Date): string {
  // 例: "2026/05/30"
  return d.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

export type ExternalFieldMap = Record<string, string> // source(fieldId | $id | $submittedAt | $submittedDate) → 出力キーパス

/** 送信ペイロードを組み立てる */
export function buildExternalPayload(params: {
  schema: FormSchema
  staticFieldsJson?: string | null
  fieldMap: ExternalFieldMap
  answers: Record<string, unknown>
  submissionId: string
  submittedAt: Date
  apiKey: string
}): Record<string, any> {
  const { schema, staticFieldsJson, fieldMap, answers, submissionId, submittedAt, apiKey } = params

  // 土台: 固定送信フィールド（{{API_KEY}} 置換）
  let payload: Record<string, any> = {}
  if (staticFieldsJson && staticFieldsJson.trim()) {
    const parsed = JSON.parse(substituteApiKey(staticFieldsJson, apiKey))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed
  }

  const fieldById = new Map<string, FormField>()
  for (const f of schema) fieldById.set(f.id, f)

  for (const [source, rawPath] of Object.entries(fieldMap || {})) {
    const path = (rawPath ?? '').trim()
    if (!path) continue
    let value: string
    if (source === '$id') value = submissionId
    else if (source === '$submittedAt') value = fmtDateTimeJst(submittedAt)
    else if (source === '$submittedDate') value = fmtDateJst(submittedAt)
    else value = stringifyAnswer(fieldById.get(source), answers[source])
    setByPath(payload, path, value)
  }

  return payload
}

/** ヘッダーJSONをパースして {{API_KEY}} 置換済みの Record にする */
export function parseHeaders(headersJson: string | null | undefined, apiKey: string): Record<string, string> {
  if (!headersJson || !headersJson.trim()) return {}
  const parsed = JSON.parse(substituteApiKey(headersJson, apiKey))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed)) out[k] = String(v)
  return out
}

export type ExternalPostResult = { ok: boolean; status?: number; error?: string; body?: string }

/** 外部APIへ JSON を POST する */
export async function postToExternalApi(params: {
  url: string
  headers?: Record<string, string>
  payload: unknown
  timeoutMs?: number
}): Promise<ExternalPostResult> {
  try {
    const res = await fetch(params.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(params.headers ?? {}) },
      body: JSON.stringify(params.payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(params.timeoutMs ?? 15000),
    })
    let body = ''
    try { body = (await res.text()).slice(0, 2000) } catch { /* ignore */ }
    if (!res.ok) {
      const host = (() => { try { return new URL(params.url).host } catch { return 'unknown' } })()
      return { ok: false, status: res.status, error: `HTTP ${res.status} (${host})`, body }
    }
    return { ok: true, status: res.status, body }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
