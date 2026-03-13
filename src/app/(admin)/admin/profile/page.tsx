'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPwSection, setShowPwSection] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving]   = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sessionUser = session?.user as any

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated') {
      if (sessionUser?.role !== 'admin') { router.push('/'); return }
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

    const res = await fetch('/api/admin/profile', { method: 'PATCH', body: fd })
    setSaving(false)

    if (res.ok) {
      const data = await res.json()
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
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar title="プロフィール" />

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* メッセージ */}
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
          >
            {message.text}
          </MessageBanner>
        )}

        <form onSubmit={handleSave} className="space-y-6">

          {/* アイコン */}
          <Card variant="elevated" padding="md">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group"
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    className="w-24 h-24 rounded-full object-cover border-4 border-[var(--md-sys-color-outline-variant)] group-hover:opacity-80 transition-opacity"
                    alt="アイコン"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[var(--md-sys-color-surface-container-high)] border-4 border-[var(--md-sys-color-outline-variant)] flex items-center justify-center group-hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors">
                    <span className="text-[var(--portal-primary,#374151)] text-3xl font-bold">{name?.[0] ?? '?'}</span>
                  </div>
                )}
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </button>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">クリックして画像を変更</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </Card>

          {/* 基本情報 */}
          <Card variant="elevated" padding="md">
            <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-4">基本情報</h3>
            <div className="space-y-4">
              <TextField
                label="氏名"
                value={name}
                onChange={setName}
              />
              <TextField
                label="メールアドレス"
                value={email}
                onChange={setEmail}
                type="email"
              />
            </div>
          </Card>

          {/* パスワード変更セクション */}
          <Card variant="outlined" padding="md">
            <button
              type="button"
              onClick={() => setShowPwSection(prev => !prev)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                パスワード変更（任意）
              </h3>
              <svg
                className={`w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] transition-transform duration-200 ${showPwSection ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showPwSection && (
              <div className="mt-4 space-y-4">
                <TextField
                  label="新しいパスワード"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="6文字以上"
                />
                <TextField
                  label="新しいパスワード（確認）"
                  value={confirmPw}
                  onChange={setConfirmPw}
                  type="password"
                  placeholder="もう一度入力"
                  error={confirmPw && password !== confirmPw ? 'パスワードが一致しません' : undefined}
                />
              </div>
            )}
          </Card>

          {/* 保存ボタン */}
          <Button
            variant="filled"
            type="submit"
            fullWidth
            size="lg"
            loading={saving}
          >
            変更を保存
          </Button>
        </form>
      </div>
    </>
  )
}
