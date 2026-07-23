'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LinkPartnerOnboardingPasswordPage() {
  const router = useRouter()
  const { update } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('新しいパスワードは8文字以上で入力してください'); return }
    if (newPassword !== confirm) { setError('新しいパスワードが一致しません'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/linkpartner/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '変更に失敗しました'); return }
      // トークンのゲートフラグを解除してダッシュボードへ
      await update({ mustChangePassword: false })
      router.push('/linkpartner/dashboard')
    } catch {
      setError('変更に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-[#ededed] p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">初回パスワード設定</h1>
          <p className="text-xs text-[#999] mt-1">続行するには、初期パスワードを新しいパスワードに変更してください</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-[#141414] rounded-2xl p-6 border border-[rgba(255,255,255,0.06)] space-y-4">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1">現在（初期）のパスワード</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1">新しいパスワード（8文字以上）</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1">新しいパスワード（確認）</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-md bg-white text-black font-semibold text-sm disabled:opacity-50">
            {loading ? '変更中…' : 'パスワードを変更して続行'}
          </button>
        </form>
      </div>
    </div>
  )
}
