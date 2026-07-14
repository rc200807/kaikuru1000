'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import DataTable, { type Column } from '@/components/DataTable'
import SearchFilterBar from '@/components/SearchFilterBar'
import LoadingSpinner from '@/components/LoadingSpinner'

type Store = {
  id: string
  name: string
  code: string
  prefecture: string | null
  postalCode: string | null
  address: string | null
  phone: string | null
  email: string | null
  storeStatus: string | null
  openingDate: string | null
  closingDate: string | null
  googleBusinessUrl: string | null
  oikuraPageUrl: string | null
  bankInfo: string | null
  invoiceNumber: string | null
  antiquePermitNumber: string | null
  _count: { customers: number }
}

type SyncLog = {
  id: string
  status: string
  message: string | null
  syncedAt: string
}

export default function AdminStoresPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stores, setStores] = useState<Store[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 新規店舗追加モーダル
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    code: '', name: '', email: '', phone: '', prefecture: '', postalCode: '', address: '',
  })
  const [creating, setCreating] = useState(false)

  // 郵便番号→住所の自動入力（7桁で zipcloud を照会）
  async function handleCreatePostal(v: string) {
    setCreateForm(prev => ({ ...prev, postalCode: v }))
    const digits = v.replace(/[^0-9]/g, '')
    if (digits.length !== 7) return
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${digits}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.prefecture) return
      const addr = data.address || `${data.prefecture}${data.city || ''}${data.town || ''}`
      setCreateForm(prev => ({ ...prev, prefecture: data.prefecture, address: addr }))
    } catch { /* ignore */ }
  }

  // パスワード表示モーダル
  const [passwordModal, setPasswordModal] = useState<{ storeName: string; password: string; storeId: string; storeEmail: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSentDone, setEmailSentDone] = useState(false)

  // パスワード再発行中の店舗ID
  const [resettingId, setResettingId] = useState<string | null>(null)

  // 店舗情報サイドバー
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)

  // ESCキーでサイドバーを閉じる
  useEffect(() => {
    if (!selectedStore) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedStore(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedStore])

  // スプレッドシートURL設定
  const [storeSheetUrl, setStoreSheetUrl] = useState('')
  const [storeSheetName, setStoreSheetName] = useState('店舗マスター')
  const [savingSheet, setSavingSheet] = useState(false)
  const [sheetSaved, setSheetSaved] = useState(false)

  // カラムマッピング
  type ColMap = {
    code: string; name: string; prefecture: string; address: string; phone: string; email: string
    storeStatus?: string; openingDate?: string; closingDate?: string
    googleBusinessUrl?: string; oikuraPageUrl?: string; bankInfo?: string
    invoiceNumber?: string; antiquePermitNumber?: string
  }
  const defaultColMap: ColMap = { code: 'A', name: 'B', prefecture: 'C', address: 'D', phone: 'E', email: 'F' }
  const [colMap, setColMap] = useState<ColMap>(defaultColMap)
  const [sheetHeaders, setSheetHeaders] = useState<{ letter: string; header: string }[]>([])
  const [fetchingHeaders, setFetchingHeaders] = useState(false)
  const [headerError, setHeaderError] = useState('')

  // スプレッドシート設定セクションの開閉
  const [sheetSectionOpen, setSheetSectionOpen] = useState(false)

  // 検索
  const [searchQ, setSearchQ] = useState('')

  // 店舗詳細サイドバー
  const [detailStore, setDetailStore] = useState<Store | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (!['admin','superadmin','hr'].includes(sessionUser.role)) { router.push('/'); return }

      Promise.all([
        fetch('/api/stores').then(r => r.json()),
        fetch('/api/sync-stores').then(r => r.json()),
        fetch('/api/admin/google-config').then(r => r.json()),
      ]).then(([storesData, logsData, sheetConfig]) => {
        setStores(Array.isArray(storesData) ? storesData : [])
        setSyncLogs(Array.isArray(logsData) ? logsData : [])
        if (sheetConfig?.storeSpreadsheetId) setStoreSheetUrl(sheetConfig.storeSpreadsheetId)
        if (sheetConfig?.storeSheetName) setStoreSheetName(sheetConfig.storeSheetName)
        if (sheetConfig?.storeColumnMapping) setColMap({ ...defaultColMap, ...sheetConfig.storeColumnMapping })
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

  function refreshStores() {
    fetch('/api/stores').then(r => r.json()).then(d => setStores(Array.isArray(d) ? d : []))
  }

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    const res = await fetch('/api/sync-stores', { method: 'POST' })
    const data = await res.json()
    setSyncing(false)
    if (data.success) {
      setMessage({ type: 'success', text: `${data.message}` })
      refreshStores()
      fetch('/api/sync-stores').then(r => r.json()).then(d => setSyncLogs(Array.isArray(d) ? d : []))
    } else {
      setMessage({ type: 'error', text: `同期に失敗しました: ${data.message}` })
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const res = await fetch('/api/admin/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 店舗コードはサーバー側で自動生成（手入力は廃止）
        name:       createForm.name.trim(),
        email:      createForm.email.trim() || undefined,
        phone:      createForm.phone.trim() || undefined,
        prefecture: createForm.prefecture.trim() || undefined,
        postalCode: createForm.postalCode.trim() || undefined,
        address:    createForm.address.trim() || undefined,
      }),
    })
    const data = await res.json()
    setCreating(false)

    if (res.ok) {
      setShowCreateModal(false)
      setCreateForm({ code: '', name: '', email: '', phone: '', prefecture: '', postalCode: '', address: '' })
      setPasswordModal({ storeName: createForm.name.trim(), password: data.password, storeId: data.store.id, storeEmail: data.store.email ?? null })
      refreshStores()
    } else {
      setMessage({ type: 'error', text: data.error || '店舗の作成に失敗しました' })
      setShowCreateModal(false)
    }
  }

  async function handleResetPassword(store: Store) {
    if (!confirm(`「${store.name}」のパスワードを再発行しますか？\n現在のパスワードは無効になります。`)) return
    setResettingId(store.id)
    const res = await fetch(`/api/admin/stores/${store.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    })
    const data = await res.json()
    setResettingId(null)

    if (res.ok) {
      setPasswordModal({ storeName: store.name, password: data.password, storeId: store.id, storeEmail: store.email ?? null })
    } else {
      setMessage({ type: 'error', text: data.error || 'パスワードの再発行に失敗しました' })
    }
  }

  async function handleFetchHeaders() {
    if (!storeSheetUrl.trim()) return
    setFetchingHeaders(true)
    setHeaderError('')
    setSheetHeaders([])
    const params = new URLSearchParams({
      spreadsheetId: storeSheetUrl.trim(),
      sheetName: storeSheetName.trim() || '店舗マスター',
    })
    const res = await fetch(`/api/admin/stores/sheet-headers?${params}`)
    const data = await res.json()
    setFetchingHeaders(false)
    if (!res.ok) {
      setHeaderError(data.error || '列の取得に失敗しました')
    } else {
      setSheetHeaders(data.columns)
    }
  }

  async function handleSaveSheetUrl() {
    setSavingSheet(true)
    await fetch('/api/admin/google-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeSpreadsheetId: storeSheetUrl.trim(),
        storeSheetName: storeSheetName.trim() || '店舗マスター',
        storeColumnMapping: colMap,
      }),
    })
    setSavingSheet(false)
    setSheetSaved(true)
    setTimeout(() => setSheetSaved(false), 3000)
  }

  function handleCopyPassword() {
    if (!passwordModal) return
    navigator.clipboard.writeText(passwordModal.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSendPasswordEmail() {
    if (!passwordModal) return
    setSendingEmail(true)
    const res = await fetch(`/api/admin/stores/${passwordModal.storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendPasswordEmail: true, password: passwordModal.password }),
    })
    setSendingEmail(false)
    if (res.ok) {
      setEmailSentDone(true)
    } else {
      const data = await res.json()
      setMessage({ type: 'error', text: data.error || 'メールの送信に失敗しました' })
    }
  }

  function handleClosePasswordModal() {
    setPasswordModal(null)
    setCopied(false)
    setSendingEmail(false)
    setEmailSentDone(false)
  }

  function handleStartEdit(store: Store) {
    setEditForm({
      name: store.name || '',
      email: store.email || '',
      phone: store.phone || '',
      address: store.address || '',
      prefecture: store.prefecture || '',
      storeStatus: store.storeStatus || 'active',
      openingDate: store.openingDate ? store.openingDate.slice(0, 10) : '',
      closingDate: store.closingDate ? store.closingDate.slice(0, 10) : '',
      googleBusinessUrl: store.googleBusinessUrl || '',
      oikuraPageUrl: store.oikuraPageUrl || '',
      bankInfo: store.bankInfo || '',
      invoiceNumber: store.invoiceNumber || '',
      antiquePermitNumber: store.antiquePermitNumber || '',
    })
    setEditMode(true)
  }

  async function handleSaveEdit() {
    if (!detailStore) return
    setSaving(true)
    const res = await fetch(`/api/admin/stores/${detailStore.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateDetails: true, ...editForm }),
    })
    setSaving(false)
    if (res.ok) {
      const updated = await res.json()
      setDetailStore({ ...detailStore, ...updated })
      setEditMode(false)
      refreshStores()
      setMessage({ type: 'success', text: '店舗情報を更新しました' })
    } else {
      const data = await res.json()
      setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
    }
  }

  function handleCloseDetail() {
    setDetailStore(null)
    setEditMode(false)
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  const q = searchQ.trim().toLowerCase()
  const filtered = q
    ? stores.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.prefecture || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.address || '').toLowerCase().includes(q)
      )
    : stores

  const storeColumns: Column<Store>[] = [
    {
      key: 'code',
      header: 'コード',
      render: (store) => (
        <code className="text-xs bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-[var(--md-sys-shape-extra-small)]">
          {store.code}
        </code>
      ),
      sortable: true,
      sortValue: (store) => store.code,
    },
    {
      key: 'name',
      header: '店舗名',
      render: (store) => <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{store.name}</span>,
      sortable: true,
      sortValue: (store) => store.name,
    },
    {
      key: 'prefecture',
      header: 'エリア',
      hideOnMobile: true,
      render: (store) => <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{store.prefecture || '\u2014'}</span>,
    },
    {
      key: 'customers',
      header: '顧客数',
      render: (store) => (
        <span>
          <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{store._count.customers}</span>
          <span className="text-sm text-[var(--md-sys-color-on-surface-variant)] ml-1">名</span>
        </span>
      ),
      sortable: true,
      sortValue: (store) => store._count.customers,
    },
    {
      key: 'actions',
      header: '',
      render: (store) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-block">
          <Button
            size="sm"
            variant="text"
            onClick={() => router.push(`/admin/stores/${store.id}`)}
          >
            詳細
          </Button>
        </span>
      ),
    },
  ]

  const syncLogColumns: Column<SyncLog>[] = [
    {
      key: 'date',
      header: '日時',
      render: (log) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {new Date(log.syncedAt).toLocaleString('ja-JP')}
        </span>
      ),
    },
    {
      key: 'status',
      header: '状態',
      render: (log) => (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          log.status === 'success'
            ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
            : 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
        }`}>
          {log.status === 'success' ? '成功' : 'エラー'}
        </span>
      ),
    },
    {
      key: 'message',
      header: 'メッセージ',
      render: (log) => <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{log.message}</span>,
    },
  ]

  return (
    <>
      <AppBar
        title="店舗管理"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => { setMessage(null); setShowCreateModal(true) }}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              新規店舗追加
            </Button>
            <a href="/api/admin/stores/inquiry-urls/export" download>
              <Button
                size="sm"
                variant="outlined"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                }
              >
                問い合わせURL一覧
              </Button>
            </a>
            <Button
              size="sm"
              variant="tonal"
              onClick={handleSync}
              disabled={syncing}
              loading={syncing}
              icon={
                <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            >
              {syncing ? '同期中...' : 'シート同期'}
            </Button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {message && (
          <MessageBanner severity={message.type} className="mb-6" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {/* Google Sheetsスプレッドシート設定 (collapsible) */}
        <Card variant="outlined" padding="none" className="mb-6 overflow-hidden">
          {/* アコーディオンヘッダー */}
          <button
            type="button"
            onClick={() => setSheetSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7" />
              </svg>
              <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">同期するGoogleスプレッドシート</h3>
              {storeSheetUrl && !sheetSectionOpen && (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-full">設定済み</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] transition-transform duration-200 ${sheetSectionOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* アコーディオンコンテンツ */}
          {sheetSectionOpen && (
          <div className="px-6 pb-5 border-t border-[var(--md-sys-color-outline-variant)] pt-4">

          {/* URL・シート名 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto] mb-3">
            <div>
              <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">スプレッドシートURL または ID</label>
              <input
                type="text"
                value={storeSheetUrl}
                onChange={e => { setStoreSheetUrl(e.target.value); setSheetHeaders([]) }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">シート名（タブ名）</label>
              <input
                type="text"
                value={storeSheetName}
                onChange={e => { setStoreSheetName(e.target.value); setSheetHeaders([]) }}
                placeholder="SHOP"
                className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="tonal"
                onClick={handleFetchHeaders}
                disabled={fetchingHeaders || !storeSheetUrl.trim()}
                loading={fetchingHeaders}
              >
                列を確認
              </Button>
            </div>
          </div>

          {headerError && (
            <p className="text-xs text-[var(--md-sys-color-error)] mb-3">{headerError}</p>
          )}

          {/* カラムマッピング */}
          {sheetHeaders.length > 0 && (
            <div className="border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] p-4 mb-4 bg-[var(--md-sys-color-surface-container-low)]">
              <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-3">各項目に対応する列を選択してください</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {([
                  { key: 'code',        label: '店舗コード（必須）' },
                  { key: 'name',        label: '店舗名（必須）' },
                  { key: 'prefecture',  label: '都道府県' },
                  { key: 'address',     label: '住所' },
                  { key: 'phone',       label: '電話番号' },
                  { key: 'email',       label: 'メールアドレス' },
                  { key: 'storeStatus',         label: 'ステータス' },
                  { key: 'openingDate',         label: '開業日' },
                  { key: 'closingDate',         label: '閉店日' },
                  { key: 'googleBusinessUrl',   label: 'GoogleビジネスURL' },
                  { key: 'oikuraPageUrl',       label: 'おいくらURL' },
                  { key: 'bankInfo',            label: '銀行情報' },
                  { key: 'invoiceNumber',       label: 'インボイス番号' },
                  { key: 'antiquePermitNumber', label: '古物許可番号' },
                ] as { key: keyof ColMap; label: string }[]).map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">{label}</label>
                    <select
                      value={colMap[key]}
                      onChange={e => setColMap(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full h-9 px-2 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-extra-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                    >
                      <option value="">未設定</option>
                      {sheetHeaders.map(col => (
                        <option key={col.letter} value={col.letter}>
                          {col.letter}列: {col.header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 保存ボタン */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleSaveSheetUrl}
              disabled={savingSheet || !storeSheetUrl.trim()}
              loading={savingSheet}
              icon={sheetSaved ? (
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : undefined}
            >
              {sheetSaved ? '保存しました' : '設定を保存'}
            </Button>
            {sheetHeaders.length === 0 && storeSheetUrl && (
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">「列を確認」で列マッピングを設定できます</p>
            )}
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-3">
            2行目以降がデータ行として読み込まれます（1行目はヘッダー）
          </p>
          </div>
          )}
        </Card>

        {/* 検索バー + 店舗数 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">
            店舗一覧
            <span className="ml-3 text-sm font-normal text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 rounded-full">
              {stores.length}店舗
            </span>
          </h2>
        </div>

        <SearchFilterBar
          filters={[
            { key: 'search', label: '検索', type: 'text', placeholder: '店舗名・コード・都道府県・メールで検索' },
          ]}
          values={{ search: searchQ }}
          onChange={(key, value) => { if (key === 'search') setSearchQ(value) }}
          onClear={() => setSearchQ('')}
          className="mb-4"
        />

        <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden mb-8">
          <DataTable<Store>
            columns={storeColumns}
            data={filtered}
            rowKey={(store) => store.id}
            emptyTitle={searchQ ? `「${searchQ}」に一致する店舗がありません` : '店舗データがありません'}
            onRowClick={(store) => setSelectedStore(store)}
          />
          {searchQ && filtered.length > 0 && filtered.length < stores.length && (
            <div className="px-4 py-2.5 bg-[var(--md-sys-color-surface-container-low)] border-t border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {stores.length}店舗中 {filtered.length}件を表示
            </div>
          )}
        </div>

        {/* 同期ログ */}
        {syncLogs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide mb-4">同期ログ</h3>
            <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden">
              <DataTable<SyncLog>
                columns={syncLogColumns}
                data={syncLogs}
                rowKey={(log) => log.id}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── 新規店舗追加モーダル ─── */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新規店舗追加"
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            ※ 店舗コードは作成時に自動生成されます。
          </p>

          <TextField
            label="郵便番号（入力で住所を自動補完）"
            value={createForm.postalCode}
            onChange={handleCreatePostal}
            placeholder="123-4567"
          />

          <TextField
            label="都道府県"
            value={createForm.prefecture}
            onChange={v => setCreateForm({ ...createForm, prefecture: v })}
            placeholder="東京都"
          />

          <TextField
            label="店舗名"
            value={createForm.name}
            onChange={v => setCreateForm({ ...createForm, name: v })}
            required
            placeholder="買いクル 東京店"
          />

          <TextField
            label="メールアドレス"
            type="email"
            value={createForm.email}
            onChange={v => setCreateForm({ ...createForm, email: v })}
            placeholder="tokyo@kaikuru.jp"
          />

          <TextField
            label="電話番号"
            type="tel"
            value={createForm.phone}
            onChange={v => setCreateForm({ ...createForm, phone: v })}
            placeholder="03-1234-5678"
          />

          <TextField
            label="住所"
            value={createForm.address}
            onChange={v => setCreateForm({ ...createForm, address: v })}
            placeholder="東京都渋谷区..."
          />

          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            ※ 初期パスワードは自動生成されます。作成後に一度だけ表示されますので必ず控えてください。
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outlined"
              onClick={() => setShowCreateModal(false)}
              fullWidth
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={creating}
              loading={creating}
              fullWidth
            >
              {creating ? '作成中...' : '店舗を追加'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── パスワード表示モーダル ─── */}
      <Modal
        open={!!passwordModal}
        onClose={handleClosePasswordModal}
        title="パスワードを発行しました"
        size="sm"
      >
        {passwordModal && (
          <>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">{passwordModal.storeName}</p>

            <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] p-4 mb-4">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">ログインパスワード</p>
              <div className="flex items-center gap-3">
                <code className="text-xl font-bold text-[var(--md-sys-color-on-surface)] tracking-widest flex-1 break-all">
                  {passwordModal.password}
                </code>
                <button
                  onClick={handleCopyPassword}
                  className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors p-1 flex-shrink-0"
                  title="コピー"
                >
                  {copied ? (
                    <svg className="w-5 h-5 text-[var(--status-completed-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <MessageBanner severity="warning" className="mb-5">
              このパスワードは一度しか表示されません。必ず控えてから閉じてください。
            </MessageBanner>

            {passwordModal.storeEmail && (
              <Button
                fullWidth
                variant="tonal"
                disabled={sendingEmail || emailSentDone}
                loading={sendingEmail}
                onClick={handleSendPasswordEmail}
                className="mb-3"
                icon={emailSentDone ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
              >
                {emailSentDone ? '送信しました' : sendingEmail ? '送信中...' : '通知メールを送信'}
              </Button>
            )}

            <Button fullWidth variant="outlined" onClick={handleClosePasswordModal}>
              閉じる
            </Button>
          </>
        )}
      </Modal>

      {/* ─── 店舗詳細サイドバー ─── */}
      {/* オーバーレイ */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${detailStore ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleCloseDetail}
      />

      {/* サイドパネル */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto ${
          detailStore ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {detailStore && (
          <div className="flex flex-col h-full">
            {/* ヘッダー */}
            <div className="sticky top-0 z-10 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">{detailStore.name}</h2>
                <code className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{detailStore.code}</code>
              </div>
              <button
                onClick={handleCloseDetail}
                className="w-9 h-9 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto">
              {editMode ? (
                /* ─── 編集モード ─── */
                <div className="space-y-4">
                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">基本情報</h3>
                    <div className="space-y-3">
                      <TextField label="店舗名" value={editForm.name || ''} onChange={v => setEditForm({...editForm, name: v})} required />
                      <div className="grid grid-cols-2 gap-3">
                        <TextField label="都道府県" value={editForm.prefecture || ''} onChange={v => setEditForm({...editForm, prefecture: v})} />
                        <div>
                          <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">ステータス</label>
                          <select
                            value={editForm.storeStatus || 'active'}
                            onChange={e => setEditForm({...editForm, storeStatus: e.target.value})}
                            className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                          >
                            <option value="active">営業中</option>
                            <option value="closed">閉店</option>
                          </select>
                        </div>
                      </div>
                      <TextField label="郵便番号" value={editForm.postalCode || ''} onChange={v => setEditForm({...editForm, postalCode: v})} placeholder="123-4567" />
                      <TextField label="住所" value={editForm.address || ''} onChange={v => setEditForm({...editForm, address: v})} />
                      <TextField label="電話番号" value={editForm.phone || ''} onChange={v => setEditForm({...editForm, phone: v})} />
                      <TextField label="メールアドレス" type="email" value={editForm.email || ''} onChange={v => setEditForm({...editForm, email: v})} />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">営業情報</h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <TextField label="開業日" type="date" value={editForm.openingDate || ''} onChange={v => setEditForm({...editForm, openingDate: v})} />
                        <TextField label="閉店日" type="date" value={editForm.closingDate || ''} onChange={v => setEditForm({...editForm, closingDate: v})} />
                      </div>
                      <TextField label="古物営業許可番号" value={editForm.antiquePermitNumber || ''} onChange={v => setEditForm({...editForm, antiquePermitNumber: v})} placeholder="第○○○号" />
                      <TextField label="インボイス番号" value={editForm.invoiceNumber || ''} onChange={v => setEditForm({...editForm, invoiceNumber: v})} placeholder="T1234567890123" />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">外部リンク</h3>
                    <div className="space-y-3">
                      <TextField label="GoogleビジネスプロフィールURL" value={editForm.googleBusinessUrl || ''} onChange={v => setEditForm({...editForm, googleBusinessUrl: v})} placeholder="https://business.google.com/..." />
                      <TextField label="おいくらページURL" value={editForm.oikuraPageUrl || ''} onChange={v => setEditForm({...editForm, oikuraPageUrl: v})} placeholder="https://oikura.jp/..." />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">銀行情報</h3>
                    <div>
                      <textarea
                        value={editForm.bankInfo || ''}
                        onChange={e => setEditForm({...editForm, bankInfo: e.target.value})}
                        placeholder={"金融機関名:\n支店名:\n支店番号:\n口座種別: 普通/当座\n口座番号:\n口座名義:\n入金時の名義:"}
                        rows={6}
                        className="w-full px-3 py-2 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2 resize-y"
                      />
                    </div>
                  </section>
                </div>
              ) : (
                /* ─── 閲覧モード ─── */
                <>
                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">基本情報</h3>
                    <dl className="space-y-3">
                      {[
                        { label: '店舗名', value: detailStore.name },
                        { label: '店舗コード', value: detailStore.code, mono: true },
                        { label: 'ステータス', value: detailStore.storeStatus === 'closed' ? '閉店' : '営業中' },
                        { label: '都道府県', value: detailStore.prefecture },
                        { label: '郵便番号', value: detailStore.postalCode ? `〒${detailStore.postalCode}` : null },
                        { label: '住所', value: detailStore.address },
                        { label: '電話番号', value: detailStore.phone },
                        { label: 'メール', value: detailStore.email },
                        { label: '担当顧客数', value: `${detailStore._count.customers} 名` },
                      ].map(item => (
                        <div key={item.label} className="flex gap-3">
                          <dt className="w-24 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 pt-0.5">{item.label}</dt>
                          <dd className={`text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0 ${(item as any).mono ? 'font-mono text-xs' : ''}`}>
                            {item.value || <span className="text-[var(--md-sys-color-outline)]">{'\u2014'}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">営業情報</h3>
                    <dl className="space-y-3">
                      {[
                        { label: '開業日', value: detailStore.openingDate ? new Date(detailStore.openingDate).toLocaleDateString('ja-JP') : null },
                        { label: '閉店日', value: detailStore.closingDate ? new Date(detailStore.closingDate).toLocaleDateString('ja-JP') : null },
                        { label: '古物許可番号', value: detailStore.antiquePermitNumber },
                        { label: 'インボイス', value: detailStore.invoiceNumber },
                      ].map(item => (
                        <div key={item.label} className="flex gap-3">
                          <dt className="w-24 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 pt-0.5">{item.label}</dt>
                          <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0">
                            {item.value || <span className="text-[var(--md-sys-color-outline)]">{'\u2014'}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">外部リンク</h3>
                    <div className="space-y-2">
                      {detailStore.googleBusinessUrl ? (
                        <a href={detailStore.googleBusinessUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--md-sys-color-primary,#374151)] hover:underline">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          Googleビジネスプロフィール
                        </a>
                      ) : (
                        <p className="text-sm text-[var(--md-sys-color-outline)]">Googleビジネス: 未設定</p>
                      )}
                      {detailStore.oikuraPageUrl ? (
                        <a href={detailStore.oikuraPageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--md-sys-color-primary,#374151)] hover:underline">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          おいくらページ
                        </a>
                      ) : (
                        <p className="text-sm text-[var(--md-sys-color-outline)]">おいくら: 未設定</p>
                      )}
                    </div>
                  </section>

                  {detailStore.bankInfo && (
                    <section>
                      <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">銀行情報</h3>
                      <pre className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] p-3 border border-[var(--md-sys-color-outline-variant)]">{detailStore.bankInfo}</pre>
                    </section>
                  )}

                  {/* 住所・地図 */}
                  {detailStore.address && (
                    <section>
                      <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">地図</h3>
                      <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailStore.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-2.5 hover:bg-[var(--md-sys-color-surface-container)] transition-colors text-xs font-medium text-[var(--md-sys-color-primary,#374151)]"
                        >
                          Google Maps で開く
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            {/* フッターアクション */}
            <div className="sticky bottom-0 bg-[var(--md-sys-color-surface-container)] border-t border-[var(--md-sys-color-outline-variant)] px-6 py-4 flex gap-3">
              {editMode ? (
                <>
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => setEditMode(false)}
                    fullWidth
                  >
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    loading={saving}
                    fullWidth
                  >
                    {saving ? '保存中...' : '保存'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={resettingId === detailStore.id}
                    loading={resettingId === detailStore.id}
                    onClick={() => { handleResetPassword(detailStore); handleCloseDetail() }}
                    fullWidth
                  >
                    {resettingId === detailStore.id ? '処理中...' : 'PW再発行'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleStartEdit(detailStore)}
                    fullWidth
                  >
                    編集
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 店舗情報サイドバー */}
      {selectedStore && (
        <>
          {/* バックドロップ */}
          <div
            className="fixed inset-0 bg-black/40 z-40 transition-opacity"
            onClick={() => setSelectedStore(null)}
            aria-hidden="true"
          />
          {/* サイドバー本体 */}
          <aside
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-[var(--md-sys-color-surface,#fff)] shadow-2xl overflow-y-auto"
            role="dialog"
            aria-label="店舗情報"
          >
            {/* ヘッダー */}
            <div className="sticky top-0 bg-[var(--md-sys-color-surface,#fff)] border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4 flex items-start justify-between gap-3 z-10">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">店舗情報</p>
                <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                  {selectedStore.name}
                </h2>
                <code className="text-xs bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded mt-1 inline-block">
                  {selectedStore.code}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStore(null)}
                className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition-colors flex-shrink-0"
                aria-label="閉じる"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 本文 */}
            <div className="px-6 py-5 space-y-5">
              {/* ステータス・顧客数 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] px-4 py-3">
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">ステータス</p>
                  <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {selectedStore.storeStatus === 'closed' ? '閉店' : '営業中'}
                  </p>
                </div>
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] px-4 py-3">
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">顧客数</p>
                  <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {selectedStore._count.customers} 名
                  </p>
                </div>
              </div>

              {/* 基本情報 */}
              <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">基本情報</p>
                </div>
                <div className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                  <div className="px-4 py-2.5 flex">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-24 flex-shrink-0">都道府県</span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)]">{selectedStore.prefecture || '—'}</span>
                  </div>
                  <div className="px-4 py-2.5 flex">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-24 flex-shrink-0">住所</span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)] break-all">
                      {selectedStore.postalCode && <>〒{selectedStore.postalCode}<br /></>}
                      {selectedStore.address || '—'}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-24 flex-shrink-0">電話</span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)] break-all">{selectedStore.phone || '—'}</span>
                  </div>
                  <div className="px-4 py-2.5 flex">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-24 flex-shrink-0">メール</span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)] break-all">{selectedStore.email || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 営業情報 */}
              <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">営業情報</p>
                </div>
                <div className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                  <div className="px-4 py-2.5 flex">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-24 flex-shrink-0">開業日</span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                      {selectedStore.openingDate ? new Date(selectedStore.openingDate).toLocaleDateString('ja-JP') : '—'}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-24 flex-shrink-0">閉店日</span>
                    <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                      {selectedStore.closingDate ? new Date(selectedStore.closingDate).toLocaleDateString('ja-JP') : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 外部リンク */}
              {(selectedStore.googleBusinessUrl || selectedStore.oikuraPageUrl) && (
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">外部リンク</p>
                  </div>
                  <div className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {selectedStore.googleBusinessUrl && (
                      <div className="px-4 py-2.5 flex">
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-32 flex-shrink-0">Google Business</span>
                        <a
                          href={selectedStore.googleBusinessUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--portal-primary,#374151)] underline break-all hover:opacity-80"
                        >
                          {selectedStore.googleBusinessUrl}
                        </a>
                      </div>
                    )}
                    {selectedStore.oikuraPageUrl && (
                      <div className="px-4 py-2.5 flex">
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-32 flex-shrink-0">おいくらページ</span>
                        <a
                          href={selectedStore.oikuraPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--portal-primary,#374151)] underline break-all hover:opacity-80"
                        >
                          {selectedStore.oikuraPageUrl}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 各種番号 */}
              {(selectedStore.invoiceNumber || selectedStore.antiquePermitNumber) && (
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">各種番号</p>
                  </div>
                  <div className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {selectedStore.invoiceNumber && (
                      <div className="px-4 py-2.5 flex">
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-32 flex-shrink-0">インボイス番号</span>
                        <span className="text-sm text-[var(--md-sys-color-on-surface)] break-all">{selectedStore.invoiceNumber}</span>
                      </div>
                    )}
                    {selectedStore.antiquePermitNumber && (
                      <div className="px-4 py-2.5 flex">
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-32 flex-shrink-0">古物商番号</span>
                        <span className="text-sm text-[var(--md-sys-color-on-surface)] break-all">{selectedStore.antiquePermitNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 詳細ページへ */}
              <div className="pt-2">
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => router.push(`/admin/stores/${selectedStore.id}`)}
                >
                  詳細ページを開く
                </Button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
