'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type Profile = {
  id: string
  name: string
  email: string
  isActive: boolean
  acceptedAt: string | null
  createdAt: string
}

export default function PartnerProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [savingBasic, setSavingBasic] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/partner/me')
      .then(r => r.ok ? r.json() : null)
      .then((p: Profile | null) => {
        if (!p) return
        setProfile(p)
        setName(p.name)
        setEmail(p.email)
      })
      .finally(() => setLoading(false))
  }, [status])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function saveBasic() {
    setSavingBasic(true)
    const res = await fetch('/api/partner/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    })
    setSavingBasic(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      flash('error', data.error ?? '保存に失敗しました')
      return
    }
    flash('success', 'プロフィールを更新しました')
    setProfile(data)
    // セッションにも反映
    await update({ name: data.name, email: data.email })
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) {
      flash('error', '新しいパスワードと確認用パスワードが一致しません')
      return
    }
    if (newPassword.length < 8) {
      flash('error', 'パスワードは8文字以上で設定してください')
      return
    }
    setSavingPassword(true)
    const res = await fetch('/api/partner/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    setSavingPassword(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      flash('error', data.error ?? 'パスワードの変更に失敗しました')
      return
    }
    flash('success', 'パスワードを変更しました')
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
  }

  if (status !== 'authenticated' || loading || !profile) {
    return <p className="px-6 py-8 text-sm text-[#a3a3a3]">読み込み中…</p>
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">プロフィール設定</h1>

      {msg && (
        <div className={`mb-4 px-3 py-2 rounded text-xs ${msg.kind === 'success' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</div>
      )}

      <section className="bg-[#141414] rounded-2xl p-5 border border-[rgba(255,255,255,0.06)] mb-5">
        <h2 className="text-base font-bold mb-3">基本情報</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-[#a3a3a3] mb-1">お名前</span>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-[#a3a3a3] mb-1">メールアドレス</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </label>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={saveBasic} disabled={savingBasic} className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold disabled:opacity-50">
            {savingBasic ? '保存中…' : '保存'}
          </button>
        </div>
      </section>

      <section className="bg-[#141414] rounded-2xl p-5 border border-[rgba(255,255,255,0.06)]">
        <h2 className="text-base font-bold mb-3">パスワード変更</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-[#a3a3a3] mb-1">現在のパスワード</span>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-[#a3a3a3] mb-1">新しいパスワード（8文字以上）</span>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-[#a3a3a3] mb-1">新しいパスワード（確認）</span>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </label>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={savePassword} disabled={savingPassword || !currentPassword || !newPassword} className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold disabled:opacity-50">
            {savingPassword ? '変更中…' : 'パスワードを変更'}
          </button>
        </div>
      </section>
    </div>
  )
}
