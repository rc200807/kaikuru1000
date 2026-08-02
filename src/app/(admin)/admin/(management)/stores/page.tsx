'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import DataTable, { type Column } from '@/components/DataTable'
import LoadingSpinner from '@/components/LoadingSpinner'
import BankSearch from '@/components/customer/BankSearch'
import StoreBulkEditModal from '@/components/admin/StoreBulkEditModal'
import SheetSyncModal from '@/components/admin/SheetSyncModal'
import ViewTabs, { type ListView } from '@/components/list/ViewTabs'
import FilterChipBar from '@/components/list/FilterChipBar'
import AdvancedFilterPanel from '@/components/list/AdvancedFilterPanel'
import ColumnPicker from '@/components/list/ColumnPicker'
import BulkActionBar from '@/components/list/BulkActionBar'
import {
  storeListChips, storeListAdvFields, STORES_PRESET_VIEWS,
  STORE_FILTER_PARAM_KEYS, parseStoreFilterString, applyStoreFilters,
  storeMissingKeys, MISSING_LABEL,
} from '@/components/list/store-list-filter-defs'
import { useListQueryState, serializeParams } from '@/hooks/useListQueryState'
import { downloadCsv, csvDateStamp } from '@/lib/client-csv'
import { parseServiceAreas } from '@/lib/address-utils'
import { STORE_STATUSES, storeStatusLabel } from '@/lib/store-status'
import {
  STORE_SERVICES, STORE_SERVICE_LABEL, STORE_SERVICE_BADGE,
  parseStoreServices, stringifyStoreServices, storeServicesLabel,
} from '@/lib/store-services'

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
  lineAddFriendUrl: string | null
  contractNotifyEmail: string | null
  calendarInviteEmail: string | null
  bankInfo: string | null
  bankName: string | null
  branchName: string | null
  accountType: string | null
  accountNumber: string | null
  accountHolder: string | null
  invoiceNumber: string | null
  antiquePermitNumber: string | null
  serviceAreas: string | null
  supportedServices: string | null
  operatorId: string | null
  operator: { id: string; name: string } | null
  createdAt: string | null
  hasLoggedIn?: boolean
  lastLoginAt?: string | null
  _count: { customers: number }
}

// 「列を編集」で切り替えられる列（店舗名・操作は常時表示）
const STORE_COLUMN_OPTIONS = [
  { key: 'code', label: 'コード' },
  { key: 'prefecture', label: 'エリア' },
  { key: 'serviceAreas', label: '対応エリア' },
  { key: 'supportedServices', label: '対応サービス' },
  { key: 'contact', label: '連絡先' },
  { key: 'customers', label: '顧客数' },
  { key: 'loginStatus', label: 'ログイン状態' },
  { key: 'operator', label: '運営者' },
  { key: 'openingDate', label: '開業日' },
  { key: 'createdAt', label: '登録日' },
  { key: 'missing', label: '情報不備' },
]
const STORE_COLUMN_KEYS = STORE_COLUMN_OPTIONS.map(c => c.key)
// デフォルトは従来の5列（見た目の互換性維持）
const STORE_DEFAULT_COLS = ['code', 'prefecture', 'serviceAreas', 'customers', 'loginStatus']
const STORE_COLS_STORAGE_KEY = 'kk-admin-stores-cols'

export default function AdminStoresPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 新規店舗追加モーダル
  const [showCreateModal, setShowCreateModal] = useState(false)

  // 一括編集モーダル（null=閉、配列=その店舗群を編集対象に開く）
  const [bulkEditTargets, setBulkEditTargets] = useState<Store[] | null>(null)

  // フィルタ状態（URLと双方向同期）
  const { params, setParams, replaceParams, ready } = useListQueryState(STORE_FILTER_PARAM_KEYS)
  const filterQuery = serializeParams(params, STORE_FILTER_PARAM_KEYS)

  // 保存ビュー・表示列・詳細フィルター
  const [savedViews, setSavedViews] = useState<ListView[]>([])
  const [visibleCols, setVisibleCols] = useState<string[]>(STORE_DEFAULT_COLS)
  const [advOpen, setAdvOpen] = useState(false)

  // 運営者一覧（詳細フィルター用）
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([])

  // 行選択・一括操作
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
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
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSentDone, setEmailSentDone] = useState(false)

  // パスワード再発行中の店舗ID
  const [resettingId, setResettingId] = useState<string | null>(null)

  // 行アクションメニュー（3点リーダー）— テーブルの overflow クリップを避けるため fixed 配置
  const [rowMenu, setRowMenu] = useState<{ store: Store; x: number; y: number } | null>(null)

  // 店舗の削除（業務データが紐づく店舗は削除できず、何が残っているかを表示する）
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteBlockers, setDeleteBlockers] = useState<{ label: string; count: number }[] | null>(null)
  const [deleteHint, setDeleteHint] = useState('')

  // メニューを ESC / スクロール / リサイズで閉じる
  useEffect(() => {
    if (!rowMenu) return
    const close = () => setRowMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenu(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [rowMenu])

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
        fetch('/api/list-views?portal=admin-stores').then(r => r.ok ? r.json() : { views: [] }).catch(() => ({ views: [] })),
        fetch('/api/admin/operators').then(r => r.ok ? r.json() : []).catch(() => []),
      ]).then(([storesData, viewsData, operatorsData]) => {
        setStores(Array.isArray(storesData) ? storesData : [])
        const rawViews = Array.isArray(viewsData?.views) ? viewsData.views : []
        setSavedViews(rawViews.map((v: any) => ({
          id: v.id, name: v.name, filters: v.filters,
          columns: v.columns ? (() => { try { return JSON.parse(v.columns) } catch { return null } })() : null,
        })))
        const ops = Array.isArray(operatorsData) ? operatorsData : (operatorsData?.operators ?? [])
        setOperators(ops.map((o: any) => ({ id: o.id, name: o.name })))
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

  // 表示列をlocalStorageから復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_COLS_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0) {
          setVisibleCols(arr.filter((k: string) => STORE_COLUMN_KEYS.includes(k)))
        }
      }
    } catch { /* ignore */ }
  }, [])

  function updateVisibleCols(cols: string[]) {
    setVisibleCols(cols)
    try { localStorage.setItem(STORE_COLS_STORAGE_KEY, JSON.stringify(cols)) } catch { /* ignore */ }
  }

  // フィルタが変わったら行選択を解除
  useEffect(() => {
    setSelectedIds(new Set())
    setAllMatching(false)
  }, [filterQuery])

  function refreshStores() {
    fetch('/api/stores').then(r => r.json()).then(d => setStores(Array.isArray(d) ? d : []))
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

  // 3点リーダー「初期ログイン情報を取得」— パスワードは復元不可のため取得のたびに再発行する
  async function handleFetchLoginInfo(store: Store) {
    setRowMenu(null)
    if (!confirm(
      `「${store.name}」の初期ログイン情報を取得します。\n\n` +
      `新しいパスワードが発行され、現在のパスワードは無効になります。\n` +
      `すでにログイン中の店舗がある場合はご注意ください。よろしいですか？`
    )) return
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
      setMessage({ type: 'error', text: data.error || '初期ログイン情報の取得に失敗しました' })
    }
  }

  // 3点リーダー「この店舗を削除」
  function openDelete(store: Store) {
    setRowMenu(null)
    setDeleteBlockers(null)
    setDeleteHint('')
    setDeleteTarget(store)
  }

  async function handleDeleteStore() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/admin/stores/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // 業務データが残っている → 中止して内訳を表示
        setDeleteBlockers(data.blockers ?? [])
        setDeleteHint(data.hint ?? '')
        return
      }
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
        setDeleteTarget(null)
        return
      }
      setDeleteTarget(null)
      setMessage({ type: 'success', text: `店舗「${deleteTarget.name}」を削除しました` })
      refreshStores()
    } catch {
      setMessage({ type: 'error', text: '削除に失敗しました' })
    } finally {
      setDeleteBusy(false)
    }
  }

  function handleCopyPassword() {
    if (!passwordModal) return
    navigator.clipboard.writeText(passwordModal.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCopyEmail() {
    if (!passwordModal?.storeEmail) return
    navigator.clipboard.writeText(passwordModal.storeEmail)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
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
    setCopiedEmail(false)
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
      bankName: store.bankName || '',
      branchName: store.branchName || '',
      accountType: store.accountType || '',
      accountNumber: store.accountNumber || '',
      accountHolder: store.accountHolder || '',
      invoiceNumber: store.invoiceNumber || '',
      antiquePermitNumber: store.antiquePermitNumber || '',
      supportedServices: store.supportedServices || '[]',
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

  // ---- スプレッドシート同期 ----
  const [sheetSyncOpen, setSheetSyncOpen] = useState(false)

  // ---- 店舗情報CSVインポート ----
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ totalRows: number; createdCount: number; updatedCount: number; errorCount: number; errors: { row: number; code?: string; message: string }[] } | null>(null)

  async function handleImportFile(file: File) {
    setImporting(true)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/stores/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'インポートに失敗しました' })
        return
      }
      setImportResult(data)
      refreshStores()
    } catch {
      setMessage({ type: 'error', text: 'インポートに失敗しました' })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  // 店舗は最大200件程度なのでメモ化不要（早期returnより後に置くためフックは使わない）
  const filtered = applyStoreFilters(stores, params)

  // ---- 保存ビュー ----
  const views: ListView[] = [...STORES_PRESET_VIEWS, ...savedViews]
  const activeViewId = views.find(
    v => serializeParams(parseStoreFilterString(v.filters), STORE_FILTER_PARAM_KEYS) === filterQuery
  )?.id ?? null

  function handleSelectView(v: ListView) {
    replaceParams(parseStoreFilterString(v.filters))
    if (v.columns && v.columns.length > 0) {
      updateVisibleCols(v.columns.filter(k => STORE_COLUMN_KEYS.includes(k)))
    }
  }

  async function handleSaveView(name: string) {
    const res = await fetch('/api/list-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: 'admin-stores', name, filters: filterQuery, columns: visibleCols }),
    })
    if (res.ok) {
      const v = await res.json()
      setSavedViews(prev => [...prev, { id: v.id, name: v.name, filters: v.filters, columns: visibleCols }])
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error || 'ビューの保存に失敗しました' })
    }
  }

  async function handleDeleteView(v: ListView) {
    if (!confirm(`ビュー「${v.name}」を削除しますか？`)) return
    const res = await fetch(`/api/list-views/${v.id}`, { method: 'DELETE' })
    if (res.ok) setSavedViews(prev => prev.filter(x => x.id !== v.id))
  }

  // ---- CSVエクスポート（クライアント生成・表示列連動）----
  function handleExportCsv(rows: Store[]) {
    // 列キー → CSV列（複合列は複数列に展開）
    const csvFields: Record<string, { header: string; value: (s: Store) => string }[]> = {
      code: [{ header: '店舗コード', value: s => s.code }],
      prefecture: [{ header: 'エリア', value: s => s.prefecture || '' }],
      serviceAreas: [{
        header: '対応エリア',
        value: s => parseServiceAreas(s.serviceAreas)
          .map(a => a.cities.length > 0 ? `${a.prefecture}(${a.cities.length})` : a.prefecture)
          .join('; '),
      }],
      supportedServices: [{ header: '対応サービス', value: s => storeServicesLabel(s.supportedServices) }],
      contact: [
        { header: 'メールアドレス', value: s => s.email || '' },
        { header: '電話番号', value: s => s.phone || '' },
      ],
      customers: [{ header: '顧客数', value: s => String(s._count.customers) }],
      loginStatus: [
        { header: 'ログイン状態', value: s => s.hasLoggedIn ? 'アクティブ' : '未ログイン' },
        { header: '最終ログイン', value: s => s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '' },
      ],
      operator: [{ header: '運営者', value: s => s.operator?.name || '' }],
      openingDate: [{ header: '開業日', value: s => s.openingDate ? s.openingDate.slice(0, 10) : '' }],
      createdAt: [{ header: '登録日', value: s => s.createdAt ? s.createdAt.slice(0, 10) : '' }],
      missing: [{ header: '情報不備', value: s => storeMissingKeys(s).map(k => MISSING_LABEL[k]).join('、') }],
    }
    // 店舗名は常に先頭。code は表示列に無くても含める（識別用）
    const colKeys = ['code', ...visibleCols.filter(k => k !== 'code')]
    const fields = [
      { header: '店舗名', value: (s: Store) => s.name },
      ...colKeys.flatMap(k => csvFields[k] ?? []),
    ]
    downloadCsv(
      `stores_${csvDateStamp()}.csv`,
      fields.map(f => f.header),
      rows.map(s => fields.map(f => f.value(s)))
    )
  }

  // ---- 一括操作 ----
  const bulkSelectionRows = allMatching ? filtered : filtered.filter(s => selectedIds.has(s.id))

  function handleBulkAction(key: string) {
    if (key === 'bulkEdit') {
      setBulkEditTargets(bulkSelectionRows)
    } else if (key === 'export') {
      handleExportCsv(bulkSelectionRows.length > 0 ? bulkSelectionRows : filtered)
    }
  }

  // 列キー → 列定義（表示列は visibleCols で合成。店舗名は先頭・操作は末尾に固定）
  const columnByKey: Record<string, Column<Store>> = {
    code: {
      key: 'code',
      header: 'コード',
      hideOnMobile: true,
      render: (store) => (
        <code className="text-xs bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-[var(--md-sys-shape-extra-small)]">
          {store.code}
        </code>
      ),
      sortable: true,
      sortValue: (store) => store.code,
    },
    prefecture: {
      key: 'prefecture',
      header: 'エリア',
      hideOnMobile: true,
      render: (store) => <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{store.prefecture || '—'}</span>,
      sortable: true,
      sortValue: (store) => store.prefecture || '',
    },
    serviceAreas: {
      key: 'serviceAreas',
      header: '対応エリア',
      hideOnMobile: true,
      render: (store) => {
        const areas = parseServiceAreas(store.serviceAreas)
        if (areas.length === 0) {
          return <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">未登録</span>
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {areas.map(a => (
              <span
                key={a.prefecture}
                title={a.cities.length > 0 ? `${a.prefecture}: ${a.cities.join('、')}` : a.prefecture}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap"
              >
                {a.prefecture}{a.cities.length > 0 ? `（${a.cities.length}）` : ''}
              </span>
            ))}
          </div>
        )
      },
    },
    supportedServices: {
      key: 'supportedServices',
      header: '対応サービス',
      hideOnMobile: true,
      render: (store) => {
        const services = parseStoreServices(store.supportedServices)
        if (services.length === 0) {
          return <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">未設定</span>
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {services.map(k => (
              <span
                key={k}
                className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium"
                style={{ backgroundColor: STORE_SERVICE_BADGE[k].bg, color: STORE_SERVICE_BADGE[k].fg }}
              >
                {STORE_SERVICE_LABEL[k]}
              </span>
            ))}
          </div>
        )
      },
      sortable: true,
      sortValue: (store) => parseStoreServices(store.supportedServices).length,
    },
    contact: {
      key: 'contact',
      header: '連絡先',
      hideOnMobile: true,
      render: (store) => (
        <div className="text-sm min-w-0">
          <p className="text-[var(--md-sys-color-on-surface)] truncate max-w-[220px]">{store.email || '—'}</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{store.phone || '—'}</p>
        </div>
      ),
    },
    customers: {
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
    loginStatus: {
      key: 'loginStatus',
      header: 'ログイン状態',
      render: (store) => {
        const active = !!store.hasLoggedIn
        return (
          <span
            title={active && store.lastLoginAt ? `最終ログイン: ${new Date(store.lastLoginAt).toLocaleString('ja-JP')}` : undefined}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
              active
                ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
                : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[var(--status-completed-text)]' : 'bg-[var(--md-sys-color-outline)]'}`} />
            {active ? 'アクティブ' : '未ログイン'}
          </span>
        )
      },
      sortable: true,
      sortValue: (store) => (store.hasLoggedIn ? 1 : 0),
    },
    operator: {
      key: 'operator',
      header: '運営者',
      hideOnMobile: true,
      render: (store) => <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{store.operator?.name || '—'}</span>,
      sortable: true,
      sortValue: (store) => store.operator?.name || '',
    },
    openingDate: {
      key: 'openingDate',
      header: '開業日',
      hideOnMobile: true,
      render: (store) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {store.openingDate ? new Date(store.openingDate).toLocaleDateString('ja-JP') : '—'}
        </span>
      ),
      sortable: true,
      sortValue: (store) => store.openingDate || '',
    },
    createdAt: {
      key: 'createdAt',
      header: '登録日',
      hideOnMobile: true,
      render: (store) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {store.createdAt ? new Date(store.createdAt).toLocaleDateString('ja-JP') : '—'}
        </span>
      ),
      sortable: true,
      sortValue: (store) => store.createdAt || '',
    },
    missing: {
      key: 'missing',
      header: '情報不備',
      hideOnMobile: true,
      render: (store) => {
        const missing = storeMissingKeys(store)
        if (missing.length === 0) {
          return <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">—</span>
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {missing.map(k => (
              <span
                key={k}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] whitespace-nowrap"
              >
                {MISSING_LABEL[k]}
              </span>
            ))}
          </div>
        )
      },
      sortable: true,
      sortValue: (store) => storeMissingKeys(store).length,
    },
  }

  const storeColumns: Column<Store>[] = [
    {
      key: 'name',
      header: '店舗名',
      render: (store) => <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{store.name}</span>,
      sortable: true,
      sortValue: (store) => store.name,
    },
    ...visibleCols.map(k => columnByKey[k]).filter(Boolean),
    {
      key: 'actions',
      header: '',
      render: (store) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 justify-end w-full">
          <Button
            size="sm"
            variant="text"
            onClick={() => router.push(`/admin/stores/${store.id}`)}
          >
            詳細
          </Button>
          <button
            type="button"
            aria-label="操作メニュー"
            title="操作"
            disabled={resettingId === store.id}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setRowMenu(prev =>
                prev?.store.id === store.id
                  ? null
                  : { store, x: rect.right, y: rect.bottom + 4 }
              )
            }}
            className="p-1.5 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {resettingId === store.id ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
              </svg>
            )}
          </button>
        </span>
      ),
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
            <Button
              size="sm"
              variant="outlined"
              onClick={() => setBulkEditTargets(filtered)}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            >
              一括編集
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
            <a href="/api/admin/stores/export" download>
              <Button
                size="sm"
                variant="outlined"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                }
              >
                店舗情報CSV
              </Button>
            </a>
            <Button
              size="sm"
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              loading={importing}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
                </svg>
              }
            >
              {importing ? '取込中...' : 'インポート'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
            />
            <Button
              size="sm"
              variant="outlined"
              onClick={() => setSheetSyncOpen(true)}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              }
            >
              シート同期
            </Button>
          </div>
        }
      />

      {/* ─── スプレッドシート同期 ─── */}
      <SheetSyncModal
        open={sheetSyncOpen}
        onClose={() => setSheetSyncOpen(false)}
        title="店舗情報のスプレッドシート同期"
        apiBase="/api/admin/stores/sheet-sync"
        keyLabel="店舗コード"
        onSynced={refreshStores}
      />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">

        {message && (
          <MessageBanner severity={message.type} className="mb-6" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}


        {/* 見出し + 店舗数 */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">
            店舗一覧
            <span className="ml-3 text-sm font-normal text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 rounded-full">
              {stores.length}店舗
            </span>
          </h2>
        </div>

        {/* 保存ビュータブ */}
        <ViewTabs
          views={views}
          activeId={activeViewId}
          dirty={false}
          onSelect={handleSelectView}
          onSaveCurrent={handleSaveView}
          onDelete={handleDeleteView}
        />

        {/* 検索 + ツール */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={params.search || ''}
              onChange={e => setParams({ search: e.target.value })}
              placeholder="店舗名・コード・住所・メール・対応エリアで検索..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <ColumnPicker options={STORE_COLUMN_OPTIONS} visible={visibleCols} onChange={updateVisibleCols} />
            <Button variant="outlined" size="sm" onClick={() => handleExportCsv(filtered)}>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 7.5m0 0l4.5 4.5M12 7.5V21" />
                </svg>
                CSVエクスポート
              </span>
            </Button>
          </div>
        </div>

        {/* クイックフィルタチップ */}
        <div className="mb-4">
          <FilterChipBar
            chips={storeListChips()}
            values={params}
            onChange={(patch) => setParams(patch)}
            trailing={
              <button
                type="button"
                onClick={() => setAdvOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                詳細フィルター
              </button>
            }
          />
        </div>

        {/* 一括操作バー */}
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={filtered.length}
          allMatching={allMatching}
          onSelectAllMatching={() => setAllMatching(true)}
          onClearSelection={() => { setSelectedIds(new Set()); setAllMatching(false) }}
          actions={[
            { key: 'bulkEdit', label: '一括編集' },
            { key: 'export', label: 'CSVエクスポート' },
          ]}
          onAction={handleBulkAction}
        />

        <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden mb-8">
          <DataTable<Store>
            columns={storeColumns}
            data={filtered}
            rowKey={(store) => store.id}
            emptyTitle={filterQuery ? '条件に一致する店舗がありません' : '店舗データがありません'}
            onRowClick={(store) => setSelectedStore(store)}
            selectable
            selectedKeys={allMatching ? new Set(filtered.map(s => s.id)) : selectedIds}
            onSelectionChange={(keys) => { setSelectedIds(keys); setAllMatching(false) }}
          />
          {filterQuery !== '' && filtered.length > 0 && filtered.length < stores.length && (
            <div className="px-4 py-2.5 bg-[var(--md-sys-color-surface-container-low)] border-t border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {stores.length}店舗中 {filtered.length}件を表示
            </div>
          )}
        </div>

      </div>

      {/* ─── 一括編集モーダル ─── */}
      <StoreBulkEditModal
        open={!!bulkEditTargets}
        stores={bulkEditTargets ?? []}
        operators={operators}
        onClose={() => { setBulkEditTargets(null); refreshStores() }}
      />

      {/* ─── CSVインポート結果 ─── */}
      <Modal open={!!importResult} onClose={() => setImportResult(null)} title="CSVインポート結果" size="md">
        {importResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 bg-[var(--md-sys-color-surface-container-low)] text-center">
                <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">新規作成</div>
                <div className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">{importResult.createdCount}</div>
              </div>
              <div className="rounded-lg p-3 bg-[var(--md-sys-color-surface-container-low)] text-center">
                <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">更新</div>
                <div className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">{importResult.updatedCount}</div>
              </div>
              <div className="rounded-lg p-3 bg-[var(--md-sys-color-surface-container-low)] text-center">
                <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">エラー</div>
                <div className={`text-xl font-bold ${importResult.errorCount > 0 ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface)]'}`}>{importResult.errorCount}</div>
              </div>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              対象 {importResult.totalRows} 行を処理しました。店舗コードで既存店舗を更新し、コード空欄の行は新規作成します。
            </p>
            {importResult.errors.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]">
                      <th className="px-2 py-1.5 text-left w-12">行</th>
                      <th className="px-2 py-1.5 text-left w-24">店舗コード</th>
                      <th className="px-2 py-1.5 text-left">エラー内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errors.map((e, i) => (
                      <tr key={i} className="border-t border-[var(--md-sys-color-outline-variant)]">
                        <td className="px-2 py-1.5">{e.row}</td>
                        <td className="px-2 py-1.5 font-mono">{e.code ?? '—'}</td>
                        <td className="px-2 py-1.5 text-[var(--md-sys-color-error)]">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setImportResult(null)}>閉じる</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── 詳細フィルター ─── */}
      <AdvancedFilterPanel
        open={advOpen}
        onClose={() => setAdvOpen(false)}
        fields={storeListAdvFields(operators)}
        values={params}
        onApply={(patch) => setParams(patch)}
        description="すべての条件に一致する店舗を表示します（AND条件）。"
        fetchCount={(draft) => Promise.resolve(applyStoreFilters(stores, { ...params, ...draft }).length)}
      />

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
        title="初期ログイン情報"
        size="sm"
      >
        {passwordModal && (
          <>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">{passwordModal.storeName}</p>

            {/* メールアドレス */}
            <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] p-4 mb-3">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">ログインメールアドレス</p>
              {passwordModal.storeEmail ? (
                <div className="flex items-center gap-3">
                  <code className="text-base font-medium text-[var(--md-sys-color-on-surface)] flex-1 break-all">
                    {passwordModal.storeEmail}
                  </code>
                  <button
                    onClick={handleCopyEmail}
                    className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors p-1 flex-shrink-0"
                    title="コピー"
                  >
                    {copiedEmail ? (
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
              ) : (
                <p className="text-sm text-[var(--md-sys-color-error)]">
                  メールアドレスが未設定です。店舗詳細から登録してください。
                </p>
              )}
            </div>

            {/* パスワード */}
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

      {/* ─── 行アクションメニュー（3点リーダー）─── */}
      {rowMenu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setRowMenu(null)}
            aria-hidden="true"
          />
          <div
            className="fixed z-[61] min-w-[224px] bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] shadow-[var(--md-sys-elevation-2)] py-1"
            style={{ top: rowMenu.y, left: rowMenu.x, transform: 'translateX(-100%)' }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleFetchLoginInfo(rowMenu.store)}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors flex items-center gap-2.5"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              初期ログイン情報を取得
            </button>
            <div className="my-1 border-t border-[var(--md-sys-color-outline-variant)]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => openDelete(rowMenu.store)}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors flex items-center gap-2.5"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              この店舗を削除
            </button>
          </div>
        </>
      )}

      {/* ─── 店舗の削除確認 ─── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleteBusy) setDeleteTarget(null) }}
        title={deleteBlockers ? 'この店舗は削除できません' : '店舗を削除しますか？'}
        size="sm"
      >
        {deleteTarget && (
          <div className="space-y-4">
            {deleteBlockers ? (
              <>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                  「{deleteTarget.name}」には次のデータが紐づいています。
                </p>
                <ul className="rounded-lg bg-[var(--md-sys-color-surface-container-low)] p-3 space-y-1">
                  {deleteBlockers.map(b => (
                    <li key={b.label} className="text-sm flex justify-between">
                      <span className="text-[var(--md-sys-color-on-surface-variant)]">{b.label}</span>
                      <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{b.count}件</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">{deleteHint}</p>
                <div className="flex justify-end">
                  <Button onClick={() => setDeleteTarget(null)}>閉じる</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                  「{deleteTarget.name}」（{deleteTarget.code}）を削除します。<br />
                  店舗メンバーのアカウント・チャット・在庫・カレンダー連携も一緒に削除されます。<br />
                  スプレッドシートを設定している場合は、その行も削除されます。<br />
                  <span className="text-[var(--md-sys-color-error)]">この操作は元に戻せません。</span>
                </p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  顧客・案件・決済などの記録がある店舗は削除できません。実行時に確認します。
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="text" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>キャンセル</Button>
                  <Button onClick={handleDeleteStore} loading={deleteBusy} disabled={deleteBusy}>削除する</Button>
                </div>
              </>
            )}
          </div>
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
                            {STORE_STATUSES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">対応サービス</label>
                        <div className="flex flex-wrap gap-2">
                          {STORE_SERVICES.map(svc => {
                            const selected = parseStoreServices(editForm.supportedServices).includes(svc.key)
                            return (
                              <button
                                key={svc.key}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                  const current = parseStoreServices(editForm.supportedServices)
                                  const next = selected ? current.filter(k => k !== svc.key) : [...current, svc.key]
                                  setEditForm({ ...editForm, supportedServices: stringifyStoreServices(next) })
                                }}
                                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                                  selected
                                    ? 'border-transparent'
                                    : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
                                }`}
                                style={selected ? { backgroundColor: STORE_SERVICE_BADGE[svc.key].bg, color: STORE_SERVICE_BADGE[svc.key].fg } : undefined}
                              >
                                {svc.label}
                              </button>
                            )
                          })}
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
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">銀行口座情報</h3>
                    <div className="space-y-3">
                      <BankSearch
                        bankName={editForm.bankName || ''}
                        branchName={editForm.branchName || ''}
                        onChange={({ bankName, branchName }) => setEditForm({ ...editForm, bankName, branchName })}
                        theme="dark"
                      />
                      <div>
                        <label className="block text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">口座種別</label>
                        <select
                          value={editForm.accountType || ''}
                          onChange={e => setEditForm({ ...editForm, accountType: e.target.value })}
                          className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                        >
                          <option value="">選択してください</option>
                          <option value="普通">普通</option>
                          <option value="当座">当座</option>
                        </select>
                      </div>
                      <TextField label="口座番号" value={editForm.accountNumber || ''} onChange={v => setEditForm({ ...editForm, accountNumber: v })} placeholder="1234567" />
                      <TextField label="口座名義" value={editForm.accountHolder || ''} onChange={v => setEditForm({ ...editForm, accountHolder: v })} placeholder="カ）カイクル" />
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
                        { label: 'ステータス', value: storeStatusLabel(detailStore.storeStatus) },
                        { label: '対応サービス', value: storeServicesLabel(detailStore.supportedServices) || null },
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

                  {(detailStore.bankName || detailStore.accountNumber) && (
                    <section>
                      <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">銀行口座情報</h3>
                      <dl className="space-y-3">
                        {[
                          { label: '銀行名', value: detailStore.bankName },
                          { label: '支店名', value: detailStore.branchName },
                          { label: '口座種別', value: detailStore.accountType },
                          { label: '口座番号', value: detailStore.accountNumber },
                          { label: '口座名義', value: detailStore.accountHolder },
                        ].map(item => (
                          <div key={item.label} className="flex gap-3">
                            <dt className="w-24 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 pt-0.5">{item.label}</dt>
                            <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0">
                              {item.value || <span className="text-[var(--md-sys-color-outline)]">{'—'}</span>}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}
                  {!detailStore.bankName && !detailStore.accountNumber && detailStore.bankInfo && (
                    <section>
                      <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">銀行情報（従来の登録内容）</h3>
                      <pre className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] p-3 border border-[var(--md-sys-color-outline-variant)]">{detailStore.bankInfo}</pre>
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">「編集」から新しい形式（全銀データ検索）で登録し直せます。</p>
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
                    {storeStatusLabel(selectedStore.storeStatus)}
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
