export type SimpleFieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date'
export type ChoiceFieldType = 'select' | 'radio'
export type CheckboxFieldType = 'checkbox'
export type CompositeFieldType = 'name' | 'prefecture'
export type DecorationFieldType = 'heading' | 'paragraph'

export type FormField =
  | { id: string; type: SimpleFieldType; label: string; required: boolean; placeholder?: string; helpText?: string }
  | { id: string; type: ChoiceFieldType; label: string; required: boolean; options: string[]; helpText?: string; allowOther?: boolean }
  | { id: string; type: CheckboxFieldType; label: string; required?: boolean; options: string[]; helpText?: string }
  | { id: string; type: CompositeFieldType; label: string; required: boolean }
  | { id: string; type: DecorationFieldType; text: string }

/** 日本の47都道府県（北→南の標準順） */
export const PREFECTURES = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const

export type Prefecture = typeof PREFECTURES[number]

export type FormSchema = FormField[]

export type FormStatus = 'draft' | 'published' | 'closed'

export const FIELD_TYPE_LABELS: Record<FormField['type'], string> = {
  text: '1行テキスト',
  textarea: '複数行テキスト',
  email: 'メールアドレス',
  phone: '電話番号',
  number: '数値',
  date: '日付',
  select: 'セレクト',
  radio: 'ラジオボタン',
  checkbox: 'チェックボックス',
  name: '氏名（姓・名）',
  prefecture: '都道府県',
  heading: '見出し',
  paragraph: '説明文',
}

export function isInputField(f: FormField): f is Exclude<FormField, { type: DecorationFieldType }> {
  return f.type !== 'heading' && f.type !== 'paragraph'
}

export function parseSchema(json: string | null | undefined): FormSchema {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as FormSchema) : []
  } catch {
    return []
  }
}
