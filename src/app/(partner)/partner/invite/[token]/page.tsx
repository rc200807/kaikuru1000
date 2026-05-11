'use client'

import { useEffect, useState, use as usePromise } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

type Invitation = { email: string; name: string | null; expiresAt: string }

export default function PartnerInviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/partner/invitations/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error ?? '招待リンクの確認に失敗しました'); return }
        setInvitation(data)
        if (data.name) setName(data.name)
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('パスワードは8文字以上で設定してください'); return }
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/partner/invitations/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? '登録に失敗しました')
      setSubmitting(false)
      return
    }
    // 自動ログイン
    const result = await signIn('partner', { redirect: false, email: data.email, password })
    setSubmitting(false)
    if (result?.ok) router.push('/partner/customers')
    else router.push('/partner/login')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-[#ededed]">読み込み中…</div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-[#ededed] p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">セールスパートナー登録</h1>
          <p className="text-xs text-[#999] mt-1">買いクル</p>
        </div>
        <div className="bg-[#141414] rounded-2xl p-6 border border-[rgba(255,255,255,0.06)] space-y-4">
          {!invitation ? (
            <p className="text-sm text-rose-400">{error || '無効な招待リンクです'}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-[#a3a3a3]">
                招待先メール: <span className="text-white">{invitation.email}</span>
              </p>
              <div>
                <label className="block text-xs text-[#a3a3a3] mb-1">お名前 *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a3a3a3] mb-1">パスワード（8文字以上） *</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                  className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
                />
              </div>
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-md bg-white text-black font-semibold text-sm disabled:opacity-50"
              >
                {submitting ? '登録中…' : '登録してログイン'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
