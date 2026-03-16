'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'

type GCalConfig = {
  googleEmail: string | null
  calendarId: string
  calendarName: string | null
  isEnabled: boolean
}

type CalendarItem = {
  id: string
  name: string
  primary: boolean
}

export default function StoreProfilePage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" fullPage label="読み込み中..." />}>
      <StoreProfileContent />
    </Suspense>
  )
}

function StoreProfileContent() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving]   = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Google Calendar state
  const [gcalConfig, setGcalConfig] = useState<GCalConfig | null>(null)
  const [gcalLoading, setGcalLoading] = useState(true)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [calendarListLoading, setCalendarListLoading] = useState(false)
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)
  const [gcalDisconnecting, setGcalDisconnecting] = useState(false)

  const sessionUser = session?.user as any

  // Fetch Google Calendar config
  const fetchGcalConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/store/google-calendar-config')
      if (res.ok) {
        const data = await res.json()
        setGcalConfig(data.config)
      } else {
        setGcalConfig(null)
      }
    } catch {
      setGcalConfig(null)
    } finally {
      setGcalLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
    if (status === 'authenticated') {
      if (sessionUser?.role !== 'store') { router.push('/'); return }
      setName(sessionUser?.name || '')
      setEmail(sessionUser?.email || '')
      setAvatarPreview(sessionUser?.avatar || null)
      fetchGcalConfig()
    }
  }, [status, session])

  // Handle gcal query params
  useEffect(() => {
    const gcal = searchParams.get('gcal')
    if (gcal === 'connected') {
      setMessage({ type: 'success', text: 'Googleカレンダーを連携しました' })
      fetchGcalConfig()
      // Clean up URL
      router.replace('/store/profile', { scroll: false })
    } else if (gcal === 'error') {
      setMessage({ type: 'error', text: 'Googleカレンダーの連携に失敗しました' })
      router.replace('/store/profile', { scroll: false })
    }
  }, [searchParams])

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

  // Google Calendar functions
  async function handleGcalConnect() {
    window.location.href = '/api/store/google-calendar-auth'
  }

  async function handleGcalDisconnect() {
    if (!confirm('Googleカレンダーの連携を解除しますか？')) return
    setGcalDisconnecting(true)
    try {
      await fetch('/api/store/google-calendar-config', { method: 'DELETE' })
      setGcalConfig(null)
      setCalendars([])
      setShowCalendarPicker(false)
      setMessage({ type: 'success', text: 'Googleカレンダーの連携を解除しました' })
    } catch {
      setMessage({ type: 'error', text: '連携解除に失敗しました' })
    } finally {
      setGcalDisconnecting(false)
    }
  }

  async function handleLoadCalendars() {
    setCalendarListLoading(true)
    setShowCalendarPicker(true)
    try {
      const res = await fetch('/api/store/google-calendar-list')
      if (res.ok) {
        const data = await res.json()
        setCalendars(data.calendars || [])
      }
    } catch {
      setMessage({ type: 'error', text: 'カレンダー一覧の取得に失敗しました' })
    } finally {
      setCalendarListLoading(false)
    }
  }

  async function handleSelectCalendar(cal: CalendarItem) {
    try {
      const res = await fetch('/api/store/google-calendar-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: cal.id, calendarName: cal.name }),
      })
      if (res.ok) {
        setGcalConfig(prev => prev ? { ...prev, calendarId: cal.id, calendarName: cal.name } : prev)
        setShowCalendarPicker(false)
        setMessage({ type: 'success', text: `カレンダー「${cal.name}」を選択しました` })
      }
    } catch {
      setMessage({ type: 'error', text: 'カレンダーの設定に失敗しました' })
    }
  }

  async function handleToggleEnabled() {
    if (!gcalConfig) return
    try {
      const res = await fetch('/api/store/google-calendar-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !gcalConfig.isEnabled }),
      })
      if (res.ok) {
        setGcalConfig(prev => prev ? { ...prev, isEnabled: !prev.isEnabled } : prev)
      }
    } catch {
      setMessage({ type: 'error', text: '設定の変更に失敗しました' })
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

        {/* ===== Googleカレンダー連携 ===== */}
        <div className="mt-8">
          <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={2}/>
              <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
            </svg>
            Googleカレンダー連携
          </h2>

          {gcalLoading ? (
            <Card variant="elevated" padding="md">
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="sm" label="読み込み中..." />
              </div>
            </Card>
          ) : gcalConfig ? (
            /* 連携済み */
            <Card variant="elevated" padding="md" className="space-y-4">
              {/* 連携ステータス */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">連携済み</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">{gcalConfig.googleEmail}</p>
                </div>
                {/* 同期有効/無効トグル */}
                <button
                  type="button"
                  onClick={handleToggleEnabled}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    gcalConfig.isEnabled ? 'bg-green-500' : 'bg-[var(--md-sys-color-outline-variant)]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    gcalConfig.isEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* 使用カレンダー */}
              <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">使用カレンダー</p>
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] mt-0.5">
                      {gcalConfig.calendarName || (gcalConfig.calendarId === 'primary' ? 'メインカレンダー' : gcalConfig.calendarId)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadCalendars}
                    className="text-xs font-medium text-[var(--store-primary,#1E3A5F)] hover:underline px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] transition-colors"
                  >
                    変更
                  </button>
                </div>
              </div>

              {/* カレンダー選択 */}
              {showCalendarPicker && (
                <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="p-3 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)]">
                    <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">カレンダーを選択</p>
                  </div>
                  {calendarListLoading ? (
                    <div className="p-6 flex justify-center">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : calendars.length === 0 ? (
                    <div className="p-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                      カレンダーが見つかりません
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto">
                      {calendars.map(cal => (
                        <button
                          key={cal.id}
                          type="button"
                          onClick={() => handleSelectCalendar(cal)}
                          className={`w-full text-left px-4 py-3 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors border-b last:border-b-0 border-[var(--md-sys-color-outline-variant)] flex items-center justify-between ${
                            gcalConfig.calendarId === cal.id ? 'bg-[var(--md-sys-color-surface-container-high)]' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--md-sys-color-on-surface)] truncate">{cal.name}</p>
                            {cal.primary && (
                              <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">メインカレンダー</span>
                            )}
                          </div>
                          {gcalConfig.calendarId === cal.id && (
                            <svg className="w-4 h-4 text-green-500 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 同期状態の説明 */}
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {gcalConfig.isEnabled
                  ? '訪問予定が作成されると、自動でGoogleカレンダーに反映されます。'
                  : '同期が無効になっています。有効にすると新しい訪問予定がカレンダーに反映されます。'}
              </p>

              {/* 連携解除 */}
              <button
                type="button"
                onClick={handleGcalDisconnect}
                disabled={gcalDisconnecting}
                className="text-xs text-[var(--md-sys-color-error,#B3261E)] hover:underline disabled:opacity-50"
              >
                {gcalDisconnecting ? '解除中...' : '連携を解除する'}
              </button>
            </Card>
          ) : (
            /* 未連携 */
            <Card variant="elevated" padding="md">
              <div className="text-center space-y-3 py-2">
                <div className="w-12 h-12 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-[var(--md-sys-color-on-surface-variant)]" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={2}/>
                    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
                    <path d="M12 14v3M12 14h3M12 14H9" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">Googleカレンダーと連携</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    訪問予定を自動でGoogleカレンダーに同期できます
                  </p>
                </div>
                <Button
                  type="button"
                  size="md"
                  onClick={handleGcalConnect}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Googleアカウントで連携
                  </span>
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
