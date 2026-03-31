'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Tabs from '@/components/Tabs'
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
  idDocumentType: string | null
  idName: string | null
  idBirthDate: string | null
  idAddress: string | null
  idLicenseNumber: string | null
  idExpiryDate: string | null
  idOcrIssueReport: string | null
  createdAt: string
  visitSchedules: Array<{ visitDate: string; status: string }>
  customerType: string
  bankName: string | null
  branchName: string | null
  accountType: string | null
  accountNumber: string | null
  accountHolder: string | null
}

type VisitSchedule = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  note: string | null
  store: { id: string; name: string }
  user: { id: string; name: string }
  purchaseItems: Array<{ id: string; itemName: string; purchasePrice: number }>
  workItems: Array<{ id: string; workName: string; unitPrice: number; quantity: number }>
  salesContract: { id: string; createdAt: string } | null
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

const MEMO_STATUS_OPTIONS = [
  { value: 'pending', label: '未確認' },
  { value: 'reviewed', label: '確認済み' },
  { value: 'completed', label: '対応完了' },
]

const MEMO_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  reviewed: 'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
}

const STATUS_OPTIONS = [
  { value: 'scheduled', label: '予定' },
  { value: 'pending', label: '未対応' },
  { value: 'completed', label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent', label: '不在' },
  { value: 'cancelled', label: 'キャンセル' },
]

const SHIPMENT_STATUS_OPTIONS = [
  { value: 'registered', label: '登録済み' },
  { value: 'shipped', label: '発送済み' },
  { value: 'received', label: '受取済み' },
  { value: 'appraised', label: '査定完了' },
]

const TYPE_MAP: Record<string, { label: string; cls: string }> = {
  delivery: { label: '定期宅配', cls: 'bg-blue-100 text-blue-700' },
  regular: { label: '通常買取', cls: 'bg-purple-100 text-purple-700' },
  visit: { label: '定期訪問', cls: 'bg-green-100 text-green-700' },
}

type TabKey = 'info' | 'memos' | 'add' | 'history' | 'shipments'

export default function StoreCustomerDetailPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()

  const tabFromUrl = (searchParams.get('tab') as TabKey) || 'info'

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)

  // 訪問履歴
  const [schedules, setSchedules] = useState<VisitSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [schedulesLoaded, setSchedulesLoaded] = useState(false)

  // スケジュール追加
  const [addForm, setAddForm] = useState({ visitDate: '', startTime: '', endTime: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 買取トライ
  const [memosList, setMemosList] = useState<PurchaseMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [memosLoaded, setMemosLoaded] = useState(false)
  const [memoStoreNotes, setMemoStoreNotes] = useState<Record<string, string>>({})
  const [savingMemoNote, setSavingMemoNote] = useState<string | null>(null)

  // 送付履歴
  const [shipmentsList, setShipmentsList] = useState<DeliveryShipment[]>([])
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [shipmentsLoaded, setShipmentsLoaded] = useState(false)
  const [shipmentEdits, setShipmentEdits] = useState<Record<string, { purchaseAmount: string; storeNote: string; status: string }>>({})
  const [savingShipment, setSavingShipment] = useState<string | null>(null)

  // 訪問日程提案
  const [proposalForm, setProposalForm] = useState({
    candidate1Date: '', candidate1Start: '', candidate1End: '',
    candidate2Date: '', candidate2Start: '', candidate2End: '',
    candidate3Date: '', candidate3Start: '', candidate3End: '',
    storeNote: '',
  })
  const [proposalSubmitting, setProposalSubmitting] = useState(false)
  const [proposalMsg, setProposalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showProposalForm, setShowProposalForm] = useState(false)
  const [storeProposals, setStoreProposals] = useState<any[]>([])
  const [storeProposalsLoaded, setStoreProposalsLoaded] = useState(false)

  // 査定フォーム表示管理
  const [appraisalOpen, setAppraisalOpen] = useState<Record<string, boolean>>({})

  // 身分証削除
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState(false)
  const [docMsg, setDocMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  // 顧客データ取得
  useEffect(() => {
    if (authStatus !== 'authenticated' || !id) return
    const storeId = (session?.user as any).id
    fetch(`/api/stores/${storeId}/customers?page=1&limit=200`)
      .then(r => r.json())
      .then(data => {
        const list = data?.customers ?? (Array.isArray(data) ? data : [])
        const found = list.find((c: Customer) => c.id === id)
        if (found) {
          setCustomer(found)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [authStatus, session, id])

  // タブ切替時のデータ読み込み
  function handleTabChange(key: string) {
    const tab = key as TabKey
    setActiveTab(tab)
    setMsg(null)
    // URLにtabパラメータを反映
    const url = new URL(window.location.href)
    if (tab === 'info') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    window.history.replaceState({}, '', url.toString())

    if (tab === 'history' && !schedulesLoaded && customer) {
      loadSchedules()
    }
    if (tab === 'add' && !storeProposalsLoaded && customer) {
      loadStoreProposals()
    }
    if (tab === 'memos' && !memosLoaded && customer) {
      loadMemos()
    }
    if (tab === 'shipments' && !shipmentsLoaded && customer) {
      loadShipments()
    }
  }

  function loadSchedules() {
    if (!customer) return
    setSchedulesLoading(true)
    fetch(`/api/visit-schedules?userId=${customer.id}`)
      .then(r => r.json())
      .then(data => {
        const list = data?.schedules ?? (Array.isArray(data) ? data : [])
        setSchedules(list)
        setSchedulesLoaded(true)
        setSchedulesLoading(false)
      })
      .catch(() => { setSchedulesLoaded(true); setSchedulesLoading(false) })
  }

  function loadMemos() {
    if (!customer) return
    setMemosLoading(true)
    fetch(`/api/purchase-memos?userId=${customer.id}`)
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

  function loadShipments() {
    if (!customer) return
    setShipmentsLoading(true)
    fetch(`/api/delivery-shipments?userId=${customer.id}`)
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

  // 初回タブロード
  useEffect(() => {
    if (!customer) return
    if (tabFromUrl === 'history' && !schedulesLoaded) loadSchedules()
    if (tabFromUrl === 'memos' && !memosLoaded) loadMemos()
    if (tabFromUrl === 'shipments' && !shipmentsLoaded) loadShipments()
    if (tabFromUrl === 'add' && !storeProposalsLoaded) loadStoreProposals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer])

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!customer || !addForm.visitDate) return
    const storeId = (session?.user as any).id
    setSubmitting(true)
    setMsg(null)

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: customer.id,
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
      setMsg({ type: 'success', text: '訪問スケジュールを追加しました' })
      setAddForm({ visitDate: '', startTime: '', endTime: '', note: '' })
    } else {
      setMsg({ type: 'error', text: 'スケジュールの追加に失敗しました' })
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
      setShipmentEdits(prev => ({
        ...prev,
        [shipmentId]: {
          purchaseAmount: updated.purchaseAmount !== null ? String(updated.purchaseAmount) : '',
          storeNote: updated.storeNote ?? '',
          status: updated.status,
        },
      }))
      setMsg({ type: 'success', text: '送付情報を更新しました' })
    } else {
      setMsg({ type: 'error', text: '更新に失敗しました' })
    }
  }

  async function handleDeleteIdDocument() {
    if (!customer) return
    setDeletingDoc(true)
    setDocMsg(null)
    try {
      const res = await fetch(`/api/users/${customer.id}/id-document`, { method: 'DELETE' })
      if (res.ok) {
        const cleared = {
          idDocumentPath: null,
          idDocumentType: null,
          idName: null,
          idBirthDate: null,
          idAddress: null,
          idLicenseNumber: null,
          idExpiryDate: null,
          idOcrIssueReport: null,
        }
        setCustomer(prev => prev ? { ...prev, ...cleared } : prev)
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

  function loadStoreProposals() {
    if (!customer) return
    fetch(`/api/visit-requests?requestedBy=store&userId=${customer.id}`)
      .then(r => r.json())
      .then(data => {
        // Filter to only this customer's proposals (API returns all for store)
        const list = (data?.requests || []).filter((r: any) => r.userId === customer.id)
        setStoreProposals(list)
        setStoreProposalsLoaded(true)
      })
      .catch(() => setStoreProposalsLoaded(true))
  }

  async function handleSubmitProposal(e: React.FormEvent) {
    e.preventDefault()
    if (!customer || !proposalForm.candidate1Date) return
    setProposalSubmitting(true)
    setProposalMsg(null)
    try {
      const res = await fetch('/api/visit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: customer.id,
          ...proposalForm,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setStoreProposals(prev => [created, ...prev])
        setProposalForm({
          candidate1Date: '', candidate1Start: '', candidate1End: '',
          candidate2Date: '', candidate2Start: '', candidate2End: '',
          candidate3Date: '', candidate3Start: '', candidate3End: '',
          storeNote: '',
        })
        setShowProposalForm(false)
        setProposalMsg({ type: 'success', text: '訪問日程を提案しました' })
      } else {
        const d = await res.json()
        setProposalMsg({ type: 'error', text: d.error || '送信に失敗しました' })
      }
    } catch {
      setProposalMsg({ type: 'error', text: '送信に失敗しました' })
    }
    setProposalSubmitting(false)
  }

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  if (!customer) {
    return (
      <>
        <AppBar title="顧客詳細" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <EmptyState title="顧客が見つかりません" description="一覧に戻って再度お試しください" />
          <div className="flex justify-center mt-4">
            <Button variant="tonal" onClick={() => router.push('/store/customers')}>顧客一覧に戻る</Button>
          </div>
        </div>
      </>
    )
  }

  const isDelivery = customer.customerType === 'delivery'
  const typeInfo = TYPE_MAP[customer.customerType] ?? TYPE_MAP.visit

  const tabs = isDelivery
    ? [
        { key: 'info', label: '基本情報' },
        { key: 'shipments', label: shipmentsList.length > 0 ? `送付履歴（${shipmentsList.length}）` : '送付履歴' },
      ]
    : [
        { key: 'info', label: '基本情報' },
        { key: 'memos', label: memosList.length > 0 ? `買取トライ（${memosList.length}）` : '買取トライ' },
        { key: 'add', label: 'スケジュール追加' },
        { key: 'history', label: schedules.length > 0 ? `訪問履歴（${schedules.length}）` : '訪問履歴' },
      ]

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

  return (
    <>
      <AppBar title={`${customer.name} 様`} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* 戻るリンク + ヘッダー */}
        <button
          onClick={() => router.push('/store/customers')}
          className="flex items-center gap-1 text-sm text-[var(--portal-primary)] hover:underline mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          顧客一覧
        </button>

        {/* 顧客ヘッダーカード */}
        <Card className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">{customer.name}</h1>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${typeInfo.cls}`}>{typeInfo.label}</span>
              </div>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{customer.furigana}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {customer.idDocumentPath ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">身分証提出済</span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">身分証未提出</span>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              <span className="text-sm text-[var(--md-sys-color-on-surface)]">{customer.phone}</span>
            </div>
            {customer.email && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <span className="text-sm text-[var(--md-sys-color-on-surface)]">{customer.email}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="text-sm text-[var(--md-sys-color-on-surface)]">{customer.address}</span>
            </div>
          </div>
        </Card>

        {/* タブ */}
        <Tabs
          tabs={tabs}
          activeKey={activeTab}
          onChange={handleTabChange}
          mobileVariant="menu"
          className="mb-6"
        />

        {/* 成功/エラーメッセージ */}
        {msg && (
          <div className="mb-4">
            <MessageBanner severity={msg.type} dismissible onDismiss={() => setMsg(null)} floating={msg.type === 'success'}>
              {msg.text}
            </MessageBanner>
          </div>
        )}

        {/* ===== 基本情報タブ ===== */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">顧客情報</h2>
              <dl className="space-y-3">
                {[
                  { label: '氏名', value: customer.name },
                  { label: 'ふりがな', value: customer.furigana },
                  { label: 'メール', value: customer.email || '未登録' },
                  { label: '電話番号', value: customer.phone },
                  { label: '訪問先住所', value: customer.address },
                  { label: '顧客タイプ', value: typeInfo.label },
                  { label: '登録日', value: format(new Date(customer.createdAt), 'yyyy年M月d日', { locale: ja }) },
                ].map(item => (
                  <div key={item.label} className="flex gap-3">
                    <dt className="w-28 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                    <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                  </div>
                ))}
                <div className="flex gap-3">
                  <dt className="w-28 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">身分証</dt>
                  <dd className="text-sm">
                    {customer.idDocumentPath
                      ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">提出済み</span>
                      : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">未提出</span>
                    }
                  </dd>
                </div>
              </dl>
            </Card>

            {/* 口座情報 */}
            {(customer.bankName || customer.branchName || customer.accountNumber) && (
              <Card>
                <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">振込先口座情報</h2>
                <dl className="space-y-2">
                  {[
                    { label: '銀行名', value: customer.bankName },
                    { label: '支店名', value: customer.branchName },
                    { label: '口座種別', value: customer.accountType },
                    { label: '口座番号', value: customer.accountNumber },
                    { label: '口座名義', value: customer.accountHolder },
                  ].filter(item => item.value).map(item => (
                    <div key={item.label} className="flex gap-3">
                      <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                      <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )}

            {/* 身分証OCR情報 */}
            {customer.idDocumentPath && (customer.idName || customer.idBirthDate || customer.idAddress || customer.idLicenseNumber || customer.idExpiryDate) && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    身分証OCR読み取り結果
                    {customer.idDocumentType && <span className="ml-2 font-normal text-[var(--md-sys-color-on-surface-variant)]">（{customer.idDocumentType}）</span>}
                  </h2>
                </div>
                <dl className="space-y-2">
                  {[
                    { label: '氏名（証明書）', value: customer.idName },
                    { label: '生年月日', value: customer.idBirthDate },
                    { label: '住所（証明書）', value: customer.idAddress },
                    { label: '証明書番号', value: customer.idLicenseNumber },
                    { label: '有効期限', value: customer.idExpiryDate },
                  ].filter(item => item.value).map(item => (
                    <div key={item.label} className="flex gap-3">
                      <dt className="w-28 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                      <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                    </div>
                  ))}
                </dl>

                {/* 顧客からの誤り報告 */}
                {customer.idOcrIssueReport && (
                  <div className="mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <svg className="w-4 h-4 text-[var(--md-sys-color-error,#B3261E)]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-semibold text-[var(--md-sys-color-error,#B3261E)]">顧客からの誤り報告</span>
                    </div>
                    <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap pl-6">{customer.idOcrIssueReport}</p>
                  </div>
                )}

                {docMsg && (
                  <div className="mt-3">
                    <MessageBanner severity={docMsg.type} dismissible onDismiss={() => setDocMsg(null)}>
                      {docMsg.text}
                    </MessageBanner>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ===== 買取トライタブ ===== */}
        {activeTab === 'memos' && (
          <div>
            {memosLoading ? (
              <div className="flex justify-center py-12">
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
                  <Card key={memo.id} variant="outlined">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                            {memo.title}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MEMO_STATUS_STYLE[memo.status] ?? ''}`}>
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
                              className="w-20 h-20 object-cover rounded-[var(--md-sys-shape-small)] hover:opacity-80 transition-opacity"
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
                    <div className="mt-3">
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
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== スケジュール追加タブ ===== */}
        {activeTab === 'add' && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">訪問スケジュール追加</h2>
              <form onSubmit={handleAddSchedule} className="space-y-4">
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
            </Card>

            {/* 訪問日程を提案 */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">訪問日程を提案</h2>
                <Button size="sm" variant={showProposalForm ? 'tonal' : 'filled'} onClick={() => { setShowProposalForm(v => !v); setProposalMsg(null) }}>
                  {showProposalForm ? 'キャンセル' : '+ 日程を提案する'}
                </Button>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
                お客様に訪問候補日を3つまで提案できます。お客様がいずれかを承認するとスケジュールが作成されます。
              </p>

              {proposalMsg && (
                <MessageBanner severity={proposalMsg.type} dismissible onDismiss={() => setProposalMsg(null)}>
                  {proposalMsg.text}
                </MessageBanner>
              )}

              {showProposalForm && (
                <form onSubmit={handleSubmitProposal} className="space-y-4 mt-4">
                  {[1, 2, 3].map(n => (
                    <div key={n} className="p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
                      <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">
                        第{n}候補 {n === 1 && <span className="text-red-500">*</span>}
                      </p>
                      <TextField
                        label="日付"
                        type="date"
                        value={(proposalForm as any)[`candidate${n}Date`]}
                        onChange={v => setProposalForm(prev => ({ ...prev, [`candidate${n}Date`]: v }))}
                        required={n === 1}
                      />
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <TextField
                          label="開始"
                          type="time"
                          value={(proposalForm as any)[`candidate${n}Start`]}
                          onChange={v => setProposalForm(prev => ({ ...prev, [`candidate${n}Start`]: v }))}
                        />
                        <TextField
                          label="終了"
                          type="time"
                          value={(proposalForm as any)[`candidate${n}End`]}
                          onChange={v => setProposalForm(prev => ({ ...prev, [`candidate${n}End`]: v }))}
                        />
                      </div>
                    </div>
                  ))}
                  <TextField
                    label="メモ（任意）"
                    value={proposalForm.storeNote}
                    onChange={v => setProposalForm(prev => ({ ...prev, storeNote: v }))}
                    placeholder="提案に関するメモ..."
                    rows={2}
                  />
                  <Button
                    type="submit"
                    disabled={proposalSubmitting || !proposalForm.candidate1Date}
                    loading={proposalSubmitting}
                    fullWidth
                  >
                    {proposalSubmitting ? '送信中...' : '日程を提案する'}
                  </Button>
                </form>
              )}

              {/* 提案済みリスト */}
              {storeProposalsLoaded && storeProposals.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">提案済みの日程</p>
                  {storeProposals.map(req => {
                    const statusMap: Record<string, { color: string; label: string }> = {
                      pending:            { color: 'bg-blue-100 text-blue-800', label: 'お客様の返答待ち' },
                      approved:           { color: 'bg-green-100 text-green-800', label: '承認済み' },
                      customer_declined:  { color: 'bg-red-100 text-red-800', label: '辞退' },
                      cancelled:          { color: 'bg-gray-100 text-gray-600', label: 'キャンセル' },
                    }
                    const st = statusMap[req.status] || { color: 'bg-gray-100 text-gray-600', label: req.status }
                    const fmtDate = (d: string | null) => d ? format(new Date(d), 'M/d（E）', { locale: ja }) : '-'
                    const fmtTime = (s: string | null, e: string | null) => {
                      if (!s && !e) return ''
                      return ` ${s || '?'}~${e || '?'}`
                    }
                    return (
                      <div key={req.id} className="p-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {format(new Date(req.createdAt), 'yyyy/M/d', { locale: ja })}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          {[1, 2, 3].map(n => {
                            const d = req[`candidate${n}Date`]
                            if (!d) return null
                            return (
                              <p key={n}>
                                <span className="text-[var(--md-sys-color-on-surface-variant)]">第{n}候補:</span>{' '}
                                {fmtDate(d)}{fmtTime(req[`candidate${n}Start`], req[`candidate${n}End`])}
                                {req.status === 'approved' && req.approvedCandidate === n && (
                                  <span className="ml-1 text-xs text-green-600 font-medium">-- 承認</span>
                                )}
                              </p>
                            )
                          })}
                        </div>
                        {req.storeNote && (
                          <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">メモ: {req.storeNote}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ===== 訪問履歴タブ ===== */}
        {activeTab === 'history' && (
          <div>
            {schedulesLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : sortedSchedules.length === 0 ? (
              <EmptyState
                title="訪問スケジュールがありません"
                description="「スケジュール追加」タブから登録できます"
              />
            ) : (
              <div className="space-y-3">
                {sortedSchedules.map(vs => {
                  const purchaseTotal = vs.purchaseItems?.reduce((sum, item) => sum + (item.purchasePrice || 0), 0) ?? 0
                  const workTotal = vs.workItems?.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0) ?? 0

                  return (
                    <Card key={vs.id} variant="outlined">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-[var(--status-scheduled-bg)] rounded-[var(--md-sys-shape-medium)] flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                              {format(new Date(vs.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                            </span>
                            {vs.startTime && (
                              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                {vs.startTime}{vs.endTime ? ` - ${vs.endTime}` : ''}
                              </span>
                            )}
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
                          {vs.note && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">{vs.note}</p>}
                          {(purchaseTotal > 0 || workTotal > 0) && (
                            <div className="flex gap-4 mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                              {purchaseTotal > 0 && <span>買取額: <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{purchaseTotal.toLocaleString()}円</span></span>}
                              {workTotal > 0 && <span>作業費: <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{workTotal.toLocaleString()}円</span></span>}
                            </div>
                          )}
                          <div className="mt-2">
                            <Button
                              variant="text"
                              size="sm"
                              onClick={() => router.push(`/store/schedule/${vs.id}`)}
                            >
                              詳細を開く
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== 送付履歴タブ（宅配顧客のみ） ===== */}
        {activeTab === 'shipments' && (
          <div>
            {shipmentsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : shipmentsList.length === 0 ? (
              <EmptyState title="送付履歴がありません" description="顧客が送付を登録すると表示されます" />
            ) : (
              <div className="space-y-4">
                {shipmentsList.map(s => {
                  const edit = shipmentEdits[s.id] ?? { purchaseAmount: '', storeNote: '', status: s.status }
                  const isFormOpen = appraisalOpen[s.id] ?? false
                  const canAppraise = s.status === 'shipped' || s.status === 'received'
                  const isAppraised = s.status === 'appraised'
                  const statusLabel = SHIPMENT_STATUS_OPTIONS.find(o => o.value === s.status)?.label ?? s.status

                  return (
                    <Card key={s.id} variant="outlined">
                      {/* ヘッダー: 伝票番号・月・ステータス */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-sm font-mono font-semibold text-[var(--md-sys-color-on-surface)]">
                          {s.shipmentNumber}
                        </span>
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {s.shipmentMonth.replace('-', '年')}月
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isAppraised
                            ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
                            : s.status === 'received'
                              ? 'bg-blue-100 text-blue-700'
                              : s.status === 'shipped'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}>
                          {statusLabel}
                        </span>
                      </div>

                      {s.description && (
                        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2 whitespace-pre-wrap">{s.description}</p>
                      )}

                      {/* 画像サムネイル */}
                      {s.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {s.imageUrls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt="" className="w-20 h-20 object-cover rounded-[var(--md-sys-shape-small)] hover:opacity-80 transition-opacity" />
                            </a>
                          ))}
                        </div>
                      )}

                      {/* 査定完了時: 査定結果表示 */}
                      {isAppraised && !isFormOpen && (
                        <div className="mt-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-lg font-bold text-green-700 dark:text-green-300">
                                {s.purchaseAmount !== null ? `¥${s.purchaseAmount.toLocaleString()}` : '金額未入力'}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setShipmentEdits(prev => ({
                                  ...prev,
                                  [s.id]: {
                                    purchaseAmount: s.purchaseAmount !== null ? String(s.purchaseAmount) : '',
                                    storeNote: s.storeNote ?? '',
                                    status: s.status,
                                  },
                                }))
                                setAppraisalOpen(prev => ({ ...prev, [s.id]: true }))
                              }}
                              className="text-xs px-3 py-1 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 rounded-[var(--md-sys-shape-small)] hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                            >
                              再査定
                            </button>
                          </div>
                          {s.storeNote && (
                            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2 whitespace-pre-wrap">{s.storeNote}</p>
                          )}
                        </div>
                      )}

                      {/* 受取済み/発送済み: 査定するボタン */}
                      {canAppraise && !isFormOpen && (
                        <div className="mt-3">
                          <Button
                            variant="filled"
                            size="sm"
                            onClick={() => {
                              setShipmentEdits(prev => ({
                                ...prev,
                                [s.id]: {
                                  purchaseAmount: s.purchaseAmount !== null ? String(s.purchaseAmount) : '',
                                  storeNote: s.storeNote ?? '',
                                  status: 'appraised',
                                },
                              }))
                              setAppraisalOpen(prev => ({ ...prev, [s.id]: true }))
                            }}
                          >
                            査定する
                          </Button>
                        </div>
                      )}

                      {/* 査定入力フォーム（インライン展開） */}
                      {isFormOpen && (
                        <div className="mt-3 p-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low,#f7f7f7)]">
                          <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">査定入力</h4>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">査定金額（円）</label>
                              <input
                                type="number"
                                value={edit.purchaseAmount}
                                onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, purchaseAmount: e.target.value } }))}
                                placeholder="例: 5000"
                                min="0"
                                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface)]"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">店舗メモ（顧客に表示されます）</label>
                              <textarea
                                value={edit.storeNote}
                                onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, storeNote: e.target.value } }))}
                                rows={3}
                                placeholder="査定結果の詳細や連絡事項など..."
                                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
                              />
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setAppraisalOpen(prev => ({ ...prev, [s.id]: false }))}
                                className="text-xs px-4 py-1.5 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                              >
                                キャンセル
                              </button>
                              <button
                                onClick={async () => {
                                  // 査定完了として保存
                                  const finalEdit = { ...edit, status: 'appraised' }
                                  setShipmentEdits(prev => ({ ...prev, [s.id]: finalEdit }))
                                  setSavingShipment(s.id)
                                  const res = await fetch(`/api/delivery-shipments/${s.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      status: 'appraised',
                                      purchaseAmount: edit.purchaseAmount !== '' ? Number(edit.purchaseAmount) : null,
                                      storeNote: edit.storeNote || null,
                                    }),
                                  })
                                  setSavingShipment(null)
                                  if (res.ok) {
                                    const updated = await res.json()
                                    setShipmentsList(prev => prev.map(item => item.id === s.id ? updated : item))
                                    setShipmentEdits(prev => ({
                                      ...prev,
                                      [s.id]: {
                                        purchaseAmount: updated.purchaseAmount !== null ? String(updated.purchaseAmount) : '',
                                        storeNote: updated.storeNote ?? '',
                                        status: updated.status,
                                      },
                                    }))
                                    setAppraisalOpen(prev => ({ ...prev, [s.id]: false }))
                                    setMsg({ type: 'success', text: '査定が完了しました' })
                                  } else {
                                    setMsg({ type: 'error', text: '査定の保存に失敗しました' })
                                  }
                                }}
                                disabled={savingShipment === s.id}
                                className="text-xs px-4 py-1.5 bg-[var(--portal-primary,#1E3A5F)] text-white rounded-[var(--md-sys-shape-small)] hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                              >
                                {savingShipment === s.id ? '保存中...' : '査定完了'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 登録済みステータスの場合は簡易表示のみ */}
                      {s.status === 'registered' && (
                        <p className="text-xs text-[var(--md-sys-color-outline)] mt-2">
                          顧客が発送すると査定が可能になります
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
