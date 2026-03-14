'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import SummaryCard from '@/components/SummaryCard'
import SearchFilterBar from '@/components/SearchFilterBar'
import DataTable, { type Column } from '@/components/DataTable'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import Tabs from '@/components/Tabs'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'

type User = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  idDocumentPath: string | null
  createdAt: string
  licenseKey: { key: string }
  store: { id: string; name: string; code: string } | null
  visitSchedules: Array<{ visitDate: string; status: string }>
  isTestData?: boolean
  isActive: boolean
  // 顧客タイプ
  customerType: string  // "visit" | "delivery"
  // 振込先口座情報
  bankName:      string | null
  branchName:    string | null
  accountType:   string | null
  accountNumber: string | null
  accountHolder: string | null
}

type Store = {
  id: string
  name: string
  code: string
  prefecture: string | null
}

type VisitSchedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
  user: { id: string; name: string }
}

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

type DetailTab = 'info' | 'add' | 'history'

export default function AdminCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showTestData, setShowTestData] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  // 削除・無効化処理中のユーザーID
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // 店舗割り当てモーダル
  const [assigning, setAssigning] = useState<{ userId: string; name: string } | null>(null)
  const [selectedStore, setSelectedStore] = useState('')

  // 顧客タイプ変更
  const [changingType, setChangingType] = useState<string | null>(null) // userId

  // 顧客詳細モーダル
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  const [detailSchedules, setDetailSchedules] = useState<VisitSchedule[]>([])
  const [detailSchedulesLoading, setDetailSchedulesLoading] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ storeId: '', visitDate: '', note: '' })
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') {
        router.push('/')
        return
      }

      const params = new URLSearchParams()
      if (showTestData) params.set('includeTestData', 'true')
      if (showInactive) params.set('includeInactive', 'true')
      const usersUrl = `/api/admin/users?${params.toString()}`
      Promise.all([
        fetch(usersUrl).then(r => r.json()),
        fetch('/api/stores').then(r => r.json()),
      ]).then(([usersData, storesData]) => {
        setUsers(Array.isArray(usersData) ? usersData : [])
        setStores(Array.isArray(storesData) ? storesData : [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session, showTestData, showInactive])

  // 顧客詳細モーダルを開いたときにスケジュール取得
  useEffect(() => {
    if (!detailUser) return
    setDetailTab('info')
    setScheduleMsg(null)
    setScheduleForm({ storeId: detailUser.store?.id || '', visitDate: '', note: '' })
    setDetailSchedulesLoading(true)
    setDetailSchedules([])
    fetch(`/api/visit-schedules?userId=${detailUser.id}`)
      .then(r => r.json())
      .then(data => {
        setDetailSchedules(Array.isArray(data) ? data : [])
        setDetailSchedulesLoading(false)
      })
      .catch(() => setDetailSchedulesLoading(false))
  }, [detailUser])

  async function handleAssign() {
    if (!assigning || !selectedStore) return
    setMessage(null)

    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: assigning.userId, storeId: selectedStore }),
    })

    if (res.ok) {
      const data = await res.json()
      setUsers(prev => prev.map(u =>
        u.id === assigning.userId
          ? { ...u, store: { id: selectedStore, name: data.storeName, code: '' } }
          : u
      ))
      setMessage({ type: 'success', text: `${assigning.name}を${data.storeName}に割り当てました` })
    } else {
      setMessage({ type: 'error', text: '割り当てに失敗しました' })
    }
    setAssigning(null)
    setSelectedStore('')
  }

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!detailUser || !scheduleForm.storeId || !scheduleForm.visitDate) return
    setScheduleSubmitting(true)
    setScheduleMsg(null)

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: detailUser.id,
        storeId: scheduleForm.storeId,
        visitDate: scheduleForm.visitDate,
        note: scheduleForm.note || undefined,
      }),
    })

    setScheduleSubmitting(false)

    if (res.ok) {
      const created = await res.json()
      setDetailSchedules(prev => [created, ...prev])
      // 顧客一覧の次回訪問日を更新
      setUsers(prev => prev.map(u =>
        u.id === detailUser.id
          ? { ...u, visitSchedules: [{ visitDate: created.visitDate, status: 'scheduled' }] }
          : u
      ))
      setScheduleMsg({ type: 'success', text: '訪問スケジュールを追加しました' })
      setScheduleForm(prev => ({ ...prev, visitDate: '', note: '' }))
    } else {
      setScheduleMsg({ type: 'error', text: 'スケジュールの追加に失敗しました' })
    }
  }

  async function handleStatusChange(scheduleId: string, newStatus: string) {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setDetailSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: newStatus } : s))
    }
  }

  async function handleChangeCustomerType(userId: string, newType: string) {
    setChangingType(userId)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerType: newType }),
    })
    setChangingType(null)
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, customerType: newType } : u))
      setDetailUser(prev => prev && prev.id === userId ? { ...prev, customerType: newType } : prev)
      setMessage({ type: 'success', text: `顧客タイプを「${newType === 'delivery' ? '宅配買取' : '訪問買取'}」に変更しました` })
    } else {
      setMessage({ type: 'error', text: 'タイプ変更に失敗しました' })
    }
  }

  function closeDetailModal() {
    setDetailUser(null)
    setDetailSchedules([])
    setScheduleMsg(null)
  }

  async function handleToggleActive(user: User) {
    const nextState = !user.isActive
    const label = nextState ? '有効化' : '無効化'
    if (!confirm(`「${user.name}」を${label}しますか？`)) return
    setTogglingId(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextState }),
    })
    setTogglingId(null)
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: nextState } : u))
      if (detailUser?.id === user.id) setDetailUser(prev => prev ? { ...prev, isActive: nextState } : null)
      setMessage({ type: 'success', text: `${user.name}を${label}しました` })
    } else {
      setMessage({ type: 'error', text: `${label}に失敗しました` })
    }
  }

  async function handleDeleteUser(user: User) {
    if (!confirm(`「${user.name}」を完全に削除しますか？\n訪問履歴もすべて削除されます。この操作は取り消せません。`)) return
    setDeletingId(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== user.id))
      if (detailUser?.id === user.id) closeDetailModal()
      setMessage({ type: 'success', text: `${user.name}を削除しました` })
    } else {
      const data = await res.json()
      setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
    }
  }

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.includes(search) || u.furigana.includes(search) || u.email.includes(search)
    const matchStore = !filterStore || (filterStore === 'unassigned' ? !u.store : u.store?.id === filterStore)
    return matchSearch && matchStore
  })

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  const unassignedCount = users.filter(u => !u.store).length
  const sortedDetailSchedules = [...detailSchedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: '顧客名',
      render: (user) => (
        <div>
          <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
            {user.name}
            {!user.isActive && (
              <span className="ml-1.5 text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-1.5 py-0.5 rounded-full">
                無効
              </span>
            )}
            {user.isTestData && (
              <span className="ml-1.5 text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                テスト
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{user.furigana}</div>
        </div>
      ),
      sortable: true,
      sortValue: (user) => user.furigana,
    },
    {
      key: 'contact',
      header: '連絡先',
      hideOnMobile: true,
      render: (user) => (
        <div>
          <div className="text-sm text-[var(--md-sys-color-on-surface)]">{user.email}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{user.phone}</div>
        </div>
      ),
    },
    {
      key: 'licenseKey',
      header: 'ライセンスキー',
      hideOnMobile: true,
      render: (user) => (
        <code className="text-xs bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-[var(--md-sys-shape-extra-small)]">
          {user.licenseKey.key}
        </code>
      ),
    },
    {
      key: 'store',
      header: '担当店舗',
      render: (user) => user.store ? (
        <span className="text-xs font-medium text-[var(--status-completed-text)] bg-[var(--status-completed-bg)] px-2 py-0.5 rounded-full">
          {user.store.name}
        </span>
      ) : (
        <span className="text-xs font-medium text-[var(--status-pending-text)] bg-[var(--status-pending-bg)] px-2 py-0.5 rounded-full">
          未割り当て
        </span>
      ),
    },
    {
      key: 'customerType',
      header: 'タイプ',
      hideOnMobile: true,
      render: (user) => user.customerType === 'delivery' ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">宅配</span>
      ) : (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">訪問</span>
      ),
    },
    {
      key: 'nextVisit',
      header: '次回訪問',
      hideOnMobile: true,
      render: (user) => {
        if (user.customerType === 'delivery') {
          return <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">宅配</span>
        }
        const nextVisit = user.visitSchedules?.[0]
        return nextVisit ? (
          <span className="text-sm text-[var(--status-scheduled-text)]">
            {format(new Date(nextVisit.visitDate), 'M/d（E）', { locale: ja })}
          </span>
        ) : (
          <span className="text-sm text-[var(--md-sys-color-outline)]">未定</span>
        )
      },
    },
    {
      key: 'idDoc',
      header: '身分証',
      hideOnMobile: true,
      render: (user) => user.idDocumentPath ? (
        <span className="text-xs font-medium text-[var(--status-completed-text)] bg-[var(--status-completed-bg)] px-2 py-0.5 rounded-full">提出済</span>
      ) : (
        <span className="text-xs font-medium text-[var(--status-pending-text)] bg-[var(--status-pending-bg)] px-2 py-0.5 rounded-full">未提出</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (user) => (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setDetailUser(user)}>
            詳細
          </Button>
          <Button
            size="sm"
            variant="outlined"
            onClick={() => { setAssigning({ userId: user.id, name: user.name }); setSelectedStore(user.store?.id || '') }}
          >
            店舗割り当て
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <AppBar title="顧客管理" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* 統計 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="登録顧客数" value={users.length} accentColor="bg-blue-600" />
          <SummaryCard label="未割り当て" value={unassignedCount} accentColor={unassignedCount > 0 ? 'bg-orange-500' : 'bg-[var(--md-sys-color-outline)]'} />
          <SummaryCard label="担当店舗数" value={stores.length} accentColor="bg-green-600" />
          <SummaryCard label="身分証未提出" value={users.filter(u => !u.idDocumentPath).length} accentColor="bg-red-500" />
        </div>

        {message && (
          <MessageBanner severity={message.type} className="mb-6" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)] mb-4">顧客一覧</h2>

        <div className="flex items-center gap-4 px-4 sm:px-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowInactive(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showInactive ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline)]'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                showInactive ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              無効化済みを表示
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowTestData(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showTestData ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline)]'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                showTestData ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              テストデータを表示
            </span>
          </label>
        </div>

        <SearchFilterBar
          filters={[
            { key: 'search', label: '検索', type: 'text', placeholder: '氏名・メールで検索...' },
            {
              key: 'store', label: '店舗', type: 'select',
              options: [
                { value: 'unassigned', label: '未割り当て' },
                ...stores.map(s => ({ value: s.id, label: s.name })),
              ],
            },
          ]}
          values={{ search, store: filterStore }}
          onChange={(key, value) => {
            if (key === 'search') setSearch(value)
            if (key === 'store') setFilterStore(value)
          }}
          onClear={() => { setSearch(''); setFilterStore('') }}
          className="mb-4"
        />

        <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden">
          <DataTable<User>
            columns={columns}
            data={filtered}
            rowKey={(user) => user.id}
            emptyTitle="該当する顧客がいません"
          />
        </div>
      </div>

      {/* 顧客詳細モーダル */}
      <Modal
        open={!!detailUser}
        onClose={closeDetailModal}
        title={detailUser ? `${detailUser.name} 様` : ''}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
            <div className="flex gap-2">
              {detailUser && (
                <>
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={togglingId === detailUser.id}
                    loading={togglingId === detailUser.id}
                    onClick={() => handleToggleActive(detailUser)}
                  >
                    {detailUser.isActive ? '無効化' : '有効化'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={deletingId === detailUser.id}
                    loading={deletingId === detailUser.id}
                    className="text-[var(--md-sys-color-error)] border-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]"
                    onClick={() => handleDeleteUser(detailUser)}
                  >
                    削除
                  </Button>
                </>
              )}
            </div>
            <Button variant="tonal" onClick={closeDetailModal}>閉じる</Button>
          </div>
        }
      >
        {detailUser && (
          <>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] -mt-2 mb-3">{detailUser.furigana}</p>

            <Tabs
              tabs={[
                { key: 'info', label: '基本情報' },
                { key: 'add', label: 'スケジュール追加' },
                { key: 'history', label: detailSchedules.length > 0 ? `訪問履歴（${detailSchedules.length}）` : '訪問履歴' },
              ]}
              activeKey={detailTab}
              onChange={(key) => { setDetailTab(key as DetailTab); setScheduleMsg(null) }}
              className="mb-4"
            />

            {/* 基本情報 */}
            {detailTab === 'info' && (
              <div className="space-y-4">
                <dl className="space-y-3">
                  {[
                    { label: 'メール', value: detailUser.email },
                    { label: '電話番号', value: detailUser.phone },
                    { label: '訪問先住所', value: detailUser.address },
                    { label: 'ライセンスキー', value: detailUser.licenseKey.key, mono: true },
                    { label: '担当店舗', value: detailUser.store?.name || '未割り当て' },
                    { label: '登録日', value: format(new Date(detailUser.createdAt), 'yyyy年M月d日', { locale: ja }) },
                  ].map(item => (
                    <div key={item.label} className="flex gap-3">
                      <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                      <dd className={`text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0 ${(item as any).mono ? 'font-mono text-xs' : ''}`}>{item.value}</dd>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">身分証</dt>
                    <dd className="text-sm">
                      {detailUser.idDocumentPath
                        ? <a href={detailUser.idDocumentPath} target="_blank" rel="noopener noreferrer" className="text-[var(--portal-primary,#374151)] underline">確認する</a>
                        : <span className="text-[var(--status-pending-text)]">未提出</span>
                      }
                    </dd>
                  </div>
                </dl>

                {/* 顧客タイプ変更 */}
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">顧客タイプ</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full self-start ${detailUser.customerType === 'delivery' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {detailUser.customerType === 'delivery' ? '宅配買取' : '訪問買取'}
                    </span>
                    <Button
                      size="sm"
                      variant="outlined"
                      disabled={changingType === detailUser.id}
                      loading={changingType === detailUser.id}
                      onClick={() => handleChangeCustomerType(
                        detailUser.id,
                        detailUser.customerType === 'delivery' ? 'visit' : 'delivery'
                      )}
                    >
                      {detailUser.customerType === 'delivery' ? '訪問買取に変更' : '宅配買取に変更'}
                    </Button>
                  </div>
                </div>

                {/* 振込先口座情報（読み取り専用） */}
                {(detailUser.bankName || detailUser.bankName === null) && (
                  <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                    <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                      <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">振込先口座情報</span>
                    </div>
                    {detailUser.bankName ? (
                      <dl className="px-4 py-3 space-y-2">
                        {[
                          { label: '銀行名',   value: detailUser.bankName },
                          { label: '支店名',   value: detailUser.branchName },
                          { label: '口座種別', value: detailUser.accountType },
                          { label: '口座番号', value: detailUser.accountNumber },
                          { label: '口座名義', value: detailUser.accountHolder },
                        ].filter(item => item.value).map(item => (
                          <div key={item.label} className="flex gap-3">
                            <dt className="w-20 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                            <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="px-4 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">未登録</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* スケジュール追加 */}
            {detailTab === 'add' && (
              <form onSubmit={handleAddSchedule} className="space-y-4">
                {scheduleMsg && (
                  <MessageBanner severity={scheduleMsg.type}>
                    {scheduleMsg.text}
                  </MessageBanner>
                )}
                <div>
                  <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                    担当店舗 <span className="text-[var(--md-sys-color-error)]">*</span>
                  </label>
                  <select
                    value={scheduleForm.storeId}
                    onChange={e => setScheduleForm({ ...scheduleForm, storeId: e.target.value })}
                    required
                    className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                  >
                    <option value="">店舗を選択...</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>
                        [{s.code}] {s.name} {s.prefecture ? `（${s.prefecture}）` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <TextField
                  label="訪問日"
                  type="date"
                  value={scheduleForm.visitDate}
                  onChange={v => setScheduleForm({ ...scheduleForm, visitDate: v })}
                  required
                />
                <TextField
                  label="メモ（任意）"
                  value={scheduleForm.note}
                  onChange={v => setScheduleForm({ ...scheduleForm, note: v })}
                  placeholder="訪問に関するメモを入力..."
                  rows={3}
                />
                <Button
                  type="submit"
                  disabled={scheduleSubmitting || !scheduleForm.storeId || !scheduleForm.visitDate}
                  loading={scheduleSubmitting}
                  fullWidth
                >
                  {scheduleSubmitting ? '追加中...' : 'スケジュールを追加'}
                </Button>
              </form>
            )}

            {/* 訪問履歴 */}
            {detailTab === 'history' && (
              <div>
                {detailSchedulesLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : sortedDetailSchedules.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-[var(--md-sys-color-outline)]">訪問スケジュールがありません</p>
                    <p className="text-xs text-[var(--md-sys-color-outline)] mt-1">「スケジュール追加」タブから登録できます</p>
                  </div>
                ) : (
                  <div>
                    {sortedDetailSchedules.map(vs => (
                      <div key={vs.id} className="flex items-start gap-3 py-3 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0">
                        <div className="w-9 h-9 bg-[var(--md-sys-color-surface-container-high)] rounded-[var(--md-sys-shape-small)] flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                              {format(new Date(vs.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                            </span>
                            <StatusBadge status={vs.status as any} />
                            <select
                              value={vs.status}
                              onChange={e => handleStatusChange(vs.id, e.target.value)}
                              className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:ring-1 focus:ring-[var(--portal-primary,#374151)] text-[var(--md-sys-color-on-surface-variant)]"
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">{vs.store.name}</p>
                          {vs.note && <p className="text-xs text-[var(--md-sys-color-outline)] mt-0.5 truncate">{vs.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* 店舗割り当てモーダル */}
      <Modal
        open={!!assigning}
        onClose={() => { setAssigning(null); setSelectedStore('') }}
        title="店舗割り当て"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => { setAssigning(null); setSelectedStore('') }}>
              キャンセル
            </Button>
            <Button onClick={handleAssign} disabled={!selectedStore}>
              割り当てる
            </Button>
          </>
        }
      >
        {assigning && (
          <>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{assigning.name}</span> の担当店舗を設定します
            </p>
            <select
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
              className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            >
              <option value="">店舗を選択...</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  [{s.code}] {s.name} {s.prefecture ? `（${s.prefecture}）` : ''}
                </option>
              ))}
            </select>
          </>
        )}
      </Modal>
    </>
  )
}
