'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function PartnerDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [count, setCount] = useState<number | null>(null)

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
      .then((data: any[]) => setCount(data.length))
      .catch(() => setCount(0))
  }, [status])

  if (status !== 'authenticated') return null

  const user = session?.user as any

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">ようこそ、{user?.name} さん</h1>
      <p className="text-sm text-[#a3a3a3] mb-8">セールスパートナー専用画面</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/partner/customers"
          className="block p-6 rounded-2xl bg-[#141414] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.18)] transition-colors"
        >
          <p className="text-xs text-[#a3a3a3] uppercase tracking-wide">ライセンスキー所有顧客</p>
          <p className="text-3xl font-bold mt-2">{count ?? '—'}</p>
          <p className="text-xs text-[#666] mt-2">クリックして一覧へ →</p>
        </Link>
      </div>
    </div>
  )
}
