'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type Member = {
  id: string
  name: string
  email: string
  acceptedAt: string | null
  createdAt: string
  isMe: boolean
}

export default function PartnerMembersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/partner/partners')
      .then(r => r.ok ? r.json() : [])
      .then(setMembers)
      .finally(() => setLoading(false))
  }, [status])

  if (status !== 'authenticated') return null

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">参加メンバー</h1>
      <p className="text-sm text-[#a3a3a3] mb-6">この画面にログイン中のセールスパートナー一覧（{members.length} 名）</p>

      {loading ? (
        <p className="text-sm text-[#a3a3a3]">読み込み中…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-[#a3a3a3]">メンバーはまだいません</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div
              key={m.id}
              className={`flex items-center gap-3 p-4 rounded-2xl border ${
                m.isMe
                  ? 'bg-[#141414] border-amber-500/30'
                  : 'bg-[#141414] border-[rgba(255,255,255,0.06)]'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center text-sm font-bold">
                {m.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {m.name}
                  {m.isMe && <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">あなた</span>}
                </p>
                <p className="text-[11px] text-[#666] truncate">{m.email}</p>
              </div>
              <p className="text-[11px] text-[#666] flex-shrink-0 hidden sm:block">
                {m.acceptedAt ? format(new Date(m.acceptedAt), 'yyyy/M/d 参加', { locale: ja }) : '招待中'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
