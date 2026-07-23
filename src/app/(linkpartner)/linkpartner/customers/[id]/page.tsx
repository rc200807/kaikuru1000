'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string | null
  phone: string
  phone2: string | null
  phone3: string | null
  address: string
  customerType: string
  customerTypes: string
  leadSource: string | null
  createdAt: string
}
type SourceSubmission = { id: string; createdAt: string; form: { id: string; title: string; slug: string } }

const TYPE_LABEL: Record<string, string> = { visit: '訪問買取', delivery: '宅配買取', regular: '常連', akikuru: 'アキクル' }

export default function LinkPartnerCustomerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [submissions, setSubmissions] = useState<SourceSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/linkpartner/customers/${params.id}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null } return r.ok ? r.json() : null })
      .then((d) => { if (d?.customer) { setCustomer(d.customer); setSubmissions(d.submissions || []) } })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="p-8 text-sm text-[#999]">読み込み中…</div>
  if (notFound || !customer) {
    return (
      <div className="p-8 text-center text-[#999]">
        <p>顧客が見つかりません。</p>
        <Link href="/linkpartner/customers" className="inline-block mt-3 px-3 py-1.5 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm">一覧へ戻る</Link>
      </div>
    )
  }

  let typeList: string[] = []
  try { typeList = JSON.parse(customer.customerTypes || '[]') } catch { typeList = [] }
  const phones = [customer.phone, customer.phone2, customer.phone3].filter(Boolean)

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <button onClick={() => router.push('/linkpartner/customers')} className="text-xs text-[#999] hover:text-[#ededed] mb-4">← 顧客一覧</button>
      <div className="mb-4">
        <h1 className="text-lg font-bold">{customer.name}</h1>
        <p className="text-xs text-[#999] mt-0.5">{customer.furigana}</p>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden mb-5">
        <Row label="電話番号" value={phones.length ? phones.join(' / ') : '—'} />
        <Row label="メール" value={customer.email ?? '—'} />
        <Row label="住所" value={customer.address || '—'} />
        <Row label="顧客種別" value={typeList.length ? typeList.map((t) => TYPE_LABEL[t] ?? t).join('、') : (TYPE_LABEL[customer.customerType] ?? customer.customerType)} />
        <Row label="流入元" value={customer.leadSource ?? '—'} />
        <Row label="登録日" value={new Date(customer.createdAt).toLocaleString('ja-JP')} />
      </div>

      <h2 className="text-sm font-bold mb-2">この顧客の問い合わせ</h2>
      {submissions.length === 0 ? (
        <p className="text-sm text-[#999]">共有フォームからの問い合わせはありません。</p>
      ) : (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
          {submissions.map((s) => (
            <Link
              key={s.id}
              href={`/linkpartner/inquiries/${s.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[#141414]"
            >
              <span className="truncate">{s.form.title}</span>
              <span className="text-[#999] text-xs shrink-0">{new Date(s.createdAt).toLocaleString('ja-JP')}</span>
            </Link>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[#666] mt-6">※ 案件の進捗・買取／売却金額・取引内容は表示されません。</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-xs text-[#999]">{label}</span>
      <span className="text-sm break-words">{value}</span>
    </div>
  )
}
