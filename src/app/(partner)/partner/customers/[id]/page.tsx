'use client'

import { useEffect, useState, use as usePromise } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getSplitName } from '@/lib/name-utils'

type Customer = {
  id: string
  name: string
  furigana: string
  lastName: string | null
  firstName: string | null
  lastNameKana: string | null
  firstNameKana: string | null
  email: string | null
  phone: string
  address: string
  customerType: 'visit' | 'delivery' | 'regular' | 'akikuru' | string
  visitFrequencyMonths: number
  createdAt: string
  isActive: boolean
  licenseKey: { key: string } | null
  store: { id: string; name: string } | null
  partnerNote: { id: string; note: string | null; tag: string | null; updatedAt: string } | null
}

const CUSTOMER_TYPES = [
  { v: 'visit', label: '訪問' },
  { v: 'delivery', label: '宅配' },
  { v: 'regular', label: '定期' },
  { v: 'akikuru', label: 'アキクル' },
]

export default function PartnerCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const { data: session, status } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // 基本情報フォーム
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastNameKana, setLastNameKana] = useState('')
  const [firstNameKana, setFirstNameKana] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [customerType, setCustomerType] = useState('visit')
  const [visitFrequencyMonths, setVisitFrequencyMonths] = useState('1')
  const [savingBasic, setSavingBasic] = useState(false)

  // パートナーメモ
  const [note, setNote] = useState('')
  const [tag, setTag] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  function load() {
    fetch(`/api/partner/customers/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((c: Customer | null) => {
        if (!c) return
        setCustomer(c)
        const split = getSplitName(c)
        setLastName(split.lastName)
        setFirstName(split.firstName)
        setLastNameKana(split.lastNameKana)
        setFirstNameKana(split.firstNameKana)
        setEmail(c.email ?? '')
        setPhone(c.phone)
        setAddress(c.address)
        setCustomerType(c.customerType)
        setVisitFrequencyMonths(String(c.visitFrequencyMonths))
        setNote(c.partnerNote?.note ?? '')
        setTag(c.partnerNote?.tag ?? '')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function saveBasic() {
    setSavingBasic(true)
    const res = await fetch(`/api/partner/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName, firstName, lastNameKana, firstNameKana,
        email: email || null, phone, address,
        customerType, visitFrequencyMonths: Number(visitFrequencyMonths) || 1,
      }),
    })
    setSavingBasic(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash('error', j.error ?? '保存に失敗しました')
      return
    }
    flash('success', '基本情報を保存しました')
    load()
  }

  async function saveNote() {
    setSavingNote(true)
    const res = await fetch(`/api/partner/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || null, tag: tag || null }),
    })
    setSavingNote(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash('error', j.error ?? '保存に失敗しました')
      return
    }
    flash('success', 'メモを保存しました')
    load()
  }

  if (status === 'loading' || loading) return <p className="px-6 py-8 text-sm text-[#a3a3a3]">読み込み中…</p>
  if (!customer) return <p className="px-6 py-8 text-sm">顧客が見つかりません</p>

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <button onClick={() => router.push('/partner/customers')} className="text-sm text-[#a3a3a3] hover:text-white mb-4">← 一覧へ戻る</button>

      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <code className="text-[11px] text-[#666] font-mono">ID: {customer.id}</code>
      </div>
      <p className="text-xs text-[#a3a3a3] mb-6">
        ライセンスキー: <span className="font-mono">{customer.licenseKey?.key ?? '—'}</span>
        ・担当店舗: {customer.store?.name ?? '—'}
      </p>

      {msg && (
        <div className={`mb-4 px-3 py-2 rounded text-xs ${msg.kind === 'success' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</div>
      )}

      <section className="bg-[#141414] rounded-2xl p-5 border border-[rgba(255,255,255,0.06)] mb-5">
        <h2 className="text-base font-bold mb-3">基本情報</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="姓"><Input value={lastName} onChange={setLastName} /></Field>
          <Field label="名"><Input value={firstName} onChange={setFirstName} /></Field>
          <Field label="セイ（フリガナ）"><Input value={lastNameKana} onChange={setLastNameKana} /></Field>
          <Field label="メイ（フリガナ）"><Input value={firstNameKana} onChange={setFirstNameKana} /></Field>
          <Field label="メール"><Input type="email" value={email} onChange={setEmail} /></Field>
          <Field label="電話"><Input value={phone} onChange={setPhone} /></Field>
          <div className="sm:col-span-2"><Field label="住所"><Input value={address} onChange={setAddress} /></Field></div>
          <Field label="顧客タイプ">
            <select
              value={customerType}
              onChange={e => setCustomerType(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
            >
              {CUSTOMER_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="訪問頻度（ヶ月）"><Input type="number" value={visitFrequencyMonths} onChange={setVisitFrequencyMonths} /></Field>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={saveBasic} disabled={savingBasic} className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold disabled:opacity-50">
            {savingBasic ? '保存中…' : '基本情報を保存'}
          </button>
        </div>
      </section>

      <section className="bg-[#141414] rounded-2xl p-5 border border-[rgba(255,255,255,0.06)]">
        <h2 className="text-base font-bold mb-1">パートナーメモ</h2>
        <p className="text-[11px] text-[#666] mb-3">この情報はあなた専用です。他のパートナーや顧客には見えません。</p>
        <div className="space-y-3">
          <Field label="タグ（短い分類ラベル）"><Input value={tag} onChange={setTag} /></Field>
          <Field label="メモ">
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
            />
          </Field>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={saveNote} disabled={savingNote} className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold disabled:opacity-50">
            {savingNote ? '保存中…' : 'メモを保存'}
          </button>
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#a3a3a3] mb-1">{label}</span>
      {children}
    </label>
  )
}

function Input({ value, onChange, type = 'text' }: { value: string; onChange: (s: string) => void; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
    />
  )
}
