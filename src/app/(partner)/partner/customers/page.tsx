'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string | null
  phone: string
  address: string
  customerType: string
  visitFrequencyMonths: number
  createdAt: string
  licenseKey: { key: string } | null
  store: { id: string; name: string } | null
  partnerNote: { note: string | null; tag: string | null; updatedAt: string } | null
}

const TYPE_LABEL: Record<string, string> = {
  visit: '訪問', delivery: '宅配', regular: '定期', akikuru: 'アキクル',
}

export default function PartnerCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // ライセンスキー顧客ページは一旦OFF。ライセンス一覧へリダイレクト。
  useEffect(() => {
    router.replace('/partner/license-keys')
  }, [router])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
    if (status === 'authenticated' && (session?.user as any)?.role !== 'partner') {
      router.push('/partner/login')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/partner/customers')
      .then(r => r.ok ? r.json() : [])
      .then(setCustomers)
      .finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c => [c.name, c.furigana, c.email ?? '', c.phone, c.address, c.licenseKey?.key ?? '']
      .join(' ').toLowerCase().includes(q))
  }, [customers, search])

  if (status !== 'authenticated') return null

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold">ライセンスキー顧客</h1>
        <Link
          href="/partner/customers/import"
          className="px-3 py-1.5 rounded-md bg-white text-black text-xs font-semibold hover:bg-[#e5e5e5]"
        >
          + CSV インポート
        </Link>
      </div>
      <p className="text-sm text-[#a3a3a3] mb-6">{filtered.length} 件 / 全 {customers.length} 件</p>

      <input
        type="search"
        placeholder="氏名・フリガナ・連絡先・ライセンスキーで検索"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md px-3 py-2 rounded-md bg-[#141414] border border-[rgba(255,255,255,0.08)] text-sm mb-4"
      />

      {loading ? (
        <p className="text-sm text-[#a3a3a3]">読み込み中…</p>
      ) : (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#141414] text-[#a3a3a3]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">氏名</th>
                <th className="px-3 py-2 text-left font-semibold">ライセンスキー</th>
                <th className="px-3 py-2 text-left font-semibold">連絡先</th>
                <th className="px-3 py-2 text-left font-semibold">タイプ</th>
                <th className="px-3 py-2 text-left font-semibold">担当店舗</th>
                <th className="px-3 py-2 text-left font-semibold">タグ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-[#666]">該当する顧客がありません</td></tr>
              ) : (
                filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/partner/customers/${c.id}`)}
                    className="border-t border-[rgba(255,255,255,0.06)] cursor-pointer hover:bg-[#141414]"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-[#666]">{c.furigana}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.licenseKey?.key ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.email && <div>{c.email}</div>}
                      <div>{c.phone}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{TYPE_LABEL[c.customerType] ?? c.customerType}</td>
                    <td className="px-3 py-2 text-xs">{c.store?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.partnerNote?.tag
                        ? <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px]">{c.partnerNote.tag}</span>
                        : <span className="text-[#666]">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
