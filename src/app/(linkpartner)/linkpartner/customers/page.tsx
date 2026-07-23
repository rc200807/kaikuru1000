'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StatusSelect, type StatusDef, type RecordStatus } from '@/components/linkpartner/StatusSelect'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string | null
  phone: string
  address: string
  customerType: string
  leadSource: string | null
  createdAt: string
  status: RecordStatus
}

export default function LinkPartnerCustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [statuses, setStatuses] = useState<StatusDef[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback((query: string) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (query.trim()) p.set('q', query.trim())
    fetch(`/api/linkpartner/customers?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : { customers: [], statuses: [] }))
      .then((d) => { setCustomers(d.customers || []); setStatuses(d.statuses || []) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  const onStatusChange = (customerId: string, next: RecordStatus) => {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, status: next } : c)))
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">顧客情報</h1>
          <p className="text-xs text-[#999] mt-1">共有フォームから作成された顧客の基本情報のみを表示します（案件・取引情報は含まれません）。</p>
        </div>
        {customers.length > 0 && (
          <a href="/api/linkpartner/customers/export" className="px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm hover:bg-[#222] shrink-0">CSVエクスポート</a>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="氏名・ふりがな・電話・メールで検索"
          className="w-full max-w-md px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-[#999]">読み込み中…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-[#999] py-12 text-center">該当する顧客がいません。</p>
      ) : (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.4fr_1.1fr_1.1fr_0.9fr_0.9fr_1.3fr] gap-3 px-4 py-2.5 text-[11px] text-[#999] bg-[#141414] border-b border-[rgba(255,255,255,0.06)]">
              <span>氏名</span>
              <span>電話</span>
              <span>メール</span>
              <span>流入元</span>
              <span>登録日</span>
              <span>対応ステータス</span>
            </div>
            {customers.map((c) => (
              <div
                key={c.id}
                onClick={() => router.push(`/linkpartner/customers/${c.id}`)}
                className="grid grid-cols-[1.4fr_1.1fr_1.1fr_0.9fr_0.9fr_1.3fr] gap-3 px-4 py-3 text-sm border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[#141414] cursor-pointer items-center"
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-[11px] text-[#666] truncate">{c.furigana}</div>
                </div>
                <span className="text-[#a3a3a3] truncate">{c.phone}</span>
                <span className="text-[#a3a3a3] truncate">{c.email ?? '—'}</span>
                <span className="text-[#a3a3a3] truncate">{c.leadSource ?? '—'}</span>
                <span className="text-[#a3a3a3]">{new Date(c.createdAt).toLocaleDateString('ja-JP')}</span>
                <div onClick={(e) => e.stopPropagation()}>
                  <StatusSelect
                    endpoint={`/api/linkpartner/customers/${c.id}/status`}
                    statuses={statuses}
                    current={c.status}
                    onChange={(next) => onStatusChange(c.id, next)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
