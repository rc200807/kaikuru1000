'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

type Member = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  acceptedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}
type Invitation = { id: string; email: string; name: string | null; expiresAt: string; createdAt: string }

export default function LinkPartnerMembersPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.partnerRole === 'partner_admin'
  const myId = (session?.user as any)?.id

  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/linkpartner/members').then((r) => (r.ok ? r.json() : { members: [] })),
      fetch('/api/linkpartner/invitations').then((r) => (r.ok ? r.json() : { invitations: [] })),
    ])
      .then(([m, inv]) => { setMembers(m.members || []); setInvitations(inv.invitations || []) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  if (session && !isAdmin) {
    return (
      <div className="p-8 text-center text-[#999]">
        <p>このページは連携パートナー管理者のみが利用できます。</p>
      </div>
    )
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true); setInviteError(''); setInviteUrl('')
    try {
      const res = await fetch('/api/linkpartner/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setInviteError(data.error ?? '招待の発行に失敗しました'); return }
      setInviteUrl(data.inviteUrl)
      setInviteEmail(''); setInviteName('')
      load()
    } catch {
      setInviteError('招待の発行に失敗しました')
    } finally {
      setInviting(false)
    }
  }

  const revoke = async (id: string) => {
    if (!confirm('この招待を取り消しますか？')) return
    const res = await fetch(`/api/linkpartner/invitations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  const toggleMember = async (memberId: string, isActive: boolean) => {
    const res = await fetch('/api/linkpartner/members', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, isActive }),
    })
    if (res.ok) load()
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? '更新に失敗しました') }
  }

  const copy = () => { navigator.clipboard?.writeText(inviteUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">メンバー管理</h1>
        <p className="text-xs text-[#999] mt-1">自社メンバーを招待し、閲覧アクセスを管理します。</p>
      </div>

      {/* 招待発行 */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#141414] p-4 mb-6">
        <h2 className="text-sm font-bold mb-3">メンバーを招待</h2>
        <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="block text-[11px] text-[#999] mb-1">メールアドレス *</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] text-[#999] mb-1">氏名（任意）</label>
            <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </div>
          <button type="submit" disabled={inviting || !inviteEmail} className="px-4 py-2 rounded-md bg-white text-black font-semibold text-sm disabled:opacity-50 shrink-0">
            {inviting ? '発行中…' : '招待リンク発行'}
          </button>
        </form>
        {inviteError && <p className="text-xs text-rose-400 mt-2">{inviteError}</p>}
        {inviteUrl && (
          <div className="mt-3 p-3 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)]">
            <p className="text-[11px] text-[#999] mb-1">招待リンク（7日間有効・相手に共有してください）</p>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all flex-1">{inviteUrl}</code>
              <button onClick={copy} className="px-3 py-1 rounded-md bg-[#222] border border-[rgba(255,255,255,0.08)] text-xs shrink-0">{copied ? 'コピー済' : 'コピー'}</button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-[#999]">読み込み中…</p>
      ) : (
        <>
          {/* 保留中の招待 */}
          {invitations.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold mb-2">保留中の招待（{invitations.length}）</h2>
              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <div className="min-w-0">
                      <div className="truncate">{inv.email}</div>
                      <div className="text-[11px] text-[#666]">有効期限: {new Date(inv.expiresAt).toLocaleDateString('ja-JP')}</div>
                    </div>
                    <button onClick={() => revoke(inv.id)} className="px-3 py-1 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-xs shrink-0">取消</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* メンバー一覧 */}
          <h2 className="text-sm font-bold mb-2">メンバー（{members.length}）</h2>
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm border-b border-[rgba(255,255,255,0.04)] last:border-0">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {m.name}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.role === 'partner_admin' ? 'bg-[#3b2f4a] text-[#d9c2ee]' : 'bg-[#1a1a1a] text-[#999]'}`}>
                      {m.role === 'partner_admin' ? '管理者' : '閲覧者'}
                    </span>
                    {!m.isActive && <span className="text-[10px] text-rose-400">無効</span>}
                    {!m.acceptedAt && m.isActive && <span className="text-[10px] text-[#999]">未受諾</span>}
                  </div>
                  <div className="text-[11px] text-[#666] truncate">{m.email}</div>
                  <div className="text-[10px] text-[#666]">最終ログイン: {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString('ja-JP') : '—'}</div>
                </div>
                {m.id !== myId && (
                  <button onClick={() => toggleMember(m.id, !m.isActive)} className="px-3 py-1 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-xs shrink-0">
                    {m.isActive ? '無効化' : '有効化'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
