'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function StoreProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
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
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar title="プロフィール" />

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
            className="mb-6"
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
                    className="w-24 h-24 rounded-full object-cover border-4 border-[var(--md-sys-color-surface-container-high)] group-hover:opacity-80 transition-opacity"
                    alt="アイコン"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[var(--md-sys-color-surface-container-high)] border-4 border-[var(--md-sys-color-outline-variant)] flex items-center justify-center group-hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors">
                    <span className="text-[var(--portal-primary)] text-3xl font-bold">{name?.[0] ?? '?'}</span>
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
          <Card variant="elevated" padding="md" className="space-y-5">
            <TextField
              label="氏名"
              value={name}
              onChange={setName}
            />
            <TextField
              label="メールアドレス"
              type="email"
              value={email}
              onChange={setEmail}
            />
          </Card>

          {/* パスワード変更 */}
          <Card variant="filled" padding="md" className="space-y-4">
            <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">パスワード変更（任意）</p>
            <TextField
              label="新しいパスワード"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="6文字以上"
            />
            <TextField
              label="新しいパスワード（確認）"
              type="password"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="もう一度入力"
            />
          </Card>

          <Button
            type="submit"
            disabled={saving}
            loading={saving}
            fullWidth
            size="lg"
          >
            {saving ? '保存中...' : '変更を保存'}
          </Button>
        </form>
      </div>
    </>
  )
}
