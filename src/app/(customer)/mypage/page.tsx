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

export default function MyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState({ name: '', furigana: '', phone: '', address: '' })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

  // 訪問履歴
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [visitsLoaded, setVisitsLoaded] = useState(false)
  const [visitsLoading, setVisitsLoading] = useState(false)

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

  if (status === 'loading' || loading) {
    return <LoadingSpinner fullPage size="lg" label="読み込み中..." />
  }

  if (!user) return null

  const nextVisit = user.visitSchedules?.[0]

  const tabs = [
    { key: 'dashboard', label: 'ダッシュボード' },
    { key: 'profile', label: 'プロフィール' },
    { key: 'password', label: 'パスワード' },
    { key: 'id-document', label: '身分証明書' },
    { key: 'history', label: '訪問履歴' },
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
  }

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
          {/* Dashboard tab */}
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

          {/* Profile tab */}
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

          {/* Password tab */}
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

          {/* ID Document tab */}
          {activeTab === 'id-document' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">
                身分証明書のアップロード
              </h2>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-6 leading-relaxed">
                運転免許証、マイナンバーカード、パスポートなどをアップロードしてください。<br />
                対応形式：JPEG、PNG、WebP、PDF（最大10MB）
              </p>

              {/* Upload area */}
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

              {/* Status display */}
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

          {/* Visit History tab */}
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
                      {/* Timeline icon */}
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

                      {/* Content */}
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
