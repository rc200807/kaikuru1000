'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Me = {
  member: { id: string; name: string | null; email: string; role: string }
  partner: { id: string; name: string } | null
  stats: { formCount: number; customerCount: number; inquiryCount: number }
}

export default function LinkPartnerDashboardPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/linkpartner/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">{me?.partner?.name ?? 'ダッシュボード'}</h1>
        <p className="text-xs text-[#999] mt-1">
          {me?.member?.role === 'partner_admin' ? '管理者' : '閲覧者'}としてログイン中 ・ {me?.member?.email ?? ''}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[#999]">読み込み中…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="共有フォーム" value={me?.stats.formCount ?? 0} suffix="件" href="/linkpartner/inquiries" />
            <StatCard label="問い合わせ" value={me?.stats.inquiryCount ?? 0} suffix="件" href="/linkpartner/inquiries" />
            <StatCard label="顧客" value={me?.stats.customerCount ?? 0} suffix="名" href="/linkpartner/customers" />
          </div>

          {me?.stats.formCount === 0 && (
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#141414] p-4 text-sm text-[#a3a3a3]">
              まだ共有フォームが割り当てられていません。買いクル管理者にお問い合わせください。
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-2">
            <Link href="/linkpartner/inquiries" className="px-4 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm hover:bg-[#222]">問い合わせを見る</Link>
            <Link href="/linkpartner/customers" className="px-4 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm hover:bg-[#222]">顧客情報を見る</Link>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, suffix, href }: { label: string; value: number; suffix: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#141414] p-4 hover:bg-[#181818] transition-colors block">
      <p className="text-xs text-[#999]">{label}</p>
      <p className="text-2xl font-bold mt-1">{value.toLocaleString()}<span className="text-sm font-normal text-[#999] ml-1">{suffix}</span></p>
    </Link>
  )
}
