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
import BottomSheet from '@/components/BottomSheet'
import Tabs from '@/components/Tabs'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import MessageBanner from '@/components/MessageBanner'
import EmptyState from '@/components/EmptyState'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, type CustomerType } from '@/lib/customer-types'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE } from '@/lib/deal-status'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string | null
  phone: string
  phone2: string | null
  phone3: string | null
  address: string
  internalNote: string | null
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
  leadSource: string | null
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
  { value: 'received', label: '査定中' },
  { value: 'appraised', label: '振込準備中' },
  { value: 'transferred', label: '振込完了' },
]

const STORE_DELIVERY_STEPS = [
  { label: '発送準備' },
  { label: '発送前準備' },
  { label: '発送' },
  { label: '店舗受取確認' },
  { label: '査定' },
  { label: '振込' },
]

function getStoreStepsDone(status: string): number {
  switch (status) {
    case 'draft': return 0
    case 'registered': return 2
    case 'shipped': return 3
    case 'received': return 4
    case 'appraised': return 5
    case 'transferred': return 6
    default: return 0
  }
}

const TYPE_MAP: Record<string, { label: string; cls: string }> = {
  delivery: { label: '宅配型', cls: 'bg-blue-100 text-blue-700' },
  regular: { label: '通常買取', cls: 'bg-purple-100 text-purple-700' },
  visit: { label: '訪問型', cls: 'bg-green-100 text-green-700' },
}

type TabKey = 'info' | 'memos' | 'add' | 'history' | 'shipments' | 'inquiries' | 'deals'

type CustomerInquiry = {
  id: string
  name: string
  furigana: string
  phone: string
  email: string | null
  postalCode: string | null
  address: string
  inquiryType: string
  details: string | null
  status: string
  purchaseMemos: { id: string; title: string; imageUrls: string; status: string }[]
  createdAt: string
}

const INQUIRY_STATUS_LABEL: Record<string, string> = { new: '新規', contacted: '対応中', completed: '完了' }
const INQUIRY_STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  new:       { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  contacted: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  completed: { bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
}

type DealItem = {
  id: string
  detail: string | null
  status: string
  createdAt: string
  inquiry: { id: string; inquiryType: string } | null
  _count?: { visitSchedules: number }
}

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

  // 内部メモ編集 state
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 顧客情報編集モーダル state
  type EditDraft = {
    name: string
    furigana: string
    email: string
    phone: string
    phone2: string
    phone3: string
    address: string
    customerType: CustomerType
    visitFrequencyMonths: number
    leadSource: string
  }
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', furigana: '', email: '', phone: '', phone2: '', phone3: '', address: '', customerType: 'visit', visitFrequencyMonths: 1, leadSource: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/lead-sources')
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setLeadSources(d) })
      .catch(() => {})
  }, [])

  function openEditModal() {
    if (!customer) return
    setEditDraft({
      name: customer.name,
      furigana: customer.furigana,
      email: customer.email || '',
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      phone3: customer.phone3 || '',
      address: customer.address || '',
      customerType: (CUSTOMER_TYPES.includes(customer.customerType as CustomerType) ? customer.customerType : 'visit') as CustomerType,
      visitFrequencyMonths: (customer as any).visitFrequencyMonths ?? 1,
      leadSource: customer.leadSource || '',
    })
    setEditModalOpen(true)
  }

  async function saveCustomerEdit() {
    if (!customer) return
    if (!editDraft.name.trim() || !editDraft.furigana.trim()) {
      setMsg({ type: 'error', text: '氏名とふりがなは必須です' })
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/users/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          furigana: editDraft.furigana.trim(),
          email: editDraft.email.trim() || null,
          phone: editDraft.phone.trim(),
          phone2: editDraft.phone2.trim() || null,
          phone3: editDraft.phone3.trim() || null,
          address: editDraft.address.trim(),
          customerType: editDraft.customerType,
          customerTypes: [editDraft.customerType],
          visitFrequencyMonths: editDraft.visitFrequencyMonths,
          leadSource: editDraft.leadSource || null,
        }),
      })
      if (res.ok) {
        setCustomer(prev => prev ? {
          ...prev,
          name: editDraft.name.trim(),
          furigana: editDraft.furigana.trim(),
          email: editDraft.email.trim() || null,
          phone: editDraft.phone.trim(),
          phone2: editDraft.phone2.trim() || null,
          phone3: editDraft.phone3.trim() || null,
          address: editDraft.address.trim(),
          customerType: editDraft.customerType,
          leadSource: editDraft.leadSource || null,
        } : prev)
        setEditModalOpen(false)
        setMsg({ type: 'success', text: '顧客情報を更新しました' })
      } else {
        const d = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: d.error || '保存に失敗しました' })
      }
    } finally {
      setSavingEdit(false)
    }
  }

  async function saveInternalNote() {
    if (!customer) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/users/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNote: noteDraft }),
      })
      if (res.ok) {
        setCustomer(prev => prev ? { ...prev, internalNote: noteDraft || null } : prev)
        setEditingNote(false)
        setMsg({ type: 'success', text: '内部メモを保存しました' })
      } else {
        const d = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: d.error || '保存に失敗しました' })
      }
    } finally {
      setSavingNote(false)
    }
  }

  // 買取トライ
  const [memosList, setMemosList] = useState<PurchaseMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [memosLoaded, setMemosLoaded] = useState(false)

  // お問い合わせ履歴
  const [inquiriesList, setInquiriesList] = useState<CustomerInquiry[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [inquiriesLoaded, setInquiriesLoaded] = useState(false)

  // 案件
  const [dealsList, setDealsList] = useState<DealItem[]>([])
  const [dealsLoading, setDealsLoading] = useState(false)
  const [dealsLoaded, setDealsLoaded] = useState(false)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [newDealDetail, setNewDealDetail] = useState('')
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [dealDetailEdits, setDealDetailEdits] = useState<Record<string, string>>({})
  const [savingDeal, setSavingDeal] = useState<string | null>(null)
  const [scheduleForDeal, setScheduleForDeal] = useState<DealItem | null>(null)
  const [dealScheduleForm, setDealScheduleForm] = useState({ visitDate: '', startTime: '', endTime: '', note: '' })
  const [creatingDealSchedule, setCreatingDealSchedule] = useState(false)
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
          // バッジ表示のため問い合わせ件数をプリロード
          fetch(`/api/store/customers/${found.id}/inquiries`)
            .then(r => r.ok ? r.json() : { inquiries: [] })
            .then((d: { inquiries: CustomerInquiry[] }) => {
              setInquiriesList(d.inquiries || [])
              setInquiriesLoaded(true)
            })
            .catch(() => {})
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
    if (tab === 'inquiries' && !inquiriesLoaded && customer) {
      loadInquiries()
    }
    if (tab === 'deals' && !dealsLoaded && customer) {
      loadDeals()
    }
  }

  function loadInquiries() {
    if (!customer) return
    setInquiriesLoading(true)
    fetch(`/api/store/customers/${customer.id}/inquiries`)
      .then(r => r.ok ? r.json() : { inquiries: [] })
      .then((data: { inquiries: CustomerInquiry[] }) => {
        setInquiriesList(data.inquiries || [])
        setInquiriesLoaded(true)
      })
      .finally(() => setInquiriesLoading(false))
  }

  function loadDeals() {
    if (!customer) return
    setDealsLoading(true)
    fetch(`/api/deals?userId=${customer.id}`)
      .then(r => r.ok ? r.json() : { deals: [] })
      .then((data: { deals: DealItem[] }) => {
        const list = data.deals || []
        setDealsList(list)
        const edits: Record<string, string> = {}
        list.forEach(d => { edits[d.id] = d.detail ?? '' })
        setDealDetailEdits(edits)
        setDealsLoaded(true)
      })
      .finally(() => setDealsLoading(false))
  }

  async function handleCreateDeal() {
    if (!customer) return
    setCreatingDeal(true)
    const storeId = (session?.user as any).id
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: customer.id, storeId, detail: newDealDetail }),
    })
    setCreatingDeal(false)
    if (res.ok) {
      const created: DealItem = await res.json()
      setDealsList(prev => [created, ...prev])
      setDealDetailEdits(prev => ({ ...prev, [created.id]: created.detail ?? '' }))
      setNewDealOpen(false)
      setNewDealDetail('')
      setMsg({ type: 'success', text: '案件を作成しました' })
    } else {
      setMsg({ type: 'error', text: '案件の作成に失敗しました' })
    }
  }

  async function handleDealStatusChange(dealId: string, newStatus: string) {
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setDealsList(prev => prev.map(d => d.id === dealId ? { ...d, status: newStatus } : d))
    }
  }

  async function handleSaveDealDetail(dealId: string) {
    setSavingDeal(dealId)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detail: dealDetailEdits[dealId] ?? '' }),
    })
    setSavingDeal(null)
    if (res.ok) {
      setDealsList(prev => prev.map(d => d.id === dealId ? { ...d, detail: dealDetailEdits[dealId] ?? '' } : d))
      setMsg({ type: 'success', text: '案件メモを保存しました' })
    } else {
      setMsg({ type: 'error', text: '保存に失敗しました' })
    }
  }

  async function handleCreateDealSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!customer || !scheduleForDeal || !dealScheduleForm.visitDate) return
    const storeId = (session?.user as any).id
    const targetId = scheduleForDeal.id
    setCreatingDealSchedule(true)
    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: customer.id,
        storeId,
        dealId: targetId,
        visitDate: dealScheduleForm.visitDate,
        startTime: dealScheduleForm.startTime || undefined,
        endTime: dealScheduleForm.endTime || undefined,
        note: dealScheduleForm.note || undefined,
      }),
    })
    setCreatingDealSchedule(false)
    if (res.ok) {
      const created = await res.json()
      setDealsList(prev => prev.map(d => d.id === targetId ? { ...d, _count: { visitSchedules: (d._count?.visitSchedules ?? 0) + 1 } } : d))
      setSchedules(prev => [created, ...prev])
      setScheduleForDeal(null)
      setDealScheduleForm({ visitDate: '', startTime: '', endTime: '', note: '' })
      setMsg({ type: 'success', text: '訪問予定を作成し、案件に紐づけました' })
    } else {
      setMsg({ type: 'error', text: '訪問予定の作成に失敗しました' })
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
    if (tabFromUrl === 'deals' && !dealsLoaded) loadDeals()
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
        { key: 'inquiries', label: inquiriesList.length > 0 ? `お問い合わせ（${inquiriesList.length}）` : 'お問い合わせ' },
        { key: 'deals', label: dealsList.length > 0 ? `案件（${dealsList.length}）` : '案件' },
        { key: 'shipments', label: shipmentsList.length > 0 ? `送付履歴（${shipmentsList.length}）` : '送付履歴' },
      ]
    : [
        { key: 'info', label: '基本情報' },
        { key: 'inquiries', label: inquiriesList.length > 0 ? `お問い合わせ（${inquiriesList.length}）` : 'お問い合わせ' },
        { key: 'deals', label: dealsList.length > 0 ? `案件（${dealsList.length}）` : '案件' },
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">顧客情報</h2>
                <button
                  onClick={openEditModal}
                  className="text-xs text-[var(--portal-primary)] hover:underline"
                >
                  顧客情報を編集
                </button>
              </div>
              <dl className="space-y-3">
                {[
                  { label: '氏名', value: customer.name },
                  { label: 'ふりがな', value: customer.furigana },
                  { label: 'メール', value: customer.email || '未登録' },
                  { label: '電話番号', value: customer.phone },
                  ...(customer.phone2 ? [{ label: '電話番号 2', value: customer.phone2 }] : []),
                  ...(customer.phone3 ? [{ label: '電話番号 3', value: customer.phone3 }] : []),
                  { label: '訪問先住所', value: customer.address },
                  { label: '顧客タイプ', value: typeInfo.label },
                  ...(customer.leadSource ? [{ label: '流入経路', value: customer.leadSource }] : []),
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

            {/* 内部メモ（店舗・管理者のみ閲覧可。お客様には非公開） */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                  内部メモ
                  <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">店舗・管理者のみ</span>
                </h2>
                {!editingNote && (
                  <button
                    onClick={() => { setNoteDraft(customer.internalNote || ''); setEditingNote(true) }}
                    className="text-xs text-[var(--portal-primary)] hover:underline"
                  >
                    {customer.internalNote ? '編集' : 'メモを追加'}
                  </button>
                )}
              </div>
              {editingNote ? (
                <div className="space-y-2">
                  <textarea
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    rows={4}
                    placeholder="どのような顧客なのか・訪問時の注意点など。お客様には公開されません。"
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] resize-y"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingNote(false)} disabled={savingNote} className="text-xs px-3 py-1.5 rounded text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]">キャンセル</button>
                    <button onClick={saveInternalNote} disabled={savingNote} className="text-xs px-3 py-1.5 rounded bg-[var(--portal-primary)] text-white disabled:opacity-50">{savingNote ? '保存中...' : '保存'}</button>
                  </div>
                </div>
              ) : customer.internalNote ? (
                <div className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap bg-amber-50 dark:bg-amber-950/30 rounded p-3 border border-amber-200 dark:border-amber-800">
                  {customer.internalNote}
                </div>
              ) : (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">未記入</p>
              )}
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

        {/* ===== お問い合わせタブ ===== */}
        {activeTab === 'inquiries' && (
          <div>
            {inquiriesLoading ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-12">読み込み中...</p>
            ) : inquiriesList.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">この顧客に紐づくお問い合わせはありません</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {inquiriesList.map(inq => {
                  const sc = INQUIRY_STATUS_COLOR[inq.status] ?? INQUIRY_STATUS_COLOR.new
                  return (
                    <Card key={inq.id} className="p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {new Date(inq.createdAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: sc.bg, color: sc.fg }}
                        >
                          {INQUIRY_STATUS_LABEL[inq.status] ?? inq.status}
                        </span>
                      </div>
                      <div className="text-sm font-semibold mb-1">{inq.inquiryType}</div>
                      {inq.details && (
                        <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap leading-relaxed mb-2">{inq.details}</p>
                      )}
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        <div><dt className="inline font-medium">氏名:</dt> <dd className="inline">{inq.name}（{inq.furigana}）</dd></div>
                        <div><dt className="inline font-medium">電話:</dt> <dd className="inline">{inq.phone}</dd></div>
                        {inq.email && <div><dt className="inline font-medium">メール:</dt> <dd className="inline">{inq.email}</dd></div>}
                        <div className="sm:col-span-2"><dt className="inline font-medium">住所:</dt> <dd className="inline">{inq.postalCode ? `〒${inq.postalCode} ` : ''}{inq.address}</dd></div>
                      </dl>
                      {inq.purchaseMemos && inq.purchaseMemos.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1">買取希望品（{inq.purchaseMemos.length}件）</div>
                          <ul className="list-disc pl-4 text-xs space-y-0.5">
                            {inq.purchaseMemos.map(m => (
                              <li key={m.id}>{m.title}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== 案件タブ ===== */}
        {activeTab === 'deals' && (
          <div>
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => { setNewDealDetail(''); setNewDealOpen(true) }}>
                + 案件を追加
              </Button>
            </div>
            {dealsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : dealsList.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">この顧客に紐づく案件はありません</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {dealsList.map(deal => {
                  const badge = DEAL_STATUS_BADGE[deal.status as keyof typeof DEAL_STATUS_BADGE] ?? DEAL_STATUS_BADGE.inquiry
                  const dirty = (dealDetailEdits[deal.id] ?? '') !== (deal.detail ?? '')
                  return (
                    <Card key={deal.id} className="p-4">
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: badge.bg, color: badge.fg }}
                          >
                            {DEAL_STATUS_LABEL[deal.status as keyof typeof DEAL_STATUS_LABEL] ?? deal.status}
                          </span>
                          {deal.inquiry && (
                            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">問い合わせ由来</span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          {new Date(deal.createdAt).toLocaleDateString('ja-JP', { dateStyle: 'medium' })}
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">ステータス</label>
                        <select
                          value={deal.status}
                          onChange={e => handleDealStatusChange(deal.id, e.target.value)}
                          className="w-full sm:w-52 px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                        >
                          {DEAL_STATUS_ORDER.map(s => (
                            <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </div>

                      <TextField
                        label="案件メモ（買取内容など）"
                        value={dealDetailEdits[deal.id] ?? ''}
                        onChange={v => setDealDetailEdits(prev => ({ ...prev, [deal.id]: v }))}
                        rows={4}
                      />
                      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                          紐づく訪問予定: {deal._count?.visitSchedules ?? 0}件
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="tonal"
                            onClick={() => { setDealScheduleForm({ visitDate: '', startTime: '', endTime: '', note: '' }); setScheduleForDeal(deal) }}
                          >
                            訪問予定を作成
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveDealDetail(deal.id)}
                            loading={savingDeal === deal.id}
                            disabled={savingDeal === deal.id || !dirty}
                          >
                            メモを保存
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* 案件追加モーダル */}
            <BottomSheet open={newDealOpen} onClose={() => setNewDealOpen(false)} title="案件を追加">
              <div className="space-y-4">
                <TextField
                  label="案件メモ（買取内容など）"
                  value={newDealDetail}
                  onChange={setNewDealDetail}
                  rows={5}
                  placeholder="買取の内容や状況などを入力..."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="text" onClick={() => setNewDealOpen(false)}>キャンセル</Button>
                  <Button onClick={handleCreateDeal} loading={creatingDeal} disabled={creatingDeal}>作成</Button>
                </div>
              </div>
            </BottomSheet>

            {/* 案件に紐づく訪問予定の作成モーダル */}
            <BottomSheet open={!!scheduleForDeal} onClose={() => setScheduleForDeal(null)} title="訪問予定を作成して案件に紐づける">
              <form onSubmit={handleCreateDealSchedule} className="space-y-4">
                <TextField
                  label="訪問日"
                  type="date"
                  value={dealScheduleForm.visitDate}
                  onChange={v => setDealScheduleForm(prev => ({ ...prev, visitDate: v }))}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="開始時間"
                    type="time"
                    value={dealScheduleForm.startTime}
                    onChange={v => setDealScheduleForm(prev => ({ ...prev, startTime: v }))}
                  />
                  <TextField
                    label="終了時間"
                    type="time"
                    value={dealScheduleForm.endTime}
                    onChange={v => setDealScheduleForm(prev => ({ ...prev, endTime: v }))}
                  />
                </div>
                <TextField
                  label="メモ（任意）"
                  value={dealScheduleForm.note}
                  onChange={v => setDealScheduleForm(prev => ({ ...prev, note: v }))}
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="text" onClick={() => setScheduleForDeal(null)}>キャンセル</Button>
                  <Button type="submit" loading={creatingDealSchedule} disabled={creatingDealSchedule || !dealScheduleForm.visitDate}>作成</Button>
                </div>
              </form>
            </BottomSheet>
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
                          className="text-xs px-4 py-1.5 bg-[var(--portal-primary)] text-white rounded-[var(--md-sys-shape-small)] hover:opacity-90 transition-opacity disabled:opacity-50"
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
                お客様に訪問日程を提案できます。お客様が承認するとスケジュールが作成されます。
              </p>

              {proposalMsg && (
                <MessageBanner severity={proposalMsg.type} dismissible onDismiss={() => setProposalMsg(null)}>
                  {proposalMsg.text}
                </MessageBanner>
              )}

              {showProposalForm && (
                <form onSubmit={handleSubmitProposal} className="space-y-4 mt-4">
                  <div className="p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
                    <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">
                      訪問日程 <span className="text-red-500">*</span>
                    </p>
                    <TextField
                      label="日付"
                      type="date"
                      value={proposalForm.candidate1Date}
                      onChange={v => setProposalForm(prev => ({ ...prev, candidate1Date: v }))}
                      required
                    />
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <TextField
                        label="開始"
                        type="time"
                        value={proposalForm.candidate1Start}
                        onChange={v => setProposalForm(prev => ({ ...prev, candidate1Start: v }))}
                      />
                      <TextField
                        label="終了"
                        type="time"
                        value={proposalForm.candidate1End}
                        onChange={v => setProposalForm(prev => ({ ...prev, candidate1End: v }))}
                      />
                    </div>
                  </div>
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
                  const stepsDone = getStoreStepsDone(s.status)
                  const isTransferred = s.status === 'transferred'
                  const isAppraised = s.status === 'appraised'

                  // Helper: update status via API
                  const updateStatus = async (newStatus: string, extra?: { purchaseAmount?: string; storeNote?: string }) => {
                    setSavingShipment(s.id)
                    const body: Record<string, unknown> = { status: newStatus }
                    if (extra?.purchaseAmount !== undefined) body.purchaseAmount = extra.purchaseAmount !== '' ? Number(extra.purchaseAmount) : null
                    if (extra?.storeNote !== undefined) body.storeNote = extra.storeNote || null
                    const res = await fetch(`/api/delivery-shipments/${s.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    setSavingShipment(null)
                    if (res.ok) {
                      const updated = await res.json()
                      setShipmentsList(prev => prev.map(item => item.id === s.id ? updated : item))
                      setShipmentEdits(prev => ({
                        ...prev,
                        [s.id]: { purchaseAmount: updated.purchaseAmount !== null ? String(updated.purchaseAmount) : '', storeNote: updated.storeNote ?? '', status: updated.status },
                      }))
                      setAppraisalOpen(prev => ({ ...prev, [s.id]: false }))
                      const labels: Record<string, string> = { received: '受取完了を記録しました', appraised: '査定が完了しました', transferred: '振込完了を記録しました' }
                      setMsg({ type: 'success', text: labels[newStatus] ?? '更新しました' })
                    } else {
                      setMsg({ type: 'error', text: '更新に失敗しました' })
                    }
                  }

                  return (
                    <Card key={s.id} variant="outlined" className="overflow-hidden">
                      {/* ─── Header ─── */}
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                            {s.shipmentNumber}
                          </span>
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {s.shipmentMonth.replace('-', '年')}月
                          </span>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          isTransferred ? 'bg-emerald-100 text-emerald-700' :
                          isAppraised   ? 'bg-green-100 text-green-700' :
                          s.status === 'received' ? 'bg-blue-100 text-blue-700' :
                          s.status === 'shipped'  ? 'bg-amber-100 text-amber-700' :
                          s.status === 'registered' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {SHIPMENT_STATUS_OPTIONS.find(o => o.value === s.status)?.label ?? s.status}
                        </span>
                      </div>

                      {s.description && (
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3 whitespace-pre-wrap">{s.description}</p>
                      )}

                      {/* ─── Progress stepper (compact horizontal) ─── */}
                      <div className="flex items-center gap-0 mb-4 overflow-x-auto pb-1">
                        {STORE_DELIVERY_STEPS.map((step, idx) => {
                          const done = idx < stepsDone
                          const active = idx === stepsDone && stepsDone < 6
                          return (
                            <div key={idx} className="flex items-center flex-shrink-0">
                              <div className="flex flex-col items-center gap-0.5" style={{ minWidth: '52px' }}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                  done   ? 'bg-emerald-500 text-white' :
                                  active ? 'bg-[var(--portal-primary)] text-white ring-2 ring-[var(--portal-primary)] ring-offset-1' :
                                           'bg-gray-100 border border-gray-300 text-gray-400'
                                }`}>
                                  {done ? (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : idx + 1}
                                </div>
                                <span className={`text-[9px] leading-tight text-center ${done ? 'text-emerald-600' : active ? 'text-[var(--portal-primary)]' : 'text-gray-400'}`}>
                                  {step.label}
                                </span>
                              </div>
                              {idx < STORE_DELIVERY_STEPS.length - 1 && (
                                <div className={`h-0.5 w-3 flex-shrink-0 -mt-3 ${idx < stepsDone - 1 ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* ─── Images ─── */}
                      {s.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {s.imageUrls.slice(0, 4).map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg hover:opacity-80 transition-opacity" />
                            </a>
                          ))}
                          {s.imageUrls.length > 4 && (
                            <div className="w-16 h-16 rounded-lg bg-[var(--md-sys-color-surface-container)] flex items-center justify-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                              +{s.imageUrls.length - 4}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── Action zone ─── */}

                      {/* registered: waiting for customer to ship */}
                      {s.status === 'registered' && (
                        <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-700">
                          顧客が発送報告をするとアクションが可能になります
                        </div>
                      )}

                      {/* shipped: confirm receipt */}
                      {s.status === 'shipped' && !isFormOpen && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-amber-800">荷物が発送されました</p>
                            <p className="text-xs text-amber-600 mt-0.5">受け取りが完了したら記録してください</p>
                          </div>
                          <button
                            onClick={() => updateStatus('received')}
                            disabled={savingShipment === s.id}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                          >
                            {savingShipment === s.id ? '処理中...' : '受取完了'}
                          </button>
                        </div>
                      )}

                      {/* received: appraise */}
                      {s.status === 'received' && !isFormOpen && (
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-blue-800">荷物を受け取りました</p>
                            <p className="text-xs text-blue-600 mt-0.5">査定が完了したら金額を入力してください</p>
                          </div>
                          <button
                            onClick={() => {
                              setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, status: 'appraised' } }))
                              setAppraisalOpen(prev => ({ ...prev, [s.id]: true }))
                            }}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          >
                            査定する
                          </button>
                        </div>
                      )}

                      {/* appraised: show result + transfer button */}
                      {isAppraised && !isFormOpen && (
                        <div className="space-y-2">
                          <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div>
                                <p className="text-xs font-medium text-green-700">査定結果</p>
                                <p className="text-lg font-bold text-green-700 mt-0.5">
                                  {s.purchaseAmount !== null ? `¥${s.purchaseAmount.toLocaleString()}` : '金額未入力'}
                                </p>
                                {s.storeNote && <p className="text-xs text-green-600 mt-1 whitespace-pre-wrap">{s.storeNote}</p>}
                              </div>
                              <button
                                onClick={() => {
                                  setShipmentEdits(prev => ({ ...prev, [s.id]: { purchaseAmount: s.purchaseAmount !== null ? String(s.purchaseAmount) : '', storeNote: s.storeNote ?? '', status: 'appraised' } }))
                                  setAppraisalOpen(prev => ({ ...prev, [s.id]: true }))
                                }}
                                className="text-xs px-2 py-1 border border-green-300 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                              >
                                修正
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => updateStatus('transferred', { storeNote: s.storeNote ?? undefined })}
                            disabled={savingShipment === s.id}
                            className="w-full py-2 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {savingShipment === s.id ? '処理中...' : '振込完了を記録する'}
                          </button>
                        </div>
                      )}

                      {/* transferred: complete */}
                      {isTransferred && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                          <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-xs font-semibold text-emerald-800">振込完了</p>
                            {s.purchaseAmount !== null && (
                              <p className="text-sm font-bold text-emerald-700">¥{s.purchaseAmount.toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Appraisal form (inline) */}
                      {isFormOpen && (
                        <div className="p-4 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low,#f7f7f7)] space-y-3">
                          <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">査定入力</h4>
                          <div>
                            <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">査定金額（円）</label>
                            <input
                              type="number"
                              value={edit.purchaseAmount}
                              onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, purchaseAmount: e.target.value } }))}
                              placeholder="例: 5000"
                              min="0"
                              className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] text-[var(--md-sys-color-on-surface)]"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">メモ（顧客に表示されます）</label>
                            <textarea
                              value={edit.storeNote}
                              onChange={e => setShipmentEdits(prev => ({ ...prev, [s.id]: { ...edit, storeNote: e.target.value } }))}
                              rows={3}
                              placeholder="査定結果の詳細や連絡事項など..."
                              className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setAppraisalOpen(prev => ({ ...prev, [s.id]: false }))}
                              className="text-xs px-4 py-1.5 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] rounded-lg hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                            >
                              キャンセル
                            </button>
                            <button
                              onClick={() => updateStatus('appraised', { purchaseAmount: edit.purchaseAmount, storeNote: edit.storeNote })}
                              disabled={savingShipment === s.id}
                              className="text-xs px-4 py-1.5 bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold"
                            >
                              {savingShipment === s.id ? '保存中...' : '査定完了'}
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 顧客情報編集モーダル */}
      <BottomSheet open={editModalOpen} onClose={() => !savingEdit && setEditModalOpen(false)} title="顧客情報を編集" desktopMaxWidth="sm:max-w-2xl">
        <div className="space-y-4">
          <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="氏名" value={editDraft.name} onChange={v => setEditDraft(d => ({ ...d, name: v }))} required autoComplete="off" name="kk-edit-name" />
            <TextField label="ふりがな" value={editDraft.furigana} onChange={v => setEditDraft(d => ({ ...d, furigana: v }))} required autoComplete="off" name="kk-edit-furigana" />
            <TextField label="メールアドレス（任意）" type="email" value={editDraft.email} onChange={v => setEditDraft(d => ({ ...d, email: v }))} autoComplete="off" name="kk-edit-email" />
            <TextField label="電話番号（任意）" type="tel" value={editDraft.phone} onChange={v => setEditDraft(d => ({ ...d, phone: v }))} autoComplete="off" name="kk-edit-phone" />
            <TextField label="電話番号 2（任意）" type="tel" value={editDraft.phone2} onChange={v => setEditDraft(d => ({ ...d, phone2: v }))} autoComplete="off" name="kk-edit-phone2" />
            <TextField label="電話番号 3（任意）" type="tel" value={editDraft.phone3} onChange={v => setEditDraft(d => ({ ...d, phone3: v }))} autoComplete="off" name="kk-edit-phone3" />
          </div>
          <TextField label="住所" value={editDraft.address} onChange={v => setEditDraft(d => ({ ...d, address: v }))} autoComplete="off" name="kk-edit-address" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">顧客タイプ</label>
              <select
                value={editDraft.customerType}
                onChange={e => setEditDraft(d => ({ ...d, customerType: e.target.value as CustomerType }))}
                className="w-full h-12 px-3 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              >
                {CUSTOMER_TYPES.map(t => (
                  <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            {(editDraft.customerType === 'visit' || editDraft.customerType === 'delivery') && (
              <div>
                <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">頻度（{editDraft.customerType === 'visit' ? '訪問' : '宅配'}）</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={editDraft.visitFrequencyMonths}
                    onChange={e => setEditDraft(d => ({ ...d, visitFrequencyMonths: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-24 h-12 px-3 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                  />
                  <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">ヶ月に1回</span>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">流入経路</label>
            <select
              value={editDraft.leadSource}
              onChange={e => setEditDraft(d => ({ ...d, leadSource: e.target.value }))}
              className="w-full h-12 px-3 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
            >
              <option value="">未設定</option>
              {leadSources.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => setEditModalOpen(false)} disabled={savingEdit}>キャンセル</Button>
            <Button onClick={saveCustomerEdit} disabled={savingEdit || !editDraft.name.trim() || !editDraft.furigana.trim()} loading={savingEdit}>
              {savingEdit ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
