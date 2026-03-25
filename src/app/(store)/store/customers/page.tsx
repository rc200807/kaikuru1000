'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import Tabs from '@/components/Tabs'
import SearchFilterBar from '@/components/SearchFilterBar'
import DataTable from '@/components/DataTable'
import type { Column } from '@/components/DataTable'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import MessageBanner from '@/components/MessageBanner'
import EmptyState from '@/components/EmptyState'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  idDocumentPath: string | null
  // 身分証OCR抽出フィールド
  idDocumentType:   string | null
  idName:           string | null
  idBirthDate:      string | null
  idAddress:        string | null
  idLicenseNumber:  string | null
  idExpiryDate:     string | null
  idOcrIssueReport: string | null
  createdAt: string
  visitSchedules: Array<{ visitDate: string; status: string }>
  // 顧客タイプ
  customerType: string  // "visit" | "delivery" | "regular"
  // 振込先口座情報
  bankName:      string | null
  branchName:    string | null
  accountType:   string | null
  accountNumber: string | null
  accountHolder: string | null
}

type DeliveryShipment = {
  id: string
  shipmentNumber: string
  shipmentMonth: string
  description: string | null
  imageUrls: string[]
  purchaseAmount: number | null
  status: string
  storeNote: string | null
  createdAt: string
}

type VisitSchedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
  user: { id: string; name: string }
}

type PurchaseMemo = {
  id: string
  title: string
  description: string | null
  imageUrls: string[]
  status: string
  storeNote: string | null
  aiAppraisal: any | null
  aiAppraisalAt: string | null
  createdAt: string
}

const MEMO_STATUS_OPTIONS = [
  { value: 'pending',   label: '未確認' },
  { value: 'reviewed',  label: '確認済み' },
  { value: 'completed', label: '対応完了' },
]

const MEMO_STATUS_STYLE: Record<string, string> = {
  pending:   'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  reviewed:  'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
}

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

const SHIPMENT_STATUS_OPTIONS = [
  { value: 'registered', label: '登録済み' },
  { value: 'shipped',    label: '発送済み' },
  { value: 'received',   label: '受取済み' },
  { value: 'appraised',  label: '査定完了' },
]

type ModalTab = 'info' | 'add' | 'history' | 'memos' | 'shipments'

export default function StoreCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // ページネーション
  const [customersPage, setCustomersPage] = useState(1)
  const [customersHasMore, setCustomersHasMore] = useState(false)
  const [customersTotal, setCustomersTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const CUSTOMERS_LIMIT = 50

  // モーダル
  const [selected, setSelected] = useState<Customer | null>(null)
  const [modalTab, setModalTab] = useState<ModalTab>('info')
  const [schedules, setSchedules] = useState<VisitSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)

  // スケジュール追加フォーム
  const [addForm, setAddForm] = useState({ visitDate: '', startTime: '', endTime: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 買取相談メモ
  const [memosList, setMemosList] = useState<PurchaseMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [memosLoaded, setMemosLoaded] = useState(false)
  const [memoStoreNotes, setMemoStoreNotes] = useState<Record<string, string>>({})
  const [savingMemoNote, setSavingMemoNote] = useState<string | null>(null)

  // 宅配送付履歴（店舗側）
  const [shipmentsList, setShipmentsList] = useState<DeliveryShipment[]>([])
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [shipmentsLoaded, setShipmentsLoaded] = useState(false)
  const [shipmentEdits, setShipmentEdits] = useState<Record<string, { purchaseAmount: string; storeNote: string; status: string }>>({})
  const [savingShipment, setSavingShipment] = useState<string | null>(null)

  // 身分証削除
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState(false)
  const [docMsg, setDocMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 新規顧客追加
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [addCustomerForm, setAddCustomerForm] = useState({ name: '', furigana: '', email: '', phone: '', address: '', password: '' })
  const [addCustomerSubmitting, setAddCustomerSubmitting] = useState(false)
  const [addCustomerMsg, setAddCustomerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      fetch(`/api/stores/${storeId}/customers?page=1&limit=${CUSTOMERS_LIMIT}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.customers ?? (Array.isArray(data) ? data : [])
          setCustomers(list)
          setCustomersTotal(data?.total ?? list.length)
          setCustomersPage(1)
          setCustomersHasMore((data?.total ?? list.length) > CUSTOMERS_LIMIT)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  async function loadMoreCustomers() {
    setLoadingMore(true)
    const storeId = (session?.user as any).id
    const nextPage = customersPage + 1
    try {
      const res = await fetch(`/api/stores/${storeId}/customers?page=${nextPage}&limit=${CUSTOMERS_LIMIT}`)
      const data = await res.json()
      const list = data?.customers ?? (Array.isArray(data) ? data : [])
      setCustomers(prev => [...prev, ...list])
      setCustomersPage(nextPage)
      setCustomersHasMore(nextPage * CUSTOMERS_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  // 顧客選択時にスケジュール一覧を取得
  useEffect(() => {
    if (!selected) return
    setModalTab('info')
    setScheduleMsg(null)
    setAddForm({ visitDate: '', startTime: '', endTime: '', note: '' })
    setSchedulesLoading(true)
    setSchedules([])
    setMemosList([])
    setMemosLoaded(false)
    setMemoStoreNotes({})
    setShipmentsList([])
    setShipmentsLoaded(false)
    setShipmentEdits({})
    fetch(`/api/visit-schedules?userId=${selected.id}`)
      .then(r => r.json())
      .then(data => {
        const list = data?.schedules ?? (Array.isArray(data) ? data : [])
        setSchedules(list)
        setSchedulesLoading(false)
      })
      .catch(() => setSchedulesLoading(false))
  }, [selected])

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !addForm.visitDate) return
    const storeId = (session?.user as any).id
    setSubmitting(true)
    setScheduleMsg(null)

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selected.id,
        storeId,
        visitDate: addForm.visitDate,
        startTime: addForm.startTime || undefined,
        endTime: addForm.endTime || undefined,
        note: addForm.note || undefined,
      }),
    })

    setSubmitting(false)

    if (res.ok) {
      const created = await res.json()
      setSchedules(prev => [created, ...prev])
      // 顧客一覧の次回訪問日を更新
      setCustomers(prev => prev.map(c =>
        c.id === selected.id
          ? { ...c, visitSchedules: [{ visitDate: created.visitDate, status: 'scheduled' }] }
          : c
      ))
      setScheduleMsg({ type: 'success', text: '訪問スケジュールを追加しました' })
      setAddForm({ visitDate: '', startTime: '', endTime: '', note: '' })
    } else {
      setScheduleMsg({ type: 'error', text: 'スケジュールの追加に失敗しました' })
    }
  }

  // メモタブ切り替え時に読み込み
  function handleModalTabChange(key: string) {
    setModalTab(key as ModalTab)
    setScheduleMsg(null)
    if (key === 'memos' && !memosLoaded && selected) {
      setMemosLoading(true)
      fetch(`/api/purchase-memos?userId=${selected.id}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.memos ?? (Array.isArray(data) ? data : [])
          setMemosList(list)
          const notes: Record<string, string> = {}
          list.forEach((m: PurchaseMemo) => { notes[m.id] = m.storeNote ?? '' })
          setMemoStoreNotes(notes)
          setMemosLoaded(true)
          setMemosLoading(false)
        })
        .catch(() => { setMemosLoaded(true); setMemosLoading(false) })
    }
    if (key === 'shipments' && !shipmentsLoaded && selected) {
      setShipmentsLoading(true)
      fetch(`/api/delivery-shipments?userId=${selected.id}`)
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : []
          setShipmentsList(list)
          const edits: Record<string, { purchaseAmount: string; storeNote: string; status: string }> = {}
          list.forEach((s: DeliveryShipment) => {
            edits[s.id] = {
              purchaseAmount: s.purchaseAmount !== null ? String(s.purchaseAmount) : '',
              storeNote: s.storeNote ?? '',
              status: s.status,
            }
          })
          setShipmentEdits(edits)
          setShipmentsLoaded(true)
          setShipmentsLoading(false)
        })
        .catch(() => { setShipmentsLoaded(true); setShipmentsLoading(false) })
    }
  }

  async function handleMemoStatusChange(memoId: string, newStatus: string) {
    const res = await fetch(`/api/purchase-memos/${memoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setMemosList(prev => prev.map(m => m.id === memoId ? { ...m, status: newStatus } : m))
    }
  }

  async function handleSaveMemoNote(memoId: string) {
    setSavingMemoNote(memoId)
    const res = await fetch(`/api/purchase-memos/${memoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeNote: memoStoreNotes[memoId] ?? '' }),
    })
    setSavingMemoNote(null)
    if (res.ok) {
      setMemosList(prev => prev.map(m => m.id === memoId ? { ...m, storeNote: memoStoreNotes[memoId] ?? '' } : m))
    }
  }

  async function handleStatusChange(scheduleId: string, newStatus: string) {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: newStatus } : s))
    }
  }

  async function handleSaveShipment(shipmentId: string) {
    setSavingShipment(shipmentId)
    const edit = shipmentEdits[shipmentId]
    const res = await fetch(`/api/delivery-shipments/${shipmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: edit.status,
        purchaseAmount: edit.purchaseAmount !== '' ? Number(edit.purchaseAmount) : null,
        storeNote: edit.storeNote || null,
      }),
    })
    setSavingShipment(null)
    if (res.ok) {
      const updated = await res.json()
      setShipmentsList(prev => prev.map(s => s.id === shipmentId ? updated : s))
      // editsも更新
      setShipmentEdits(prev => ({
        ...prev,
        [shipmentId]: {
          purchaseAmount: updated.purchaseAmount !== null ? String(updated.purchaseAmount) : '',
          storeNote: updated.storeNote ?? '',
          status: updated.status,
        },
      }))
      setScheduleMsg({ type: 'success', text: '送付情報を更新しました' })
    } else {
      setScheduleMsg({ type: 'error', text: '更新に失敗しました' })
    }
  }

  async function handleDeleteIdDocument() {
    if (!selected) return
    setDeletingDoc(true)
    setDocMsg(null)
    try {
      const res = await fetch(`/api/users/${selected.id}/id-document`, { method: 'DELETE' })
      if (res.ok) {
        const cleared = {
          idDocumentPath:   null,
          idDocumentType:   null,
          idName:           null,
          idBirthDate:      null,
          idAddress:        null,
          idLicenseNumber:  null,
          idExpiryDate:     null,
          idOcrIssueReport: null,
        }
        setSelected(prev => prev ? { ...prev, ...cleared } : prev)
        setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, ...cleared } : c))
        setConfirmDeleteDoc(false)
        setDocMsg({ type: 'success', text: '身分証明書を削除しました' })
      } else {
        const data = await res.json()
        setDocMsg({ type: 'error', text: data.error ?? '削除に失敗しました' })
      }
    } finally {
      setDeletingDoc(false)
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addCustomerForm.name,
          furigana: addCustomerForm.furigana,
          email: addCustomerForm.email,
          phone: addCustomerForm.phone,
          address: addCustomerForm.address,
          password: addCustomerForm.password,
          customerType: 'regular',
          skipLicenseKey: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAddCustomerMsg({ type: 'error', text: data.error ?? '顧客の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      const newUser = await res.json()

      // 店舗に自動アサイン
      const storeId = (session?.user as any).id
      await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUser.id, storeId }),
      })

      // 顧客一覧を再取得
      const listRes = await fetch(`/api/stores/${storeId}/customers?page=1&limit=${CUSTOMERS_LIMIT}`)
      const listData = await listRes.json()
      const list = listData?.customers ?? (Array.isArray(listData) ? listData : [])
      setCustomers(list)
      setCustomersTotal(listData?.total ?? list.length)
      setCustomersPage(1)
      setCustomersHasMore((listData?.total ?? list.length) > CUSTOMERS_LIMIT)

      setAddCustomerMsg({ type: 'success', text: `${addCustomerForm.name} 様を追加しました` })
      setAddCustomerForm({ name: '', furigana: '', email: '', phone: '', address: '', password: '' })
      setTimeout(() => setShowAddCustomer(false), 1200)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '顧客の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  function closeModal() {
    setSelected(null)
    setSchedules([])
    setScheduleMsg(null)
    setMemosList([])
    setMemosLoaded(false)
    setMemoStoreNotes({})
    setShipmentsList([])
    setShipmentsLoaded(false)
    setShipmentEdits({})
    setConfirmDeleteDoc(false)
    setDocMsg(null)
  }

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.furigana.includes(search) ||
    c.email.includes(search) || c.phone.includes(search)
  )

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const customerColumns: Column<Customer>[] = [
    {
      key: 'name',
      header: '氏名',
      render: (c) => (
        <div>
          <div className="font-medium text-[var(--md-sys-color-on-surface)]">{c.name}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.furigana}</div>
        </div>
      ),
      sortable: true,
      sortValue: (c) => c.furigana,
    },
    {
      key: 'contact',
      header: '連絡先',
      hideOnMobile: true,
      render: (c) => (
        <div>
          <div className="text-[var(--md-sys-color-on-surface)]">{c.phone}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'address',
      header: '住所',
      hideOnMobile: true,
      render: (c) => (
        <div className="text-[var(--md-sys-color-on-surface-variant)] max-w-48 truncate">{c.address}</div>
      ),
    },
    {
      key: 'customerType',
      header: 'タイプ',
      hideOnMobile: true,
      render: (c) => {
        const typeMap: Record<string, {label:string, cls:string}> = {
          delivery: { label: '定期宅配', cls: 'bg-blue-100 text-blue-700' },
          regular:  { label: '通常買取', cls: 'bg-purple-100 text-purple-700' },
          visit:    { label: '定期訪問', cls: 'bg-green-100 text-green-700' },
        }
        const t = typeMap[c.customerType] ?? typeMap.visit
        return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
      },
    },
    {
      key: 'nextVisit',
      header: '次回訪問',
      render: (c) => {
        if (c.customerType === 'delivery') {
          return <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">定期宅配</span>
        }
        const nextVisit = c.visitSchedules?.[0]
        return nextVisit ? (
          <span className="font-medium text-[var(--portal-primary)]">
            {format(new Date(nextVisit.visitDate), 'M/d（E）', { locale: ja })}
          </span>
        ) : (
          <span className="text-[var(--md-sys-color-on-surface-variant)]">未定</span>
        )
      },
    },
    {
      key: 'idDoc',
      header: '身分証',
      hideOnMobile: true,
      render: (c) => c.idDocumentPath ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">提出済</span>
      ) : (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">未提出</span>
      ),
    },
    {
      key: 'action',
      header: '',
      render: (c) => (
        <Button variant="text" size="sm" onClick={() => setSelected(c)}>
          詳細
        </Button>
      ),
    },
  ]

  const isDeliveryCustomer = selected?.customerType === 'delivery'

  const modalTabs = isDeliveryCustomer
    ? [
        { key: 'info',      label: '基本情報' },
        { key: 'shipments', label: shipmentsList.length > 0 ? `送付履歴（${shipmentsList.length}）` : '送付履歴' },
      ]
    : [
        { key: 'info',    label: '基本情報' },
        { key: 'memos',   label: memosList.length > 0 ? `買取トライ（${memosList.length}）` : '買取トライ' },
        { key: 'add',     label: 'スケジュール追加' },
        { key: 'history', label: schedules.length > 0 ? `訪問履歴（${schedules.length}）` : '訪問履歴' },
      ]

  return (
    <>
      <AppBar
        title="担当顧客"
        subtitle={`${customers.length}名`}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex-1">
            <SearchFilterBar
              filters={[
                { key: 'search', label: '検索', type: 'text', placeholder: '氏名・メール・電話で検索...' },
              ]}
              values={{ search }}
              onChange={(_, v) => setSearch(v)}
              onClear={() => setSearch('')}
            />
          </div>
          <Button
            variant="filled"
            onClick={() => { setShowAddCustomer(true); setAddCustomerMsg(null); setAddCustomerForm({ name: '', furigana: '', email: '', phone: '', address: '', password: '' }) }}
          >
            新規顧客追加
          </Button>
        </div>

        <Card variant="outlined" padding="none">
          <DataTable
            columns={customerColumns}
            data={filtered}
            rowKey={(c) => c.id}
            emptyTitle={customers.length === 0 ? '担当顧客がいません' : '検索結果がありません'}
          />
        </Card>

        {customersHasMore && (
          <div className="flex justify-center mt-6">
            <Button
              variant="tonal"
              onClick={loadMoreCustomers}
              loading={loadingMore}
              disabled={loadingMore}
            >
              {loadingMore ? '読み込み中...' : `もっと読み込む（${customers.length} / ${customersTotal}名）`}
            </Button>
          </div>
        )}
      </div>

      {/* 顧客詳細モーダル */}
      <Modal
        open={!!selected}
        onClose={closeModal}
        title={selected ? `${selected.name} 様` : ''}
        size="md"
        footer={
          <Button variant="tonal" onClick={closeModal}>閉じる</Button>
        }
      >
        {selected && (
          <>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">{selected.furigana}</p>

            <Tabs
              tabs={modalTabs}
              activeKey={modalTab}
              onChange={handleModalTabChange}
              className="mb-4"
            />

            {/* 基本情報 */}
            {modalTab === 'info' && (
              <>
              <dl className="space-y-3">
                {[
                  { label: 'メール', value: selected.email },
                  { label: '電話番号', value: selected.phone },
                  { label: '訪問先住所', value: selected.address },
                  { label: '登録日', value: format(new Date(selected.createdAt), 'yyyy年M月d日', { locale: ja }) },
                ].map(item => (
                  <div key={item.label} className="flex gap-3">
                    <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                    <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                  </div>
                ))}
                <div className="flex gap-4">
                  <dt className="w-28 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">身分証</dt>
                  <dd className="text-sm">
                    {selected.idDocumentPath
                      ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">提出済み</span>
                      : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">未提出</span>
                    }
                  </dd>
                </div>
              </dl>

              {/* 口座情報（読み取り専用） */}
              {(selected.bankName || selected.branchName || selected.accountNumber) && (
                <div className="mt-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">振込先口座情報</span>
                  </div>
                  <dl className="px-4 py-3 space-y-2">
                    {[
                      { label: '銀行名',   value: selected.bankName },
                      { label: '支店名',   value: selected.branchName },
                      { label: '口座種別', value: selected.accountType },
                      { label: '口座番号', value: selected.accountNumber },
                      { label: '口座名義', value: selected.accountHolder },
                    ].filter(item => item.value).map(item => (
                      <div key={item.label} className="flex gap-3">
                        <dt className="w-20 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                        <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* 身分証OCR抽出情報 */}
              {selected.idDocumentPath && (selected.idName || selected.idBirthDate || selected.idAddress || selected.idLicenseNumber || selected.idExpiryDate) && (
                <div className="mt-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)] flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                      身分証OCR読み取り結果
                      {selected.idDocumentType && <span className="ml-2 font-normal">（{selected.idDocumentType}）</span>}
                    </span>
                  </div>
                  <dl className="px-4 py-3 space-y-2">
                    {[
                      { label: '氏名（証明書）', value: selected.idName },
                      { label: '生年月日',       value: selected.idBirthDate },
                      { label: '住所（証明書）', value: selected.idAddress },
                      { label: '証明書番号',     value: selected.idLicenseNumber },
                      { label: '有効期限',       value: selected.idExpiryDate },
                    ].filter(item => item.value).map(item => (
                      <div key={item.label} className="flex gap-3">
                        <dt className="w-24 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                        <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {/* 顧客からの誤り報告 */}
                  {selected.idOcrIssueReport && (
                    <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                      <div className="flex items-center gap-1 mb-1">
                        <svg className="w-3.5 h-3.5 text-[var(--md-sys-color-error,#B3261E)]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-semibold text-[var(--md-sys-color-error,#B3261E)]">顧客からの誤り報告</span>
                      </div>
                      <p className="text-xs text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap pl-5">{selected.idOcrIssueReport}</p>
                    </div>
                  )}
                </div>
              )}
              </>
            )}

            {/* 送付履歴（宅配顧客のみ） */}
            {modalTab === 'shipments' && (
              <div>
                {scheduleMsg && (
                  <div className="mb-3">
                    <MessageBanner severity={scheduleMsg.type} dismissible onDismiss={() => setScheduleMsg(null)}>
                      {scheduleMsg.text}
                    </MessageBanner>
                  </div>
                )}
                {shipmentsLoading ? (
                  <div className="flex justify-center py-8"><LoadingSpinner size="md" /></div>
                ) : shipmentsList.length === 0 ? (
                  <EmptyState title="送付履歴がありません" description="顧客が送付を登録すると表示されます" />
                ) : (
                  <div className="space-y-4">
                    {shipmentsList.map(s => {
                      const edit = shipmentEdits[s.id] ?? { purchaseAmount: '', storeNote: '', status: s.status }
                      return (
                        <div key={s.id} className="border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-medium)] p-4">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-sm font-mono font-semibold text-[var(--md-sys-color-on-surface)]">
                              {s.shipmentNumber}
                            </span>
                            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                              {s.shipmentMonth.replace('-', '年')}月
                            </span>
                          </div>
                          {s.description && (
                            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2 whitespace-pre-wrap">{s.description}</p>
                          )}
                          {s.imageUrls.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {s.imageUrls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt="" className="w-16 h-16 object-cover rounded-[var(--md-sys-shape-small)] hover:opacity-80 transition-opacity" />
                                </a>
                              ))}
                            </div>
                          )}
                          {/* 編集フィールド */}
                          <div className="space-y-2 mt-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-20 flex-shrink-0">ステータス</label>
                              <select
                                value={edit.status}
                                onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, status: e.target.value } }))}
                                className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)]"
                              >
                                {SHIPMENT_STATUS_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)] w-20 flex-shrink-0">査定金額（円）</label>
                              <input
                                type="number"
                                value={edit.purchaseAmount}
                                onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, purchaseAmount: e.target.value } }))}
                                placeholder="0"
                                className="flex-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface)]"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1 block">店舗メモ（顧客に表示）</label>
                              <textarea
                                value={edit.storeNote}
                                onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, storeNote: e.target.value } }))}
                                rows={2}
                                placeholder="査定結果や連絡事項など..."
                                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
                              />
                              <div className="flex justify-end mt-1.5">
                                <button
                                  onClick={() => handleSaveShipment(s.id)}
                                  disabled={savingShipment === s.id}
                                  className="text-xs px-4 py-1.5 bg-[var(--portal-primary,#1E3A5F)] text-white rounded-[var(--md-sys-shape-small)] hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                  {savingShipment === s.id ? '保存中...' : '保存する'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 買取相談メモ */}
            {modalTab === 'memos' && (
              <div>
                {memosLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : memosList.length === 0 ? (
                  <EmptyState
                    title="買取トライの投稿がありません"
                    description="顧客が買取トライを投稿するとここに表示されます"
                  />
                ) : (
                  <div className="space-y-4">
                    {memosList.map(memo => (
                      <div
                        key={memo.id}
                        className="border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-medium)] p-4"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                                {memo.title}
                              </span>
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full ${MEMO_STATUS_STYLE[memo.status] ?? ''}`}
                              >
                                {MEMO_STATUS_OPTIONS.find(o => o.value === memo.status)?.label ?? memo.status}
                              </span>
                            </div>
                            {memo.description && (
                              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">
                                {memo.description}
                              </p>
                            )}
                            <p className="text-xs text-[var(--md-sys-color-outline)] mt-1">
                              {format(new Date(memo.createdAt), 'yyyy年M月d日', { locale: ja })}
                            </p>
                          </div>
                          {/* ステータス変更 */}
                          <select
                            value={memo.status}
                            onChange={e => handleMemoStatusChange(memo.id, e.target.value)}
                            className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0"
                          >
                            {MEMO_STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* 画像サムネイル */}
                        {memo.imageUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {memo.imageUrls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={url}
                                  alt=""
                                  className="w-16 h-16 object-cover rounded-[var(--md-sys-shape-small)] hover:opacity-80 transition-opacity"
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* AI査定結果 */}
                        {memo.aiAppraisal && (
                          <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800">
                            <div className="flex items-center gap-1.5 mb-2">
                              <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                              </svg>
                              <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">AI査定結果</span>
                              {memo.aiAppraisalAt && (
                                <span className="text-[10px] text-purple-500 dark:text-purple-400 ml-auto">
                                  {format(new Date(memo.aiAppraisalAt), 'M/d HH:mm', { locale: ja })}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--md-sys-color-on-surface)] space-y-1.5">
                              {memo.aiAppraisal.estimatedPrice && (
                                <p><span className="font-medium">推定価格:</span> <span className="text-purple-700 dark:text-purple-300 font-bold">{memo.aiAppraisal.estimatedPrice}</span></p>
                              )}
                              {memo.aiAppraisal.marketAnalysis && (
                                <p><span className="font-medium">市場分析:</span> {memo.aiAppraisal.marketAnalysis}</p>
                              )}
                              {memo.aiAppraisal.condition && (
                                <p><span className="font-medium">状態評価:</span> {memo.aiAppraisal.condition}</p>
                              )}
                              {memo.aiAppraisal.recommendation && (
                                <p><span className="font-medium">推奨:</span> {memo.aiAppraisal.recommendation}</p>
                              )}
                              {memo.aiAppraisal.summary && (
                                <p className="whitespace-pre-wrap">{memo.aiAppraisal.summary}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 店舗メモ入力 */}
                        <div className="mt-2">
                          <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                            店舗メモ（顧客に表示されます）
                          </p>
                          <textarea
                            value={memoStoreNotes[memo.id] ?? ''}
                            onChange={e => setMemoStoreNotes(prev => ({ ...prev, [memo.id]: e.target.value }))}
                            rows={2}
                            placeholder="事前確認のコメントなどを入力..."
                            className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
                          />
                          <div className="flex justify-end mt-1.5">
                            <button
                              onClick={() => handleSaveMemoNote(memo.id)}
                              disabled={savingMemoNote === memo.id}
                              className="text-xs px-4 py-1.5 bg-[var(--portal-primary,#1E3A5F)] text-white rounded-[var(--md-sys-shape-small)] hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {savingMemoNote === memo.id ? '保存中...' : '保存する'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* スケジュール追加 */}
            {modalTab === 'add' && (
              <form onSubmit={handleAddSchedule} className="space-y-4">
                {scheduleMsg && (
                  <MessageBanner severity={scheduleMsg.type} dismissible onDismiss={() => setScheduleMsg(null)}>
                    {scheduleMsg.text}
                  </MessageBanner>
                )}
                <TextField
                  label="訪問日"
                  type="date"
                  value={addForm.visitDate}
                  onChange={v => setAddForm({ ...addForm, visitDate: v })}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="開始時間"
                    type="time"
                    value={addForm.startTime}
                    onChange={v => setAddForm({ ...addForm, startTime: v })}
                  />
                  <TextField
                    label="終了時間"
                    type="time"
                    value={addForm.endTime}
                    onChange={v => setAddForm({ ...addForm, endTime: v })}
                  />
                </div>
                <TextField
                  label="メモ（任意）"
                  value={addForm.note}
                  onChange={v => setAddForm({ ...addForm, note: v })}
                  placeholder="訪問に関するメモを入力..."
                  rows={3}
                />
                <Button
                  type="submit"
                  disabled={submitting || !addForm.visitDate}
                  loading={submitting}
                  fullWidth
                >
                  {submitting ? '追加中...' : 'スケジュールを追加'}
                </Button>
              </form>
            )}

            {/* 訪問履歴 */}
            {modalTab === 'history' && (
              <div>
                {schedulesLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : sortedSchedules.length === 0 ? (
                  <EmptyState
                    title="訪問スケジュールがありません"
                    description="「スケジュール追加」タブから登録できます"
                  />
                ) : (
                  <div>
                    {sortedSchedules.map(vs => (
                      <div key={vs.id} className="flex items-start gap-3 py-3 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0">
                        <div className="w-9 h-9 bg-[var(--status-scheduled-bg)] rounded-[var(--md-sys-shape-medium)] flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                              {format(new Date(vs.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                            </span>
                            <StatusBadge status={vs.status as Status} />
                            <select
                              value={vs.status}
                              onChange={e => handleStatusChange(vs.id, e.target.value)}
                              className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)]"
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          {vs.note && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 truncate">{vs.note}</p>}
                          <div className="mt-1.5">
                            <Button
                              variant="text"
                              size="sm"
                              onClick={() => { closeModal(); router.push(`/store/schedule/${vs.id}`) }}
                            >
                              詳細
                            </Button>
                          </div>
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

      {/* 新規顧客追加モーダル */}
      <Modal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        title="新規顧客追加"
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          {addCustomerMsg && (
            <MessageBanner severity={addCustomerMsg.type} dismissible onDismiss={() => setAddCustomerMsg(null)}>
              {addCustomerMsg.text}
            </MessageBanner>
          )}
          <TextField
            label="氏名"
            value={addCustomerForm.name}
            onChange={v => setAddCustomerForm(f => ({ ...f, name: v }))}
            required
            placeholder="山田 太郎"
          />
          <TextField
            label="ふりがな"
            value={addCustomerForm.furigana}
            onChange={v => setAddCustomerForm(f => ({ ...f, furigana: v }))}
            required
            placeholder="やまだ たろう"
          />
          <TextField
            label="メールアドレス"
            type="email"
            value={addCustomerForm.email}
            onChange={v => setAddCustomerForm(f => ({ ...f, email: v }))}
            required
            placeholder="taro@example.com"
          />
          <TextField
            label="電話番号"
            type="tel"
            value={addCustomerForm.phone}
            onChange={v => setAddCustomerForm(f => ({ ...f, phone: v }))}
            required
            placeholder="090-1234-5678"
          />
          <TextField
            label="住所"
            value={addCustomerForm.address}
            onChange={v => setAddCustomerForm(f => ({ ...f, address: v }))}
            required
            placeholder="東京都渋谷区..."
          />
          <TextField
            label="パスワード"
            type="password"
            value={addCustomerForm.password}
            onChange={v => setAddCustomerForm(f => ({ ...f, password: v }))}
            required
            placeholder="8文字以上"
          />
          {addCustomerForm.password.length > 0 && addCustomerForm.password.length < 8 && (
            <p className="text-xs text-[var(--md-sys-color-error,#B3261E)]">パスワードは8文字以上で入力してください</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="filled"
              loading={addCustomerSubmitting}
              disabled={addCustomerSubmitting || addCustomerForm.password.length < 8}
              fullWidth
            >
              {addCustomerSubmitting ? '登録中...' : '登録する'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
