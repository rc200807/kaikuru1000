import { z } from 'zod'
import type { FormField, FormSchema } from './types'
import { PREFECTURES } from './types'

/** FormSchema から動的に zod スキーマを生成し、回答値を検証する */
export function buildZodFromSchema(schema: FormSchema) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const f of schema) {
    if (f.type === 'heading' || f.type === 'paragraph') continue

    let validator: z.ZodTypeAny

    switch (f.type) {
      case 'text':
      case 'textarea':
        validator = z.string().max(5000)
        break
      case 'email':
        validator = z.string()
          .max(200)
          .refine(v => v === '' || /^[\x20-\x7E]+$/.test(v), { message: 'メールアドレスは半角英数字で入力してください' })
          .refine(v => v === '' || /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(v), { message: 'メールアドレスの形式が正しくありません' })
        break
      case 'phone':
        validator = z.string()
          .max(30)
          .refine(v => v === '' || /^[+0-9\-\s()]+$/.test(v), { message: '電話番号は半角数字とハイフンで入力してください' })
          .refine(v => v === '' || (v.match(/\d/g)?.length ?? 0) >= 9, { message: '電話番号の桁数が正しくありません' })
          .transform(v => v.replace(/[\s\-()]/g, ''))
        break
      case 'number':
        validator = z.coerce.number().or(z.literal(''))
        break
      case 'date':
        validator = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません').or(z.literal(''))
        break
      case 'select':
      case 'radio': {
        const ff = f as Extract<FormField, { type: 'select' | 'radio' }>
        const opts = ff.options
        validator = z.string().refine(
          v => {
            if (v === '') return true
            if (opts.includes(v)) return true
            // 「その他」許可時: "その他" 単体 or "その他: <自由テキスト>" を許可
            if (ff.allowOther && (v === 'その他' || v.startsWith('その他: '))) return true
            return false
          },
          { message: '選択肢から選んでください' }
        )
        break
      }
      case 'checkbox': {
        const opts = (f as Extract<FormField, { type: 'checkbox' }>).options
        validator = z.array(z.string()).refine(arr => arr.every(v => opts.includes(v)), { message: '選択肢から選んでください' })
        break
      }
      case 'name':
        validator = z.object({
          last: z.string().max(50),
          first: z.string().max(50),
        })
        break
      case 'prefecture':
        validator = z.string().refine(v => v === '' || (PREFECTURES as readonly string[]).includes(v), { message: '都道府県を選択してください' })
        break
      default:
        validator = z.unknown()
    }

    // required チェック
    if ('required' in f && f.required) {
      if (f.type === 'checkbox') {
        validator = (validator as z.ZodArray<z.ZodString>).min(1, `${f.label} は必須項目です`)
      } else if (f.type === 'name') {
        validator = z.object({
          last: z.string().min(1, `${f.label}（姓）は必須項目です`).max(50),
          first: z.string().min(1, `${f.label}（名）は必須項目です`).max(50),
        })
      } else {
        validator = (validator as z.ZodString).refine(v => v !== '' && v != null, { message: `${f.label} は必須項目です` })
      }
    } else {
      validator = validator.optional()
    }

    shape[f.id] = validator
  }

  return z.object(shape)
}

/** 回答値を表示用の文字列にする（配列・氏名オブジェクトにも対応） */
export function stringifyAnswerValue(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(stringifyAnswerValue).filter((s) => s !== '').join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('last' in o || 'first' in o) return `${o.last ?? ''} ${o.first ?? ''}`.trim()
    return JSON.stringify(v)
  }
  return String(v)
}

/**
 * 現在のフォーム設問に無いキーの表示ラベル。
 * 設問を作り直すと ID が変わり、過去の回答が「どの設問のものか」を失う。
 * 値を捨てずに、どのキーの回答かが分かる形で見せる。
 */
export function unknownAnswerLabel(key: string): string {
  return `（フォームにない項目: ${key}）`
}

/**
 * 検証済み値を表示用の {label, value} 配列に整形する。
 * includeUnknown を渡すと、現在のスキーマに無いキーの回答も末尾に付ける。
 */
export function formatAnswersForDisplay(
  schema: FormSchema,
  data: Record<string, unknown>,
  options?: { includeUnknown?: boolean },
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  const known = new Set<string>()
  for (const f of schema) {
    if (f.type === 'heading' || f.type === 'paragraph') continue
    known.add(f.id)
    const v = data[f.id]
    if (f.type === 'name' && v && typeof v === 'object') {
      const nv = v as { last?: string; first?: string }
      out.push({ label: f.label, value: `${nv.last ?? ''} ${nv.first ?? ''}`.trim() })
    } else if (f.type === 'checkbox' && Array.isArray(v)) {
      out.push({ label: f.label, value: v.join(', ') })
    } else {
      const label = (f as Exclude<FormField, { type: 'heading' | 'paragraph' }>).label
      out.push({ label, value: v == null ? '' : String(v) })
    }
  }
  if (options?.includeUnknown && data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (known.has(k)) continue
      out.push({ label: unknownAnswerLabel(k), value: stringifyAnswerValue(v) })
    }
  }
  return out
}
