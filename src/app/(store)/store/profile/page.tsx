'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function StoreProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving]   = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sessionUser = session?.user as any

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
    if (status === 'authenticated') {
      if (sessionUser?.role !== 'store') { router.push('/'); return }
      setName(sessionUser?.name || '')
      setEmail(sessionUser?.email || '')
      setAvatarPreview(sessionUser?.avatar || null)
    }
  }, [status, session])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (password && password !== confirmPw) {
      setMessage({ type: 'error', text: 'パスワードが一致しません' })
      return
    }
    setSaving(true)
    setMessage(null)

    const fd = new FormData()
    if (name)     fd.append('name', name)
    if (email)    fd.append('email', email)
    if (password) fd.append('password', password)
    if (avatarFile) fd.append('avatar', avatarFile)

    const res = await fetch('/api/store/profile', { method: 'PATCH', body: fd })
    setSaving(false)

    if (res.ok) {
      const data = await res.json()
      // NextAuth セッションを更新
      await update({
        name: data.name,
        email: data.email,
        avatar: data.avatar,
      })
      setMessage({ type: 'success', text: 'プロフィールを更新しました' })
      setPassword('')
      setConfirmPw('')
      if (data.avatar) setAvatarPreview(data.avatar)
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '更新に失敗しました' })
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-blue-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      <header className="bg-blue-800 text-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/store/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {avatarPreview ? (
              <img src={avatarPreview} className="w-9 h-9 rounded-full object-cover border-2 border-blue-600" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-600 border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">{sessionUser?.name?.[0] ?? '?'}</span>
              </div>
            )}
            <div>
              <p className="text-blue-300 text-xs font-medium tracking-widest uppercase">買いクル 店舗ポータル</p>
              <h1 className="text-base font-semibold mt-0.5">{sessionUser?.name}</h1>
            </div>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/store/customers" className="text-sm text-blue-200 hover:text-white transition-colors">担当顧客</Link>
            <Link href="/store/schedule" className="text-sm text-blue-200 hover:text-white transition-colors">訪問スケジュール</Link>
            <Link href="/store/members" className="text-sm text-blue-200 hover:text-white transition-colors">メンバー</Link>
            <Link href="/store/mystore" className="text-sm text-blue-200 hover:text-white transition-colors">店舗情報</Link>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-blue-300 hover:text-white transition-colors ml-2">ログアウト</button>
          </nav>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">プロフィール編集</h2>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>{message.text}</div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* アイコン */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  className="w-24 h-24 rounded-full object-cover border-4 border-blue-100 group-hover:opacity-80 transition-opacity"
                  alt="アイコン"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-100 border-4 border-blue-200 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <span className="text-blue-800 text-3xl font-bold">{name?.[0] ?? '?'}</span>
                </div>
              )}
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <p className="text-xs text-gray-400">クリックして画像を変更</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* 氏名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">氏名</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* メールアドレス */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* パスワード */}
          <div className="bg-gray-50 rounded-2xl p-5 space-y-4 border border-gray-100">
            <p className="text-sm font-medium text-gray-700">パスワード変更（任意）</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">新しいパスワード</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="6文字以上"
                  minLength={password ? 6 : undefined}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">新しいパスワード（確認）</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="もう一度入力"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-800 text-white py-3 rounded-full text-sm font-medium hover:bg-blue-900 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '変更を保存'}
          </button>
        </form>
      </div>
    </div>
  )
}
