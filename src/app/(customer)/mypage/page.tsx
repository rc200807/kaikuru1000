'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Tabs from '@/components/Tabs'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'

type UserData = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  idDocumentPath: string | null
  licenseKey: { key: string }
  store: { name: string; phone: string | null } | null
  visitSchedules: Array<{ id: string; visitDate: string; status: string; note: string | null }>
}

type VisitRecord = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
}

type Stats = {
  totalPurchaseAmount: number
  purchaseCount: number
  monthlyStats: Array<{ year: number; month: number; amount: number }>
}

type PurchaseMemo = {
  id: string
  title: string
  description: string | null
  imageUrls: string[]
  status: string
  storeNote: string | null
  createdAt: string
  updatedAt: string
}

export default function MyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const memoImageInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState({ name: '', furigana: '', phone: '', address: '' })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

  // 訪問履歴
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [visitsLoaded, setVisitsLoaded] = useState(false)
  const [visitsLoading, setVisitsLoading] = useState(false)

  // ダッシュボード統計
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoaded, setStatsLoaded] = useState(false)

  // 買取相談メモ
  const [memos, setMemos] = useState<PurchaseMemo[]>([])
  const [memosLoaded, setMemosLoaded] = useState(false)
  const [memosLoading, setMemosLoading] = useState(false)
  const [showMemoForm, setShowMemoForm] = useState(false)
  const [memoForm, setMemoForm] = useState({ title: '', description: '' })
  const [memoImages, setMemoImages] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [submittingMemo, setSubmittingMemo] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') {
      const sessionUser = session?.user as any
      if (sessionUser?.role && sessionUser.role !== 'customer') router.push('/')
    }
  }, [status, router, session])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser?.role && sessionUser.role !== 'customer') return
      const userId = sessionUser.id
      fetch(`/api/users/${userId}`)
        .then(r => r.json())
        .then(data => {
          if (!data || data.error) { setLoading(false); return }
          setUser(data)
          setEditForm({ name: data.name, furigana: data.furigana, phone: data.phone, address: data.address })
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  // ダッシュボードタブ表示時に統計をロード
  useEffect(() => {
    if (activeTab === 'dashboard' && !statsLoaded && status === 'authenticated') {
      fetch('/api/customer/stats')
        .then(r => r.json())
        .then(data => { setStats(data); setStatsLoaded(true) })
        .catch(() => setStatsLoaded(true))
    }
  }, [activeTab, statsLoaded, status])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const userId = (session?.user as any).id
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    if (res.ok) {
      const updated = await res.json()
      setUser(prev => prev ? { ...prev, ...updated } : null)
      setMessage({ type: 'success', text: 'プロフィールを更新しました' })
    } else {
      setMessage({ type: 'error', text: '更新に失敗しました' })
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) {
      setMessage({ type: 'error', text: '新しいパスワードが一致しません' })
      return
    }
    if (pwForm.next.length < 8) {
      setMessage({ type: 'error', text: 'パスワードは8文字以上で入力してください' })
      return
    }
    setSaving(true)
    setMessage(null)
    const userId = (session?.user as any).id
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    })
    setSaving(false)
    if (res.ok) {
      setMessage({ type: 'success', text: 'パスワードを変更しました' })
      setPwForm({ current: '', next: '', confirm: '' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || 'パスワード変更に失敗しました' })
    }
  }

  async function handleUploadIdDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    const userId = (session?.user as any).id
    setMessage(null)
    const res = await fetch(`/api/users/${userId}/id-document`, {
      method: 'POST',
      body: formData,
    })
    if (res.ok) {
      const data = await res.json()
      setUser(prev => prev ? { ...prev, idDocumentPath: data.path } : null)
      setMessage({ type: 'success', text: '身分証明書をアップロードしました' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || 'アップロードに失敗しました' })
    }
  }

  // メモ画像アップロード
  async function handleMemoImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/purchase-memos/images', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setMemoImages(prev => [...prev, data.url])
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '画像のアップロードに失敗しました' })
    }
    setUploadingImage(false)
    e.target.value = ''
  }

  // メモ作成
  async function handleSubmitMemo(e: React.FormEvent) {
    e.preventDefault()
    if (!memoForm.title) return
    setSubmittingMemo(true)
    const res = await fetch('/api/purchase-memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: memoForm.title,
        description: memoForm.description || undefined,
        imageUrls: memoImages,
      }),
    })
    setSubmittingMemo(false)
    if (res.ok) {
      const created = await res.json()
      setMemos(prev => [created, ...prev])
      setMemoForm({ title: '', description: '' })
      setMemoImages([])
      setShowMemoForm(false)
      setMessage({ type: 'success', text: '買取相談メモを登録しました' })
    } else {
      setMessage({ type: 'error', text: 'メモの登録に失敗しました' })
    }
  }

  // メモ削除
  async function handleDeleteMemo(id: string) {
    if (!confirm('このメモを削除しますか？')) return
    const res = await fetch(`/api/purchase-memos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMemos(prev => prev.filter(m => m.id !== id))
    }
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner fullPage size="lg" label="読み込み中..." />
  }

  if (!user) return null

  const nextVisit = user.visitSchedules?.[0]

  const tabs = [
    { key: 'dashboard', label: 'ダッシュボード' },
    { key: 'memos', label: '買取相談メモ' },
    { key: 'history', label: '訪問履歴' },
    { key: 'profile', label: 'プロフィール' },
    { key: 'password', label: 'パスワード' },
    { key: 'id-document', label: '身分証明書' },
  ]

  function handleTabChange(tabKey: string) {
    setActiveTab(tabKey)
    setMessage(null)
    if (tabKey === 'history' && !visitsLoaded) {
      setVisitsLoading(true)
      fetch('/api/visit-schedules')
        .then(r => r.json())
        .then(data => {
          const sorted = Array.isArray(data)
            ? [...data].sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
            : []
          setVisits(sorted)
          setVisitsLoaded(true)
          setVisitsLoading(false)
        })
        .catch(() => { setVisitsLoaded(true); setVisitsLoading(false) })
    }
    if (tabKey === 'memos' && !memosLoaded) {
      setMemosLoading(true)
      fetch('/api/purchase-memos')
        .then(r => r.json())
        .then(data => {
          setMemos(Array.isArray(data) ? data : [])
          setMemosLoaded(true)
          setMemosLoading(false)
        })
        .catch(() => { setMemosLoaded(true); setMemosLoading(false) })
    }
  }

  // 月次グラフ最大値
  const maxMonthlyAmount = stats?.monthlyStats
    ? Math.max(...stats.monthlyStats.map(m => m.amount), 1)
    : 1

  const activeMemos = memos.filter(m => m.status !== 'completed')
  const completedMemos = memos.filter(m => m.status === 'completed')

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface,#FFFBFE)]">
      {/* App Bar */}
      <AppBar
        title="買いクル マイページ"
        actions={
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {user.name} 様
            </span>
            <Button
              variant="text"
              size="sm"
              onClick={() => { if (confirm('ログアウトしますか？')) signOut({ callbackUrl: '/' }) }}
            >
              ログアウト
            </Button>
          </div>
        }
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Message banner */}
        {message && (
          <div className="pt-6">
            <MessageBanner
              severity={message.type}
              dismissible
              onDismiss={() => setMessage(null)}
            >
              {message.text}
            </MessageBanner>
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4">
          <Tabs
            tabs={tabs}
            activeKey={activeTab}
            onChange={handleTabChange}
          />
        </div>

        <div className="py-6">
          {/* ─── Dashboard tab ─── */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Next visit card */}
              <div
                className={`
                  rounded-[var(--md-sys-shape-medium)] p-6 text-white
                  ${nextVisit ? 'bg-[var(--portal-primary,#B91C1C)]' : 'bg-[var(--md-sys-color-outline)]'}
                `}
              >
                <p className="text-xs font-medium opacity-70 mb-2 tracking-wide uppercase">
                  次回訪問予定日
                </p>
                {nextVisit ? (
                  <>
                    <p className="text-4xl font-bold mb-1">
                      {format(new Date(nextVisit.visitDate), 'M月d日（E）', { locale: ja })}
                    </p>
                    {nextVisit.note && (
                      <p className="text-sm opacity-75 mt-1">{nextVisit.note}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xl font-semibold">訪問日が未定です</p>
                )}
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card variant="outlined" padding="md">
                  <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    累計買取金額
                  </p>
                  <p className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
                    {stats
                      ? `¥${stats.totalPurchaseAmount.toLocaleString()}`
                      : <span className="text-base text-[var(--md-sys-color-on-surface-variant)]">---</span>
                    }
                  </p>
                </Card>
                <Card variant="outlined" padding="md">
                  <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    買取回数
                  </p>
                  <p className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
                    {stats
                      ? `${stats.purchaseCount}回`
                      : <span className="text-base text-[var(--md-sys-color-on-surface-variant)]">---</span>
                    }
                  </p>
                </Card>
              </div>

              {/* Monthly bar chart */}
              {stats && (
                <Card variant="outlined" padding="md">
                  <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">
                    月次買取金額推移
                  </h3>
                  {stats.totalPurchaseAmount === 0 ? (
                    <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-4">
                      まだ買取履歴がありません
                    </p>
                  ) : (
                    <div className="flex items-end gap-1 h-32">
                      {stats.monthlyStats.map((m, i) => {
                        const pct = maxMonthlyAmount > 0 ? (m.amount / maxMonthlyAmount) * 100 : 0
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t-sm"
                              style={{
                                height: `${Math.max(pct, m.amount > 0 ? 4 : 0)}%`,
                                backgroundColor: 'var(--portal-primary, #B91C1C)',
                                opacity: m.amount > 0 ? 1 : 0.15,
                                minHeight: m.amount > 0 ? '4px' : undefined,
                              }}
                            />
                            <span className="text-[9px] text-[var(--md-sys-color-on-surface-variant)]">
                              {m.month}月
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              )}

              {/* Info summary grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card variant="outlined" padding="md">
                  <h3 className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-3 tracking-wide uppercase">
                    基本情報
                  </h3>
                  <dl className="space-y-2.5">
                    <div className="flex justify-between">
                      <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">氏名</dt>
                      <dd className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{user.name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">電話番号</dt>
                      <dd className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{user.phone}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">住所</dt>
                      <dd className="text-sm font-medium text-[var(--md-sys-color-on-surface)] text-right max-w-48">{user.address}</dd>
                    </div>
                  </dl>
                </Card>

                <Card variant="outlined" padding="md">
                  <h3 className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-3 tracking-wide uppercase">
                    契約情報
                  </h3>
                  <dl className="space-y-2.5">
                    <div className="flex justify-between">
                      <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">ライセンスキー</dt>
                      <dd className="text-xs font-mono font-medium text-[var(--md-sys-color-on-surface)]">{user.licenseKey.key}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">担当店舗</dt>
                      <dd className="text-sm font-medium">
                        {user.store ? (
                          <span className="text-[var(--md-sys-color-on-surface)]">{user.store.name}</span>
                        ) : (
                          <span className="text-[var(--status-pending-text)]">割り当て待ち</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">身分証</dt>
                      <dd className={`text-sm font-medium ${user.idDocumentPath ? 'text-[var(--status-completed-text)]' : 'text-[var(--status-pending-text)]'}`}>
                        {user.idDocumentPath ? '提出済み' : '未提出'}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </div>

              {/* Warning banner for missing ID document */}
              {!user.idDocumentPath && (
                <MessageBanner severity="warning">
                  <p className="font-medium">身分証明書が未提出です</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    サービス開始前に「身分証明書」タブからアップロードをお願いします。
                  </p>
                </MessageBanner>
              )}
            </div>
          )}

          {/* ─── 買取相談メモタブ ─── */}
          {activeTab === 'memos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
                    買取相談メモ
                  </h2>
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                    買取を検討しているものをメモしておきましょう
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => { setShowMemoForm(v => !v); setMessage(null) }}
                >
                  {showMemoForm ? 'キャンセル' : '+ メモを追加'}
                </Button>
              </div>

              {/* メモ作成フォーム */}
              {showMemoForm && (
                <Card variant="elevated" padding="md">
                  <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">
                    新しい買取相談メモ
                  </h3>
                  <form onSubmit={handleSubmitMemo} className="space-y-4">
                    <TextField
                      label="タイトル"
                      value={memoForm.title}
                      onChange={v => setMemoForm({ ...memoForm, title: v })}
                      required
                      placeholder="例：ブランドバッグ、古い時計など"
                    />
                    <TextField
                      label="詳細メモ（任意）"
                      value={memoForm.description}
                      onChange={v => setMemoForm({ ...memoForm, description: v })}
                      placeholder="状態、年代、ブランド名など詳細をメモ..."
                      rows={3}
                    />

                    {/* 画像アップロード */}
                    <div>
                      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2">
                        写真（JPEG・PNG・WebP・HEIC、各10MB以下、最大5枚）
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {memoImages.map((url, i) => (
                          <div key={i} className="relative w-20 h-20">
                            <img
                              src={url}
                              alt=""
                              className="w-20 h-20 object-cover rounded-[var(--md-sys-shape-small)]"
                            />
                            <button
                              type="button"
                              onClick={() => setMemoImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--md-sys-color-error,#B3261E)] text-white rounded-full flex items-center justify-center text-xs leading-none"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {memoImages.length < 5 && (
                          <button
                            type="button"
                            onClick={() => memoImageInputRef.current?.click()}
                            disabled={uploadingImage}
                            className="w-20 h-20 border-2 border-dashed border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] flex flex-col items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--portal-primary)] transition-colors disabled:opacity-50"
                          >
                            {uploadingImage ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-xs mt-1">追加</span>
                              </>
                            )}
                          </button>
                        )}
                        <input
                          ref={memoImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          onChange={handleMemoImageUpload}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        disabled={submittingMemo || !memoForm.title}
                        loading={submittingMemo}
                      >
                        {submittingMemo ? '登録中...' : '登録する'}
                      </Button>
                      <Button
                        type="button"
                        variant="tonal"
                        onClick={() => {
                          setShowMemoForm(false)
                          setMemoForm({ title: '', description: '' })
                          setMemoImages([])
                        }}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              {/* メモ一覧 */}
              {memosLoading ? (
                <div className="py-8">
                  <LoadingSpinner size="md" label="読み込み中..." className="justify-center" />
                </div>
              ) : memos.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                  title="買取相談メモがありません"
                  description="「メモを追加」から買取を検討しているものを登録しましょう"
                />
              ) : (
                <div className="space-y-6">
                  {activeMemos.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3 uppercase tracking-wide">
                        対応中 ({activeMemos.length})
                      </h3>
                      <div className="space-y-3">
                        {activeMemos.map(memo => (
                          <MemoCard key={memo.id} memo={memo} onDelete={handleDeleteMemo} />
                        ))}
                      </div>
                    </div>
                  )}
                  {completedMemos.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3 uppercase tracking-wide">
                        対応完了 ({completedMemos.length})
                      </h3>
                      <div className="space-y-3 opacity-70">
                        {completedMemos.map(memo => (
                          <MemoCard key={memo.id} memo={memo} onDelete={handleDeleteMemo} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Profile tab ─── */}
          {activeTab === 'profile' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-6">
                プロフィール編集
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label="氏名"
                    value={editForm.name}
                    onChange={(val) => setEditForm({ ...editForm, name: val })}
                    required
                  />
                  <TextField
                    label="ふりがな"
                    value={editForm.furigana}
                    onChange={(val) => setEditForm({ ...editForm, furigana: val })}
                    required
                  />
                </div>

                <TextField
                  label="メールアドレス"
                  type="email"
                  value={user.email}
                  onChange={() => {}}
                  disabled
                  helper="メールアドレスは変更できません"
                />

                <TextField
                  label="電話番号"
                  type="tel"
                  value={editForm.phone}
                  onChange={(val) => setEditForm({ ...editForm, phone: val })}
                  required
                />

                <TextField
                  label="訪問先住所"
                  value={editForm.address}
                  onChange={(val) => setEditForm({ ...editForm, address: val })}
                  required
                />

                <TextField
                  label="ライセンスキー"
                  value={user.licenseKey.key}
                  onChange={() => {}}
                  disabled
                />

                <Button
                  type="submit"
                  disabled={saving}
                  loading={saving}
                  size="lg"
                >
                  {saving ? '保存中...' : '保存する'}
                </Button>
              </form>
            </Card>
          )}

          {/* ─── Password tab ─── */}
          {activeTab === 'password' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-6">
                パスワード変更
              </h2>
              <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
                <TextField
                  label="現在のパスワード"
                  type="password"
                  value={pwForm.current}
                  onChange={(val) => setPwForm({ ...pwForm, current: val })}
                  required
                />
                <TextField
                  label="新しいパスワード"
                  type="password"
                  value={pwForm.next}
                  onChange={(val) => setPwForm({ ...pwForm, next: val })}
                  required
                  placeholder="8文字以上"
                />
                <TextField
                  label="新しいパスワード（確認）"
                  type="password"
                  value={pwForm.confirm}
                  onChange={(val) => setPwForm({ ...pwForm, confirm: val })}
                  required
                />
                <Button
                  type="submit"
                  disabled={saving}
                  loading={saving}
                  size="lg"
                >
                  {saving ? '変更中...' : 'パスワードを変更'}
                </Button>
              </form>
            </Card>
          )}

          {/* ─── ID Document tab ─── */}
          {activeTab === 'id-document' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">
                身分証明書のアップロード
              </h2>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-6 leading-relaxed">
                運転免許証、マイナンバーカード、パスポートなどをアップロードしてください。<br />
                対応形式：JPEG、PNG、WebP、PDF（最大10MB）
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="
                  border-2 border-dashed border-[var(--md-sys-color-outline-variant)]
                  rounded-[var(--md-sys-shape-medium)] p-12 text-center cursor-pointer
                  hover:border-[var(--portal-primary,#B91C1C)] hover:bg-[var(--md-sys-color-surface-container-low)]
                  transition-colors mb-6
                "
              >
                <div className="w-16 h-16 bg-[var(--md-sys-color-surface-container-high)] rounded-[var(--md-sys-shape-medium)] flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                  クリックしてファイルを選択
                </p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                  またはドラッグ＆ドロップ
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleUploadIdDocument}
                  className="hidden"
                />
              </div>

              {user.idDocumentPath ? (
                <MessageBanner severity="success">
                  <p className="font-medium">身分証明書が提出されています</p>
                  <p className="text-xs mt-0.5 opacity-80">新しいファイルをアップロードすると更新されます</p>
                </MessageBanner>
              ) : (
                <MessageBanner severity="warning">
                  <p className="font-medium">身分証明書が未提出です</p>
                  <p className="text-xs mt-0.5 opacity-80">サービス開始前に提出が必要です</p>
                </MessageBanner>
              )}
            </Card>
          )}

          {/* ─── Visit History tab ─── */}
          {activeTab === 'history' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                訪問履歴
              </h2>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-6">
                担当店舗による訪問のスケジュール履歴です
              </p>

              {visitsLoading ? (
                <div className="py-12">
                  <LoadingSpinner size="md" label="読み込み中..." className="justify-center" />
                </div>
              ) : visits.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  title="訪問履歴がありません"
                  description="訪問スケジュールが登録されると表示されます"
                />
              ) : (
                <div className="space-y-0">
                  {visits.map((visit, i) => (
                    <div
                      key={visit.id}
                      className={`
                        flex items-start gap-4 py-4
                        ${i < visits.length - 1 ? 'border-b border-[var(--md-sys-color-outline-variant)]' : ''}
                      `}
                    >
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className={`
                            w-9 h-9 rounded-[var(--md-sys-shape-small)] flex items-center justify-center
                            ${visit.status === 'completed'
                              ? 'bg-[var(--status-completed-bg)]'
                              : visit.status === 'cancelled'
                                ? 'bg-[var(--md-sys-color-surface-container-high)]'
                                : 'bg-[var(--status-scheduled-bg)]'
                            }
                          `}
                        >
                          {visit.status === 'completed' ? (
                            <svg className="w-4 h-4 text-[var(--status-completed-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : visit.status === 'cancelled' ? (
                            <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-[var(--status-scheduled-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                            {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                          </span>
                          <StatusBadge status={visit.status as Status} />
                        </div>
                        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                          {visit.store.name}
                        </p>
                        {visit.note && (
                          <p className="text-xs text-[var(--md-sys-color-outline)] mt-0.5">
                            {visit.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MemoCard サブコンポーネント ───

const MEMO_STATUS_LABEL: Record<string, string> = {
  pending: '未確認',
  reviewed: '確認済み',
  completed: '対応完了',
}

const MEMO_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  reviewed: 'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
}

function MemoCard({
  memo,
  onDelete,
}: {
  memo: PurchaseMemo
  onDelete: (id: string) => void
}) {
  const [showImages, setShowImages] = useState(false)

  return (
    <Card variant="outlined" padding="md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
              {memo.title}
            </h4>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${MEMO_STATUS_STYLE[memo.status] ?? ''}`}
            >
              {MEMO_STATUS_LABEL[memo.status] ?? memo.status}
            </span>
          </div>
          {memo.description && (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">
              {memo.description}
            </p>
          )}
          {memo.storeNote && (
            <div className="mt-2 px-3 py-2 bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)]">
              <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-0.5">
                店舗からのメモ
              </p>
              <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">
                {memo.storeNote}
              </p>
            </div>
          )}
          <p className="text-xs text-[var(--md-sys-color-outline)] mt-2">
            {format(new Date(memo.createdAt), 'yyyy年M月d日', { locale: ja })}
          </p>
        </div>
        {memo.status === 'pending' && (
          <button
            onClick={() => onDelete(memo.id)}
            className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error,#B3261E)] flex-shrink-0 px-2 py-1"
          >
            削除
          </button>
        )}
      </div>

      {memo.imageUrls.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowImages(v => !v)}
            className="text-xs text-[var(--portal-primary)] hover:underline"
          >
            {showImages ? '画像を非表示' : `画像を見る（${memo.imageUrls.length}枚）`}
          </button>
          {showImages && (
            <div className="flex flex-wrap gap-2 mt-2">
              {memo.imageUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt=""
                    className="w-24 h-24 object-cover rounded-[var(--md-sys-shape-small)] hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
