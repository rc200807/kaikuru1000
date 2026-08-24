'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import CustomerMergeModal from '@/components/CustomerMergeModal'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import TimeSelect from '@/components/TimeSelect'
import { useBusinessHours } from '@/hooks/useBusinessHours'
import BottomSheet from '@/components/BottomSheet'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import MessageBanner from '@/components/MessageBanner'
import EmptyState from '@/components/EmptyState'
import Modal from '@/components/Modal'
import Section, { SECTION_CLS, useOpenLatch } from '@/components/detail/SectionCard'
import { PropRow } from '@/components/detail/PropRow'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, type CustomerType } from '@/lib/customer-types'
import { getSplitName, combineName } from '@/lib/name-utils'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE } from '@/lib/deal-status'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE, dealCategoryFromCustomerType } from '@/lib/deal-categories'
import { isSelectableVisitStatus } from '@/lib/visit-status'
import { formatDealNumber } from '@/lib/deal-number'
import { useStoreScope } from '@/components/store/StoreScopeContext'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string | null
  phone: string
  phone2: string | null
  phone3: string | null
  postalCode: string | null
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
  birthDate: string | null
  occupation: string | null
  visitFrequencyMonths: number | null
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
  dealId?: string | null
  purchaseAmount?: number | null
  billingAmount?: number | null
  store: { id: string; name: string }
  user: { id: string; name: string }
  purchaseItems: Array<{ id: string; itemName: string; purchasePrice: number }>
  workItems: Array<{ id: string; workName: string; unitPrice: number; quantity: number }>
  salesContract: { id: string; createdAt: string } | null
}

type IssuedDocs = {
  estimate: { hasSale: boolean; hasInvoice: boolean } | null
  contract: { hasSale: boolean; hasInvoice: boolean } | null
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

// 全ステータス（バッジ・ラベル表示用に既存値も網羅）
const STATUS_OPTIONS = [
  { value: 'scheduled', label: '予定' },
  { value: 'pending', label: '未対応' },
  { value: 'completed', label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent', label: '不在' },
  { value: 'cancelled', label: 'キャンセル' },
]
// ステータス変更ドロップダウンで選択可能なもの（契約進捗系は案件側で管理）
const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.filter(o => isSelectableVisitStatus(o.value))

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

// 旧タブURL（?tab=）で来たときにスクロールする先。1画面俯瞰に統合したのでタブは持たない
const TAB_ANCHOR: Record<string, string> = {
  inquiries: 'cust-inquiries',
  deals: 'cust-deals',
  memos: 'cust-memos',
  add: 'cust-next',
  history: 'cust-visits',
  shipments: 'cust-shipments',
}

const ACTIVITY_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'visit', label: '訪問' },
  { key: 'deal', label: '案件' },
  { key: 'inquiry', label: '問い合わせ' },
  { key: 'shipment', label: '宅配' },
]

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
  dealNumber: string | null
  detail: string | null
  status: string
  category: string | null
  occurredAt: string | null
  createdAt: string
  purchaseAmount: number | null
  billingAmount: number | null
  preConsentAt: string | null
  member: { id: string; name: string } | null
  salesContract: { id: string } | null
  inquiry: { id: string; inquiryType: string } | null
  _count?: { visitSchedules: number }
}

// ───── ダッシュボード用ヘルパー ─────
const DASH_ACCENT = '#b91c1c'
const DASH_GRID = '#e5e5e5'
const DASH_TICK = '#a3a3a3'

function fmtYen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`
}
function yenAxis(v: number): string {
  if (v >= 10_000) return `${(v / 10_000).toFixed(v % 10_000 === 0 ? 0 : 1)}万`
  return `${v}`
}
function fmtMD(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
}

function DashStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-4">
      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{label}</p>
      <p className="text-xl font-bold text-[var(--md-sys-color-on-surface)] mt-1 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">{sub}</p>}
    </div>
  )
}

export default function StoreCustomerDetailPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const bizHours = useBusinessHours()
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const scope = useStoreScope()
  // セッション店舗がアキクル非対応か（読込中は制限しない）
  const akikuruBlocked = !scope.loading && !scope.services.includes('akikuru')

  const tabFromUrl = (searchParams.get('tab') as TabKey) || 'info'

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)

  // 訪問履歴
  const [schedules, setSchedules] = useState<VisitSchedule[]>([])
  const [schedulesLoaded, setSchedulesLoaded] = useState(false)
  // 発行済み書類（見積書・売買契約書のPDF有無）。scheduleId をキーに保持
  const [docsBySchedule, setDocsBySchedule] = useState<Record<string, IssuedDocs>>({})

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
    lastName: string
    firstName: string
    lastNameKana: string
    firstNameKana: string
    email: string
    phone: string
    phone2: string
    phone3: string
    postalCode: string
    address: string
    customerType: CustomerType
    visitFrequencyMonths: number
    leadSource: string
  }
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft>({ lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', email: '', phone: '', phone2: '', phone3: '', postalCode: '', address: '', customerType: 'visit', visitFrequencyMonths: 1, leadSource: '' })
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
      ...getSplitName(customer as any),
      email: customer.email || '',
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      phone3: customer.phone3 || '',
      postalCode: customer.postalCode || '',
      address: customer.address || '',
      customerType: (CUSTOMER_TYPES.includes(customer.customerType as CustomerType) ? customer.customerType : 'visit') as CustomerType,
      visitFrequencyMonths: (customer as any).visitFrequencyMonths ?? 1,
      leadSource: customer.leadSource || '',
    })
    setEditModalOpen(true)
  }

  async function saveCustomerEdit() {
    if (!customer) return
    if (!editDraft.lastName.trim() || !editDraft.firstName.trim() || !editDraft.lastNameKana.trim() || !editDraft.firstNameKana.trim()) {
      setMsg({ type: 'error', text: '姓・名とふりがなは必須です' })
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/users/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastName: editDraft.lastName.trim(),
          firstName: editDraft.firstName.trim(),
          lastNameKana: editDraft.lastNameKana.trim(),
          firstNameKana: editDraft.firstNameKana.trim(),
          email: editDraft.email.trim() || null,
          phone: editDraft.phone.trim(),
          phone2: editDraft.phone2.trim() || null,
          phone3: editDraft.phone3.trim() || null,
          postalCode: editDraft.postalCode.replace(/[-ー－\s]/g, '') || null,
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
          name: combineName(editDraft.lastName, editDraft.firstName),
          furigana: combineName(editDraft.lastNameKana, editDraft.firstNameKana),
          lastName: editDraft.lastName.trim(),
          firstName: editDraft.firstName.trim(),
          lastNameKana: editDraft.lastNameKana.trim(),
          firstNameKana: editDraft.firstNameKana.trim(),
          email: editDraft.email.trim() || null,
          phone: editDraft.phone.trim(),
          phone2: editDraft.phone2.trim() || null,
          phone3: editDraft.phone3.trim() || null,
          postalCode: editDraft.postalCode.replace(/[-ー－\s]/g, '') || null,
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
  const [memosLoaded, setMemosLoaded] = useState(false)

  // お問い合わせ履歴
  const [inquiriesList, setInquiriesList] = useState<CustomerInquiry[]>([])
  const [inquiriesLoaded, setInquiriesLoaded] = useState(false)

  // 案件
  const [dealsList, setDealsList] = useState<DealItem[]>([])
  const [dealsLoaded, setDealsLoaded] = useState(false)
  const [dealsTotal, setDealsTotal] = useState(0)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [newDealDetail, setNewDealDetail] = useState('')
  const [newDealCategory, setNewDealCategory] = useState<string>('purchase')
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [scheduleForDeal, setScheduleForDeal] = useState<DealItem | null>(null)
  const [dealScheduleForm, setDealScheduleForm] = useState({ visitDate: '', startTime: '', endTime: '', note: '' })
  const [creatingDealSchedule, setCreatingDealSchedule] = useState(false)
  const [memoStoreNotes, setMemoStoreNotes] = useState<Record<string, string>>({})
  const [savingMemoNote, setSavingMemoNote] = useState<string | null>(null)

  // 送付履歴
  const [shipmentsList, setShipmentsList] = useState<DeliveryShipment[]>([])
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
  // 身分証の拡大表示
  const [idImageOpen, setIdImageOpen] = useState(false)
  // アクティビティの絞り込みと表示件数
  const [activityFilter, setActivityFilter] = useState('all')
  const [activityLimit, setActivityLimit] = useState(20)
  // 折りたたみセクションの既定開閉（データ到着後に一度だけ確定）
  const initialOpen = useOpenLatch()
  // 旧タブURLからのスクロールを1回だけ行うためのフラグ
  const anchorScrolled = useRef(false)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  // 1画面ぶんのデータを1本のAPIでまとめて取得する。
  // 以前は 顧客／案件／訪問予定／書類／買取希望品／問い合わせ／宅配／日程提案 で
  // 8本のAPIを並行で叩いていた（往復1本あたり0.3秒前後＋そのぶんの関数起動とDB接続）。
  useEffect(() => {
    if (authStatus !== 'authenticated' || !id) return
    let cancelled = false
    fetch(`/api/store/customers/${id}/overview`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return
        if (data?.customer) {
          setCustomer(data.customer)

          setDealsList(data.deals ?? [])
          setDealsTotal(data.dealsTotal ?? (data.deals?.length ?? 0))
          setDealsLoaded(true)

          setSchedules(data.schedules ?? [])
          setSchedulesLoaded(true)

          const docMap: Record<string, IssuedDocs> = {}
          for (const d of (data.documents ?? []) as any[]) {
            docMap[d.scheduleId] = {
              estimate: d.estimate ? { hasSale: !!d.estimate.hasSale, hasInvoice: !!d.estimate.hasInvoice } : null,
              contract: d.contract ? { hasSale: !!d.contract.hasSale, hasInvoice: !!d.contract.hasInvoice } : null,
            }
          }
          setDocsBySchedule(docMap)

          const memos: PurchaseMemo[] = data.memos ?? []
          setMemosList(memos)
          const notes: Record<string, string> = {}
          memos.forEach(m => { notes[m.id] = m.storeNote ?? '' })
          setMemoStoreNotes(notes)
          setMemosLoaded(true)

          setInquiriesList(data.inquiries ?? [])
          setInquiriesLoaded(true)

          const shipments: DeliveryShipment[] = data.shipments ?? []
          setShipmentsList(shipments)
          const edits: Record<string, { purchaseAmount: string; storeNote: string; status: string }> = {}
          shipments.forEach(sh => {
            edits[sh.id] = {
              purchaseAmount: sh.purchaseAmount !== null ? String(sh.purchaseAmount) : '',
              storeNote: sh.storeNote ?? '',
              status: sh.status,
            }
          })
          setShipmentEdits(edits)
          setShipmentsLoaded(true)

          setStoreProposals(data.proposals ?? [])
          setStoreProposalsLoaded(true)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [authStatus, id])



  async function handleCreateDeal() {
    if (!customer) return
    setCreatingDeal(true)
    const storeId = (session?.user as any).id
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: customer.id, storeId, detail: newDealDetail, category: newDealCategory }),
    })
    setCreatingDeal(false)
    if (res.ok) {
      const created: DealItem = await res.json()
      setDealsList(prev => [created, ...prev])
      setDealsTotal(prev => prev + 1)
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


  // 発行済みPDFをダウンロード（店舗セッションで取得・添付不要）
  function downloadDoc(scheduleId: string, type: 'estimate' | 'contract', kind: 'sale' | 'invoice') {
    const url = `/api/magic-link/document-pdf?type=${type}&kind=${kind}&visitId=${encodeURIComponent(scheduleId)}`
    window.open(url, '_blank')
  }



  // 旧タブURL（?tab=deals など）で来た場合は該当セクションへスクロールし、パラメータを落とす。
  // 各セクションの高さはデータ到着後に確定するため、読み込みが揃うまで待ってから移動する
  useEffect(() => {
    if (!customer || anchorScrolled.current) return
    const anchor = TAB_ANCHOR[tabFromUrl]
    // useSearchParams は初回レンダーで空になることがあるので、ここではフラグを立てない
    if (!anchor) return
    if (!(dealsLoaded && schedulesLoaded && memosLoaded && inquiriesLoaded && shipmentsLoaded)) return
    anchorScrolled.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState({}, '', url.toString())
    // cleanup で消すと依存の再評価で二度と実行されないため、あえて片付けないタイマーにする
    setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, dealsLoaded, schedulesLoaded, memosLoaded, inquiriesLoaded, shipmentsLoaded])

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

  // 再読み込み中に全体を差し替えると <details> の開閉やフォーム入力が巻き戻るため、初回だけ全面スピナー
  if (authStatus === 'loading' || (loading && !customer)) {
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

  // ───── ダッシュボード集計 ─────
  const visitAmount = (s: VisitSchedule): number =>
    s.purchaseAmount ?? (s.purchaseItems?.reduce((a, i) => a + (i.purchasePrice || 0), 0) ?? 0)
  const visitPurchaseTotal = schedules.reduce((sum, s) => sum + visitAmount(s), 0)
  const shipmentPurchaseTotal = shipmentsList.reduce((sum, s) => sum + (s.purchaseAmount ?? 0), 0)
  const cumulativePurchase = visitPurchaseTotal + shipmentPurchaseTotal
  const completedVisits = schedules.filter(s => s.status === 'completed').length
  const dashNow = new Date()
  const upcomingVisits = schedules
    .filter(s => s.status !== 'cancelled' && new Date(s.visitDate).getTime() >= new Date(dashNow.getFullYear(), dashNow.getMonth(), dashNow.getDate()).getTime())
    .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())
  const nextVisit = upcomingVisits[0] ?? null
  const lastDealStatus = dealsList[0]?.status ?? null

  // 月別買取金額（直近12ヶ月）
  const dashMonths: { key: string; label: string }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(dashNow.getFullYear(), dashNow.getMonth() - i, 1)
    dashMonths.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${d.getMonth() + 1}月` })
  }
  const amountByMonth: Record<string, number> = {}
  for (const s of schedules) {
    const amt = visitAmount(s)
    const key = typeof s.visitDate === 'string' ? s.visitDate.slice(0, 7) : ''
    if (amt > 0 && key) amountByMonth[key] = (amountByMonth[key] || 0) + amt
  }
  for (const sh of shipmentsList) {
    const amt = sh.purchaseAmount ?? 0
    if (amt > 0 && sh.shipmentMonth) amountByMonth[sh.shipmentMonth] = (amountByMonth[sh.shipmentMonth] || 0) + amt
  }
  const monthlyTrend = dashMonths.map(m => ({ month: m.label, amount: amountByMonth[m.key] || 0 }))
  const hasTrend = monthlyTrend.some(d => d.amount > 0)

  // これまでの履歴（複数ソースを統合・新しい順）
  type DashEvent = { date: string; kind: string; label: string; sub?: string; color: string; href?: string }
  const dashEvents: DashEvent[] = []
  for (const s of schedules) {
    dashEvents.push({ date: s.visitDate, kind: 'visit', color: '#a78bfa', label: '訪問', sub: visitAmount(s) > 0 ? `買取 ${fmtYen(visitAmount(s))}` : (STATUS_OPTIONS.find(o => o.value === s.status)?.label ?? s.status), href: s.dealId ? `/store/deals/${s.dealId}` : undefined })
  }
  for (const d of dealsList) {
    dashEvents.push({ date: d.createdAt, kind: 'deal', color: '#2dd4bf', label: '案件作成', sub: d.detail ? d.detail.slice(0, 24) : (DEAL_STATUS_LABEL[d.status] ?? d.status), href: `/store/deals/${d.id}` })
  }
  for (const q of inquiriesList) {
    dashEvents.push({ date: q.createdAt, kind: 'inquiry', color: '#60a5fa', label: 'お問い合わせ', sub: q.inquiryType || undefined })
  }
  for (const sh of shipmentsList) {
    dashEvents.push({ date: sh.createdAt, kind: 'shipment', color: '#fbbf24', label: '宅配送付', sub: sh.purchaseAmount ? `買取 ${fmtYen(sh.purchaseAmount)}` : sh.shipmentMonth })
  }
  // 目次・アラートから該当セクションへ移動する。折りたたみ中のセクションは開いてから移動
  function jumpToSection(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const el = document.getElementById(href.replace('#', ''))
    if (!el) return
    e.preventDefault()
    if (el.tagName === 'DETAILS') (el as HTMLDetailsElement).open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ───── ヘッダー・レーン表示用の派生値 ─────
  const isRegular = customer.customerType === 'regular'
  const freqMonths = customer.visitFrequencyMonths ?? null
  const customerTypeBadges = [{ key: customer.customerType, label: typeInfo.label, cls: typeInfo.cls }]

  // 直近の接触（訪問・案件・問い合わせ・送付のうち、今日までで最も新しいもの）
  const lastContact = dashEvents
    .filter(e => e.date && !isNaN(new Date(e.date).getTime()) && new Date(e.date).getTime() <= dashNow.getTime())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null

  const pendingMemoCount = memosList.filter(m => m.status === 'pending').length
  const newInquiryCount = inquiriesList.filter(q => q.status === 'new').length

  // アクティビティ（種別で絞り込み・20件ずつ表示）
  const filteredActivity = dashEvents
    .filter(e => e.date && !isNaN(new Date(e.date).getTime()))
    .filter(e => activityFilter === 'all' || e.kind === activityFilter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const visibleActivity = filteredActivity.slice(0, activityLimit)

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

  // 発行済み書類（見積書・売買契約書）を訪問予定から平坦化して顧客単位で一覧化
  type IssuedDocRow = {
    scheduleId: string
    visitDate: string
    type: 'estimate' | 'contract'
    hasSale: boolean
    hasInvoice: boolean
    purchaseTotal: number
    workTotal: number
  }
  const issuedDocRows: IssuedDocRow[] = []
  for (const s of sortedSchedules) {
    const docs = docsBySchedule[s.id]
    if (!docs) continue
    const purchaseTotal = s.purchaseItems?.reduce((a, i) => a + (i.purchasePrice || 0), 0) ?? 0
    const workTotal = s.workItems?.reduce((a, i) => a + (i.unitPrice || 0) * (i.quantity || 0), 0) ?? 0
    for (const type of ['contract', 'estimate'] as const) {
      const d = docs[type]
      if (d) issuedDocRows.push({ scheduleId: s.id, visitDate: s.visitDate, type, hasSale: d.hasSale, hasInvoice: d.hasInvoice, purchaseTotal, workTotal })
    }
  }

  // 不足している情報・要対応（クリックで該当セクションへ）
  const alertChips: { label: string; href: string }[] = []
  if (newInquiryCount > 0) alertChips.push({ label: `未対応のお問い合わせ ${newInquiryCount}件`, href: '#cust-inquiries' })
  if (pendingMemoCount > 0) alertChips.push({ label: `未確認の買取希望品 ${pendingMemoCount}件`, href: '#cust-memos' })
  if (!isDelivery && !nextVisit) alertChips.push({ label: '次回訪問が未設定', href: '#cust-next' })
  if (!customer.idDocumentPath) alertChips.push({ label: '身分証が未提出', href: '#cust-identity' })
  if (!customer.bankName || !customer.accountNumber) alertChips.push({ label: '振込先口座が未登録', href: '#cust-bank' })
  if (!customer.address) alertChips.push({ label: '住所が未登録', href: '#cust-contact' })
  if (!customer.phone) alertChips.push({ label: '電話番号が未登録', href: '#cust-contact' })

  // 関連レコードの目次（左カラム最上部）
  const relatedIndex = [
    { label: '案件', count: dealsTotal || dealsList.length, href: '#cust-deals' },
    ...(!isDelivery || schedules.length > 0 ? [{ label: '訪問予定', count: schedules.length, href: '#cust-visits' }] : []),
    ...(!isDelivery || memosList.length > 0 ? [{ label: '買取希望品', count: memosList.length, href: '#cust-memos' }] : []),
    { label: '発行済み書類', count: issuedDocRows.length, href: '#cust-docs' },
    { label: 'お問い合わせ', count: inquiriesList.length, href: '#cust-inquiries' },
    ...(isDelivery || shipmentsList.length > 0 ? [{ label: '宅配送付', count: shipmentsList.length, href: '#cust-shipments' }] : []),
    ...(!isDelivery ? [{ label: '日程提案', count: storeProposals.length, href: '#cust-proposals' }] : []),
    { label: 'アクティビティ', count: dashEvents.length, href: '#cust-activity' },
  ]

  return (
    <>
      <AppBar
        title={`${customer.name} 様`}
        subtitle="顧客詳細"
        actions={<Button variant="text" size="sm" onClick={() => router.push('/store/customers')}>← 顧客一覧</Button>}
      />

      {/* 2カラム化は xl(1280px) から。lg 以下は1カラムで読み順どおりに流す */}
      <div className="max-w-3xl xl:max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
        {msg && (
          <MessageBanner severity={msg.type} dismissible onDismiss={() => setMsg(null)} floating={msg.type === 'success'}>
            {msg.text}
          </MessageBanner>
        )}

        {/* ── ゾーンA: 顧客ヘッダー（全幅） ─────────────────────── */}
        <div className={SECTION_CLS}>
          <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-4 sm:pb-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">{customer.name}</h1>
                  {customerTypeBadges.map(t => (
                    <span key={t.key} className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
                  ))}
                  {customer.idDocumentPath ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">身分証提出済</span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">身分証未提出</span>
                  )}
                </div>
                {customer.furigana && <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">{customer.furigana}</p>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {customer.phone && (
                  <a href={`tel:${customer.phone.replace(/[-ー\s]/g, '')}`} className="text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--portal-primary)] hover:bg-[var(--md-sys-color-surface-container-high)]">電話をかける</a>
                )}
                {customer.address && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--portal-primary)] hover:bg-[var(--md-sys-color-surface-container-high)]">地図で開く</a>
                )}
                <Button size="sm" variant="outlined" onClick={openEditModal}>顧客情報を編集</Button>
                <Button size="sm" variant="text" onClick={() => setShowMerge(true)}>統合</Button>
              </div>
            </div>

            {/* KPI */}
            <div className="mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <DashStat label="累計買取金額" value={fmtYen(cumulativePurchase)} sub={isDelivery ? '訪問＋宅配の合計' : undefined} />
              <DashStat label={isDelivery ? '送付回数' : '訪問回数（完了）'} value={`${isDelivery ? shipmentsList.length : completedVisits} 回`} sub={isDelivery ? undefined : `予定含む全${schedules.length}件`} />
              <DashStat label="案件数" value={`${dealsList.length} 件`} sub={lastDealStatus ? `最新: ${DEAL_STATUS_LABEL[lastDealStatus] ?? lastDealStatus}` : undefined} />
              <DashStat label={isDelivery ? '直近の送付' : '次回訪問予定'} value={isDelivery ? (shipmentsList[0] ? fmtMD(shipmentsList[0].createdAt) : '—') : (nextVisit ? fmtMD(nextVisit.visitDate) : '—')} sub={!isDelivery && nextVisit?.startTime ? nextVisit.startTime : undefined} />
            </div>
            </div>

            {/* 不足・要対応（該当があるときだけ） */}
            {alertChips.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap gap-2">
                {alertChips.map(a => (
                  <a
                    key={a.label}
                    href={a.href}
                    onClick={e => jumpToSection(e, a.href)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] hover:opacity-80"
                  >
                    {a.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 2カラム（items-start が無いと左カラムの sticky が効かない） ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 xl:gap-5 items-start">

          {/* 左カラム: 参照レーン */}
          <div className="min-w-0 flex flex-col gap-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1">

            {/* L0 関連レコードの目次 */}
            <div className={`${SECTION_CLS} px-4 sm:px-5 py-3`}>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-2">この顧客の関連レコード</p>
              <div className="flex flex-wrap gap-1.5">
                {relatedIndex.map(r => (
                  <a
                    key={r.href}
                    href={r.href}
                    onClick={e => jumpToSection(e, r.href)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] ${r.count === 0 ? 'opacity-50' : ''}`}
                  >
                    {r.label} <span className="tabular-nums font-semibold">{r.count}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* L1 内部メモ */}
            <Section
              title="内部メモ"
              badge={<span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">店舗・管理者のみ</span>}
              actions={
                <>
                {!editingNote && (
                <button
                onClick={() => { setNoteDraft(customer.internalNote || ''); setEditingNote(true) }}
                className="text-xs text-[var(--portal-primary)] hover:underline"
                >
                {customer.internalNote ? '編集' : 'メモを追加'}
                </button>
                )}
                </>
              }
            >
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
                <div className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap bg-[var(--status-pending-bg)] rounded p-3 border border-amber-200 dark:border-amber-800">
                  {customer.internalNote}
                </div>
              ) : (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">未記入</p>
              )}
            </Section>

            {/* L2 連絡先と訪問先 */}
            <Section id="cust-contact" className="scroll-mt-20" title="連絡先・訪問先">
              <PropRow
                label="電話"
                alert={!customer.phone}
                value={customer.phone ? <a href={`tel:${customer.phone.replace(/[-ー\s]/g, '')}`} className="text-[var(--portal-primary)] hover:underline">{customer.phone}</a> : '未登録'}
              />
              {customer.phone2 && (
                <PropRow label="電話 2" value={<a href={`tel:${customer.phone2.replace(/[-ー\s]/g, '')}`} className="text-[var(--portal-primary)] hover:underline">{customer.phone2}</a>} />
              )}
              {customer.phone3 && (
                <PropRow label="電話 3" value={<a href={`tel:${customer.phone3.replace(/[-ー\s]/g, '')}`} className="text-[var(--portal-primary)] hover:underline">{customer.phone3}</a>} />
              )}
              <PropRow
                label="メール"
                alert={!customer.email}
                value={customer.email ? <a href={`mailto:${customer.email}`} className="text-[var(--portal-primary)] hover:underline break-all">{customer.email}</a> : '未登録'}
              />
              <PropRow
                label="訪問先住所"
                alert={!customer.address}
                value={customer.address
                  ? <>{customer.postalCode ? `〒${customer.postalCode} ` : ''}{customer.address}</>
                  : '未登録'}
              />
              <PropRow label="ふりがな" value={customer.furigana} />
            </Section>

            {/* L3 顧客属性 */}
            <Section title="顧客属性">
              <PropRow label="顧客タイプ" value={typeInfo.label} />
              {!isRegular && (
                <PropRow label={isDelivery ? '宅配の頻度' : '訪問の頻度'} value={freqMonths ? `${freqMonths}ヶ月に1回` : null} />
              )}
              <PropRow label="流入経路" value={customer.leadSource} />
              <PropRow label="生年月日" value={customer.birthDate || customer.idBirthDate} />
              <PropRow label="職業" value={customer.occupation} hint={customer.occupation ? '売買契約書から取得' : undefined} />
              <PropRow
                label="最終接触"
                value={lastContact ? `${fmtMD(lastContact.date)}（${lastContact.label}）` : null}
              />
            </Section>

            {/* L4 本人確認 */}
            <Section id="cust-identity" className="scroll-mt-20" title="本人確認">
              {customer.idDocumentPath ? (
                <button
                  type="button"
                  onClick={() => setIdImageOpen(true)}
                  className="block w-full mb-3 rounded-lg overflow-hidden border border-[var(--md-sys-color-outline-variant)]"
                  title="クリックで拡大"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" decoding="async" src={customer.idDocumentPath} alt="身分証" className="w-full h-32 object-cover" />
                </button>
              ) : (
                <p className="text-sm mb-2 text-[var(--status-pending-text)]">身分証は未提出です</p>
              )}
              <PropRow label="書類種別" value={customer.idDocumentType} />
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
            </Section>

            {/* L5 振込先口座 */}
            <Section
              id="cust-bank"
              className="scroll-mt-20"
              title="振込先口座"
              actions={<Button size="sm" variant="text" onClick={openEditModal}>編集</Button>}
            >
              {(customer.bankName || customer.branchName || customer.accountNumber) ? (
                <>
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
                </>
              ) : (
                <p className="text-sm text-[var(--status-pending-text)]">未登録です（買取代金の振込に必要です）</p>
              )}
            </Section>

            {/* L6 システム情報 */}
            <Section title="システム情報" collapsible defaultOpen={false}>
              <PropRow label="顧客ID" value={<span className="text-[11px] break-all">{customer.id}</span>} />
              <PropRow label="登録日" value={format(new Date(customer.createdAt), 'yyyy年M月d日', { locale: ja })} />
            </Section>
          </div>

          {/* 右カラム: 作業レーン */}
          <div className="min-w-0 flex flex-col gap-4">

            {/* 案件（この顧客の全案件） */}
            <Section id="cust-deals" className="scroll-mt-20" title="案件" meta={`${dealsTotal || dealsList.length}件`}>
              <>
              <div className="flex items-center justify-end mb-3">
                <Button size="sm" onClick={() => { setNewDealDetail(''); const def = dealCategoryFromCustomerType(customer?.customerType); setNewDealCategory(def === 'akikuru' && akikuruBlocked ? 'purchase' : def); setNewDealOpen(true) }}>
                  ＋ 案件を追加
                </Button>
              </div>

              {dealsList.length === 0 ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">この顧客に紐づく案件はありません</p>
              ) : (
                <div className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                  {dealsList.map(deal => {
                    const badge = DEAL_STATUS_BADGE[deal.status as keyof typeof DEAL_STATUS_BADGE] ?? DEAL_STATUS_BADGE.inquiry
                    const catBadge = DEAL_CATEGORY_BADGE[deal.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase
                    const linkedSchedules = schedules.filter(s => s.dealId === deal.id)
                    const nextLinked = linkedSchedules
                      .filter(s => s.status !== 'cancelled' && new Date(s.visitDate).getTime() >= new Date(dashNow.getFullYear(), dashNow.getMonth(), dashNow.getDate()).getTime())
                      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())[0]
                    return (
                      <div key={deal.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <button
                              type="button"
                              onClick={() => router.push(`/store/deals/${deal.id}`)}
                              className="text-sm font-semibold text-[var(--portal-primary)] hover:underline tabular-nums"
                            >
                              {formatDealNumber(deal.dealNumber)}
                            </button>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.fg }}>
                              {DEAL_STATUS_LABEL[deal.status as keyof typeof DEAL_STATUS_LABEL] ?? deal.status}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: catBadge.bg, color: catBadge.fg }}>
                              {DEAL_CATEGORY_LABEL[deal.category ?? 'purchase'] ?? deal.category}
                            </span>
                            {deal.inquiry && (
                              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">問い合わせ由来</span>
                            )}
                          </div>
                          <span className="text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                            {fmtMD(deal.occurredAt ?? deal.createdAt)}
                          </span>
                        </div>

                        {deal.detail && (
                          <p className="text-xs text-[var(--md-sys-color-on-surface)] mt-1 line-clamp-2 break-words">{deal.detail}</p>
                        )}

                        <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                          {typeof deal.purchaseAmount === 'number' && deal.purchaseAmount > 0 && <span>買取 {fmtYen(deal.purchaseAmount)}</span>}
                          {typeof deal.billingAmount === 'number' && deal.billingAmount > 0 && <span>請求 {fmtYen(deal.billingAmount)}</span>}
                          <span>訪問 {deal._count?.visitSchedules ?? linkedSchedules.length}件</span>
                          {nextLinked && <span>次回 {fmtMD(nextLinked.visitDate)}{nextLinked.startTime ? ` ${nextLinked.startTime}` : ''}</span>}
                          {deal.member?.name && <span>担当 {deal.member.name}</span>}
                          {deal.salesContract && <span>契約書あり</span>}
                          {deal.preConsentAt && <span>事前同意あり</span>}
                        </div>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <select
                            value={deal.status}
                            onChange={e => handleDealStatusChange(deal.id, e.target.value)}
                            className="h-8 px-2 text-xs rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                            aria-label="ステータスを変更"
                          >
                            {DEAL_STATUS_ORDER.map(s => (
                              <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => { setDealScheduleForm({ visitDate: '', startTime: '', endTime: '', note: '' }); setScheduleForDeal(deal) }}
                            className="text-xs px-3 h-8 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                          >
                            訪問予定を作成
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/store/deals/${deal.id}`)}
                            className="ml-auto text-xs text-[var(--portal-primary)] hover:underline"
                          >
                            案件詳細を開く →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 案件追加モーダル */}
              <BottomSheet open={newDealOpen} onClose={() => setNewDealOpen(false)} title="案件を追加">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">カテゴリー</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEAL_CATEGORIES.map(cat => {
                        const active = newDealCategory === cat
                        const c = DEAL_CATEGORY_BADGE[cat]
                        const catBlocked = cat === 'akikuru' && akikuruBlocked
                        return (
                          <button
                            key={cat}
                            type="button"
                            disabled={catBlocked}
                            title={catBlocked ? 'この店舗はアキクルに対応していません' : undefined}
                            onClick={() => setNewDealCategory(cat)}
                            className="text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
                            style={active
                              ? { background: c.bg, color: c.fg, borderColor: c.fg }
                              : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                          >
                            {DEAL_CATEGORY_LABEL[cat]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <TextField
                    label="案件内容（買取内容など）"
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
                    <TimeSelect
                      label="開始時間"
                      value={dealScheduleForm.startTime}
                      onChange={v => setDealScheduleForm(prev => ({ ...prev, startTime: v }))}
                      rangeStart={bizHours?.start}
                      rangeEnd={bizHours?.end}
                    />
                    <TimeSelect
                      label="終了時間"
                      value={dealScheduleForm.endTime}
                      onChange={v => setDealScheduleForm(prev => ({ ...prev, endTime: v }))}
                      rangeStart={bizHours?.start}
                      rangeEnd={bizHours?.end}
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
                {dealsTotal > dealsList.length && (
                  <p className="mt-3 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    最新{dealsList.length}件を表示しています（全{dealsTotal}件）。
                    <button type="button" onClick={() => router.push(`/store/deals?userId=${customer.id}`)} className="ml-1 text-[var(--portal-primary)] hover:underline">案件一覧で全件を見る →</button>
                  </p>
                )}
              </>
            </Section>

            {/* 買取希望品（買取トライ） */}
            {(!isDelivery || memosList.length > 0) && (
            <Section
              id="cust-memos"
              className="scroll-mt-20"
              title="買取希望品（買取トライ）"
              meta={`${memosList.length}件`}
              badge={pendingMemoCount > 0 ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">未確認 {pendingMemoCount}</span>
              ) : undefined}
              collapsible
              defaultOpen={initialOpen('memos', memosList.length > 0, memosLoaded)}
            >
              {memosList.length === 0 ? (
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
                              <img loading="lazy" decoding="async"
                                src={`${url}?thumb=1`}
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
            </Section>
            )}

            {/* 発行済み書類（顧客単位でまとめて一覧） */}
            <Section
              id="cust-docs"
              className="scroll-mt-20"
              title="発行済み書類"
              meta={`${issuedDocRows.length}件`}
              collapsible
              defaultOpen={initialOpen('docs', issuedDocRows.length > 0, schedulesLoaded)}
            >
              {issuedDocRows.length === 0 ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">発行済みの見積書・売買契約書はありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead>
                      <tr>
                        {['訪問日', '種別', '買取額', '請求額', 'PDF'].map(h => (
                          <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {issuedDocRows.map(row => (
                        <tr key={`${row.scheduleId}-${row.type}`} className="border-t border-[var(--md-sys-color-outline-variant)]">
                          <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{fmtMD(row.visitDate)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{row.type === 'estimate' ? '見積書' : '売買契約書'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{row.purchaseTotal > 0 ? fmtYen(row.purchaseTotal) : '—'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{row.workTotal > 0 ? fmtYen(row.workTotal) : '—'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className="flex gap-1.5">
                              {row.hasSale && (
                                <button type="button" onClick={() => downloadDoc(row.scheduleId, row.type, 'sale')} className="text-[var(--portal-primary)] hover:underline">
                                  {row.type === 'estimate' ? '買取PDF' : '契約書PDF'}
                                </button>
                              )}
                              {row.hasInvoice && (
                                <button type="button" onClick={() => downloadDoc(row.scheduleId, row.type, 'invoice')} className="text-[var(--portal-primary)] hover:underline">請求PDF</button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* 訪問予定を追加（旧「スケジュール追加」タブ） */}
            {!isDelivery && (
              <Section
                id="cust-next"
                className="scroll-mt-20"
                title="訪問予定を追加"
                meta={nextVisit ? `次回 ${fmtMD(nextVisit.visitDate)}` : '次回未設定'}
                collapsible
                defaultOpen={initialOpen('next', tabFromUrl === 'add')}
              >
              <form onSubmit={handleAddSchedule} className="space-y-4">
                <TextField
                  label="訪問日"
                  type="date"
                  value={addForm.visitDate}
                  onChange={v => setAddForm({ ...addForm, visitDate: v })}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <TimeSelect
                    label="開始時間"
                    value={addForm.startTime}
                    onChange={v => setAddForm({ ...addForm, startTime: v })}
                    rangeStart={bizHours?.start}
                    rangeEnd={bizHours?.end}
                  />
                  <TimeSelect
                    label="終了時間"
                    value={addForm.endTime}
                    onChange={v => setAddForm({ ...addForm, endTime: v })}
                    rangeStart={bizHours?.start}
                    rangeEnd={bizHours?.end}
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
              </Section>
            )}

            {/* 訪問予定（全件） */}
            {(!isDelivery || schedules.length > 0) && (
            <Section
              id="cust-visits"
              className="scroll-mt-20"
              title="訪問予定"
              meta={`${schedules.length}件`}
              collapsible
              defaultOpen={initialOpen('visits', schedules.length > 0, schedulesLoaded)}
            >
              {sortedSchedules.length === 0 ? (
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
                                {STATUS_SELECT_OPTIONS.map(opt => (
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
                            {(() => {
                              const docs = docsBySchedule[vs.id]
                              if (!docs || (!docs.estimate && !docs.contract)) return null
                              const btnCls = 'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--portal-primary)] hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors'
                              const dlIcon = (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              )
                              return (
                                <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)] space-y-1.5">
                                  <p className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">発行済み書類</p>
                                  {docs.estimate && (docs.estimate.hasSale || docs.estimate.hasInvoice) && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs text-[var(--md-sys-color-on-surface)] w-16">見積書</span>
                                      {docs.estimate.hasSale && <button type="button" className={btnCls} onClick={() => downloadDoc(vs.id, 'estimate', 'sale')}>{dlIcon}買取PDF</button>}
                                      {docs.estimate.hasInvoice && <button type="button" className={btnCls} onClick={() => downloadDoc(vs.id, 'estimate', 'invoice')}>{dlIcon}請求PDF</button>}
                                    </div>
                                  )}
                                  {docs.contract && (docs.contract.hasSale || docs.contract.hasInvoice) && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs text-[var(--md-sys-color-on-surface)] w-16">売買契約書</span>
                                      {docs.contract.hasSale && <button type="button" className={btnCls} onClick={() => downloadDoc(vs.id, 'contract', 'sale')}>{dlIcon}契約書PDF</button>}
                                      {docs.contract.hasInvoice && <button type="button" className={btnCls} onClick={() => downloadDoc(vs.id, 'contract', 'invoice')}>{dlIcon}請求書PDF</button>}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
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
            </Section>
            )}

            {/* 宅配送付（宅配顧客・実績がある場合） */}
            {(isDelivery || shipmentsList.length > 0) && (
              <Section
                id="cust-shipments"
                className="scroll-mt-20"
                title="宅配送付"
                meta={`${shipmentsList.length}件`}
                collapsible
                defaultOpen={initialOpen('shipments', shipmentsList.length > 0, shipmentsLoaded)}
              >
              {shipmentsList.length === 0 ? (
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
                                <img loading="lazy" decoding="async" src={`${url}?thumb=1`} alt="" className="w-16 h-16 object-cover rounded-lg hover:opacity-80 transition-opacity" />
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
              </Section>
            )}

            {/* アクティビティ（訪問・案件・問い合わせ・送付を時系列で統合） */}
            <Section id="cust-activity" className="scroll-mt-20" title="アクティビティ" meta={`${dashEvents.length}件`}>
              {/* 種別セグメント */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ACTIVITY_FILTERS.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => { setActivityFilter(f.key); setActivityLimit(20) }}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      activityFilter === f.key
                        ? 'border-[var(--portal-primary)] text-[var(--portal-primary)] bg-[var(--md-sys-color-surface-container-high)]'
                        : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {visibleActivity.length === 0 ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] py-4 text-center">履歴はまだありません</p>
              ) : (
                <>
                  <ol className="space-y-2.5">
                    {visibleActivity.map((ev, i) => (
                      <li key={`${ev.date}-${ev.kind}-${i}`} className="flex gap-3">
                        <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: ev.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm text-[var(--md-sys-color-on-surface)]">{ev.label}</span>
                            <span className="text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{fmtMD(ev.date)}</span>
                          </div>
                          {ev.sub && <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] break-words">{ev.sub}</p>}
                        </div>
                        {ev.href && (
                          <button type="button" onClick={() => router.push(ev.href!)} className="text-[11px] text-[var(--portal-primary)] hover:underline flex-shrink-0">開く</button>
                        )}
                      </li>
                    ))}
                  </ol>
                  {filteredActivity.length > visibleActivity.length && (
                    <div className="mt-3 text-center">
                      <Button size="sm" variant="text" onClick={() => setActivityLimit(v => v + 20)}>
                        さらに読む（残り{filteredActivity.length - visibleActivity.length}件）
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* お問い合わせ */}
            <Section
              id="cust-inquiries"
              className="scroll-mt-20"
              title="お問い合わせ"
              meta={`${inquiriesList.length}件`}
              badge={newInquiryCount > 0 ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">未対応 {newInquiryCount}</span>
              ) : undefined}
              collapsible
              defaultOpen={initialOpen('inquiries', inquiriesList.length > 0, inquiriesLoaded)}
            >
              {inquiriesList.length === 0 ? (
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
            </Section>

            {/* 訪問日程を提案 */}
            {!isDelivery && (
              <Section id="cust-proposals" className="scroll-mt-20" title="訪問日程を提案" meta={storeProposals.length > 0 ? `${storeProposals.length}件` : undefined} collapsible defaultOpen={initialOpen('proposals', false)}>
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
                      <TimeSelect
                        label="開始"
                        value={proposalForm.candidate1Start}
                        onChange={v => setProposalForm(prev => ({ ...prev, candidate1Start: v }))}
                        rangeStart={bizHours?.start}
                        rangeEnd={bizHours?.end}
                      />
                      <TimeSelect
                        label="終了"
                        value={proposalForm.candidate1End}
                        onChange={v => setProposalForm(prev => ({ ...prev, candidate1End: v }))}
                        rangeStart={bizHours?.start}
                        rangeEnd={bizHours?.end}
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
              </Section>
            )}

            {/* 買取金額の推移 */}
            <Section title="買取金額の推移（月別・直近12ヶ月）" collapsible defaultOpen={initialOpen('trend', false)}>
              {!hasTrend ? (
                <p className="text-sm text-center py-10 text-[var(--md-sys-color-on-surface-variant)]">買取実績がありません</p>
              ) : (
                <div className="h-52 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="custPurchaseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={DASH_ACCENT} stopOpacity={0.14} />
                          <stop offset="100%" stopColor={DASH_ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={DASH_GRID} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: DASH_TICK }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: DASH_TICK }} axisLine={false} tickLine={false} tickFormatter={yenAxis} width={46} />
                      <Tooltip formatter={(v) => [`¥${Number(v).toLocaleString()}`, '買取金額'] as [string, string]} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Area type="monotone" dataKey="amount" stroke={DASH_ACCENT} strokeWidth={2} fill="url(#custPurchaseGrad)" dot={false} activeDot={{ r: 4, fill: DASH_ACCENT, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>

      {/* 身分証の拡大表示 */}
      <Modal open={idImageOpen} onClose={() => setIdImageOpen(false)} title="身分証" size="xl">
        {customer.idDocumentPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={customer.idDocumentPath} alt="身分証" className="w-full h-auto rounded-lg" />
        ) : (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">身分証は未提出です</p>
        )}
      </Modal>

      {/* 顧客統合モーダル */}
      {customer && (
        <CustomerMergeModal
          open={showMerge}
          onClose={() => setShowMerge(false)}
          base={{ id: customer.id, name: customer.name, furigana: customer.furigana, email: customer.email, phone: customer.phone, address: customer.address, birthDate: (customer as any).birthDate }}
          onSearch={async (q) => {
            const storeId = (session?.user as any).id
            const res = await fetch(`/api/stores/${storeId}/customers?search=${encodeURIComponent(q)}&limit=20`)
            const data = await res.json()
            const list = data?.customers ?? (Array.isArray(data) ? data : [])
            return list.map((u: any) => ({ id: u.id, name: u.name, furigana: u.furigana, email: u.email, phone: u.phone, address: u.address, birthDate: u.birthDate }))
          }}
          onMerged={() => { setShowMerge(false); window.location.href = '/store/customers' }}
        />
      )}

      {/* 顧客情報編集モーダル */}
      <BottomSheet open={editModalOpen} onClose={() => !savingEdit && setEditModalOpen(false)} title="顧客情報を編集" desktopMaxWidth="sm:max-w-2xl">
        <div className="space-y-4">
          <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <TextField label="姓" value={editDraft.lastName} onChange={v => setEditDraft(d => ({ ...d, lastName: v }))} required autoComplete="off" name="kk-edit-last-name" />
              <TextField label="名" value={editDraft.firstName} onChange={v => setEditDraft(d => ({ ...d, firstName: v }))} required autoComplete="off" name="kk-edit-first-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="せい（ふりがな）" value={editDraft.lastNameKana} onChange={v => setEditDraft(d => ({ ...d, lastNameKana: v }))} required autoComplete="off" name="kk-edit-last-kana" />
              <TextField label="めい（ふりがな）" value={editDraft.firstNameKana} onChange={v => setEditDraft(d => ({ ...d, firstNameKana: v }))} required autoComplete="off" name="kk-edit-first-kana" />
            </div>
            <TextField label="メールアドレス（任意）" type="email" value={editDraft.email} onChange={v => setEditDraft(d => ({ ...d, email: v }))} autoComplete="off" name="kk-edit-email" />
            <TextField label="電話番号（任意）" type="tel" value={editDraft.phone} onChange={v => setEditDraft(d => ({ ...d, phone: v }))} autoComplete="off" name="kk-edit-phone" />
            <TextField label="電話番号 2（任意）" type="tel" value={editDraft.phone2} onChange={v => setEditDraft(d => ({ ...d, phone2: v }))} autoComplete="off" name="kk-edit-phone2" />
            <TextField label="電話番号 3（任意）" type="tel" value={editDraft.phone3} onChange={v => setEditDraft(d => ({ ...d, phone3: v }))} autoComplete="off" name="kk-edit-phone3" />
          </div>
          <TextField
            label="郵便番号"
            value={editDraft.postalCode}
            onChange={v => {
              setEditDraft(d => ({ ...d, postalCode: v }))
              // 7桁揃ったら住所を自動補完（既に住所が入っている場合は上書きしない）
              const cleaned = v.replace(/[-ー－\s]/g, '')
              if (cleaned.length === 7) {
                fetch(`/api/postal-lookup?zipcode=${cleaned}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(d => {
                    if (d?.address) setEditDraft(prev => (prev.address.trim() ? prev : { ...prev, address: d.address }))
                  })
                  .catch(() => {})
              }
            }}
            autoComplete="off"
            name="kk-edit-postal"
          />
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
              {/* 流入経路マスタに無い値（CSV取込や計測由来）を選択肢に残す。無いと保存時に消える */}
              {editDraft.leadSource && !leadSources.some(s => s.name === editDraft.leadSource) && (
                <option value={editDraft.leadSource}>{editDraft.leadSource}</option>
              )}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => setEditModalOpen(false)} disabled={savingEdit}>キャンセル</Button>
            <Button onClick={saveCustomerEdit} disabled={savingEdit || !editDraft.lastName.trim() || !editDraft.firstName.trim() || !editDraft.lastNameKana.trim() || !editDraft.firstNameKana.trim()} loading={savingEdit}>
              {savingEdit ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
