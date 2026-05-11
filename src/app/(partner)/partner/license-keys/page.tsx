'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type KeyRow = {
  id: string
  key: string
  isUsed: boolean
  createdAt: string
  user: {
    id: string
    name: string
    email: string | null
    phone: string
    registeredAt: string
  } | null
}

type Response = {
  total: number
  used: number
  unused: number
  keys: KeyRow[]
}

export default function PartnerLicenseKeysPage() {
  const { status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [search, setSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/partner/license-keys')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.keys
    if (filter === 'used') list = list.filter(k => k.isUsed)
    else if (filter === 'unused') list = list.filter(k => !k.isUsed)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(k =>
        [k.key, k.user?.name ?? '', k.user?.email ?? '', k.user?.phone ?? '']
          .join(' ').toLowerCase().includes(q)
      )
    }
    return list
  }, [data, filter, search])

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  if (status !== 'authenticated') return null

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">ライセンスキー一覧</h1>
      <p className="text-sm text-[#a3a3a3] mb-6">
        本部が発行済みのライセンスキー（使用済み・未使用を含む全件）
      </p>

      {loading ? (
        <p className="text-sm text-[#a3a3a3]">読み込み中…</p>
      ) : !data ? (
        <p className="text-sm text-rose-400">読み込みに失敗しました</p>
      ) : (
        <>
          {/* サマリ */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl px-4 py-3 bg-[#141414] border border-[rgba(255,255,255,0.06)]">
              <p className="text-[10px] uppercase tracking-wide text-[#a3a3a3] font-bold">合計</p>
              <p className="text-xl font-bold mt-1">{data.total}</p>
            </div>
            <div className="rounded-xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-bold">使用済み</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{data.used}</p>
            </div>
            <div className="rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold">未使用</p>
              <p className="text-xl font-bold text-amber-400 mt-1">{data.unused}</p>
            </div>
          </div>

          {/* フィルタ + 検索 */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex gap-2">
              {([
                { v: 'all', label: 'すべて' },
                { v: 'used', label: '使用済み' },
                { v: 'unused', label: '未使用' },
              ] as const).map(t => (
                <button
                  key={t.v}
                  onClick={() => setFilter(t.v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === t.v
                      ? 'bg-white text-black'
                      : 'bg-[#141414] text-[#a3a3a3] hover:bg-[#1a1a1a]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="キー・顧客名・連絡先で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] max-w-md px-3 py-2 rounded-md bg-[#141414] border border-[rgba(255,255,255,0.08)] text-sm"
            />
          </div>

          {/* テーブル */}
          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#141414] text-[#a3a3a3]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">ライセンスキー</th>
                  <th className="px-3 py-2 text-left font-semibold w-24">状態</th>
                  <th className="px-3 py-2 text-left font-semibold">登録顧客</th>
                  <th className="px-3 py-2 text-left font-semibold w-32">発行日</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-xs text-[#666]">該当するキーがありません</td></tr>
                ) : filtered.map(k => (
                  <tr key={k.id} className="border-t border-[rgba(255,255,255,0.06)]">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => copy(k.key)}
                        title="クリックでコピー"
                        className="font-mono text-xs hover:text-amber-300"
                      >
                        {k.key}
                      </button>
                      {copiedKey === k.key && <span className="ml-2 text-[10px] text-emerald-400">✓ コピー済み</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        k.isUsed
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}>
                        {k.isUsed ? '使用済み' : '未使用'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {k.user ? (
                        <button
                          onClick={() => router.push(`/partner/customers/${k.user!.id}`)}
                          className="text-left hover:text-amber-300"
                        >
                          <div className="text-sm font-medium">{k.user.name}</div>
                          <div className="text-[11px] text-[#666]">{k.user.email ?? k.user.phone}</div>
                        </button>
                      ) : (
                        <span className="text-xs text-[#666]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#a3a3a3]">
                      {format(new Date(k.createdAt), 'yyyy/M/d', { locale: ja })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
