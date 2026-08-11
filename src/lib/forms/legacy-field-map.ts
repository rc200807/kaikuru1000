import { isInputField, type FormField, type FormSchema } from './types'

/**
 * 設問を「削除して作り直す」と項目IDが変わり、それ以前の回答は現在の設問と結びつかなくなる。
 * Form.legacyFieldMap（{ 過去の回答キー: 現在のfieldId }）でその対応を持ち、
 * 表示・CSV出力の直前に現在の設問へ寄せ直す。保存されている回答自体は書き換えない。
 */
export type LegacyFieldMap = Record<string, string>

export function parseLegacyFieldMap(json: string | null | undefined): LegacyFieldMap {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: LegacyFieldMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** 値が「未回答」か（空文字・空配列・空オブジェクトも未回答とみなす） */
function isEmptyAnswer(v: unknown): boolean {
  if (v == null || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

/** 移し先の設問の型に合わせて値を整える（チェックボックスは配列、それ以外は単一値） */
function coerceForField(field: FormField | undefined, v: unknown): unknown {
  if (!field) return v
  if (field.type === 'checkbox') {
    if (Array.isArray(v)) return v
    if (typeof v === 'string') return v === '' ? [] : [v]
    return v
  }
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  return v
}

/**
 * 過去の回答キーを現在の設問IDへ寄せ直した回答データを返す。
 * 現在の設問に既に回答がある場合は上書きしない（現在の値が正）。
 */
export function applyLegacyFieldMap(
  schema: FormSchema,
  data: Record<string, unknown>,
  map: LegacyFieldMap,
): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  if (Object.keys(map).length === 0) return data

  const fieldById = new Map<string, FormField>()
  for (const f of schema) {
    if (isInputField(f)) fieldById.set(f.id, f)
  }

  const out: Record<string, unknown> = { ...data }
  for (const [legacyKey, targetId] of Object.entries(map)) {
    if (!(legacyKey in out)) continue
    const value = out[legacyKey]
    // 移せなかったものは元のキーのまま残す（消すと値ごと画面から消えてしまう）
    if (!fieldById.has(targetId)) continue // 移し先の設問が既に無い
    if (isEmptyAnswer(value)) continue
    if (!isEmptyAnswer(out[targetId])) continue // 現在の回答を優先
    out[targetId] = coerceForField(fieldById.get(targetId), value)
    delete out[legacyKey]
  }
  return out
}

/** 現在の設問にも対応表にも無い回答キー（＝割り当て待ち）を、代表的な値つきで集める */
export function collectUnassignedAnswers(
  schema: FormSchema,
  dataList: Record<string, unknown>[],
  map: LegacyFieldMap,
): { key: string; samples: string[]; count: number }[] {
  const known = new Set(schema.filter(isInputField).map((f) => f.id))
  const found = new Map<string, { key: string; samples: string[]; count: number }>()
  for (const data of dataList) {
    if (!data || typeof data !== 'object') continue
    for (const [k, v] of Object.entries(data)) {
      if (known.has(k) || map[k]) continue
      if (isEmptyAnswer(v)) continue
      const entry = found.get(k) ?? { key: k, samples: [], count: 0 }
      entry.count++
      const s = Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
      if (s && entry.samples.length < 3 && !entry.samples.includes(s)) entry.samples.push(s)
      found.set(k, entry)
    }
  }
  return [...found.values()]
}

/**
 * 回答の中身から移し先の設問を推測する。
 * 選択肢を持つ設問は、保存されている値が選択肢に含まれるかで判定できるので確度が高い。
 * 推測できないものは null（画面側で手動選択させる）。
 */
export function suggestLegacyTarget(schema: FormSchema, samples: string[]): string | null {
  const values = samples.flatMap((s) => s.split(', ')).map((s) => s.trim()).filter(Boolean)
  if (values.length === 0) return null

  let best: { id: string; score: number } | null = null
  for (const f of schema) {
    if (!isInputField(f)) continue
    if (!('options' in f) || !Array.isArray(f.options) || f.options.length === 0) continue
    const hit = values.filter((v) => f.options.includes(v)).length
    if (hit === 0) continue
    const score = hit / values.length
    if (!best || score > best.score) best = { id: f.id, score }
  }
  return best && best.score >= 0.5 ? best.id : null
}
