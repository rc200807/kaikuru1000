export type SimpleFieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date'
export type ChoiceFieldType = 'select' | 'radio'
export type CheckboxFieldType = 'checkbox'
export type CompositeFieldType = 'name'
export type DecorationFieldType = 'heading' | 'paragraph'

export type FormField =
  | { id: string; type: SimpleFieldType; label: string; required: boolean; placeholder?: string; helpText?: string }
  | { id: string; type: ChoiceFieldType; label: string; required: boolean; options: string[]; helpText?: string }
  | { id: string; type: CheckboxFieldType; label: string; required?: boolean; options: string[]; helpText?: string }
  | { id: string; type: CompositeFieldType; label: string; required: boolean }
  | { id: string; type: DecorationFieldType; text: string }

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
