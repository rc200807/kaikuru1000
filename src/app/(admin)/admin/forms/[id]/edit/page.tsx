'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Card from '@/components/Card'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'
import FormBuilderCanvas from '@/components/forms/FormBuilderCanvas'
import FieldEditor from '@/components/forms/FieldEditor'
import FormRenderer from '@/components/forms/FormRenderer'
import { FIELD_TYPE_LABELS, parseSchema, isInputField, type FormField, type FormSchema, type FormStatus } from '@/lib/forms/types'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, CUSTOMER_TYPE_BADGE, parseCustomerTypes, type CustomerType } from '@/lib/customer-types'

type CustomerFieldMap = {
  name?: string
  furigana?: string
  email?: string
  phone?: string
  address?: string
  postalCode?: string
}

type FormData = {
  id: string
  slug: string
  title: string
  description: string | null
  schema: string
  status: FormStatus
  notifyEmails: string | null
  successMessage: string | null
  sheetWebhookUrl: string | null
  recaptchaEnabled: boolean
  submissionCount: number
  // 顧客自動作成
  customerCreate: boolean
  customerType: string | null
  customerTypes: string | null  // JSON
  customerFieldMap: string | null // JSON
  customerStoreId: string | null
}

type StoreOption = { id: string; name: string }

const PALETTE: Array<FormField['type']> = [
  'text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox', 'name', 'prefecture', 'heading', 'paragraph',
]

function newField(type: FormField['type']): FormField {
  const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  switch (type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone':
    case 'number':
    case 'date':
      return { id, type, label: FIELD_TYPE_LABELS[type], required: false, placeholder: '' }
    case 'select':
    case 'radio':
      return { id, type, label: FIELD_TYPE_LABELS[type], required: false, options: ['選択肢1', '選択肢2'] }
    case 'checkbox':
      return { id, type, label: FIELD_TYPE_LABELS[type], required: false, options: ['選択肢1', '選択肢2'] }
    case 'name':
      return { id, type, label: 'お名前', required: true }
    case 'prefecture':
      return { id, type, label: '都道府県', required: false }
    case 'heading':
      return { id, type, text: '見出しテキスト' }
    case 'paragraph':
      return { id, type, text: '説明文をここに入力' }
  }
}

const inputCls = 'w-full rounded-[6px] px-3 py-2 text-sm bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] placeholder:text-[#737373] focus:outline-none transition-shadow'
const inputBoxShadow = 'rgba(255,255,255,0.10) 0 0 0 1px'
const inputFocusBoxShadow = 'hsla(212, 100%, 48%, 1) 0 0 0 2px'

export default function FormEditPage() {
  const params = useParams<{ id: string }>()
  const formId = params.id

  const [data, setData] = useState<FormData | null>(null)
  const [schema, setSchema] = useState<FormSchema>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 顧客自動作成設定
  const [customerTypesArr, setCustomerTypesArr] = useState<CustomerType[]>([])
  const [customerFieldMap, setCustomerFieldMap] = useState<CustomerFieldMap>({})
  const [stores, setStores] = useState<StoreOption[]>([])

  // ストアリスト読み込み
  useEffect(() => {
    fetch('/api/stores').then(r => r.ok ? r.json() : []).then(d => {
      const list = Array.isArray(d) ? d : (d.stores ?? [])
      setStores(list.map((s: any) => ({ id: s.id, name: s.name })))
    }).catch(() => {})
  }, [])

  useEffect(() => { void load() }, [formId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/forms/${formId}`)
    if (res.ok) {
      const d: FormData = await res.json()
      setData(d)
      setSchema(parseSchema(d.schema))
      // 顧客作成設定の初期化
      setCustomerTypesArr(parseCustomerTypes(d.customerTypes, d.customerType ?? undefined))
      try {
        setCustomerFieldMap(d.customerFieldMap ? JSON.parse(d.customerFieldMap) : {})
      } catch {
        setCustomerFieldMap({})
      }
    } else {
      setMsg({ type: 'error', text: 'フォームを取得できませんでした' })
    }
    setLoading(false)
  }

  const selectedField = useMemo(() => schema.find(f => f.id === selectedId) ?? null, [schema, selectedId])

  function addField(type: FormField['type']) {
    const f = newField(type)
    setSchema(prev => [...prev, f])
    setSelectedId(f.id)
  }

  function updateField(next: FormField) {
    setSchema(prev => prev.map(f => f.id === next.id ? next : f))
  }

  function deleteField(id: string) {
    setSchema(prev => prev.filter(f => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function moveField(id: string, dir: 'up' | 'down') {
    setSchema(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if (idx < 0) return prev
      const target = dir === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    if (!data) return
    setData({ ...data, [key]: value })
  }

  async function save() {
    if (!data) return
    setSaving(true)
    setMsg(null)
    try {
      const payload: any = {
        title: data.title,
        description: data.description,
        schema: JSON.stringify(schema),
        status: data.status,
        notifyEmails: data.notifyEmails,
        successMessage: data.successMessage,
        sheetWebhookUrl: data.sheetWebhookUrl,
        recaptchaEnabled: data.recaptchaEnabled,
        slug: data.slug,
        // 顧客自動作成
        customerCreate: data.customerCreate,
        customerType: data.customerType,
        customerTypes: customerTypesArr,
        customerFieldMap: customerFieldMap,
        customerStoreId: data.customerStoreId,
      }
      const res = await fetch(`/api/admin/forms/${formId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: j.error ?? '保存に失敗しました' })
      } else {
        const updated = await res.json()
        // slug が小文字化された等のサーバー側調整を反映
        setData(prev => prev ? { ...prev, slug: updated.slug } : prev)
        setMsg({ type: 'success', text: '保存しました' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !data) return <LoadingSpinner size="lg" fullPage />

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/f/${data.slug}` : `/f/${data.slug}`

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <Link href="/admin/forms" className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            一覧へ戻る
          </Link>
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)] mt-1 truncate">{data.title || 'フォーム編集'}</h1>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 font-mono break-all">{publicUrl}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/admin/forms/${formId}/submissions`}>
            <Button variant="outlined" size="md">回答 ({data.submissionCount})</Button>
          </Link>
          <Button onClick={save} loading={saving}>保存</Button>
        </div>
      </div>

      {msg && (
        <div className="mb-4">
          <MessageBanner severity={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</MessageBanner>
        </div>
      )}

      {/* 共通設定 */}
      <Card variant="elevated" padding="md" className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">基本設定</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="タイトル" value={data.title} onChange={(v) => setField('title', v)} />
          <Input label="slug（公開URL末尾）" value={data.slug} onChange={(v) => setField('slug', v)} hint="半角英数とハイフン" />
          <Textarea label="説明文" value={data.description ?? ''} onChange={(v) => setField('description', v)} />
          <Textarea label="送信完了メッセージ" value={data.successMessage ?? ''} onChange={(v) => setField('successMessage', v)} />
          <Input label="通知メール（カンマ区切り）" value={data.notifyEmails ?? ''} onChange={(v) => setField('notifyEmails', v)} placeholder="info@example.com, admin@example.com" />
          <Input label="スプレッドシート Webhook URL（GAS）" value={data.sheetWebhookUrl ?? ''} onChange={(v) => setField('sheetWebhookUrl', v)} placeholder="https://script.google.com/macros/s/.../exec" />
          <div>
            <Label>公開ステータス</Label>
            <select
              value={data.status}
              onChange={(e) => setField('status', e.target.value as FormStatus)}
              className={inputCls}
              style={{ boxShadow: inputBoxShadow }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = inputFocusBoxShadow }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = inputBoxShadow }}
            >
              <option value="draft">下書き</option>
              <option value="published">公開中</option>
              <option value="closed">受付終了</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-6">
            <input type="checkbox" checked={data.recaptchaEnabled} onChange={(e) => setField('recaptchaEnabled', e.target.checked)} className="w-4 h-4 rounded accent-[hsla(212,100%,48%,1)]" />
            <span className="text-sm text-[var(--md-sys-color-on-surface)]">reCAPTCHA を有効化</span>
          </label>
        </div>
      </Card>

      {/* 顧客自動作成 */}
      <Card variant="elevated" padding="md" className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={data.customerCreate}
            onChange={(e) => setField('customerCreate', e.target.checked)}
            className="w-4 h-4 rounded accent-[hsla(212,100%,48%,1)]"
          />
          <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">回答から顧客を自動作成する</h3>
        </label>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
          有効化すると、フォーム回答時に該当する氏名・電話・住所が揃っていれば、自動的に顧客レコードを作成します。
          メールアドレスが既存ユーザーと一致する場合は、新規作成せずそのユーザーに紐付けます。
        </p>

        {data.customerCreate && (
          <div className="space-y-5 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
            {/* 顧客種別 */}
            <div>
              <Label>顧客種別（複数選択可）</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {CUSTOMER_TYPES.map(t => {
                  const checked = customerTypesArr.includes(t)
                  const c = CUSTOMER_TYPE_BADGE[t]
                  return (
                    <label
                      key={t}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer text-xs font-medium border"
                      style={{
                        background: checked ? c.bg : 'transparent',
                        color: checked ? c.fg : 'var(--md-sys-color-on-surface-variant)',
                        borderColor: checked ? c.fg : 'var(--md-sys-color-outline-variant)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...customerTypesArr, t]
                            : customerTypesArr.filter(x => x !== t)
                          setCustomerTypesArr(next)
                          // 主タイプが配列から外れたら先頭に切替
                          const primary = next.includes((data.customerType ?? '') as CustomerType)
                            ? data.customerType
                            : (next[0] ?? null)
                          setField('customerType', primary)
                        }}
                        className="hidden"
                      />
                      {checked && <span>✓</span>}
                      {CUSTOMER_TYPE_LABEL[t]}
                    </label>
                  )
                })}
              </div>
              {customerTypesArr.length > 0 && (
                <>
                  <Label>主タイプ（マイページの表示種別）</Label>
                  <select
                    value={data.customerType ?? ''}
                    onChange={(e) => setField('customerType', e.target.value || null)}
                    className={inputCls}
                    style={{ boxShadow: inputBoxShadow }}
                    onFocus={(e) => { e.currentTarget.style.boxShadow = inputFocusBoxShadow }}
                    onBlur={(e) => { e.currentTarget.style.boxShadow = inputBoxShadow }}
                  >
                    {customerTypesArr.map(t => (
                      <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* フィールドマッピング */}
            <div>
              <Label>顧客フィールドマッピング</Label>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-2">
                顧客レコードの各項目を、フォームのどのフィールドから取得するか指定してください。氏名・電話・住所が揃っていない回答は顧客作成をスキップします。
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                {([
                  { key: 'name', label: '氏名 *' },
                  { key: 'furigana', label: 'フリガナ' },
                  { key: 'email', label: 'メール' },
                  { key: 'phone', label: '電話 *' },
                  { key: 'postalCode', label: '郵便番号' },
                  { key: 'address', label: '住所 *' },
                ] as const).map(({ key, label }) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <select
                      value={customerFieldMap[key] ?? ''}
                      onChange={(e) => setCustomerFieldMap(prev => ({ ...prev, [key]: e.target.value || undefined }))}
                      className={inputCls}
                      style={{ boxShadow: inputBoxShadow }}
                      onFocus={(e) => { e.currentTarget.style.boxShadow = inputFocusBoxShadow }}
                      onBlur={(e) => { e.currentTarget.style.boxShadow = inputBoxShadow }}
                    >
                      <option value="">— 未設定 —</option>
                      {schema.filter(isInputField).map(f => (
                        <option key={f.id} value={f.id}>
                          {f.label} ({FIELD_TYPE_LABELS[f.type]})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* 紐付け店舗 */}
            <div>
              <Label>紐付け店舗（任意）</Label>
              <select
                value={data.customerStoreId ?? ''}
                onChange={(e) => setField('customerStoreId', e.target.value || null)}
                className={inputCls}
                style={{ boxShadow: inputBoxShadow }}
                onFocus={(e) => { e.currentTarget.style.boxShadow = inputFocusBoxShadow }}
                onBlur={(e) => { e.currentTarget.style.boxShadow = inputBoxShadow }}
              >
                <option value="">— 紐付けなし（本部管理）—</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </Card>

      {/* タブ切り替え */}
      <div className="flex gap-1 bg-[var(--md-sys-color-surface-container)] rounded-xl p-1 mb-4 max-w-xs">
        {(['edit', 'preview'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t
                ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {t === 'edit' ? '編集' : 'プレビュー'}
          </button>
        ))}
      </div>

      {tab === 'edit' ? (
        <div className="grid grid-cols-12 gap-4">
          {/* パレット */}
          <aside className="col-span-12 md:col-span-3">
            <Card variant="outlined" padding="sm" className="md:sticky md:top-4">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-2">部品を追加</p>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                {PALETTE.map(t => (
                  <button
                    key={t}
                    onClick={() => addField(t)}
                    className="text-left text-sm px-2.5 py-1.5 rounded-[6px] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                    style={{ boxShadow: 'rgba(255,255,255,0.08) 0 0 0 1px inset' }}
                  >
                    + {FIELD_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </Card>
          </aside>

          {/* キャンバス */}
          <main className="col-span-12 md:col-span-6">
            <Card variant="elevated" padding="md" className="min-h-[400px]">
              <FormBuilderCanvas schema={schema} selectedId={selectedId} onSelect={setSelectedId} onMove={moveField} />
            </Card>
          </main>

          {/* インスペクタ */}
          <aside className="col-span-12 md:col-span-3">
            <Card variant="outlined" padding="md" className="md:sticky md:top-4">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3">フィールド設定</p>
              <FieldEditor field={selectedField} onChange={updateField} onDelete={() => selectedField && deleteField(selectedField.id)} />
            </Card>
          </aside>
        </div>
      ) : (
        <Card variant="filled" padding="lg" className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl p-6 md:p-8 text-gray-900">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{data.title}</h2>
            {data.description && <p className="text-sm text-gray-600 whitespace-pre-wrap mb-6">{data.description}</p>}
            <FormRenderer schema={schema} hideSubmit />
          </div>
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-3 text-center">
            ↑ 公開フォームでの見え方プレビュー
          </p>
        </Card>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
      {children}
    </label>
  )
}

function Input({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
        style={{ boxShadow: inputBoxShadow }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = inputFocusBoxShadow }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = inputBoxShadow }}
      />
      {hint && <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">{hint}</p>}
    </div>
  )
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={inputCls}
        style={{ boxShadow: inputBoxShadow }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = inputFocusBoxShadow }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = inputBoxShadow }}
      />
    </div>
  )
}
