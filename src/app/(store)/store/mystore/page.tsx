'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import SummaryCard from '@/components/SummaryCard'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type StoreInfo = {
  id: string
  name: string
  code: string
  phone: string | null
  address: string | null
  prefecture: string | null
  email: string | null
  isActive: boolean
  createdAt: string
  _count: { customers: number; visitSchedules: number }
}

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

export default function MyStorePage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" fullPage label="読み込み中..." />}>
      <MyStoreContent />
    </Suspense>
  )
}

function MyStoreContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Google Calendar state
  const [gcalConfig, setGcalConfig] = useState<GCalConfig | null>(null)
  const [gcalLoading, setGcalLoading] = useState(true)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [calendarListLoading, setCalendarListLoading] = useState(false)
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)
  const [gcalDisconnecting, setGcalDisconnecting] = useState(false)

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
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      fetch(`/api/stores/${storeId}`)
        .then(async r => {
          if (!r.ok) { setLoading(false); return }
          const data = await r.json()
          setStore(data)
          setLoading(false)
        })
        .catch(() => setLoading(false))
      fetchGcalConfig()
    }
  }, [status, session])

  // Handle gcal query params from OAuth callback
  useEffect(() => {
    const gcal = searchParams.get('gcal')
    if (gcal === 'connected') {
      setMessage({ type: 'success', text: 'Googleカレンダーを連携しました' })
      fetchGcalConfig()
      router.replace('/store/mystore', { scroll: false })
    } else if (gcal === 'error') {
      setMessage({ type: 'error', text: 'Googleカレンダーの連携に失敗しました' })
      router.replace('/store/mystore', { scroll: false })
    }
  }, [searchParams])

  // Google Calendar handlers
  function handleGcalConnect() {
    window.location.href = '/api/store/google-calendar-auth'
  }

  async function handleGcalDisconnect() {
    if (!confirm('Googleカレンダーの連携を解除しますか？\n今後の訪問予定はカレンダーに反映されなくなります。')) return
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

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar title="店舗情報" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
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

        {store ? (
          <div className="space-y-6">
            {/* ステータスバナー */}
            <Card
              variant={store.isActive ? 'filled' : 'outlined'}
              padding="md"
              className={store.isActive
                ? 'bg-[var(--status-completed-bg)] border border-[var(--status-completed-text)]/20'
                : 'bg-[var(--status-absent-bg)] border border-[var(--status-absent-text)]/20'
              }
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  store.isActive ? 'bg-[var(--status-completed-text)]/15' : 'bg-[var(--status-absent-text)]/15'
                }`}>
                  {store.isActive ? (
                    <svg className="w-5 h-5 text-[var(--status-completed-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[var(--status-absent-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${store.isActive ? 'text-[var(--status-completed-text)]' : 'text-[var(--status-absent-text)]'}`}>
                    {store.name}
                  </p>
                  <p className={`text-xs mt-0.5 ${store.isActive ? 'text-[var(--status-completed-text)]' : 'text-[var(--status-absent-text)]'}`}>
                    {store.isActive ? '営業中' : '停止中'}
                  </p>
                </div>
              </div>
            </Card>

            {/* 基本情報 */}
            <Card variant="elevated" padding="none">
              <div className="px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
                <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">基本情報</h3>
              </div>
              <dl className="divide-y divide-[var(--md-sys-color-surface-container-high)]">
                {[
                  { label: '店舗名', value: store.name, mono: false },
                  { label: '店舗コード', value: store.code, mono: true },
                  { label: '都道府県', value: store.prefecture || '—', mono: false },
                  { label: '住所', value: store.address || '—', mono: false },
                  { label: '電話番号', value: store.phone || '—', mono: false },
                  { label: 'メール', value: store.email || '—', mono: false },
                  { label: '登録日', value: store.createdAt ? format(new Date(store.createdAt), 'yyyy年M月d日', { locale: ja }) : '—', mono: false },
                ].map(item => (
                  <div key={item.label} className="px-6 py-3.5 flex gap-4">
                    <dt className="w-32 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                    <dd className={`text-sm text-[var(--md-sys-color-on-surface)] ${item.mono ? 'font-mono' : ''}`}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* 統計 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SummaryCard
                label="担当顧客数"
                value={store._count?.customers ?? 0}
                unit="名"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                }
              />
              <SummaryCard
                label="総訪問スケジュール数"
                value={store._count?.visitSchedules ?? 0}
                unit="件"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                }
              />
            </div>

            {/* ===== Googleカレンダー連携 ===== */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={2}/>
                  <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
                </svg>
                Googleカレンダー連携
              </h3>

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
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs ${gcalConfig.isEnabled ? 'text-green-600 dark:text-green-400' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                        {gcalConfig.isEnabled ? '同期ON' : '同期OFF'}
                      </span>
                      <button
                        type="button"
                        onClick={handleToggleEnabled}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          gcalConfig.isEnabled ? 'bg-green-500' : 'bg-[var(--md-sys-color-outline-variant)]'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          gcalConfig.isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* 使用カレンダー */}
                  <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">使用カレンダー</p>
                        <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] mt-0.5 truncate">
                          {gcalConfig.calendarName || (gcalConfig.calendarId === 'primary' ? 'メインカレンダー' : gcalConfig.calendarId)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLoadCalendars}
                        className="text-xs font-medium text-[var(--store-primary,#1E3A5F)] hover:underline px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] transition-colors shrink-0"
                      >
                        変更
                      </button>
                    </div>
                  </div>

                  {/* カレンダー選択リスト */}
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

                  {/* 説明テキスト */}
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {gcalConfig.isEnabled
                      ? '訪問予定が作成されると、自動で選択したGoogleカレンダーに反映されます。この設定は店舗メンバー全員に適用されます。'
                      : '同期が無効です。有効にすると新しい訪問予定がカレンダーに反映されます。'}
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
                  <div className="flex flex-col sm:flex-row items-center gap-4 py-2">
                    <div className="w-12 h-12 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-[var(--md-sys-color-on-surface-variant)]" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={2}/>
                        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
                        <path d="M12 14v3M12 14h3M12 14H9" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">Googleカレンダーと連携</p>
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                        訪問予定を自動でGoogleカレンダーに同期できます。店舗メンバー全員で共有されます。
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
        ) : (
          <Card variant="outlined" padding="none">
            <EmptyState title="店舗情報を取得できませんでした" />
          </Card>
        )}
      </div>
    </>
  )
}
