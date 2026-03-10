'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

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

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">完了</span>
  if (status === 'cancelled') return <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">キャンセル</span>
  return <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">予定</span>
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-red-700 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-400">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const nextVisit = user.visitSchedules?.[0]

  const tabs = [
    { id: 'dashboard', label: 'ダッシュボード' },
    { id: 'profile', label: 'プロフィール' },
    { id: 'password', label: 'パスワード' },
    { id: 'id-document', label: '身分証明書' },
    { id: 'history', label: '訪問履歴' },
  ]

  function handleTabChange(tabId: string) {
    setActiveTab(tabId)
    setMessage(null)
    if (tabId === 'history' && !visitsLoaded) {
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
    <div className="min-h-screen bg-[#FFFBFE]">
      {/* Top App Bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-base font-semibold text-red-700 tracking-tight">買いクル マイページ</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.name} 様</span>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* メッセージ */}
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* タブナビゲーション */}
        <nav className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 mb-8 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 min-w-max px-4 py-2 rounded-xl text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'bg-red-700 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ダッシュボード */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* 次回訪問日カード */}
            <div className={`rounded-2xl p-6 text-white ${nextVisit ? 'bg-red-700' : 'bg-gray-400'}`}>
              <p className="text-xs font-medium opacity-70 mb-2 tracking-wide uppercase">次回訪問予定日</p>
              {nextVisit ? (
                <>
                  <p className="text-4xl font-bold mb-1">
                    {format(new Date(nextVisit.visitDate), 'M月d日（E）', { locale: ja })}
                  </p>
                  {nextVisit.note && <p className="text-sm opacity-75 mt-1">{nextVisit.note}</p>}
                </>
              ) : (
                <p className="text-xl font-semibold">訪問日が未定です</p>
              )}
            </div>

            {/* 情報サマリー */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-xs font-medium text-gray-400 mb-3 tracking-wide uppercase">基本情報</h3>
                <dl className="space-y-2.5">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">氏名</dt>
                    <dd className="text-sm font-medium text-gray-900">{user.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">電話番号</dt>
                    <dd className="text-sm font-medium text-gray-900">{user.phone}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">住所</dt>
                    <dd className="text-sm font-medium text-gray-900 text-right max-w-48">{user.address}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-xs font-medium text-gray-400 mb-3 tracking-wide uppercase">契約情報</h3>
                <dl className="space-y-2.5">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">ライセンスキー</dt>
                    <dd className="text-xs font-mono font-medium text-gray-700">{user.licenseKey.key}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">担当店舗</dt>
                    <dd className="text-sm font-medium">
                      {user.store ? user.store.name : <span className="text-amber-600">割り当て待ち</span>}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">身分証</dt>
                    <dd className={`text-sm font-medium ${user.idDocumentPath ? 'text-green-600' : 'text-amber-600'}`}>
                      {user.idDocumentPath ? '提出済み' : '未提出'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* 注意事項 */}
            {!user.idDocumentPath && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-sm text-amber-800 font-medium mb-0.5">身分証明書が未提出です</p>
                <p className="text-xs text-amber-700">
                  サービス開始前に「身分証明書」タブからアップロードをお願いします。
                </p>
              </div>
            )}
          </div>
        )}

        {/* プロフィール編集 */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6">プロフィール編集</h2>
            <form onSubmit={handleSaveProfile} className="space-y-5 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">氏名</label>
                  <input
                    type="text" value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">ふりがな</label>
                  <input
                    type="text" value={editForm.furigana}
                    onChange={e => setEditForm({ ...editForm, furigana: e.target.value })}
                    required
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">メールアドレス</label>
                <input
                  type="email" value={user.email} disabled
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">メールアドレスは変更できません</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">電話番号</label>
                <input
                  type="tel" value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">訪問先住所</label>
                <input
                  type="text" value={editForm.address}
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ライセンスキー</label>
                <input
                  type="text" value={user.licenseKey.key} disabled
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-400 font-mono"
                />
              </div>

              <button
                type="submit" disabled={saving}
                className="bg-red-700 text-white px-8 py-2.5 rounded-full text-sm font-medium hover:bg-red-800 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </form>
          </div>
        )}

        {/* パスワード変更 */}
        {activeTab === 'password' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6">パスワード変更</h2>
            <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">現在のパスワード</label>
                <input
                  type="password" value={pwForm.current}
                  onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">新しいパスワード</label>
                <input
                  type="password" value={pwForm.next}
                  onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                  required minLength={8}
                  placeholder="8文字以上"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">新しいパスワード（確認）</label>
                <input
                  type="password" value={pwForm.confirm}
                  onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>
              <button
                type="submit" disabled={saving}
                className="bg-red-700 text-white px-8 py-2.5 rounded-full text-sm font-medium hover:bg-red-800 transition-colors disabled:opacity-50"
              >
                {saving ? '変更中...' : 'パスワードを変更'}
              </button>
            </form>
          </div>
        )}

        {/* 身分証明書 */}
        {activeTab === 'id-document' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">身分証明書のアップロード</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              運転免許証、マイナンバーカード、パスポートなどをアップロードしてください。<br />
              対応形式：JPEG、PNG、WebP、PDF（最大10MB）
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors mb-6"
            >
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">クリックしてファイルを選択</p>
              <p className="text-xs text-gray-400 mt-1">またはドラッグ＆ドロップ</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleUploadIdDocument}
                className="hidden"
              />
            </div>

            {user.idDocumentPath ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-700">身分証明書が提出されています</p>
                  <p className="text-xs text-green-600 mt-0.5">新しいファイルをアップロードすると更新されます</p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-800">身分証明書が未提出です</p>
                  <p className="text-xs text-amber-700 mt-0.5">サービス開始前に提出が必要です</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 訪問履歴 */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">訪問履歴</h2>
            <p className="text-sm text-gray-400 mb-6">担当店舗による訪問のスケジュール履歴です</p>

            {visitsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-red-700 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : visits.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400">訪問履歴がありません</p>
                <p className="text-xs text-gray-300 mt-1">訪問スケジュールが登録されると表示されます</p>
              </div>
            ) : (
              <div className="space-y-0">
                {visits.map((visit, i) => (
                  <div
                    key={visit.id}
                    className={`flex items-start gap-4 py-4 ${i < visits.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    {/* タイムラインドット */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        visit.status === 'completed' ? 'bg-green-50' :
                        visit.status === 'cancelled' ? 'bg-gray-50' : 'bg-red-50'
                      }`}>
                        {visit.status === 'completed' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : visit.status === 'cancelled' ? (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                        </span>
                        <StatusBadge status={visit.status} />
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{visit.store.name}</p>
                      {visit.note && (
                        <p className="text-xs text-gray-400 mt-0.5">{visit.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
