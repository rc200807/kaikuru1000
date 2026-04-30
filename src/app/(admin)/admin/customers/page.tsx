'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
import BankSearch from '@/components/customer/BankSearch'
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, CUSTOMER_TYPE_BADGE, parseCustomerTypes, type CustomerType } from '@/lib/customer-types'

type User = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
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
  const [showInactive, setShowInactive] = useState(false)

  // 訪問ステータス（動的取得）
  const [visitStatuses, setVisitStatuses] = useState<{key:string,label:string,color:string}[]>([])
  const STATUS_OPTIONS = visitStatuses.length > 0
    ? visitStatuses.map(s => ({ value: s.key, label: s.label }))
    : DEFAULT_STATUS_OPTIONS

  // ページネーション
  const [usersPage, setUsersPage] = useState(1)
  const [usersHasMore, setUsersHasMore] = useState(false)
  const [usersTotal, setUsersTotal] = useState(0)
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
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  const [detailSchedules, setDetailSchedules] = useState<VisitSchedule[]>([])
  const [detailSchedulesLoading, setDetailSchedulesLoading] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ storeId: '', visitDate: '', note: '' })
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 顧客情報編集
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<{ name: string; furigana: string; email: string; phone: string; address: string; customerType: string; customerTypes: string[]; visitFrequencyMonths: number }>({ name: '', furigana: '', email: '', phone: '', address: '', customerType: 'visit', customerTypes: ['visit'], visitFrequencyMonths: 1 })
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

  // 新規顧客追加モーダル
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', furigana: '', email: '', phone: '', address: '', password: '', customerType: 'visit', storeId: '',
  })
  const [addSubmitting, setAddSubmitting] = useState(false)

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

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') {
        router.push('/')
        return
      }

      const params = new URLSearchParams()
      if (showInactive) params.set('includeInactive', 'true')
      params.set('page', '1')
      params.set('limit', String(USERS_LIMIT))
      const usersUrl = `/api/admin/users?${params.toString()}`
      Promise.all([
        fetch(usersUrl).then(r => r.json()),
        fetch('/api/stores').then(r => r.json()),
      ]).then(([usersData, storesData]) => {
        const list = usersData?.users ?? (Array.isArray(usersData) ? usersData : [])
        setUsers(list)
        setUsersTotal(usersData?.total ?? list.length)
        setUsersPage(1)
        setUsersHasMore((usersData?.total ?? list.length) > USERS_LIMIT)
        setStores(Array.isArray(storesData) ? storesData : [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session, showInactive])

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
        if (tab && ['info', 'add', 'history'].includes(tab)) {
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
    const params = new URLSearchParams()
    if (showInactive) params.set('includeInactive', 'true')
    params.set('page', String(nextPage))
    params.set('limit', String(USERS_LIMIT))
    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`)
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
    setScheduleForm({ storeId: detailUser.store?.id || '', visitDate: '', note: '' })
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
      setMessage({ type: 'success', text: `顧客タイプを「${newType === 'delivery' ? '定期宅配' : newType === 'regular' ? '通常買取' : '定期訪問'}」に変更しました` })
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
      address: detailUser.address,
      customerType: detailUser.customerType,
      customerTypes: types.length > 0 ? types : [detailUser.customerType],
      visitFrequencyMonths: detailUser.visitFrequencyMonths ?? 1,
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
          address: editForm.address,
          customerType: editForm.customerType,
          customerTypes: editForm.customerTypes,
          visitFrequencyMonths: editForm.visitFrequencyMonths,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        const patch = {
          name: updated.name ?? editForm.name,
          furigana: updated.furigana ?? editForm.furigana,
          email: updated.email ?? editForm.email,
          phone: updated.phone ?? editForm.phone,
          address: updated.address ?? editForm.address,
          customerType: updated.customerType ?? editForm.customerType,
          visitFrequencyMonths: updated.visitFrequencyMonths ?? editForm.visitFrequencyMonths,
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
          password: addForm.password,
          customerType: addForm.customerType,
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

      // ユーザー一覧を再取得
      const params = new URLSearchParams()
      if (showInactive) params.set('includeInactive', 'true')
      params.set('page', '1')
      params.set('limit', String(USERS_LIMIT))
      const usersRes = await fetch(`/api/admin/users?${params.toString()}`)
      const usersData = await usersRes.json()
      const list = usersData?.users ?? (Array.isArray(usersData) ? usersData : [])
      setUsers(list)
      setUsersTotal(usersData?.total ?? list.length)
      setUsersPage(1)
      setUsersHasMore((usersData?.total ?? list.length) > USERS_LIMIT)

      setMessage({ type: 'success', text: `${addForm.name} を追加しました` })
      setShowAddCustomer(false)
      setAddForm({ name: '', furigana: '', email: '', phone: '', address: '', password: '', customerType: 'visit', storeId: '' })
    } catch {
      setMessage({ type: 'error', text: '顧客の追加に失敗しました' })
    }
    setAddSubmitting(false)
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
          {user.licenseKey?.key || '—'}
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
      key: 'nextVisit',
      header: '次回訪問',
      hideOnMobile: true,
      render: (user) => {
        if (user.customerType === 'delivery') {
          return <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">定期宅配</span>
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-[var(--status-completed-text)] bg-[var(--status-completed-bg)] px-2 py-0.5 rounded-full">提出済</span>
          {user.idOcrIssueReport && (
            <span className="text-[10px] font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">要確認</span>
          )}
        </div>
      ) : (
        <span className="text-xs font-medium text-[var(--status-pending-text)] bg-[var(--status-pending-bg)] px-2 py-0.5 rounded-full">未提出</span>
      ),
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="登録顧客数" value={users.length} accentColor="bg-[#E8927C]" />
          <SummaryCard label="未割り当て" value={unassignedCount} accentColor={unassignedCount > 0 ? 'bg-orange-500' : 'bg-[var(--md-sys-color-outline)]'} />
          <SummaryCard label="担当店舗数" value={stores.length} accentColor="bg-green-600" />
          <SummaryCard label="身分証未提出" value={users.filter(u => !u.idDocumentPath).length} accentColor="bg-red-500" />
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
                      label="住所"
                      value={editForm.address}
                      onChange={v => setEditForm(prev => ({ ...prev, address: v }))}
                      required
                    />
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
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outlined" onClick={() => setEditMode(false)} disabled={editSubmitting}>
                        キャンセル
                      </Button>
                      <Button
                        onClick={handleSaveCustomer}
                        disabled={editSubmitting || !editForm.name || !editForm.furigana || !editForm.phone || !editForm.address}
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
                      { label: '訪問先住所', value: detailUser.address },
                      { label: 'ライセンスキー', value: detailUser.licenseKey?.key || '—', mono: true },
                      { label: '担当店舗', value: detailUser.store?.name || '未割り当て' },
                      { label: '登録日', value: format(new Date(detailUser.createdAt), 'yyyy年M月d日', { locale: ja }) },
                    ].map(item => (
                      <div key={item.label} className="flex gap-3">
                        <dt className="w-24 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                        <dd className={`text-sm text-[var(--md-sys-color-on-surface)] break-all min-w-0 ${(item as any).mono ? 'font-mono text-xs' : ''}`}>{item.value}</dd>
                      </div>
                    ))}
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

      {/* 新規顧客追加モーダル */}
      <Modal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        title="新規顧客追加"
        size="lg"
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <TextField
            label="氏名"
            value={addForm.name}
            onChange={v => setAddForm(prev => ({ ...prev, name: v }))}
            required
            placeholder="山田 太郎"
          />
          <TextField
            label="ふりがな"
            value={addForm.furigana}
            onChange={v => setAddForm(prev => ({ ...prev, furigana: v }))}
            required
            placeholder="やまだ たろう"
          />
          <TextField
            label="メールアドレス（任意）"
            value={addForm.email}
            onChange={v => setAddForm(prev => ({ ...prev, email: v }))}
            type="email"
            placeholder="example@mail.com"
          />
          <TextField
            label="電話番号"
            value={addForm.phone}
            onChange={v => setAddForm(prev => ({ ...prev, phone: v }))}
            required
            placeholder="090-1234-5678"
          />
          <TextField
            label="住所"
            value={addForm.address}
            onChange={v => setAddForm(prev => ({ ...prev, address: v }))}
            required
            placeholder="東京都渋谷区..."
          />
          <TextField
            label="パスワード（8文字以上）"
            value={addForm.password}
            onChange={v => setAddForm(prev => ({ ...prev, password: v }))}
            required
            type="password"
            placeholder="8文字以上のパスワード"
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
              担当店舗（任意）
            </label>
            <select
              value={addForm.storeId}
              onChange={e => setAddForm(prev => ({ ...prev, storeId: e.target.value }))}
              className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            >
              <option value="">店舗を選択しない</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  [{s.code}] {s.name} {s.prefecture ? `（${s.prefecture}）` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outlined" onClick={() => setShowAddCustomer(false)} type="button">
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={addSubmitting || !addForm.name || !addForm.furigana || !addForm.email || !addForm.phone || !addForm.address || addForm.password.length < 8}
              loading={addSubmitting}
            >
              {addSubmitting ? '追加中...' : '顧客を追加'}
            </Button>
          </div>
        </form>
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
