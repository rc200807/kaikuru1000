'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import SearchFilterBar from '@/components/SearchFilterBar'
import DataTable, { type Column } from '@/components/DataTable'
import Modal from '@/components/Modal'
import CustomerMergeModal from '@/components/CustomerMergeModal'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import TimeSelect from '@/components/TimeSelect'
import MessageBanner from '@/components/MessageBanner'
import Tabs from '@/components/Tabs'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import BankSearch from '@/components/customer/BankSearch'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, CUSTOMER_TYPE_BADGE, parseCustomerTypes, type CustomerType } from '@/lib/customer-types'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import { filterSelectableStatusOptions } from '@/lib/visit-status'

type User = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  phone2?: string | null
  phone3?: string | null
  address: string
  internalNote?: string | null
  idDocumentPath: string | null
  createdAt: string
  licenseKey: { key: string } | null
  store: { id: string; name: string; code: string } | null
  visitSchedules: Array<{ visitDate: string; status: string }>
  isActive: boolean
  // 顧客タイプ
  customerType: string  // 主タイプ "visit" | "delivery" | "regular" | "akikuru"
  customerTypes?: string  // JSON配列（複数可）
  visitFrequencyMonths: number
  leadSource?: string | null  // 流入経路
  // 振込先口座情報
  bankName:      string | null
  branchName:    string | null
  accountType:   string | null
  accountNumber: string | null
  accountHolder: string | null
  // 身分証明書OCR情報
  idDocumentType:     string | null
  idName:             string | null
  idBirthDate:        string | null
  idAddress:          string | null
  idLicenseNumber:    string | null
  idExpiryDate:       string | null
  idOcrIssueReport:   string | null
  idDocumentBackPath: string | null
  idBackAddress:      string | null
  idFacePhotoPath:    string | null
  // 住所確認関連
  addressVerified: boolean
  addressMismatch: boolean
  proofDocumentPath: string | null
  proofDocumentType: string | null
  proofDocumentStatus: string | null
}

type Store = {
  id: string
  name: string
  code: string
  prefecture: string | null
  address: string | null
}

type VisitSchedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
  user: { id: string; name: string }
}

const DEFAULT_STATUS_OPTIONS = [
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

type DetailTab = 'info' | 'add' | 'history' | 'inquiries' | 'deals'

type DealItem = {
  id: string
  detail: string | null
  status: string
  createdAt: string
  inquiry: { id: string; inquiryType: string } | null
  _count?: { visitSchedules: number }
}

type CustomerInquiry = {
  id: string
  storeId: string
  store: { id: string; name: string; code: string }
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

function KpiCard({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: '#171717', border: '1px solid #262626' }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-normal" style={{ color: '#a3a3a3' }}>{label}</span>
        <span style={{ color: '#525252' }}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl tracking-tight" style={{ color: '#ffffff', fontWeight: 600 }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: '#a3a3a3' }}>{unit}</span>}
      </div>
    </div>
  )
}

export default function AdminCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [filterCustomerType, setFilterCustomerType] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // 訪問ステータス（動的取得）
  const [visitStatuses, setVisitStatuses] = useState<{key:string,label:string,color:string}[]>([])
  const STATUS_OPTIONS = filterSelectableStatusOptions(
    visitStatuses.length > 0
      ? visitStatuses.map(s => ({ value: s.key, label: s.label }))
      : DEFAULT_STATUS_OPTIONS
  )

  // ページネーション
  const [usersPage, setUsersPage] = useState(1)
  const [usersHasMore, setUsersHasMore] = useState(false)
  const [usersTotal, setUsersTotal] = useState(0)
  // 全件集計
  const [statsTotal, setStatsTotal] = useState(0)
  const [statsUnassigned, setStatsUnassigned] = useState(0)
  const [statsIdMissing, setStatsIdMissing] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const USERS_LIMIT = 50

  // 削除・無効化処理中のユーザーID
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // 店舗割り当てモーダル
  const [assigning, setAssigning] = useState<{ userId: string; name: string; address: string } | null>(null)
  const [selectedStore, setSelectedStore] = useState('')

  // 顧客タイプ変更
  const [changingType, setChangingType] = useState<string | null>(null) // userId

  // 顧客詳細モーダル
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [showMerge, setShowMerge] = useState(false)
  const [mergeRefresh, setMergeRefresh] = useState(0)
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  // 顧客に紐づくお問い合わせ
  const [customerInquiries, setCustomerInquiries] = useState<CustomerInquiry[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  // 顧客に紐づく案件
  const [customerDeals, setCustomerDeals] = useState<DealItem[]>([])
  const [dealsLoading, setDealsLoading] = useState(false)
  const [dealDetailEdits, setDealDetailEdits] = useState<Record<string, string>>({})
  const [savingDeal, setSavingDeal] = useState<string | null>(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [newDealDetail, setNewDealDetail] = useState('')
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [detailSchedules, setDetailSchedules] = useState<VisitSchedule[]>([])
  const [detailSchedulesLoading, setDetailSchedulesLoading] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ storeId: '', visitDate: '', startTime: '', endTime: '', note: '' })
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 顧客情報編集
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<{ name: string; furigana: string; email: string; phone: string; phone2: string; phone3: string; address: string; internalNote: string; customerType: string; customerTypes: string[]; visitFrequencyMonths: number; leadSource: string }>({ name: '', furigana: '', email: '', phone: '', phone2: '', phone3: '', address: '', internalNote: '', customerType: 'visit', customerTypes: ['visit'], visitFrequencyMonths: 1, leadSource: '' })
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([])
  const [changingFrequency, setChangingFrequency] = useState<string | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // OCR情報編集
  const [ocrEditMode, setOcrEditMode] = useState(false)
  const [ocrForm, setOcrForm] = useState({ idName: '', idBirthDate: '', idAddress: '', idLicenseNumber: '', idExpiryDate: '', idBackAddress: '' })
  const [ocrSaving, setOcrSaving] = useState(false)

  // 口座情報編集
  const [bankEditMode, setBankEditMode] = useState(false)
  const [bankForm, setBankForm] = useState({ bankName: '', branchName: '', accountType: '', accountNumber: '', accountHolder: '' })
  const [bankSaving, setBankSaving] = useState(false)

  // 新規顧客追加ウィザード（Step1: 顧客情報＋案件 / Step2: 訪問スケジュール）
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [addStep, setAddStep] = useState<1 | 2>(1)
  const [addForm, setAddForm] = useState({
    name: '', furigana: '', email: '', phone: '', postalCode: '', address: '', customerType: 'regular', storeId: '', leadSource: '',
  })
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addStoreSearch, setAddStoreSearch] = useState('')
  const [addStoreOpen, setAddStoreOpen] = useState(false)
  const [addZipLooking, setAddZipLooking] = useState(false)
  const [addCreatedUser, setAddCreatedUser] = useState<{ id: string; name: string } | null>(null)
  const [wizardDealDetail, setWizardDealDetail] = useState('')
  const [wizardDealOccurredAt, setWizardDealOccurredAt] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [wizardDealId, setWizardDealId] = useState<string | null>(null)
  const [wizardSchedule, setWizardSchedule] = useState({ storeId: '', visitDate: '', startTime: '', endTime: '', note: '' })
  const [wizardScheduleSubmitting, setWizardScheduleSubmitting] = useState(false)

  // URL同期用: 復元フラグ（URL由来の初回openでtabリセットを抑止）
  const restoringFromUrl = useRef(false)

  // URL更新ヘルパー（history entryを増やさない）
  const updateUrlParams = useCallback((params: Record<string, string | null>) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    })
    window.history.replaceState(null, '', url.toString())
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/visit-statuses')
      .then(res => res.ok ? res.json() : [])
      .then(data => setVisitStatuses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // 顧客取得用クエリ（検索・店舗・タイプ・有効/無効・ページ）を組み立て
  const buildUserParams = useCallback((pageNum: number) => {
    const params = new URLSearchParams()
    if (showInactive) params.set('includeInactive', 'true')
    if (search.trim()) params.set('search', search.trim())
    if (filterStore) params.set('storeId', filterStore)
    if (filterCustomerType) params.set('customerType', filterCustomerType)
    params.set('page', String(pageNum))
    params.set('limit', String(USERS_LIMIT))
    return params.toString()
  }, [showInactive, search, filterStore, filterCustomerType])

  // 店舗・流入経路・全件集計（フィルタに依存しない）
  useEffect(() => {
    if (status !== 'authenticated') return
    const sessionUser = session.user as any
    if (!['admin','superadmin','hr'].includes(sessionUser.role)) { router.push('/'); return }
    const statsUrl = `/api/admin/users/stats?${showInactive ? 'includeInactive=true' : ''}`
    Promise.all([
      fetch('/api/stores').then(r => r.json()),
      fetch(statsUrl).then(r => r.ok ? r.json() : null),
      fetch('/api/lead-sources').then(r => r.ok ? r.json() : []),
    ]).then(([storesData, statsData, leadSourcesData]) => {
      setStores(Array.isArray(storesData) ? storesData : [])
      setLeadSources(Array.isArray(leadSourcesData) ? leadSourcesData : [])
      if (statsData) {
        setStatsTotal(statsData.total ?? 0)
        setStatsUnassigned(statsData.unassigned ?? 0)
        setStatsIdMissing(statsData.idMissing ?? 0)
      }
    }).catch(() => {})
  }, [status, session, showInactive])

  // 顧客一覧（全顧客対象にサーバー側で検索・絞り込み。検索はデバウンス）
  useEffect(() => {
    if (status !== 'authenticated') return
    const sessionUser = session.user as any
    if (!['admin','superadmin','hr'].includes(sessionUser.role)) return
    const handle = setTimeout(() => {
      fetch(`/api/admin/users?${buildUserParams(1)}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.users ?? (Array.isArray(data) ? data : [])
          setUsers(list)
          setUsersTotal(data?.total ?? list.length)
          setUsersPage(1)
          setUsersHasMore((data?.total ?? list.length) > USERS_LIMIT)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }, search.trim() ? 300 : 0)
    return () => clearTimeout(handle)
  }, [status, session, showInactive, search, filterStore, filterCustomerType, buildUserParams, mergeRefresh])

  // URLから顧客ID・タブを復元
  useEffect(() => {
    if (loading || users.length === 0) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const customerId = params.get('customer')
    const tab = params.get('tab') as DetailTab | null
    if (customerId) {
      const user = users.find(u => u.id === customerId)
      if (user) {
        if (tab && ['info', 'add', 'history', 'inquiries', 'deals'].includes(tab)) {
          restoringFromUrl.current = true
          setDetailTab(tab)
        }
        setDetailUser(user)
      } else {
        // ユーザーが見つからない場合はURLをクリア
        updateUrlParams({ customer: null, tab: null })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  async function loadMoreUsers() {
    setLoadingMore(true)
    const nextPage = usersPage + 1
    try {
      const res = await fetch(`/api/admin/users?${buildUserParams(nextPage)}`)
      const data = await res.json()
      const list = data?.users ?? (Array.isArray(data) ? data : [])
      setUsers(prev => [...prev, ...list])
      setUsersPage(nextPage)
      setUsersHasMore(nextPage * USERS_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  // 顧客詳細モーダルを開いたときにスケジュール取得
  useEffect(() => {
    if (!detailUser) return
    // URL復元時はtabをリセットしない
    if (restoringFromUrl.current) {
      restoringFromUrl.current = false
    } else {
      setDetailTab('info')
    }
    setScheduleMsg(null)
    setScheduleForm({ storeId: detailUser.store?.id || '', visitDate: '', startTime: '', endTime: '', note: '' })
    setDetailSchedulesLoading(true)
    setDetailSchedules([])
    fetch(`/api/visit-schedules?userId=${detailUser.id}`)
      .then(r => r.json())
      .then(data => {
        const list = data?.schedules ?? (Array.isArray(data) ? data : [])
        setDetailSchedules(list)
        setDetailSchedulesLoading(false)
      })
      .catch(() => setDetailSchedulesLoading(false))

    // 顧客に紐づくお問い合わせを取得
    setInquiriesLoading(true)
    setCustomerInquiries([])
    fetch(`/api/admin/users/${detailUser.id}/inquiries`)
      .then(r => r.ok ? r.json() : { inquiries: [] })
      .then((data: { inquiries: CustomerInquiry[] }) => setCustomerInquiries(data.inquiries || []))
      .finally(() => setInquiriesLoading(false))

    // 顧客に紐づく案件を取得
    setDealsLoading(true)
    setCustomerDeals([])
    fetch(`/api/deals?userId=${detailUser.id}`)
      .then(r => r.ok ? r.json() : { deals: [] })
      .then((data: { deals: DealItem[] }) => {
        const list = data.deals || []
        setCustomerDeals(list)
        const edits: Record<string, string> = {}
        list.forEach(d => { edits[d.id] = d.detail ?? '' })
        setDealDetailEdits(edits)
      })
      .finally(() => setDealsLoading(false))
  }, [detailUser])

  async function handleCreateDeal() {
    if (!detailUser) return
    setCreatingDeal(true)
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: detailUser.id, detail: newDealDetail }),
    })
    setCreatingDeal(false)
    if (res.ok) {
      const created: DealItem = await res.json()
      setCustomerDeals(prev => [created, ...prev])
      setDealDetailEdits(prev => ({ ...prev, [created.id]: created.detail ?? '' }))
      setShowNewDeal(false)
      setNewDealDetail('')
    }
  }

  async function handleDealStatusChange(dealId: string, newStatus: string) {
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setCustomerDeals(prev => prev.map(d => d.id === dealId ? { ...d, status: newStatus } : d))
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
      setCustomerDeals(prev => prev.map(d => d.id === dealId ? { ...d, detail: dealDetailEdits[dealId] ?? '' } : d))
    }
  }

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
        startTime: scheduleForm.startTime || undefined,
        endTime: scheduleForm.endTime || undefined,
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
      setScheduleForm(prev => ({ ...prev, visitDate: '', startTime: '', endTime: '', note: '' }))
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
      setMessage({ type: 'success', text: `顧客タイプを「${newType === 'delivery' ? '宅配型' : newType === 'regular' ? '通常買取' : '訪問型'}」に変更しました` })
    } else {
      setMessage({ type: 'error', text: 'タイプ変更に失敗しました' })
    }
  }

  async function handleChangeFrequency(userId: string, newFreq: number) {
    setChangingFrequency(userId)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitFrequencyMonths: newFreq }),
    })
    setChangingFrequency(null)
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, visitFrequencyMonths: newFreq } : u))
      setDetailUser(prev => prev && prev.id === userId ? { ...prev, visitFrequencyMonths: newFreq } : prev)
      setMessage({ type: 'success', text: `訪問頻度を「${newFreq}ヶ月に1回」に変更しました` })
    } else {
      setMessage({ type: 'error', text: '頻度変更に失敗しました' })
    }
  }

  function startEditMode() {
    if (!detailUser) return
    const types = parseCustomerTypes((detailUser as any).customerTypes, detailUser.customerType)
    setEditForm({
      name: detailUser.name,
      furigana: detailUser.furigana,
      email: detailUser.email || '',
      phone: detailUser.phone,
      phone2: (detailUser as any).phone2 || '',
      phone3: (detailUser as any).phone3 || '',
      address: detailUser.address,
      internalNote: (detailUser as any).internalNote || '',
      customerType: detailUser.customerType,
      customerTypes: types.length > 0 ? types : [detailUser.customerType],
      visitFrequencyMonths: detailUser.visitFrequencyMonths ?? 1,
      leadSource: (detailUser as any).leadSource || '',
    })
    setEditMode(true)
  }

  async function handleSaveCustomer() {
    if (!detailUser) return
    setEditSubmitting(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          furigana: editForm.furigana,
          email: editForm.email,
          phone: editForm.phone,
          phone2: editForm.phone2,
          phone3: editForm.phone3,
          address: editForm.address,
          internalNote: editForm.internalNote,
          customerType: editForm.customerType,
          customerTypes: editForm.customerTypes,
          visitFrequencyMonths: editForm.visitFrequencyMonths,
          leadSource: editForm.leadSource || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        const patch = {
          name: updated.name ?? editForm.name,
          furigana: updated.furigana ?? editForm.furigana,
          email: updated.email ?? editForm.email,
          phone: updated.phone ?? editForm.phone,
          phone2: updated.phone2 ?? editForm.phone2,
          phone3: updated.phone3 ?? editForm.phone3,
          address: updated.address ?? editForm.address,
          internalNote: updated.internalNote ?? editForm.internalNote,
          customerType: updated.customerType ?? editForm.customerType,
          visitFrequencyMonths: updated.visitFrequencyMonths ?? editForm.visitFrequencyMonths,
          leadSource: updated.leadSource ?? editForm.leadSource,
        }
        setDetailUser(prev => prev ? { ...prev, ...patch } : null)
        setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, ...patch } : u))
        setEditMode(false)
        setMessage({ type: 'success', text: `${patch.name} の情報を更新しました` })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新に失敗しました' })
    }
    setEditSubmitting(false)
  }

  function startOcrEditMode() {
    if (!detailUser) return
    setOcrForm({
      idName: detailUser.idName || '',
      idBirthDate: detailUser.idBirthDate || '',
      idAddress: detailUser.idAddress || '',
      idLicenseNumber: detailUser.idLicenseNumber || '',
      idExpiryDate: detailUser.idExpiryDate || '',
      idBackAddress: detailUser.idBackAddress || '',
    })
    setOcrEditMode(true)
  }

  async function handleSaveOcr() {
    if (!detailUser) return
    setOcrSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idName: ocrForm.idName,
          idBirthDate: ocrForm.idBirthDate,
          idAddress: ocrForm.idAddress,
          idLicenseNumber: ocrForm.idLicenseNumber,
          idExpiryDate: ocrForm.idExpiryDate,
          idBackAddress: ocrForm.idBackAddress,
        }),
      })
      if (res.ok) {
        const patch = { ...ocrForm }
        setDetailUser(prev => prev ? { ...prev, ...patch } : null)
        setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, ...patch } : u))
        setOcrEditMode(false)
        setMessage({ type: 'success', text: 'OCR情報を更新しました' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'OCR情報の更新に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: 'OCR情報の更新に失敗しました' })
    }
    setOcrSaving(false)
  }

  function startBankEditMode() {
    if (!detailUser) return
    setBankForm({
      bankName: detailUser.bankName || '',
      branchName: detailUser.branchName || '',
      accountType: detailUser.accountType || '',
      accountNumber: detailUser.accountNumber || '',
      accountHolder: detailUser.accountHolder || '',
    })
    setBankEditMode(true)
  }

  async function handleSaveBank() {
    if (!detailUser) return
    setBankSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankInfo: true,
          bankName: bankForm.bankName || null,
          branchName: bankForm.branchName || null,
          accountType: bankForm.accountType || null,
          accountNumber: bankForm.accountNumber || null,
          accountHolder: bankForm.accountHolder || null,
        }),
      })
      if (res.ok) {
        const patch = {
          bankName: bankForm.bankName || null,
          branchName: bankForm.branchName || null,
          accountType: bankForm.accountType || null,
          accountNumber: bankForm.accountNumber || null,
          accountHolder: bankForm.accountHolder || null,
        }
        setDetailUser(prev => prev ? { ...prev, ...patch } : null)
        setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, ...patch } : u))
        setBankEditMode(false)
        setMessage({ type: 'success', text: '口座情報を更新しました' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '口座情報の更新に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '口座情報の更新に失敗しました' })
    }
    setBankSaving(false)
  }

  function closeDetailModal() {
    setDetailUser(null)
    setDetailSchedules([])
    setScheduleMsg(null)
    setEditMode(false)
    setOcrEditMode(false)
    setBankEditMode(false)
    updateUrlParams({ customer: null, tab: null })
  }

  // 郵便番号(7桁)から住所を自動入力
  async function lookupAddPostal(zip: string) {
    const digits = zip.replace(/[-ー\s]/g, '')
    if (digits.length !== 7) return
    setAddZipLooking(true)
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${digits}`)
      const data = await res.json()
      if (res.ok && data.address) {
        setAddForm(f => ({ ...f, address: data.address }))
      } else {
        setMessage({ type: 'error', text: '該当する住所が見つかりませんでした' })
      }
    } catch {
      setMessage({ type: 'error', text: '住所の検索に失敗しました' })
    }
    setAddZipLooking(false)
  }

  // Step1: 顧客作成（＋店舗割当＋案件内容があれば案件も作成）→ Step2へ
  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    setAddSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          furigana: addForm.furigana,
          email: addForm.email,
          phone: addForm.phone,
          address: addForm.address,
          // パスワードは未指定にしてAPI側で自動生成させる
          customerType: addForm.customerType,
          leadSource: addForm.leadSource || undefined,
          skipLicenseKey: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '顧客の追加に失敗しました' })
        setAddSubmitting(false)
        return
      }

      const created = await res.json()

      // 店舗割り当て
      if (addForm.storeId) {
        await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: created.id, storeId: addForm.storeId }),
        })
      }

      // 案件内容が入力されていれば同時に案件を作成
      let newDealId: string | null = null
      if (wizardDealDetail.trim()) {
        try {
          const dealRes = await fetch('/api/deals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: created.id, detail: wizardDealDetail, occurredAt: wizardDealOccurredAt || undefined }),
          })
          if (dealRes.ok) {
            const deal = await dealRes.json()
            newDealId = deal.id
          }
        } catch { /* ignore */ }
      }

      // ユーザー一覧を再取得（バックグラウンドで）
      const params = new URLSearchParams()
      if (showInactive) params.set('includeInactive', 'true')
      params.set('page', '1')
      params.set('limit', String(USERS_LIMIT))
      fetch(`/api/admin/users?${params.toString()}`)
        .then(r => r.json())
        .then(usersData => {
          const list = usersData?.users ?? (Array.isArray(usersData) ? usersData : [])
          setUsers(list)
          setUsersTotal(usersData?.total ?? list.length)
          setUsersPage(1)
          setUsersHasMore((usersData?.total ?? list.length) > USERS_LIMIT)
        })
        .catch(() => {})

      // ウィザードのステップ2（訪問スケジュール）へ
      setAddCreatedUser({ id: created.id, name: addForm.name })
      setWizardDealId(newDealId)
      setWizardSchedule(prev => ({ ...prev, storeId: addForm.storeId || '' }))
      setAddSubmitting(false)
      setAddStep(2)
    } catch {
      setMessage({ type: 'error', text: '顧客の追加に失敗しました' })
      setAddSubmitting(false)
    }
  }

  async function handleWizardScheduleFinish(skip: boolean) {
    if (!skip && wizardSchedule.storeId && wizardSchedule.visitDate) {
      setWizardScheduleSubmitting(true)
      try {
        await fetch('/api/visit-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: addCreatedUser!.id,
            storeId: wizardSchedule.storeId,
            visitDate: wizardSchedule.visitDate,
            startTime: wizardSchedule.startTime || undefined,
            endTime: wizardSchedule.endTime || undefined,
            note: wizardSchedule.note || undefined,
            ...(wizardDealId ? { dealId: wizardDealId } : {}),
          }),
        })
      } catch { /* ignore */ }
      setWizardScheduleSubmitting(false)
    }
    const name = addCreatedUser?.name ?? ''
    // リセット
    setShowAddCustomer(false)
    setAddStep(1)
    setAddCreatedUser(null)
    setWizardDealDetail('')
    setWizardDealId(null)
    setWizardSchedule({ storeId: '', visitDate: '', startTime: '', endTime: '', note: '' })
    setAddForm({ name: '', furigana: '', email: '', phone: '', postalCode: '', address: '', customerType: 'regular', storeId: '', leadSource: '' })
    setAddStoreSearch('')
    setAddStoreOpen(false)
    setMessage({ type: 'success', text: `${name} を追加しました` })
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

  // 住所から都道府県・市区町村を抽出するヘルパー
  function extractAddressParts(address: string): { prefecture: string; city: string } {
    const prefMatch = address.match(/^(北海道|東京都|大阪府|京都府|.{2,3}県)/)
    const prefecture = prefMatch?.[1] || ''
    const rest = prefecture ? address.slice(prefecture.length) : address
    const cityMatch = rest.match(/^(.+?[市区町村郡])/)
    const city = cityMatch?.[1] || ''
    return { prefecture, city }
  }

  // 顧客住所に近い店舗をスコアリングして上位5件を取得
  function getRecommendedStoreIds(customerAddress: string): string[] {
    const customer = extractAddressParts(customerAddress)
    if (!customer.prefecture) return []

    // 隣接都道府県マップ（主要な隣接関係）
    const neighbors: Record<string, string[]> = {
      '北海道': ['青森県'],
      '青森県': ['北海道', '岩手県', '秋田県'],
      '岩手県': ['青森県', '宮城県', '秋田県'],
      '宮城県': ['岩手県', '秋田県', '山形県', '福島県'],
      '秋田県': ['青森県', '岩手県', '宮城県', '山形県'],
      '山形県': ['秋田県', '宮城県', '福島県', '新潟県'],
      '福島県': ['宮城県', '山形県', '茨城県', '栃木県', '群馬県', '新潟県'],
      '茨城県': ['福島県', '栃木県', '埼玉県', '千葉県'],
      '栃木県': ['福島県', '茨城県', '群馬県', '埼玉県'],
      '群馬県': ['福島県', '栃木県', '埼玉県', '新潟県', '長野県'],
      '埼玉県': ['茨城県', '栃木県', '群馬県', '千葉県', '東京都', '山梨県', '長野県'],
      '千葉県': ['茨城県', '埼玉県', '東京都'],
      '東京都': ['埼玉県', '千葉県', '神奈川県', '山梨県'],
      '神奈川県': ['東京都', '山梨県', '静岡県'],
      '新潟県': ['山形県', '福島県', '群馬県', '長野県', '富山県'],
      '富山県': ['新潟県', '石川県', '長野県', '岐阜県'],
      '石川県': ['富山県', '福井県', '岐阜県'],
      '福井県': ['石川県', '岐阜県', '滋賀県', '京都府'],
      '山梨県': ['埼玉県', '東京都', '神奈川県', '長野県', '静岡県'],
      '長野県': ['群馬県', '埼玉県', '山梨県', '静岡県', '新潟県', '富山県', '岐阜県', '愛知県'],
      '岐阜県': ['富山県', '石川県', '福井県', '長野県', '愛知県', '三重県', '滋賀県'],
      '静岡県': ['神奈川県', '山梨県', '長野県', '愛知県'],
      '愛知県': ['長野県', '岐阜県', '静岡県', '三重県'],
      '三重県': ['岐阜県', '愛知県', '滋賀県', '京都府', '奈良県', '和歌山県'],
      '滋賀県': ['福井県', '岐阜県', '三重県', '京都府'],
      '京都府': ['福井県', '滋賀県', '三重県', '大阪府', '奈良県', '兵庫県'],
      '大阪府': ['京都府', '奈良県', '和歌山県', '兵庫県'],
      '兵庫県': ['京都府', '大阪府', '鳥取県', '岡山県'],
      '奈良県': ['京都府', '大阪府', '三重県', '和歌山県'],
      '和歌山県': ['三重県', '大阪府', '奈良県'],
      '鳥取県': ['兵庫県', '島根県', '岡山県', '広島県'],
      '島根県': ['鳥取県', '広島県', '山口県'],
      '岡山県': ['兵庫県', '鳥取県', '広島県', '香川県'],
      '広島県': ['鳥取県', '島根県', '岡山県', '山口県', '愛媛県'],
      '山口県': ['島根県', '広島県', '福岡県', '大分県'],
      '徳島県': ['香川県', '愛媛県', '高知県'],
      '香川県': ['岡山県', '徳島県', '愛媛県'],
      '愛媛県': ['広島県', '香川県', '徳島県', '高知県'],
      '高知県': ['徳島県', '愛媛県'],
      '福岡県': ['山口県', '大分県', '熊本県', '佐賀県'],
      '佐賀県': ['福岡県', '長崎県'],
      '長崎県': ['佐賀県'],
      '熊本県': ['福岡県', '大分県', '宮崎県', '鹿児島県'],
      '大分県': ['山口県', '福岡県', '熊本県', '宮崎県'],
      '宮崎県': ['大分県', '熊本県', '鹿児島県'],
      '鹿児島県': ['熊本県', '宮崎県'],
      '沖縄県': [],
    }

    const scored = stores.map(store => {
      let score = 0
      const storePref = store.prefecture || ''
      const storeAddr = store.address || ''
      const storeParts = extractAddressParts(storeAddr || storePref)

      // 同一都道府県 & 同一市区町村
      if (customer.prefecture === (storeParts.prefecture || storePref)) {
        score += 10
        if (customer.city && storeParts.city && customer.city === storeParts.city) {
          score += 10
        }
        // 住所文字列の部分一致（区レベル）
        if (storeAddr && customer.city) {
          const customerWard = customer.city.match(/(.+?区)/)?.[1]
          if (customerWard && storeAddr.includes(customerWard)) {
            score += 5
          }
        }
      }
      // 隣接都道府県
      else if (neighbors[customer.prefecture]?.includes(storeParts.prefecture || storePref)) {
        score += 3
      }

      return { id: store.id, score }
    })

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.id)
  }

  // おすすめ店舗IDリスト（assigningが変わるたびに再計算）+ 買いクル本部は常に含める
  const HQ_STORE_ID = '905b89bc'
  const recommendedStoreIds = assigning
    ? [...new Set([...getRecommendedStoreIds(assigning.address), HQ_STORE_ID])]
    : []

  // 検索・店舗・タイプの絞り込みはサーバー側（全顧客対象）で実施済み
  const filtered = users

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

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
      render: (user) => {
        const types = parseCustomerTypes((user as any).customerTypes, user.customerType)
        const list = types.length > 0 ? types : [user.customerType as any]
        return (
          <div className="flex gap-1 flex-wrap">
            {list.map((t: any) => {
              const c = CUSTOMER_TYPE_BADGE[t as keyof typeof CUSTOMER_TYPE_BADGE]
              const label = CUSTOMER_TYPE_LABEL[t as keyof typeof CUSTOMER_TYPE_LABEL] ?? t
              return (
                <span key={t} className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: c?.bg, color: c?.fg }}>
                  {label}
                </span>
              )
            })}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      render: (user) => (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => { setDetailUser(user); updateUrlParams({ customer: user.id, tab: 'info' }) }}>
            詳細
          </Button>
          <Button
            size="sm"
            variant="outlined"
            onClick={() => { setAssigning({ userId: user.id, name: user.name, address: user.address }); setSelectedStore(user.store?.id || '') }}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="登録顧客数"
            value={statsTotal.toLocaleString()}
            unit="名"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          />
          <KpiCard
            label="未割り当て"
            value={statsUnassigned.toLocaleString()}
            unit="名"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
          />
          <KpiCard
            label="担当店舗数"
            value={stores.length.toLocaleString()}
            unit="店舗"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
              </svg>
            }
          />
          <KpiCard
            label="身分証未提出"
            value={statsIdMissing.toLocaleString()}
            unit="名"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
              </svg>
            }
          />
        </div>

        {message && (
          <MessageBanner severity={message.type} className="mb-6" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">顧客一覧</h2>
          <Button onClick={() => setShowAddCustomer(true)}>
            新規顧客追加
          </Button>
        </div>

        <div className="flex items-center gap-4 px-4 sm:px-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowInactive(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showInactive ? 'bg-[var(--portal-primary,#374151)]' : 'bg-[var(--md-sys-color-outline)]'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-[var(--toggle-thumb,#fff)] rounded-full shadow transition-transform ${
                showInactive ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              無効化済みを表示
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
            {
              key: 'customerType', label: '顧客タイプ', type: 'select',
              options: CUSTOMER_TYPES.map(t => ({ value: t, label: CUSTOMER_TYPE_LABEL[t] })),
            },
          ]}
          values={{ search, store: filterStore, customerType: filterCustomerType }}
          onChange={(key, value) => {
            if (key === 'search') setSearch(value)
            if (key === 'store') setFilterStore(value)
            if (key === 'customerType') setFilterCustomerType(value)
          }}
          onClear={() => { setSearch(''); setFilterStore(''); setFilterCustomerType('') }}
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

        {usersHasMore && (
          <div className="flex justify-center mt-6">
            <Button
              variant="tonal"
              onClick={loadMoreUsers}
              loading={loadingMore}
              disabled={loadingMore}
            >
              {loadingMore ? '読み込み中...' : `もっと読み込む（${users.length} / ${usersTotal}件）`}
            </Button>
          </div>
        )}
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
                    onClick={() => setShowMerge(true)}
                  >
                    統合
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
                { key: 'inquiries', label: customerInquiries.length > 0 ? `お問い合わせ（${customerInquiries.length}）` : 'お問い合わせ' },
                { key: 'deals', label: customerDeals.length > 0 ? `案件（${customerDeals.length}）` : '案件' },
                { key: 'add', label: 'スケジュール追加' },
                { key: 'history', label: detailSchedules.length > 0 ? `訪問履歴（${detailSchedules.length}）` : '訪問履歴' },
              ]}
              activeKey={detailTab}
              onChange={(key) => { setDetailTab(key as DetailTab); setScheduleMsg(null); updateUrlParams({ tab: key }) }}
              className="mb-4"
            />

            {/* 基本情報 */}
            {detailTab === 'info' && (
              <div className="space-y-4">
                {!editMode && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="tonal" onClick={startEditMode}>
                      編集
                    </Button>
                  </div>
                )}

                {editMode ? (
                  <div className="space-y-3">
                    <TextField
                      label="氏名"
                      value={editForm.name}
                      onChange={v => setEditForm(prev => ({ ...prev, name: v }))}
                      required
                    />
                    <TextField
                      label="ふりがな"
                      value={editForm.furigana}
                      onChange={v => setEditForm(prev => ({ ...prev, furigana: v }))}
                      required
                    />
                    <TextField
                      label="メールアドレス（任意）"
                      value={editForm.email}
                      onChange={v => setEditForm(prev => ({ ...prev, email: v }))}
                      type="email"
                    />
                    <TextField
                      label="電話番号"
                      value={editForm.phone}
                      onChange={v => setEditForm(prev => ({ ...prev, phone: v }))}
                      required
                    />
                    <TextField
                      label="電話番号 2（任意）"
                      value={editForm.phone2}
                      onChange={v => setEditForm(prev => ({ ...prev, phone2: v }))}
                    />
                    <TextField
                      label="電話番号 3（任意）"
                      value={editForm.phone3}
                      onChange={v => setEditForm(prev => ({ ...prev, phone3: v }))}
                    />
                    <TextField
                      label="住所（任意）"
                      value={editForm.address}
                      onChange={v => setEditForm(prev => ({ ...prev, address: v }))}
                    />
                    <div>
                      <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                        内部メモ（顧客には非公開）
                      </label>
                      <textarea
                        value={editForm.internalNote}
                        onChange={e => setEditForm(prev => ({ ...prev, internalNote: e.target.value }))}
                        rows={3}
                        placeholder="どのような顧客なのか・訪問時の注意点など"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40 resize-y"
                      />
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">店舗・管理者のみに表示されます。お客様には公開されません。</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                        顧客タイプ（複数選択可）
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {CUSTOMER_TYPES.map(t => {
                          const checked = editForm.customerTypes.includes(t)
                          const c = CUSTOMER_TYPE_BADGE[t]
                          return (
                            <label
                              key={t}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer text-xs font-medium border"
                              style={{
                                background: checked ? c.bg : 'transparent',
                                color: checked ? c.fg : 'var(--md-sys-color-on-surface-variant)',
                                borderColor: checked ? c.fg : 'var(--md-sys-color-outline-variant)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  setEditForm(prev => {
                                    const next = e.target.checked
                                      ? [...prev.customerTypes, t]
                                      : prev.customerTypes.filter(x => x !== t)
                                    // 主タイプが配列から外れた場合は先頭に切替
                                    const primary = next.includes(prev.customerType as CustomerType) ? prev.customerType : (next[0] ?? prev.customerType)
                                    return { ...prev, customerTypes: next.length > 0 ? next : [prev.customerType], customerType: primary }
                                  })
                                }}
                                className="hidden"
                              />
                              {checked && <span>✓</span>}
                              {CUSTOMER_TYPE_LABEL[t]}
                            </label>
                          )
                        })}
                      </div>
                      <label className="block text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-2 mb-1">主タイプ（マイページの表示種別）</label>
                      <select
                        value={editForm.customerType}
                        onChange={e => setEditForm(prev => ({ ...prev, customerType: e.target.value }))}
                        className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                      >
                        {editForm.customerTypes.map(t => (
                          <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t as CustomerType] ?? t}</option>
                        ))}
                      </select>
                    </div>
                    {(editForm.customerType === 'visit' || editForm.customerType === 'delivery') && (
                      <div>
                        <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                          訪問頻度
                        </label>
                        <select
                          value={editForm.visitFrequencyMonths}
                          onChange={e => setEditForm(prev => ({ ...prev, visitFrequencyMonths: Number(e.target.value) }))}
                          className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                        >
                          <option value={1}>1ヶ月に1回</option>
                          <option value={2}>2ヶ月に1回</option>
                          <option value={3}>3ヶ月に1回</option>
                          <option value={4}>4ヶ月に1回</option>
                          <option value={6}>6ヶ月に1回</option>
                          <option value={12}>12ヶ月に1回</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                        流入経路
                      </label>
                      <select
                        value={editForm.leadSource}
                        onChange={e => setEditForm(prev => ({ ...prev, leadSource: e.target.value }))}
                        className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                      >
                        <option value="">未設定</option>
                        {leadSources.map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outlined" onClick={() => setEditMode(false)} disabled={editSubmitting}>
                        キャンセル
                      </Button>
                      <Button
                        onClick={handleSaveCustomer}
                        disabled={editSubmitting || !editForm.name || !editForm.furigana || !editForm.phone}
                        loading={editSubmitting}
                      >
                        {editSubmitting ? '保存中...' : '保存'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-3">
                    {[
                      { label: 'メール', value: detailUser.email },
                      { label: '電話番号', value: detailUser.phone },
                      ...(detailUser.phone2 ? [{ label: '電話番号 2', value: detailUser.phone2 }] : []),
                      ...(detailUser.phone3 ? [{ label: '電話番号 3', value: detailUser.phone3 }] : []),
                      { label: '訪問先住所', value: detailUser.address },
                      { label: 'ライセンスキー', value: detailUser.licenseKey?.key || '—', mono: true },
                      { label: '担当店舗', value: detailUser.store?.name || '未割り当て' },
                      ...(detailUser.leadSource ? [{ label: '流入経路', value: detailUser.leadSource }] : []),
                      { label: '登録日', value: format(new Date(detailUser.createdAt), 'yyyy年M月d日', { locale: ja }) },
                    ].map(item => (
                      <div key={item.label} className="flex gap-3">
                        <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                        <dd className={`text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0 ${(item as any).mono ? 'font-mono text-xs' : ''}`}>{item.value}</dd>
                      </div>
                    ))}
                    {detailUser.internalNote && (
                      <div className="flex gap-3">
                        <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">内部メモ</dt>
                        <dd className="text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0 whitespace-pre-wrap bg-amber-50 dark:bg-amber-950/30 rounded p-2 border border-amber-200 dark:border-amber-800">
                          {detailUser.internalNote}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                {/* 身分証明書セクション */}
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">身分証明書</span>
                    {detailUser.idDocumentPath ? (
                      <span className="text-[10px] font-medium text-[var(--status-completed-text)] bg-[var(--status-completed-bg)] px-2 py-0.5 rounded-full">提出済</span>
                    ) : (
                      <span className="text-[10px] font-medium text-[var(--status-pending-text)] bg-[var(--status-pending-bg)] px-2 py-0.5 rounded-full">未提出</span>
                    )}
                  </div>
                  {detailUser.idDocumentPath ? (
                    <div className="px-4 py-3 space-y-3">
                      {/* 書類種別 */}
                      {detailUser.idDocumentType && (
                        <div className="flex gap-3">
                          <dt className="w-24 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">書類種別</dt>
                          <dd className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">{detailUser.idDocumentType}</dd>
                        </div>
                      )}

                      {/* 表面画像 */}
                      <div>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">表面</p>
                        <a
                          href={`/api/users/${detailUser.id}/id-document`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/users/${detailUser.id}/id-document`}
                            alt="身分証明書（表面）"
                            className="max-w-full max-h-48 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] object-contain cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        </a>
                      </div>

                      {/* 裏面画像 */}
                      {detailUser.idDocumentBackPath && (
                        <div>
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">裏面</p>
                          <a
                            href={`/api/users/${detailUser.id}/id-document/back`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/users/${detailUser.id}/id-document/back`}
                              alt="身分証明書（裏面）"
                              className="max-w-full max-h-48 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] object-contain cursor-pointer hover:opacity-80 transition-opacity"
                            />
                          </a>
                        </div>
                      )}

                      {/* 顔写真 */}
                      {detailUser.idFacePhotoPath && (
                        <div>
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">顔写真</p>
                          <a
                            href={detailUser.idFacePhotoPath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={detailUser.idFacePhotoPath}
                              alt="顔写真"
                              className="w-20 h-20 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            />
                          </a>
                        </div>
                      )}

                      {/* OCR抽出データ */}
                      {(detailUser.idName || detailUser.idBirthDate || detailUser.idAddress || detailUser.idLicenseNumber || detailUser.idExpiryDate || detailUser.idBackAddress) ? (
                        <div>
                          <div className="flex items-center justify-between border-t border-[var(--md-sys-color-surface-container-high)] pt-2 mb-2">
                            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">OCR読み取りデータ</p>
                            {!ocrEditMode && (
                              <Button size="sm" variant="tonal" onClick={startOcrEditMode}>
                                編集
                              </Button>
                            )}
                          </div>
                          {ocrEditMode ? (
                            <div className="space-y-2.5">
                              <TextField
                                label="氏名"
                                value={ocrForm.idName}
                                onChange={v => setOcrForm(prev => ({ ...prev, idName: v }))}
                              />
                              <TextField
                                label="生年月日"
                                value={ocrForm.idBirthDate}
                                onChange={v => setOcrForm(prev => ({ ...prev, idBirthDate: v }))}
                              />
                              <TextField
                                label="住所"
                                value={ocrForm.idAddress}
                                onChange={v => setOcrForm(prev => ({ ...prev, idAddress: v }))}
                              />
                              <TextField
                                label="証明書番号"
                                value={ocrForm.idLicenseNumber}
                                onChange={v => setOcrForm(prev => ({ ...prev, idLicenseNumber: v }))}
                              />
                              <TextField
                                label="有効期限"
                                value={ocrForm.idExpiryDate}
                                onChange={v => setOcrForm(prev => ({ ...prev, idExpiryDate: v }))}
                              />
                              <TextField
                                label="裏面新住所"
                                value={ocrForm.idBackAddress}
                                onChange={v => setOcrForm(prev => ({ ...prev, idBackAddress: v }))}
                              />
                              <div className="flex justify-end gap-3 pt-1">
                                <Button variant="outlined" onClick={() => setOcrEditMode(false)} disabled={ocrSaving}>
                                  キャンセル
                                </Button>
                                <Button onClick={handleSaveOcr} disabled={ocrSaving} loading={ocrSaving}>
                                  {ocrSaving ? '保存中...' : '保存'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <dl className="space-y-1.5">
                                {[
                                  { label: '氏名',     value: detailUser.idName },
                                  { label: '生年月日', value: detailUser.idBirthDate },
                                  { label: '住所',     value: detailUser.idAddress },
                                  { label: '証明書番号', value: detailUser.idLicenseNumber },
                                  { label: '有効期限', value: detailUser.idExpiryDate },
                                ].filter(item => item.value).map(item => (
                                  <div key={item.label} className="flex gap-3">
                                    <dt className="w-20 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                                    <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
                                  </div>
                                ))}
                              </dl>
                              {/* 裏面新住所 */}
                              {detailUser.idBackAddress && (
                                <div className="flex gap-3 border-t border-[var(--md-sys-color-surface-container-high)] pt-2 mt-2">
                                  <dt className="w-20 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">裏面新住所</dt>
                                  <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{detailUser.idBackAddress}</dd>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : null}

                      {/* OCR誤り報告 */}
                      {detailUser.idOcrIssueReport && (
                        <div className="bg-[var(--md-sys-color-error-container)] rounded-[var(--md-sys-shape-small)] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-[var(--md-sys-color-on-error-container)] mb-0.5">OCR誤り報告</p>
                              <p className="text-xs text-[var(--md-sys-color-on-error-container)]">{detailUser.idOcrIssueReport}</p>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('この誤り報告を解消済みとしてクリアしますか？')) return
                                const res = await fetch(`/api/admin/users/${detailUser.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ idOcrIssueReport: null }),
                                })
                                if (res.ok) {
                                  setDetailUser({ ...detailUser, idOcrIssueReport: null })
                                  setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, idOcrIssueReport: null } : u))
                                }
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-white/80 text-[var(--md-sys-color-error)] hover:bg-white transition-colors shrink-0"
                            >
                              解消済み
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">身分証明書が未提出です</p>
                  )}
                </div>

                {/* 顧客タイプ変更 */}
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)]">
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">顧客タイプ</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                      {parseCustomerTypes((detailUser as any).customerTypes, detailUser.customerType).map(t => {
                        const c = CUSTOMER_TYPE_BADGE[t]
                        const isPrimary = t === detailUser.customerType
                        return (
                          <span key={t} className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.fg, border: isPrimary ? `1px solid ${c.fg}` : 'none' }}>
                            {CUSTOMER_TYPE_LABEL[t]}
                            {isPrimary && <span className="ml-1 text-[10px] opacity-75">(主)</span>}
                          </span>
                        )
                      })}
                    </div>
                    <select
                      className="text-xs px-2 py-1 rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
                      value={detailUser.customerType}
                      disabled={changingType === detailUser.id}
                      onChange={(e) => handleChangeCustomerType(detailUser.id, e.target.value)}
                    >
                      {CUSTOMER_TYPES.map(t => (
                        <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                  {(detailUser.customerType === 'visit' || detailUser.customerType === 'delivery') && (
                    <div className="px-4 py-3 border-t border-[var(--md-sys-color-outline-variant)] flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">訪問頻度</span>
                      <select
                        className="text-xs px-2 py-1 rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
                        value={detailUser.visitFrequencyMonths ?? 1}
                        disabled={changingFrequency === detailUser.id}
                        onChange={e => handleChangeFrequency(detailUser.id, Number(e.target.value))}
                      >
                        <option value={1}>1ヶ月に1回</option>
                        <option value={2}>2ヶ月に1回</option>
                        <option value={3}>3ヶ月に1回</option>
                        <option value={4}>4ヶ月に1回</option>
                        <option value={6}>6ヶ月に1回</option>
                        <option value={12}>12ヶ月に1回</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 振込先口座情報 */}
                <div className="rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">振込先口座情報</span>
                    {!bankEditMode && (
                      <button
                        type="button"
                        onClick={startBankEditMode}
                        className="text-xs text-[var(--portal-primary)] hover:underline"
                      >
                        編集
                      </button>
                    )}
                  </div>
                  {bankEditMode ? (
                    <div className="px-4 py-3 space-y-3">
                      <BankSearch
                        bankName={bankForm.bankName}
                        branchName={bankForm.branchName}
                        onChange={({ bankName, bankCode, branchName, branchCode }) => {
                          setBankForm(f => ({ ...f, bankName, branchName }))
                        }}
                      />
                      <div>
                        <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">口座種別</label>
                        <select
                          value={bankForm.accountType}
                          onChange={e => setBankForm(f => ({ ...f, accountType: e.target.value }))}
                          className="w-full text-xs border border-[var(--md-sys-color-outline-variant)] rounded-md px-2.5 py-2 bg-[var(--md-sys-color-surface)] focus:outline-none focus:border-[var(--portal-primary)]"
                        >
                          <option value="">選択してください</option>
                          <option value="普通">普通</option>
                          <option value="当座">当座</option>
                        </select>
                      </div>
                      <TextField
                        label="口座番号"
                        value={bankForm.accountNumber}
                        onChange={v => setBankForm(f => ({ ...f, accountNumber: v }))}
                        placeholder="例：1234567"

                      />
                      <TextField
                        label="口座名義"
                        value={bankForm.accountHolder}
                        onChange={v => setBankForm(f => ({ ...f, accountHolder: v }))}
                        placeholder="例：ヤマダ タロウ"

                      />
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={handleSaveBank} disabled={bankSaving} loading={bankSaving}>
                          {bankSaving ? '保存中...' : '保存'}
                        </Button>
                        <Button size="sm" variant="outlined" onClick={() => setBankEditMode(false)}>
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : detailUser.bankName ? (
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

                {/* 住所確認セクション */}
                {detailUser.addressMismatch && (
                  <div className="rounded-[var(--md-sys-shape-medium)] border border-red-300 overflow-hidden">
                    <div className="px-4 py-2 bg-red-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-red-800">住所不一致 - 確認が必要</span>
                      {detailUser.addressVerified ? (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">承認済み</span>
                      ) : detailUser.proofDocumentStatus === 'pending' ? (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">審査待ち</span>
                      ) : detailUser.proofDocumentStatus === 'rejected' ? (
                        <span className="text-[10px] font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">却下済み</span>
                      ) : (
                        <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">書類未提出</span>
                      )}
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      {/* 住所比較 */}
                      <dl className="space-y-1.5">
                        <div className="flex gap-3">
                          <dt className="w-20 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">登録住所</dt>
                          <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{detailUser.address}</dd>
                        </div>
                        <div className="flex gap-3">
                          <dt className="w-20 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">証明書住所</dt>
                          <dd className="text-xs text-[var(--md-sys-color-on-surface)] break-all min-w-0">{detailUser.idAddress || '---'}</dd>
                        </div>
                      </dl>

                      {/* 住所証明書類 */}
                      {detailUser.proofDocumentPath && (
                        <div>
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                            住所証明書類（{detailUser.proofDocumentType || '種別不明'}）
                          </p>
                          <a
                            href={`/api/users/${detailUser.id}/proof-document`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/users/${detailUser.id}/proof-document`}
                              alt="住所証明書類"
                              className="max-w-full max-h-48 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] object-contain cursor-pointer hover:opacity-80 transition-opacity"
                            />
                          </a>
                        </div>
                      )}

                      {/* 承認・却下ボタン */}
                      {!detailUser.addressVerified && detailUser.proofDocumentPath && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={async () => {
                              const res = await fetch(`/api/admin/users/${detailUser.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ addressVerified: true, proofDocumentStatus: 'approved' }),
                              })
                              if (res.ok) {
                                setDetailUser({ ...detailUser, addressVerified: true, proofDocumentStatus: 'approved' })
                                setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, addressVerified: true, proofDocumentStatus: 'approved' } : u))
                                setMessage({ type: 'success', text: '住所確認を承認しました' })
                              }
                            }}
                          >
                            承認
                          </Button>
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={async () => {
                              const reason = prompt('却下理由を入力してください')
                              if (!reason) return
                              const res = await fetch(`/api/admin/users/${detailUser.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ proofDocumentStatus: 'rejected' }),
                              })
                              if (res.ok) {
                                setDetailUser({ ...detailUser, proofDocumentStatus: 'rejected' })
                                setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, proofDocumentStatus: 'rejected' } : u))
                                setMessage({ type: 'success', text: '住所証明書類を却下しました' })
                              }
                            }}
                            className="!text-red-600 !border-red-300 hover:!bg-red-50"
                          >
                            却下
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* お問い合わせ履歴 */}
            {detailTab === 'inquiries' && (
              <div className="space-y-3">
                {inquiriesLoading ? (
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-6">読み込み中...</p>
                ) : customerInquiries.length === 0 ? (
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-6">この顧客に紐づくお問い合わせはありません</p>
                ) : (
                  customerInquiries.map(inq => {
                    const sc = INQUIRY_STATUS_COLOR[inq.status] ?? INQUIRY_STATUS_COLOR.new
                    return (
                      <div
                        key={inq.id}
                        className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {new Date(inq.createdAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}
                            <span className="mx-1.5">・</span>
                            {inq.store?.name ?? ''}
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
                        <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex justify-end">
                          <Link
                            href={`/admin/inquiries?id=${inq.id}`}
                            className="text-xs text-[var(--portal-primary,#374151)] hover:underline"
                          >
                            お問い合わせ管理で開く →
                          </Link>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* 案件 */}
            {detailTab === 'deals' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="tonal" onClick={() => { setNewDealDetail(''); setShowNewDeal(v => !v) }}>
                    {showNewDeal ? 'キャンセル' : '+ 案件を追加'}
                  </Button>
                </div>
                {showNewDeal && (
                  <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 space-y-2">
                    <TextField
                      label="案件内容（買取内容など）"
                      value={newDealDetail}
                      onChange={setNewDealDetail}
                      rows={4}
                      placeholder="買取の内容や状況などを入力..."
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleCreateDeal} loading={creatingDeal} disabled={creatingDeal}>作成</Button>
                    </div>
                  </div>
                )}
                {dealsLoading ? (
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-6">読み込み中...</p>
                ) : customerDeals.length === 0 ? (
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-6">この顧客に紐づく案件はありません</p>
                ) : (
                  customerDeals.map(deal => {
                    const badge = DEAL_STATUS_BADGE[deal.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
                    const dirty = (dealDetailEdits[deal.id] ?? '') !== (deal.detail ?? '')
                    return (
                      <div
                        key={deal.id}
                        className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: badge.bg, color: badge.fg }}
                            >
                              {DEAL_STATUS_LABEL[deal.status as DealStatus] ?? deal.status}
                            </span>
                            {deal.inquiry && (
                              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">問い合わせ由来</span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {new Date(deal.createdAt).toLocaleDateString('ja-JP', { dateStyle: 'medium' })}
                          </div>
                        </div>
                        <select
                          value={deal.status}
                          onChange={e => handleDealStatusChange(deal.id, e.target.value)}
                          className="w-full sm:w-52 mb-2 px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
                        >
                          {DEAL_STATUS_ORDER.map(s => (
                            <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                        <TextField
                          label="案件内容"
                          value={dealDetailEdits[deal.id] ?? ''}
                          onChange={v => setDealDetailEdits(prev => ({ ...prev, [deal.id]: v }))}
                          rows={3}
                        />
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            紐づく訪問予定: {deal._count?.visitSchedules ?? 0}件
                          </span>
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
                    )
                  })
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
                <div className="grid grid-cols-2 gap-3">
                  <TimeSelect label="開始時間（任意）" value={scheduleForm.startTime} onChange={v => setScheduleForm(prev => ({ ...prev, startTime: v }))} />
                  <TimeSelect label="終了時間（任意）" value={scheduleForm.endTime} onChange={v => setScheduleForm(prev => ({ ...prev, endTime: v }))} />
                </div>
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
                          <div className="mt-1.5">
                            <Button
                              variant="text"
      
                              onClick={() => { closeDetailModal(); router.push(`/admin/visits/${vs.id}`) }}
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

      {/* 顧客統合モーダル */}
      {detailUser && (
        <CustomerMergeModal
          open={showMerge}
          onClose={() => setShowMerge(false)}
          base={{ id: detailUser.id, name: detailUser.name, furigana: detailUser.furigana, email: detailUser.email, phone: detailUser.phone, address: detailUser.address, birthDate: (detailUser as any).birthDate }}
          onSearch={async (q) => {
            const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=20`)
            const data = await res.json()
            const list = data?.users ?? (Array.isArray(data) ? data : [])
            return list.map((u: any) => ({ id: u.id, name: u.name, furigana: u.furigana, email: u.email, phone: u.phone, address: u.address, birthDate: u.birthDate }))
          }}
          onMerged={() => { setShowMerge(false); closeDetailModal(); setMergeRefresh(x => x + 1) }}
        />
      )}

      {/* 新規顧客追加ウィザードモーダル */}
      <Modal
        open={showAddCustomer}
        onClose={() => {
          if (addStep === 1) setShowAddCustomer(false)
          else handleWizardScheduleFinish(true)
        }}
        title={addStep === 1 ? '新規顧客追加' : '訪問スケジュールを設定'}
        size="lg"
        disableBackdropClose
      >
        {/* ステップインジケーター */}
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-[var(--md-sys-color-outline-variant)]">
          {(['顧客情報・案件', '訪問スケジュール'] as const).map((label, idx) => {
            const step = idx + 1
            const done = addStep > step
            const active = addStep === step
            return (
              <div key={step} className="flex items-center gap-2 min-w-0">
                {idx > 0 && <div className="w-6 h-px flex-shrink-0" style={{ background: done || active ? 'var(--portal-primary,#374151)' : 'var(--md-sys-color-outline-variant)' }} />}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${done ? 'bg-green-500 text-white' : active ? 'bg-[var(--portal-primary,#374151)] text-[var(--portal-primary-container,#fff)]' : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'}`}>
                    {done ? '✓' : step}
                  </div>
                  <span className={`text-xs hidden sm:inline ${active ? 'text-[var(--md-sys-color-on-surface)] font-semibold' : done ? 'text-green-600 dark:text-green-400' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>{label}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── STEP 1: 顧客情報 ── */}
        {addStep === 1 && (
          <form onSubmit={handleAddCustomer} className="space-y-4" autoComplete="off">
            <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <input type="password" name="prevent-autofill-pw" autoComplete="new-password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <TextField
              label="氏名"
              value={addForm.name}
              onChange={v => setAddForm(prev => ({ ...prev, name: v }))}
              required
              placeholder="山田 太郎"
              autoComplete="off"
              name="kk-cust-name"
            />
            <TextField
              label="ふりがな"
              value={addForm.furigana}
              onChange={v => setAddForm(prev => ({ ...prev, furigana: v }))}
              required
              placeholder="やまだ たろう"
              autoComplete="off"
              name="kk-cust-furigana"
            />
            <TextField
              label="メールアドレス（任意）"
              value={addForm.email}
              onChange={v => setAddForm(prev => ({ ...prev, email: v }))}
              type="email"
              placeholder="example@mail.com"
              autoComplete="off"
              name="kk-cust-email"
            />
            <TextField
              label="電話番号（任意）"
              value={addForm.phone}
              onChange={v => setAddForm(prev => ({ ...prev, phone: v }))}
              type="tel"
              placeholder="090-1234-5678"
              autoComplete="off"
              name="kk-cust-phone"
            />
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                郵便番号（任意）
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  inputMode="numeric"
                  value={addForm.postalCode}
                  onChange={e => {
                    const v = e.target.value
                    setAddForm(prev => ({ ...prev, postalCode: v }))
                    if (v.replace(/[-ー\s]/g, '').length === 7) lookupAddPostal(v)
                  }}
                  placeholder="1500001"
                  autoComplete="off"
                  name="kk-cust-zip"
                  className="flex-1 h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                />
                <button
                  type="button"
                  onClick={() => lookupAddPostal(addForm.postalCode)}
                  disabled={addZipLooking || addForm.postalCode.replace(/[-ー\s]/g, '').length !== 7}
                  className="h-12 px-4 text-sm font-semibold rounded-[var(--md-sys-shape-small)] bg-[var(--portal-primary,#374151)] text-[var(--portal-primary-container,#fff)] disabled:opacity-40 flex-shrink-0"
                >
                  {addZipLooking ? '検索中...' : '住所検索'}
                </button>
              </div>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">7桁入力で住所を自動入力します</p>
            </div>
            <TextField
              label="住所（任意）"
              value={addForm.address}
              onChange={v => setAddForm(prev => ({ ...prev, address: v }))}
              placeholder="東京都渋谷区..."
              autoComplete="off"
              name="kk-cust-address"
            />
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                顧客タイプ <span className="text-[var(--md-sys-color-error)]">*</span>
              </label>
              <select
                value={addForm.customerType}
                onChange={e => setAddForm(prev => ({ ...prev, customerType: e.target.value }))}
                className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                {CUSTOMER_TYPES.map(t => (
                  <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>
                ))}
              </select>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">作成後の編集画面で複数タイプを追加できます</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                流入経路（任意）
              </label>
              <select
                value={addForm.leadSource}
                onChange={e => setAddForm(prev => ({ ...prev, leadSource: e.target.value }))}
                className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                <option value="">未設定</option>
                {leadSources.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                担当店舗（任意）
              </label>
              {(() => {
                const selected = stores.find(s => s.id === addForm.storeId)
                const q = addStoreSearch.trim().toLowerCase()
                const filtered = q
                  ? stores.filter(s =>
                      s.code.toLowerCase().includes(q) ||
                      s.name.toLowerCase().includes(q) ||
                      (s.prefecture || '').toLowerCase().includes(q)
                    )
                  : stores
                // 住所（郵便番号自動入力含む）に近い店舗候補
                const recIds = addForm.address ? getRecommendedStoreIds(addForm.address) : []
                const recommended = recIds
                  .map(id => stores.find(s => s.id === id))
                  .filter((s): s is typeof stores[number] => !!s)
                return (
                  <div className="relative">
                    {selected && !addStoreOpen && (
                      <div className="flex items-center justify-between gap-2 h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)]">
                        <span className="truncate">[{selected.code}] {selected.name}{selected.prefecture ? `（${selected.prefecture}）` : ''}</span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button type="button" onClick={() => setAddStoreOpen(true)} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">変更</button>
                          <button type="button" onClick={() => { setAddForm(prev => ({ ...prev, storeId: '' })); setAddStoreSearch('') }} className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:underline">クリア</button>
                        </div>
                      </div>
                    )}
                    {(!selected || addStoreOpen) && (
                      <>
                        {/* 住所が近い店舗（おすすめ） */}
                        {recommended.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-1.5 flex items-center gap-1">
                              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                              </svg>
                              住所が近い店舗（おすすめ）
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {recommended.map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => { setAddForm(prev => ({ ...prev, storeId: s.id })); setAddStoreSearch(''); setAddStoreOpen(false) }}
                                  className={`px-2.5 py-1.5 rounded-full text-[11px] border transition-all ${
                                    addForm.storeId === s.id
                                      ? 'border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-semibold'
                                      : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]'
                                  }`}
                                >
                                  {s.name}{s.prefecture ? `（${s.prefecture}）` : ''}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <input
                          type="text"
                          value={addStoreSearch}
                          onChange={e => setAddStoreSearch(e.target.value)}
                          placeholder="店舗名・コード・都道府県で検索（空欄は全店舗から選択）"
                          autoComplete="off"
                          className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                        />
                        <div className="mt-1 max-h-48 overflow-y-auto rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
                          <button
                            type="button"
                            onClick={() => { setAddForm(prev => ({ ...prev, storeId: '' })); setAddStoreSearch(''); setAddStoreOpen(false) }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--md-sys-color-surface-container-high)] ${!addForm.storeId ? 'bg-[var(--md-sys-color-surface-container-high)] font-medium' : ''}`}
                          >
                            店舗を選択しない
                          </button>
                          {filtered.length === 0 ? (
                            <p className="px-3 py-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">該当する店舗が見つかりません</p>
                          ) : filtered.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setAddForm(prev => ({ ...prev, storeId: s.id })); setAddStoreSearch(''); setAddStoreOpen(false) }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--md-sys-color-surface-container-high)] border-t border-[var(--md-sys-color-outline-variant)] flex items-center gap-1.5 ${addForm.storeId === s.id ? 'bg-[var(--md-sys-color-surface-container-high)] font-medium' : ''}`}
                            >
                              {recIds.includes(s.id) && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 font-semibold flex-shrink-0">近い</span>
                              )}
                              <span className="truncate">[{s.code}] {s.name}{s.prefecture ? `（${s.prefecture}）` : ''}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* 案件内容（任意・顧客と同時に作成） */}
            <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                案件内容（任意）
              </label>
              <textarea
                value={wizardDealDetail}
                onChange={e => setWizardDealDetail(e.target.value)}
                rows={6}
                placeholder="買取内容・状況など。入力すると顧客と同時に案件を作成します"
                className="w-full px-3.5 py-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2 resize-none"
              />
              <div className="mt-2">
                <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">案件発生日</label>
                <input
                  type="date"
                  value={wizardDealOccurredAt}
                  onChange={e => setWizardDealOccurredAt(e.target.value)}
                  className="h-11 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                />
                <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">案件作成時に記録されます（既定は本日）</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outlined" onClick={() => setShowAddCustomer(false)} type="button">
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={addSubmitting || !addForm.name || !addForm.furigana}
                loading={addSubmitting}
              >
                {addSubmitting ? '登録中...' : '登録して次へ →'}
              </Button>
            </div>
          </form>
        )}

        {/* ── STEP 2: 訪問スケジュール ── */}
        {addStep === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
              顧客 <span className="font-semibold">{addCreatedUser?.name}</span> を登録しました{wizardDealId ? '（案件も作成済み）' : ''}。訪問スケジュールを設定しますか？
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                担当店舗 <span className="text-[var(--md-sys-color-on-surface-variant)] font-normal">（任意）</span>
              </label>
              <select
                value={wizardSchedule.storeId}
                onChange={e => setWizardSchedule(prev => ({ ...prev, storeId: e.target.value }))}
                className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                <option value="">店舗を選択...</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>[{s.code}] {s.name}{s.prefecture ? `（${s.prefecture}）` : ''}</option>
                ))}
              </select>
            </div>
            <TextField
              label="訪問日（任意）"
              type="date"
              value={wizardSchedule.visitDate}
              onChange={v => setWizardSchedule(prev => ({ ...prev, visitDate: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <TimeSelect label="開始時間（任意）" value={wizardSchedule.startTime} onChange={v => setWizardSchedule(prev => ({ ...prev, startTime: v }))} />
              <TimeSelect label="終了時間（任意）" value={wizardSchedule.endTime} onChange={v => setWizardSchedule(prev => ({ ...prev, endTime: v }))} />
            </div>
            <TextField
              label="メモ（任意）"
              value={wizardSchedule.note}
              onChange={v => setWizardSchedule(prev => ({ ...prev, note: v }))}
              placeholder="訪問に関するメモ..."
              rows={3}
            />
            <div className="flex justify-between gap-3 pt-2">
              <Button variant="text" onClick={() => handleWizardScheduleFinish(true)} type="button">
                スキップして完了
              </Button>
              <Button
                onClick={() => handleWizardScheduleFinish(false)}
                loading={wizardScheduleSubmitting}
                disabled={wizardScheduleSubmitting || (!wizardSchedule.storeId || !wizardSchedule.visitDate)}
              >
                スケジュールを追加して完了
              </Button>
            </div>
          </div>
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
        {assigning && (() => {
          const recommended = stores.filter(s => recommendedStoreIds.includes(s.id))
          const others = stores.filter(s => !recommendedStoreIds.includes(s.id))
          return (
            <>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-1">
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{assigning.name}</span> の担当店舗を設定します
              </p>
              <p className="text-xs text-[var(--md-sys-color-outline)] mb-4 truncate">
                📍 {assigning.address}
              </p>

              {/* おすすめ店舗（住所が近い） */}
              {recommended.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    住所が近い店舗（おすすめ）
                  </p>
                  <div className="space-y-1.5">
                    {recommended.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStore(s.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-[var(--md-sys-shape-small)] border transition-all text-sm ${
                          selectedStore === s.id
                            ? 'border-green-500 bg-green-50 dark:bg-green-950/30 ring-1 ring-green-500'
                            : 'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                            [{s.code}] {s.name}
                          </span>
                          {selectedStore === s.id && (
                            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                          {s.address || s.prefecture || '住所未設定'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 区切り + すべての店舗 */}
              {recommended.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
                  <span className="text-xs text-[var(--md-sys-color-outline)]">その他の店舗</span>
                  <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
                </div>
              )}
              <select
                value={recommendedStoreIds.includes(selectedStore) ? '' : selectedStore}
                onChange={e => setSelectedStore(e.target.value)}
                className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
              >
                <option value="">{recommended.length > 0 ? 'その他の店舗から選択...' : '店舗を選択...'}</option>
                {others.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name} {s.prefecture ? `（${s.prefecture}）` : ''}
                  </option>
                ))}
              </select>
            </>
          )
        })()}
      </Modal>
    </>
  )
}
