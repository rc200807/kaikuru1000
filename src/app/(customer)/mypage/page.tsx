'use client'

import { useState, useEffect, useRef, useMemo, Fragment, Suspense } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'

type UserData = {
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
  licenseKey: { key: string }
  store: { name: string; phone: string | null } | null
  visitSchedules: Array<{ id: string; visitDate: string; status: string; note: string | null }>
  // 顧客タイプ
  customerType: string  // "visit" | "delivery" | "regular"
  // 振込先口座情報
  bankName:      string | null
  branchName:    string | null
  accountType:   string | null
  accountNumber: string | null
  accountHolder: string | null
}

type VisitRecord = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
}

type Stats = {
  totalPurchaseAmount: number
  purchaseCount: number
  monthlyStats: Array<{ year: number; month: number; amount: number }>
}

type AiAppraisalResult = {
  productDetail: string
  marketPriceHigh: string
  marketPriceLow: string
  offerPrice: string
  offerReason: string
  platforms: string
  supplement: string
}

type PurchaseMemo = {
  id: string
  title: string
  description: string | null
  imageUrls: string[]
  status: string
  storeNote: string | null
  aiAppraisal: AiAppraisalResult | null
  aiAppraisalAt: string | null
  createdAt: string
  updatedAt: string
}

type DeliveryShipment = {
  id: string
  shipmentNumber: string
  shipmentMonth: string
  description: string | null
  imageUrls: string[]
  purchaseAmount: number | null
  status: string  // registered | shipped | received | appraised
  storeNote: string | null
  createdAt: string
}

export default function MyPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MyPageContent />
    </Suspense>
  )
}

function MyPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<UserData | null>(null)
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'dashboard')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const memoImageInputRef = useRef<HTMLInputElement>(null)
  const shipmentImageInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState({ name: '', furigana: '', phone: '', address: '' })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

  // 振込先口座
  const [bankForm, setBankForm] = useState({
    bankName: '', branchName: '', accountType: '', accountNumber: '', accountHolder: '',
  })
  const [savingBank, setSavingBank] = useState(false)

  // 訪問履歴
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [visitsLoaded, setVisitsLoaded] = useState(false)
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [visitsPage, setVisitsPage] = useState(1)
  const [visitsHasMore, setVisitsHasMore] = useState(false)
  const [visitsTotal, setVisitsTotal] = useState(0)
  const [visitsLoadingMore, setVisitsLoadingMore] = useState(false)
  const VISITS_LIMIT = 30

  // ダッシュボード統計
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoaded, setStatsLoaded] = useState(false)

  // 買取トライ
  const [memos, setMemos] = useState<PurchaseMemo[]>([])
  const [memosLoaded, setMemosLoaded] = useState(false)
  const [memosLoading, setMemosLoading] = useState(false)
  const [memosPage, setMemosPage] = useState(1)
  const [memosHasMore, setMemosHasMore] = useState(false)
  const [memosTotal, setMemosTotal] = useState(0)
  const [memosLoadingMore, setMemosLoadingMore] = useState(false)
  const MEMOS_LIMIT = 20
  const [showMemoForm, setShowMemoForm] = useState(false)
  const [memoForm, setMemoForm] = useState({ title: '', description: '' })
  const [memoImages, setMemoImages] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [submittingMemo, setSubmittingMemo] = useState(false)
  const [aiAppraisalRemaining, setAiAppraisalRemaining] = useState<number | null>(null)
  const [apprasingMemoId, setApprasingMemoId] = useState<string | null>(null)

  // 訪問リクエスト
  const [visitRequests, setVisitRequests] = useState<any[]>([])
  const [visitRequestsLoaded, setVisitRequestsLoaded] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestForm, setRequestForm] = useState({
    candidate1Date: '', candidate1Start: '', candidate1End: '',
    candidate2Date: '', candidate2Start: '', candidate2End: '',
    candidate3Date: '', candidate3Start: '', candidate3End: '',
    customerNote: '',
  })
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestMsg, setRequestMsg] = useState<{type:'success'|'error',text:string}|null>(null)

  // 宅配送付履歴
  const [shipments, setShipments] = useState<DeliveryShipment[]>([])
  const [shipmentsLoaded, setShipmentsLoaded] = useState(false)
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [showShipmentForm, setShowShipmentForm] = useState(false)
  const [shipmentForm, setShipmentForm] = useState({ description: '' })
  const [shipmentImages, setShipmentImages] = useState<string[]>([])
  const [uploadingShipmentImage, setUploadingShipmentImage] = useState(false)
  const [submittingShipment, setSubmittingShipment] = useState(false)
  const [updatingShipmentId, setUpdatingShipmentId] = useState<string | null>(null)

  // 身分証OCR関連
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [reOcrLoading, setReOcrLoading] = useState(false)
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportText, setReportText] = useState('')
  const [savingReport, setSavingReport] = useState(false)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState(false)

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
          setBankForm({
            bankName:      data.bankName      ?? '',
            branchName:    data.branchName    ?? '',
            accountType:   data.accountType   ?? '',
            accountNumber: data.accountNumber ?? '',
            accountHolder: data.accountHolder ?? '',
          })
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  // ダッシュボードタブ表示時に統計をロード
  useEffect(() => {
    if (activeTab === 'dashboard' && !statsLoaded && status === 'authenticated') {
      fetch('/api/customer/stats')
        .then(r => r.json())
        .then(data => { setStats(data); setStatsLoaded(true) })
        .catch(() => setStatsLoaded(true))
    }
  }, [activeTab, statsLoaded, status])

  // 宅配顧客: ダッシュボード表示時にも送付履歴をロード（今月ステータス表示用）
  useEffect(() => {
    if (activeTab === 'dashboard' && !shipmentsLoaded && status === 'authenticated' && user?.customerType === 'delivery') {
      fetch('/api/delivery-shipments')
        .then(r => r.json())
        .then(data => { setShipments(Array.isArray(data) ? data : []); setShipmentsLoaded(true) })
        .catch(() => setShipmentsLoaded(true))
    }
  }, [activeTab, shipmentsLoaded, status, user?.customerType])

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
    setUploadingDoc(true)
    const res = await fetch(`/api/users/${userId}/id-document`, {
      method: 'POST',
      body: formData,
    })
    setUploadingDoc(false)
    if (res.ok) {
      const data = await res.json()
      setUser(prev => {
        if (!prev) return null
        return {
          ...prev,
          idDocumentPath:   `/api/users/${prev.id}/id-document`,
          idOcrIssueReport: null,
          ...(data.ocr && {
            idDocumentType:  data.ocr.idDocumentType,
            idName:          data.ocr.idName,
            idBirthDate:     data.ocr.idBirthDate,
            idAddress:       data.ocr.idAddress,
            idLicenseNumber: data.ocr.idLicenseNumber,
            idExpiryDate:    data.ocr.idExpiryDate,
          }),
        }
      })
      setShowReportForm(false)
      setReportText('')
      const ocrMsg = data.ocr ? '（情報を自動読み取りしました）' : '（自動読み取りに失敗しました。再読み取りをお試しください）'
      setMessage({ type: 'success', text: `身分証明書をアップロードしました${ocrMsg}` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || 'アップロードに失敗しました' })
    }
  }

  // 身分証再OCR
  async function handleReOcr() {
    const userId = (session?.user as any).id
    setReOcrLoading(true)
    setMessage(null)
    const res = await fetch(`/api/users/${userId}/id-document/reocr`, { method: 'POST' })
    setReOcrLoading(false)
    if (res.ok) {
      const data = await res.json()
      if (data.ocr) {
        setUser(prev => prev ? {
          ...prev,
          idOcrIssueReport: null,
          idDocumentType:  data.ocr.idDocumentType,
          idName:          data.ocr.idName,
          idBirthDate:     data.ocr.idBirthDate,
          idAddress:       data.ocr.idAddress,
          idLicenseNumber: data.ocr.idLicenseNumber,
          idExpiryDate:    data.ocr.idExpiryDate,
        } : null)
        setShowReportForm(false)
        setReportText('')
        setMessage({ type: 'success', text: '再読み取りが完了しました' })
      } else {
        setMessage({ type: 'error', text: '読み取りに失敗しました。画像を再アップロードしてください。' })
      }
    } else {
      setMessage({ type: 'error', text: '再読み取りに失敗しました' })
    }
  }

  // 身分証削除
  async function handleDeleteIdDocument() {
    if (!user) return
    setDeletingDoc(true)
    try {
      const res = await fetch(`/api/users/${user.id}/id-document`, { method: 'DELETE' })
      if (res.ok) {
        setUser(prev => prev ? {
          ...prev,
          idDocumentPath:   null,
          idDocumentType:   null,
          idName:           null,
          idBirthDate:      null,
          idAddress:        null,
          idLicenseNumber:  null,
          idExpiryDate:     null,
          idOcrIssueReport: null,
        } : prev)
        setConfirmDeleteDoc(false)
        setShowReportForm(false)
        setMessage({ type: 'success', text: '身分証明書を削除しました' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error ?? '削除に失敗しました' })
      }
    } finally {
      setDeletingDoc(false)
    }
  }

  // 身分証OCR誤り報告
  async function handleSubmitIssueReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportText.trim()) return
    const userId = (session?.user as any).id
    setSavingReport(true)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idOcrIssueReport: reportText.trim() }),
    })
    setSavingReport(false)
    if (res.ok) {
      setUser(prev => prev ? { ...prev, idOcrIssueReport: reportText.trim() } : null)
      setShowReportForm(false)
      setMessage({ type: 'success', text: '誤りを報告しました。スタッフが確認します。' })
    } else {
      setMessage({ type: 'error', text: '報告に失敗しました' })
    }
  }

  // メモ画像アップロード
  async function handleMemoImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/purchase-memos/images', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setMemoImages(prev => [...prev, data.url])
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '画像のアップロードに失敗しました' })
    }
    setUploadingImage(false)
    e.target.value = ''
  }

  // メモ作成
  async function handleSubmitMemo(e: React.FormEvent) {
    e.preventDefault()
    if (!memoForm.title) return
    setSubmittingMemo(true)
    const res = await fetch('/api/purchase-memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: memoForm.title,
        description: memoForm.description || undefined,
        imageUrls: memoImages,
      }),
    })
    setSubmittingMemo(false)
    if (res.ok) {
      const created = await res.json()
      setMemos(prev => [created, ...prev])
      setMemoForm({ title: '', description: '' })
      setMemoImages([])
      setShowMemoForm(false)
      setMessage({ type: 'success', text: '買取トライを登録しました' })
    } else {
      setMessage({ type: 'error', text: 'メモの登録に失敗しました' })
    }
  }

  // 口座情報保存
  async function handleSaveBank(e: React.FormEvent) {
    e.preventDefault()
    setSavingBank(true)
    setMessage(null)
    const userId = (session?.user as any).id
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankName:      bankForm.bankName      || null,
        branchName:    bankForm.branchName    || null,
        accountType:   bankForm.accountType   || null,
        accountNumber: bankForm.accountNumber || null,
        accountHolder: bankForm.accountHolder || null,
      }),
    })
    setSavingBank(false)
    if (res.ok) {
      setUser(prev => prev ? { ...prev, ...bankForm } : null)
      setMessage({ type: 'success', text: '口座情報を保存しました' })
    } else {
      setMessage({ type: 'error', text: '口座情報の保存に失敗しました' })
    }
  }

  // 宅配送付画像アップロード
  async function handleShipmentImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingShipmentImage(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/delivery-shipments/images', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setShipmentImages(prev => [...prev, data.url])
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '画像のアップロードに失敗しました' })
    }
    setUploadingShipmentImage(false)
    e.target.value = ''
  }

  // 今月の送付登録
  async function handleSubmitShipment(e: React.FormEvent) {
    e.preventDefault()
    setSubmittingShipment(true)
    const res = await fetch('/api/delivery-shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: shipmentForm.description || undefined,
        imageUrls: shipmentImages,
      }),
    })
    setSubmittingShipment(false)
    if (res.ok) {
      const created = await res.json()
      setShipments(prev => [created, ...prev])
      setShipmentForm({ description: '' })
      setShipmentImages([])
      setShowShipmentForm(false)
      setMessage({ type: 'success', text: `送付を登録しました。定期宅配番号: ${created.shipmentNumber}` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '送付登録に失敗しました' })
    }
  }

  // 送付「発送しました」
  async function handleMarkShipped(id: string) {
    setUpdatingShipmentId(id)
    const res = await fetch(`/api/delivery-shipments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'shipped' }),
    })
    setUpdatingShipmentId(null)
    if (res.ok) {
      const updated = await res.json()
      setShipments(prev => prev.map(s => s.id === id ? updated : s))
      setMessage({ type: 'success', text: '発送済みに更新しました' })
    } else {
      setMessage({ type: 'error', text: '更新に失敗しました' })
    }
  }

  // メモ削除
  async function handleDeleteMemo(id: string) {
    if (!confirm('このメモを削除しますか？')) return
    const res = await fetch(`/api/purchase-memos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMemos(prev => prev.filter(m => m.id !== id))
    }
  }

  // AI査定
  async function handleAiAppraisal(id: string) {
    if (apprasingMemoId) return
    setApprasingMemoId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/purchase-memos/${id}/ai-appraisal`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMemos(prev => prev.map(m =>
          m.id === id
            ? { ...m, aiAppraisal: data.appraisal, aiAppraisalAt: data.aiAppraisalAt }
            : m
        ))
        setAiAppraisalRemaining(data.remaining)
        setMessage({ type: 'success', text: 'AI査定が完了しました' })
      } else {
        setMessage({ type: 'error', text: data.error || 'AI査定に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: 'AI査定に失敗しました' })
    } finally {
      setApprasingMemoId(null)
    }
  }

  // Listen for bottom nav tab changes
  useEffect(() => {
    function onBottomNavChange(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail) handleTabChange(detail)
    }
    window.addEventListener('bottomnav-tab-change', onBottomNavChange)
    return () => window.removeEventListener('bottomnav-tab-change', onBottomNavChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for browser back/forward to restore tab
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') || 'dashboard'
      setActiveTab(tab)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (status === 'loading' || loading) {
    return <LoadingSpinner fullPage size="lg" label="読み込み中..." />
  }

  if (!user) return null

  const nextVisit = user.visitSchedules?.[0]

  const isDelivery = user.customerType === 'delivery'

  const tabs = isDelivery
    ? [
        { key: 'dashboard',   label: 'ダッシュボード' },
        { key: 'shipments',   label: '送付履歴' },
        { key: 'profile',     label: 'プロフィール' },
        { key: 'password',    label: 'パスワード' },
        { key: 'id-document', label: '身分証明書' },
        { key: 'bank-account', label: '口座情報' },
      ]
    : [
        { key: 'dashboard',   label: 'ダッシュボード' },
        { key: 'memos',       label: '買取トライ' },
        { key: 'visit-request', label: '訪問リクエスト' },
        { key: 'history',     label: '訪問履歴' },
        { key: 'profile',     label: 'プロフィール' },
        { key: 'password',    label: 'パスワード' },
        { key: 'id-document', label: '身分証明書' },
        { key: 'bank-account', label: '口座情報' },
      ]

  function handleTabChange(tabKey: string) {
    setActiveTab(tabKey)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tabKey)
    window.history.pushState({}, '', url.toString())
    setMessage(null)
    if (tabKey === 'history' && !visitsLoaded) {
      setVisitsLoading(true)
      fetch(`/api/visit-schedules?page=1&limit=${VISITS_LIMIT}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.schedules ?? (Array.isArray(data) ? data : [])
          const sorted = [...list].sort((a: VisitRecord, b: VisitRecord) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
          setVisits(sorted)
          setVisitsTotal(data?.total ?? list.length)
          setVisitsPage(1)
          setVisitsHasMore((data?.total ?? list.length) > VISITS_LIMIT)
          setVisitsLoaded(true)
          setVisitsLoading(false)
        })
        .catch(() => { setVisitsLoaded(true); setVisitsLoading(false) })
    }
    if (tabKey === 'memos' && !memosLoaded) {
      setMemosLoading(true)
      fetch(`/api/purchase-memos?page=1&limit=${MEMOS_LIMIT}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.memos ?? (Array.isArray(data) ? data : [])
          setMemos(list)
          setMemosTotal(data?.total ?? list.length)
          setMemosPage(1)
          setMemosHasMore((data?.total ?? list.length) > MEMOS_LIMIT)
          setMemosLoaded(true)
          setMemosLoading(false)
        })
        .catch(() => { setMemosLoaded(true); setMemosLoading(false) })
      // AI査定の残り回数を取得（任意のメモIDでGETする — idは無視される）
      fetch('/api/purchase-memos/_/ai-appraisal')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setAiAppraisalRemaining(data.remaining) })
        .catch(() => {})
    }
    if (tabKey === 'visit-request' && !visitRequestsLoaded) {
      fetch('/api/visit-requests')
        .then(r => r.ok ? r.json() : { requests: [] })
        .then(data => { setVisitRequests(Array.isArray(data) ? data : data.requests || []); setVisitRequestsLoaded(true) })
        .catch(() => setVisitRequestsLoaded(true))
    }
    if (tabKey === 'shipments' && !shipmentsLoaded) {
      setShipmentsLoading(true)
      fetch('/api/delivery-shipments')
        .then(r => r.json())
        .then(data => {
          setShipments(Array.isArray(data) ? data : [])
          setShipmentsLoaded(true)
          setShipmentsLoading(false)
        })
        .catch(() => { setShipmentsLoaded(true); setShipmentsLoading(false) })
    }
  }

  async function loadMoreVisits() {
    setVisitsLoadingMore(true)
    const nextPage = visitsPage + 1
    try {
      const res = await fetch(`/api/visit-schedules?page=${nextPage}&limit=${VISITS_LIMIT}`)
      const data = await res.json()
      const list = data?.schedules ?? (Array.isArray(data) ? data : [])
      const sorted = [...list].sort((a: VisitRecord, b: VisitRecord) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      setVisits(prev => [...prev, ...sorted])
      setVisitsPage(nextPage)
      setVisitsHasMore(nextPage * VISITS_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setVisitsLoadingMore(false)
  }

  async function loadMoreMemos() {
    setMemosLoadingMore(true)
    const nextPage = memosPage + 1
    try {
      const res = await fetch(`/api/purchase-memos?page=${nextPage}&limit=${MEMOS_LIMIT}`)
      const data = await res.json()
      const list = data?.memos ?? (Array.isArray(data) ? data : [])
      setMemos(prev => [...prev, ...list])
      setMemosPage(nextPage)
      setMemosHasMore(nextPage * MEMOS_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setMemosLoadingMore(false)
  }

  // 訪問リクエスト送信
  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!requestForm.candidate1Date) return
    setRequestSubmitting(true)
    setRequestMsg(null)
    try {
      const res = await fetch('/api/visit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestForm),
      })
      if (res.ok) {
        const created = await res.json()
        setVisitRequests(prev => [created, ...prev])
        setRequestForm({
          candidate1Date: '', candidate1Start: '', candidate1End: '',
          candidate2Date: '', candidate2Start: '', candidate2End: '',
          candidate3Date: '', candidate3Start: '', candidate3End: '',
          customerNote: '',
        })
        setShowRequestForm(false)
        setRequestMsg({ type: 'success', text: '訪問リクエストを送信しました' })
      } else {
        const d = await res.json()
        setRequestMsg({ type: 'error', text: d.error || '送信に失敗しました' })
      }
    } catch {
      setRequestMsg({ type: 'error', text: '送信に失敗しました' })
    }
    setRequestSubmitting(false)
  }

  // 訪問リクエストアクション（accept_counter, decline_counter, cancel）
  async function handleRequestAction(id: string, action: string) {
    try {
      const res = await fetch(`/api/visit-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        const updated = await res.json()
        setVisitRequests(prev => prev.map(r => r.id === id ? updated : r))
        setRequestMsg({ type: 'success', text: action === 'cancel' ? 'キャンセルしました' : action === 'accept_counter' ? '日程を承認しました' : '日程を辞退しました' })
      } else {
        setRequestMsg({ type: 'error', text: '操作に失敗しました' })
      }
    } catch {
      setRequestMsg({ type: 'error', text: '操作に失敗しました' })
    }
  }

  // 月次グラフ最大値
  const maxMonthlyAmount = stats?.monthlyStats
    ? Math.max(...stats.monthlyStats.map(m => m.amount), 1)
    : 1

  const activeMemos = memos.filter(m => m.status !== 'completed')
  const completedMemos = memos.filter(m => m.status === 'completed')

  const customerTypeLabel = user ? (user.customerType === 'visit' ? '定期訪問' : user.customerType === 'delivery' ? '定期宅配' : '一般') : ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Hidden Tabs for non-dashboard tabs on desktop ─── */}
      {activeTab !== 'dashboard' && (
        <>
          {/* Compact top bar for non-dashboard tabs */}
          <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <div className="flex items-center justify-between h-14">
                <button
                  onClick={() => handleTabChange('dashboard')}
                  className="flex items-center gap-2 text-gray-600 hover:text-[#B91C1C] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-sm font-medium">戻る</span>
                </button>
                <h1 className="text-sm font-bold text-gray-900">
                  {tabs.find(t => t.key === activeTab)?.label || 'マイページ'}
                </h1>
                <div className="w-16" />
              </div>
            </div>
          </div>
        </>
      )}

      <div>
        {/* Message banner */}
        {message && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
            <MessageBanner
              severity={message.type}
              dismissible
              onDismiss={() => setMessage(null)}
            >
              {message.text}
            </MessageBanner>
          </div>
        )}

        <div className={activeTab === 'dashboard' ? '' : 'max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28'}>
          {/* ─── Dashboard tab ─── */}
          {activeTab === 'dashboard' && (
            <div>
              {/* ─── Gradient Header ─── */}
              <div className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] px-5 pt-6 pb-8 relative overflow-hidden">
                {/* Decorative circles */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

                {/* Top bar */}
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <h1 className="text-lg font-bold text-white">
                    {user.customerType === 'regular' ? '買いクル' : 'エコ得BOX'}
                  </h1>
                  <div />
                </div>

                {/* User info */}
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <span className="text-white text-lg font-bold">{user.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-white text-lg font-bold">{user.name} 様</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white">
                        {customerTypeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Next visit / delivery status in header */}
                  {isDelivery ? (
                    (() => {
                      const now = new Date()
                      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                      const thisMonthShipment = shipments.find(s => s.shipmentMonth === currentMonth)
                      const shipStatusLabel: Record<string, string> = {
                        registered: '登録済み', shipped: '発送済み', received: '受取済み', appraised: '査定完了',
                      }
                      return (
                        <div className="mt-2 bg-white/10 rounded-xl px-4 py-3">
                          <p className="text-white/70 text-[10px] font-medium uppercase tracking-wider mb-1">今月の送付状況</p>
                          {thisMonthShipment ? (
                            <p className="text-white text-xl font-bold">{shipStatusLabel[thisMonthShipment.status] ?? thisMonthShipment.status}</p>
                          ) : (
                            <p className="text-white/80 text-sm">未登録</p>
                          )}
                        </div>
                      )
                    })()
                  ) : nextVisit ? (
                    <div className="mt-2 bg-white/10 rounded-xl px-4 py-3">
                      <p className="text-white/70 text-[10px] font-medium uppercase tracking-wider mb-1">次回訪問予定日</p>
                      <p className="text-white text-xl font-bold">
                        {format(new Date(nextVisit.visitDate), 'M月d日（E）', { locale: ja })}
                      </p>
                      {user.store && (
                        <p className="text-white/60 text-xs mt-0.5">{user.store.name}</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 bg-white/10 rounded-xl px-4 py-3">
                      <p className="text-white/70 text-[10px] font-medium uppercase tracking-wider mb-1">次回訪問予定日</p>
                      <p className="text-white/80 text-sm">未定</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Main Content Area ─── */}
              <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-4 relative z-10 space-y-5 pb-28">

                {/* ─── Quick Action Cards (2x2 grid) ─── */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: '買取トライ',
                      sub: '写真で事前査定',
                      tab: 'memos',
                      color: 'text-[#B91C1C]',
                      bgColor: 'bg-red-50',
                      icon: (
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                        </svg>
                      ),
                    },
                    {
                      label: '訪問リクエスト',
                      sub: '日時を予約',
                      tab: 'visit-request',
                      color: 'text-blue-600',
                      bgColor: 'bg-blue-50',
                      icon: (
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                      ),
                    },
                    {
                      label: '訪問履歴',
                      sub: '過去の訪問一覧',
                      tab: 'history',
                      color: 'text-emerald-600',
                      bgColor: 'bg-emerald-50',
                      icon: (
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ),
                    },
                    {
                      label: 'プロフィール',
                      sub: '設定・口座情報',
                      tab: 'profile',
                      color: 'text-purple-600',
                      bgColor: 'bg-purple-50',
                      icon: (
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      ),
                    },
                  ].filter(item => {
                    // Hide visit-request and history for delivery customers
                    if (isDelivery && (item.tab === 'visit-request' || item.tab === 'history')) return false
                    return true
                  }).map(item => (
                    <button
                      key={item.tab}
                      onClick={() => handleTabChange(item.tab)}
                      className="bg-white rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition-all active:scale-[0.98] border border-gray-100"
                    >
                      <div className={`w-12 h-12 ${item.bgColor} rounded-xl flex items-center justify-center mb-3`}>
                        <span className={item.color}>{item.icon}</span>
                      </div>
                      <p className="text-sm font-bold text-gray-900">{item.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{item.sub}</p>
                    </button>
                  ))}
                </div>

                {/* ─── 身分証明書未提出バナー ─── */}
                {!user.idDocumentPath && (
                  <button
                    onClick={() => handleTabChange('id-document')}
                    className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-amber-100 transition-colors"
                  >
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-800">身分証明書が未提出です</p>
                      <p className="text-xs text-amber-600 mt-0.5">タップして登録する</p>
                    </div>
                    <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}

                {/* ─── Stats Section ─── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <p className="text-[11px] font-medium text-gray-500 mb-1">累計買取金額</p>
                    <p className="text-xl font-bold text-gray-900">
                      {stats
                        ? `¥${stats.totalPurchaseAmount.toLocaleString()}`
                        : <span className="text-sm text-gray-400">---</span>
                      }
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <p className="text-[11px] font-medium text-gray-500 mb-1">買取回数</p>
                    <p className="text-xl font-bold text-gray-900">
                      {stats
                        ? `${stats.purchaseCount}回`
                        : <span className="text-sm text-gray-400">---</span>
                      }
                    </p>
                  </div>
                </div>

                {/* ─── Monthly bar chart ─── */}
                {stats && stats.totalPurchaseAmount > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 mb-4">月次買取金額推移</h3>
                    <div className="flex items-end gap-1 h-28">
                      {stats.monthlyStats.map((m, i) => {
                        const pct = maxMonthlyAmount > 0 ? (m.amount / maxMonthlyAmount) * 100 : 0
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t-md"
                              style={{
                                height: `${Math.max(pct, m.amount > 0 ? 4 : 0)}%`,
                                backgroundColor: '#B91C1C',
                                opacity: m.amount > 0 ? 1 : 0.1,
                                minHeight: m.amount > 0 ? '4px' : undefined,
                              }}
                            />
                            <span className="text-[9px] text-gray-400">{m.month}月</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ─── Onboarding Checklist (horizontal scrollable) ─── */}
                {(() => {
                  const tasks = [
                    {
                      key: 'id-document',
                      label: '身分証明書を登録',
                      sub: '写真を撮るだけ10秒',
                      done: !!user.idDocumentPath,
                      action: () => handleTabChange('id-document'),
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                        </svg>
                      ),
                    },
                    {
                      key: 'bank',
                      label: '口座情報を登録',
                      sub: '買取金額の振込先を設定',
                      done: !!(user.bankName && user.accountNumber),
                      action: () => handleTabChange('bank-account'),
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                        </svg>
                      ),
                    },
                    {
                      key: 'memo',
                      label: '買取トライで事前査定',
                      sub: '写真で簡単に買取価格をチェック',
                      done: memos.length > 0,
                      action: () => handleTabChange('memos'),
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      ),
                    },
                    ...(user.customerType !== 'delivery' ? [{
                      key: 'visit',
                      label: '定期訪問の予約',
                      sub: 'お近くの店舗が定期訪問',
                      done: user.visitSchedules.length > 0,
                      action: () => handleTabChange('visit-request'),
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                      ),
                    }] : []),
                  ]
                  const completedCount = tasks.filter(t => t.done).length
                  const allDone = completedCount === tasks.length

                  if (allDone) return null

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900">はじめにやること</h3>
                        <span className="text-xs text-gray-500">{completedCount}/{tasks.length}</span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-[#B91C1C] rounded-full transition-all duration-500"
                          style={{ width: `${(completedCount / tasks.length) * 100}%` }}
                        />
                      </div>
                      {/* Horizontal scrollable cards */}
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
                        {tasks.filter(t => !t.done).map(task => (
                          <button
                            key={task.key}
                            onClick={task.action}
                            className="flex-shrink-0 w-40 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left snap-start hover:shadow-md transition-all active:scale-[0.98]"
                          >
                            <div className="w-10 h-10 bg-[#B91C1C] rounded-xl flex items-center justify-center mb-3">
                              <span className="text-white">{task.icon}</span>
                            </div>
                            <p className="text-xs font-bold text-gray-900 leading-tight">{task.label}</p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">{task.sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* ─── Info Cards ─── */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-50">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">基本情報</h3>
                    <dl className="space-y-2.5">
                      <div className="flex justify-between gap-3">
                        <dt className="text-sm text-gray-500">氏名</dt>
                        <dd className="text-sm font-medium text-gray-900 text-right">{user.name}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-sm text-gray-500">電話番号</dt>
                        <dd className="text-sm font-medium text-gray-900 text-right">{user.phone}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-sm text-gray-500">担当店舗</dt>
                        <dd className="text-sm font-medium text-right">
                          {user.store ? (
                            <span className="text-gray-900">{user.store.name}</span>
                          ) : (
                            <span className="text-amber-600">割り当て待ち</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="p-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">契約情報</h3>
                    <dl className="space-y-2.5">
                      <div className="flex justify-between gap-3">
                        <dt className="text-sm text-gray-500">ライセンスキー</dt>
                        <dd className="text-xs font-mono font-medium text-gray-900 text-right break-all">{user.licenseKey.key}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-sm text-gray-500">身分証</dt>
                        <dd className={`text-sm font-medium ${user.idDocumentPath ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {user.idDocumentPath ? '提出済み' : '未提出'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ─── 買取トライタブ ─── */}
          {activeTab === 'memos' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
                    買取トライ
                  </h2>
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                    買取を検討しているものをメモしておきましょう
                  </p>
                  {aiAppraisalRemaining !== null && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI査定: 今月あと{aiAppraisalRemaining}回利用可能
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => { setShowMemoForm(v => !v); setMessage(null) }}
                  >
                    {showMemoForm ? 'キャンセル' : '+ メモを追加'}
                  </Button>
                </div>
              </div>

              {/* メモ作成フォーム */}
              {showMemoForm && (
                <Card variant="elevated" padding="md">
                  <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">
                    新しい買取トライ
                  </h3>
                  <form onSubmit={handleSubmitMemo} className="space-y-4">
                    <TextField
                      label="タイトル"
                      value={memoForm.title}
                      onChange={v => setMemoForm({ ...memoForm, title: v })}
                      required
                      placeholder="例：ブランドバッグ、古い時計など"
                    />
                    <TextField
                      label="詳細メモ（任意）"
                      value={memoForm.description}
                      onChange={v => setMemoForm({ ...memoForm, description: v })}
                      placeholder="状態、年代、ブランド名など詳細をメモ..."
                      rows={3}
                    />

                    {/* 画像アップロード */}
                    <div>
                      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2">
                        写真（JPEG・PNG・WebP・HEIC、各10MB以下、最大5枚）
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {memoImages.map((url, i) => (
                          <div key={i} className="relative w-20 h-20">
                            <img
                              src={url}
                              alt=""
                              className="w-20 h-20 object-cover rounded-[var(--md-sys-shape-small)]"
                            />
                            <button
                              type="button"
                              onClick={() => setMemoImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--md-sys-color-error,#B3261E)] text-white rounded-full flex items-center justify-center text-xs leading-none"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {memoImages.length < 5 && (
                          <button
                            type="button"
                            onClick={() => memoImageInputRef.current?.click()}
                            disabled={uploadingImage}
                            className="w-20 h-20 border-2 border-dashed border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] flex flex-col items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--portal-primary)] transition-colors disabled:opacity-50"
                          >
                            {uploadingImage ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-xs mt-1">追加</span>
                              </>
                            )}
                          </button>
                        )}
                        <input
                          ref={memoImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          onChange={handleMemoImageUpload}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        disabled={submittingMemo || !memoForm.title}
                        loading={submittingMemo}
                      >
                        {submittingMemo ? '登録中...' : '登録する'}
                      </Button>
                      <Button
                        type="button"
                        variant="tonal"
                        onClick={() => {
                          setShowMemoForm(false)
                          setMemoForm({ title: '', description: '' })
                          setMemoImages([])
                        }}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              {/* メモ一覧 */}
              {memosLoading ? (
                <div className="py-8">
                  <LoadingSpinner size="md" label="読み込み中..." className="justify-center" />
                </div>
              ) : memos.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                  title="買取トライがありません"
                  description="「メモを追加」から買取を検討しているものを登録しましょう"
                />
              ) : (
                <div className="space-y-6">
                  {activeMemos.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3 uppercase tracking-wide">
                        対応中 ({activeMemos.length})
                      </h3>
                      <div className="space-y-3">
                        {activeMemos.map(memo => (
                          <MemoCard key={memo.id} memo={memo} onDelete={handleDeleteMemo} onAiAppraisal={handleAiAppraisal} isAppraising={apprasingMemoId === memo.id} appraisalDisabled={apprasingMemoId !== null || (aiAppraisalRemaining !== null && aiAppraisalRemaining <= 0)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {completedMemos.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] mb-3 uppercase tracking-wide">
                        対応完了 ({completedMemos.length})
                      </h3>
                      <div className="space-y-3 opacity-70">
                        {completedMemos.map(memo => (
                          <MemoCard key={memo.id} memo={memo} onDelete={handleDeleteMemo} onAiAppraisal={handleAiAppraisal} isAppraising={apprasingMemoId === memo.id} appraisalDisabled={apprasingMemoId !== null || (aiAppraisalRemaining !== null && aiAppraisalRemaining <= 0)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {memosHasMore && (
                    <div className="flex justify-center py-4">
                      <Button
                        variant="tonal"
                        onClick={loadMoreMemos}
                        loading={memosLoadingMore}
                        disabled={memosLoadingMore}
                      >
                        {memosLoadingMore ? '読み込み中...' : `もっと読み込む（${memos.length} / ${memosTotal}件）`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── 送付履歴タブ（宅配顧客のみ） ─── */}
          {activeTab === 'shipments' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">送付履歴</h2>
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">月ごとに段ボールを送付してください（月1回）</p>
                </div>
                {(() => {
                  const now = new Date()
                  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                  const alreadyRegistered = shipments.some(s => s.shipmentMonth === currentMonth)
                  return !alreadyRegistered && (
                    <div className="flex-shrink-0">
                      <Button size="sm" onClick={() => { setShowShipmentForm(v => !v); setMessage(null) }}>
                        {showShipmentForm ? 'キャンセル' : '今月の送付を登録'}
                      </Button>
                    </div>
                  )
                })()}
              </div>

              {/* 送付登録フォーム */}
              {showShipmentForm && (
                <Card variant="elevated" padding="md">
                  <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-4">今月の送付を登録</h3>
                  <form onSubmit={handleSubmitShipment} className="space-y-4">
                    <TextField
                      label="内容メモ（任意）"
                      value={shipmentForm.description}
                      onChange={v => setShipmentForm({ description: v })}
                      placeholder="例：ブランドバッグ2点、時計1点など"
                      rows={3}
                    />
                    {/* 画像アップロード */}
                    <div>
                      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2">
                        写真（JPEG・PNG・WebP・HEIC、各10MB以下、最大5枚）
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {shipmentImages.map((url, i) => (
                          <div key={i} className="relative w-20 h-20">
                            <img src={url} alt="" className="w-20 h-20 object-cover rounded-[var(--md-sys-shape-small)]" />
                            <button
                              type="button"
                              onClick={() => setShipmentImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--md-sys-color-error,#B3261E)] text-white rounded-full flex items-center justify-center text-xs leading-none"
                            >×</button>
                          </div>
                        ))}
                        {shipmentImages.length < 5 && (
                          <button
                            type="button"
                            onClick={() => shipmentImageInputRef.current?.click()}
                            disabled={uploadingShipmentImage}
                            className="w-20 h-20 border-2 border-dashed border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] flex flex-col items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--portal-primary)] transition-colors disabled:opacity-50"
                          >
                            {uploadingShipmentImage ? <LoadingSpinner size="sm" /> : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-xs mt-1">追加</span>
                              </>
                            )}
                          </button>
                        )}
                        <input
                          ref={shipmentImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          onChange={handleShipmentImageUpload}
                          className="hidden"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button type="submit" disabled={submittingShipment} loading={submittingShipment}>
                        {submittingShipment ? '登録中...' : '登録する'}
                      </Button>
                      <Button type="button" variant="tonal" onClick={() => { setShowShipmentForm(false); setShipmentForm({ description: '' }); setShipmentImages([]) }}>
                        キャンセル
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              {/* 送付一覧 */}
              {shipmentsLoading ? (
                <div className="py-8">
                  <LoadingSpinner size="md" label="読み込み中..." className="justify-center" />
                </div>
              ) : shipments.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  }
                  title="送付履歴がありません"
                  description="今月の送付を登録してから段ボールをお送りください"
                />
              ) : (
                <div className="space-y-3">
                  {shipments.map(s => (
                    <ShipmentCard
                      key={s.id}
                      shipment={s}
                      updating={updatingShipmentId === s.id}
                      onMarkShipped={handleMarkShipped}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Profile tab ─── */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* メニューカード */}
              <Card variant="elevated" padding="none">
                <div className="divide-y divide-gray-100">
                  {[
                    { key: 'id-document', label: '身分証明書', sub: user.idDocumentPath ? '提出済み' : '未提出', icon: '🪪', color: user.idDocumentPath ? 'text-green-600' : 'text-red-500' },
                    { key: 'password', label: 'パスワード変更', sub: 'セキュリティ設定', icon: '🔒', color: 'text-gray-600' },
                    { key: 'bank-account', label: '口座情報', sub: user.bankName ? `${user.bankName} ${user.branchName || ''}` : '未登録', icon: '🏦', color: user.bankName ? 'text-green-600' : 'text-amber-500' },
                    { key: '_logout', label: 'ログアウト', sub: '', icon: '🚪', color: 'text-gray-400' },
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => item.key === '_logout' ? (confirm('ログアウトしますか？') && signOut({ callbackUrl: '/login' })) : handleTabChange(item.key)}
                      className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left ${item.key === '_logout' ? 'text-red-500' : ''}`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.label}</p>
                        <p className={`text-xs ${item.color}`}>{item.sub}</p>
                      </div>
                      <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </Card>

              <Card variant="elevated" padding="md">
                <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-6">
                  プロフィール編集
                </h2>
              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label="氏名"
                    value={editForm.name}
                    onChange={(val) => setEditForm({ ...editForm, name: val })}
                    required
                  />
                  <TextField
                    label="ふりがな"
                    value={editForm.furigana}
                    onChange={(val) => setEditForm({ ...editForm, furigana: val })}
                    required
                  />
                </div>

                <TextField
                  label="メールアドレス"
                  type="email"
                  value={user.email}
                  onChange={() => {}}
                  disabled
                  helper="メールアドレスは変更できません"
                />

                <TextField
                  label="電話番号"
                  type="tel"
                  value={editForm.phone}
                  onChange={(val) => setEditForm({ ...editForm, phone: val })}
                  required
                />

                <TextField
                  label="訪問先住所"
                  value={editForm.address}
                  onChange={(val) => setEditForm({ ...editForm, address: val })}
                  required
                />

                <TextField
                  label="ライセンスキー"
                  value={user.licenseKey.key}
                  onChange={() => {}}
                  disabled
                />

                <Button
                  type="submit"
                  disabled={saving}
                  loading={saving}
                  size="lg"
                >
                  {saving ? '保存中...' : '保存する'}
                </Button>
              </form>
            </Card>
            </div>
          )}

          {/* ─── Password tab ─── */}
          {activeTab === 'password' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-6">
                パスワード変更
              </h2>
              <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
                <TextField
                  label="現在のパスワード"
                  type="password"
                  value={pwForm.current}
                  onChange={(val) => setPwForm({ ...pwForm, current: val })}
                  required
                />
                <TextField
                  label="新しいパスワード"
                  type="password"
                  value={pwForm.next}
                  onChange={(val) => setPwForm({ ...pwForm, next: val })}
                  required
                  placeholder="8文字以上"
                />
                <TextField
                  label="新しいパスワード（確認）"
                  type="password"
                  value={pwForm.confirm}
                  onChange={(val) => setPwForm({ ...pwForm, confirm: val })}
                  required
                />
                <Button
                  type="submit"
                  disabled={saving}
                  loading={saving}
                  size="lg"
                >
                  {saving ? '変更中...' : 'パスワードを変更'}
                </Button>
              </form>
            </Card>
          )}

          {/* ─── ID Document tab ─── */}
          {activeTab === 'id-document' && (
            <div className="space-y-5">

              {/* OCR読み取り結果セクション（提出済みの場合のみ） */}
              {user.idDocumentPath && (
                <Card variant="outlined" padding="md">

                  {/* ── スキャン中アニメーション ── */}
                  {reOcrLoading ? (
                    <OcrScanningAnimation label="再読み取り中..." />
                  ) : (
                  <>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                      自動読み取り結果
                      {user.idDocumentType && (
                        <span className="ml-2 text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">
                          （{user.idDocumentType}）
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={handleReOcr}
                        disabled={reOcrLoading}
                        className="text-xs px-3 py-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        再読み取り
                      </button>
                      <button
                        onClick={() => {
                          setShowReportForm(v => !v)
                          if (!showReportForm) setReportText(user.idOcrIssueReport ?? '')
                        }}
                        className="text-xs px-3 py-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                      >
                        {showReportForm ? 'キャンセル' : '誤りを報告'}
                      </button>
                      <button
                        onClick={() => { setConfirmDeleteDoc(v => !v); setShowReportForm(false) }}
                        className="text-xs px-3 py-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-error,#B3261E)] text-[var(--md-sys-color-error,#B3261E)] hover:bg-red-50 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {confirmDeleteDoc ? 'キャンセル' : '削除'}
                      </button>
                    </div>
                  </div>

                  {/* 削除確認エリア */}
                  {confirmDeleteDoc && (
                    <div className="mb-4 p-3 rounded-[var(--md-sys-shape-small)] bg-red-50 border border-red-200">
                      <p className="text-sm font-medium text-red-800 mb-1">身分証明書を削除しますか？</p>
                      <p className="text-xs text-red-600 mb-3">ファイルと読み取り情報がすべて削除されます。この操作は取り消せません。</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteIdDocument}
                          disabled={deletingDoc}
                          className="text-xs px-4 py-1.5 bg-red-600 text-white rounded-[var(--md-sys-shape-small)] hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {deletingDoc ? '削除中...' : '削除する'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteDoc(false)}
                          disabled={deletingDoc}
                          className="text-xs px-4 py-1.5 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}

                  {/* OCRデータ表示 */}
                  {(user.idName || user.idBirthDate || user.idAddress || user.idLicenseNumber || user.idExpiryDate) ? (
                    <dl className="space-y-2.5 mb-4">
                      {[
                        { label: '氏名（証明書）', value: user.idName },
                        { label: '生年月日',       value: user.idBirthDate },
                        { label: '住所（証明書）', value: user.idAddress },
                        { label: '証明書番号',     value: user.idLicenseNumber },
                        { label: '有効期限',       value: user.idExpiryDate },
                      ].filter(item => item.value).map(item => (
                        <div key={item.label} className="flex gap-3">
                          <dt className="w-28 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 pt-0.5">{item.label}</dt>
                          <dd className="text-sm text-[var(--md-sys-color-on-surface)]">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="flex items-center gap-2 mb-4 py-2 text-[var(--md-sys-color-on-surface-variant)]">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-sm">自動読み取りデータがありません。「再読み取り」をお試しください。</p>
                    </div>
                  )}

                  {/* 誤り報告フォーム */}
                  {showReportForm && (
                    <form onSubmit={handleSubmitIssueReport} className="border-t border-[var(--md-sys-color-outline-variant)] pt-4 mt-2 space-y-3">
                      <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">
                        読み取り内容の誤りをご報告ください（担当スタッフが確認します）
                      </p>
                      <textarea
                        value={reportText}
                        onChange={e => setReportText(e.target.value)}
                        rows={3}
                        required
                        placeholder="例：生年月日が間違っています。正しくは1985年3月15日です。"
                        className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2 bg-[var(--md-sys-color-surface)] focus:outline-none focus:border-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={savingReport || !reportText.trim()}
                          className="text-sm px-4 py-2 bg-[var(--portal-primary,#B91C1C)] text-white rounded-[var(--md-sys-shape-small)] hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {savingReport ? '送信中...' : '報告を送信'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 既存の報告内容（フォーム非表示時） */}
                  {user.idOcrIssueReport && !showReportForm && (
                    <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-3 mt-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <svg className="w-3.5 h-3.5 text-[var(--md-sys-color-error,#B3261E)]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-medium text-[var(--md-sys-color-error,#B3261E)]">誤り報告済み（スタッフ確認待ち）</span>
                      </div>
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap pl-5">{user.idOcrIssueReport}</p>
                    </div>
                  )}
                  </>
                  )}
                </Card>
              )}

              {/* アップロードセクション */}
              <Card variant="elevated" padding="md">
                {/* アップロード＋OCR処理中アニメーション */}
                {uploadingDoc ? (
                  <OcrScanningAnimation label="アップロード・読み取り中..." />
                ) : (
                <>
                <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                  {user.idDocumentPath ? '身分証明書を再アップロード' : '身分証明書のアップロード'}
                </h2>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 leading-relaxed">
                  運転免許証、マイナンバーカード、パスポートなどをアップロードしてください。<br />
                  対応形式：JPEG、PNG、WebP、PDF（最大10MB）
                </p>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="
                    border-2 border-dashed border-[var(--md-sys-color-outline-variant)]
                    rounded-[var(--md-sys-shape-medium)] p-10 text-center cursor-pointer
                    hover:border-[var(--portal-primary,#B91C1C)] hover:bg-[var(--md-sys-color-surface-container-low)]
                    transition-colors mb-5
                  "
                >
                  <div className="w-14 h-14 bg-[var(--md-sys-color-surface-container-high)] rounded-[var(--md-sys-shape-medium)] flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                    クリックしてファイルを選択
                  </p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    アップロードすると自動で情報を読み取ります
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleUploadIdDocument}
                    className="hidden"
                  />
                </div>

                {user.idDocumentPath ? (
                  <MessageBanner severity="success">
                    <p className="font-medium">身分証明書が提出されています</p>
                    <p className="text-xs mt-0.5 opacity-80">新しいファイルをアップロードすると更新・再読み取りされます</p>
                  </MessageBanner>
                ) : (
                  <MessageBanner severity="warning">
                    <p className="font-medium">身分証明書が未提出です</p>
                    <p className="text-xs mt-0.5 opacity-80">サービス開始前に提出が必要です</p>
                  </MessageBanner>
                )}
                </>
                )}
              </Card>
            </div>
          )}

          {/* ─── 口座情報タブ ─── */}
          {activeTab === 'bank-account' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">振込先口座情報</h2>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-6">
                買取金額のお振込み先をご登録ください。
              </p>
              <form onSubmit={handleSaveBank} className="space-y-5 max-w-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label="銀行名"
                    value={bankForm.bankName}
                    onChange={v => setBankForm(f => ({ ...f, bankName: v }))}
                    placeholder="例：〇〇銀行"
                  />
                  <TextField
                    label="支店名"
                    value={bankForm.branchName}
                    onChange={v => setBankForm(f => ({ ...f, branchName: v }))}
                    placeholder="例：〇〇支店"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">口座種別</label>
                  <select
                    value={bankForm.accountType}
                    onChange={e => setBankForm(f => ({ ...f, accountType: e.target.value }))}
                    className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2.5 bg-[var(--md-sys-color-surface)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface)]"
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
                  type="text"
                />
                <TextField
                  label="口座名義"
                  value={bankForm.accountHolder}
                  onChange={v => setBankForm(f => ({ ...f, accountHolder: v }))}
                  placeholder="例：ヤマダ タロウ"
                />
                <Button type="submit" disabled={savingBank} loading={savingBank} size="lg">
                  {savingBank ? '保存中...' : '保存する'}
                </Button>
              </form>
            </Card>
          )}

          {/* ─── Visit Request tab ─── */}
          {activeTab === 'visit-request' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">訪問リクエスト</h2>
                  <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">希望日時を送信して訪問を依頼しましょう</p>
                </div>
                <div className="flex-shrink-0">
                  <Button size="sm" onClick={() => { setShowRequestForm(v => !v); setRequestMsg(null) }}>
                    {showRequestForm ? 'キャンセル' : '+ 新しい訪問リクエスト'}
                  </Button>
                </div>
              </div>

              {requestMsg && (
                <MessageBanner severity={requestMsg.type} dismissible onDismiss={() => setRequestMsg(null)}>
                  {requestMsg.text}
                </MessageBanner>
              )}

              {/* リクエストフォーム（カレンダー+2時間枠） */}
              {showRequestForm && (
                <VisitRequestCalendarForm
                  requestForm={requestForm}
                  setRequestForm={setRequestForm}
                  onSubmit={handleSubmitRequest}
                  submitting={requestSubmitting}
                  onCancel={() => setShowRequestForm(false)}
                />
              )}

              {/* リクエスト一覧 */}
              {!visitRequestsLoaded ? (
                <div className="py-8">
                  <LoadingSpinner size="md" label="読み込み中..." className="justify-center" />
                </div>
              ) : visitRequests.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  title="訪問リクエストがありません"
                  description="「新しい訪問リクエスト」から希望日時を送信しましょう"
                />
              ) : (
                <div className="space-y-3">
                  {visitRequests.map(req => {
                    const statusMap: Record<string, { color: string; label: string }> = {
                      pending:            { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', label: '待機中' },
                      approved:           { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: '承認済み' },
                      counter_proposed:   { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', label: '日程変更の提案あり' },
                      customer_accepted:  { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: '確定' },
                      customer_declined:  { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', label: '辞退' },
                      cancelled:          { color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', label: 'キャンセル' },
                    }
                    const st = statusMap[req.status] || { color: 'bg-gray-100 text-gray-600', label: req.status }
                    const fmtDate = (d: string | null) => d ? format(new Date(d), 'M/d（E）', { locale: ja }) : '-'
                    const fmtTime = (s: string | null, e: string | null) => {
                      if (!s && !e) return ''
                      return ` ${s || '?'}〜${e || '?'}`
                    }
                    return (
                      <Card key={req.id} variant="outlined" padding="md">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {format(new Date(req.createdAt), 'yyyy/M/d', { locale: ja })}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-[var(--md-sys-color-on-surface-variant)]">第1希望:</span> {fmtDate(req.candidate1Date)}{fmtTime(req.candidate1Start, req.candidate1End)}</p>
                          {req.candidate2Date && <p><span className="text-[var(--md-sys-color-on-surface-variant)]">第2希望:</span> {fmtDate(req.candidate2Date)}{fmtTime(req.candidate2Start, req.candidate2End)}</p>}
                          {req.candidate3Date && <p><span className="text-[var(--md-sys-color-on-surface-variant)]">第3希望:</span> {fmtDate(req.candidate3Date)}{fmtTime(req.candidate3Start, req.candidate3End)}</p>}
                        </div>

                        {/* カウンター提案 */}
                        {req.status === 'counter_proposed' && req.counterDate && (
                          <div className="mt-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                            <p className="text-xs font-bold text-yellow-800 dark:text-yellow-300 mb-1">店舗からの日程提案</p>
                            <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                              {fmtDate(req.counterDate)}{fmtTime(req.counterStart, req.counterEnd)}
                            </p>
                            {req.storeNote && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">{req.storeNote}</p>}
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" onClick={() => handleRequestAction(req.id, 'accept_counter')}>承認する</Button>
                              <Button size="sm" variant="tonal" onClick={() => handleRequestAction(req.id, 'decline_counter')}>辞退する</Button>
                            </div>
                          </div>
                        )}

                        {req.customerNote && (
                          <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            <span className="font-medium">備考:</span> {req.customerNote}
                          </p>
                        )}
                        {req.storeNote && req.status !== 'counter_proposed' && (
                          <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            <span className="font-medium">店舗メモ:</span> {req.storeNote}
                          </p>
                        )}

                        {/* キャンセルボタン */}
                        {(req.status === 'pending' || req.status === 'counter_proposed') && (
                          <div className="mt-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                            <Button size="sm" variant="text" onClick={() => { if (confirm('このリクエストをキャンセルしますか？')) handleRequestAction(req.id, 'cancel') }}>
                              キャンセル
                            </Button>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Visit History tab ─── */}
          {activeTab === 'history' && (
            <Card variant="elevated" padding="md">
              <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                訪問履歴
              </h2>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-6">
                担当店舗による訪問のスケジュール履歴です
              </p>

              {visitsLoading ? (
                <div className="py-12">
                  <LoadingSpinner size="md" label="読み込み中..." className="justify-center" />
                </div>
              ) : visits.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  title="訪問履歴がありません"
                  description="訪問スケジュールが登録されると表示されます"
                />
              ) : (
                <div className="space-y-0">
                  {visits.map((visit, i) => (
                    <div
                      key={visit.id}
                      className={`
                        flex items-start gap-4 py-4
                        ${i < visits.length - 1 ? 'border-b border-[var(--md-sys-color-outline-variant)]' : ''}
                      `}
                    >
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className={`
                            w-9 h-9 rounded-[var(--md-sys-shape-small)] flex items-center justify-center
                            ${visit.status === 'completed'
                              ? 'bg-[var(--status-completed-bg)]'
                              : visit.status === 'cancelled'
                                ? 'bg-[var(--md-sys-color-surface-container-high)]'
                                : 'bg-[var(--status-scheduled-bg)]'
                            }
                          `}
                        >
                          {visit.status === 'completed' ? (
                            <svg className="w-4 h-4 text-[var(--status-completed-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : visit.status === 'cancelled' ? (
                            <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-[var(--status-scheduled-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                            {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                          </span>
                          <StatusBadge status={visit.status as Status} />
                        </div>
                        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                          {visit.store.name}
                        </p>
                        {visit.note && (
                          <p className="text-xs text-[var(--md-sys-color-outline)] mt-0.5">
                            {visit.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {visitsHasMore && (
                    <div className="flex justify-center py-4">
                      <Button
                        variant="tonal"
                        onClick={loadMoreVisits}
                        loading={visitsLoadingMore}
                        disabled={visitsLoadingMore}
                      >
                        {visitsLoadingMore ? '読み込み中...' : `もっと読み込む（${visits.length} / ${visitsTotal}件）`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── OcrScanningAnimation ───

function OcrScanningAnimation({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-5 select-none">
      <style>{`
        @keyframes ocr-scan {
          0%   { top: 4px; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: calc(100% - 4px); opacity: 0; }
        }
        @keyframes ocr-glow {
          0%   { top: 4px; }
          100% { top: calc(100% - 4px); }
        }
        @keyframes ocr-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes ocr-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1.2); opacity: 1; }
        }
        @keyframes ocr-line-flash {
          0%, 100% { opacity: 0.25; }
          50%       { opacity: 0.7; }
        }
      `}</style>

      {/* ドキュメントアイコン + スキャンビーム */}
      <div className="relative" style={{ width: 80, height: 104 }}>
        {/* 台紙（影） */}
        <div
          className="absolute inset-0 rounded-[6px]"
          style={{ background: 'var(--md-sys-color-surface-container-highest, #E6E1E5)', transform: 'translate(3px, 4px)' }}
        />
        {/* 本体 */}
        <div
          className="absolute inset-0 rounded-[6px] overflow-hidden"
          style={{ background: 'var(--md-sys-color-surface, #FFFBFE)', border: '1.5px solid var(--md-sys-color-outline-variant)' }}
        >
          {/* 折り返し角 */}
          <div
            className="absolute top-0 right-0 w-5 h-5"
            style={{
              background: 'var(--md-sys-color-surface-container-high, #ECE6F0)',
              clipPath: 'polygon(0 0, 100% 100%, 100% 0)',
            }}
          />

          {/* テキスト行（シマー付き） */}
          {[
            { top: 18, width: '72%' },
            { top: 30, width: '58%' },
            { top: 44, width: '80%' },
            { top: 56, width: '65%' },
            { top: 68, width: '75%' },
            { top: 80, width: '50%' },
          ].map((line, i) => (
            <div
              key={i}
              className="absolute left-3 h-[5px] rounded-full overflow-hidden"
              style={{
                top: line.top,
                width: line.width,
                background: 'var(--md-sys-color-outline-variant, #CAC4D0)',
                animation: `ocr-line-flash ${1.4 + i * 0.15}s ease-in-out ${i * 0.1}s infinite`,
              }}
            >
              {/* シマー */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
                  animation: `ocr-shimmer 1.8s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            </div>
          ))}

          {/* スキャンビーム（グロー） */}
          <div
            className="absolute left-0 right-0"
            style={{
              height: 16,
              background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--portal-primary, #B91C1C) 20%, transparent), transparent)',
              animation: 'ocr-glow 1.6s cubic-bezier(0.4,0,0.6,1) infinite alternate',
              pointerEvents: 'none',
            }}
          />
          {/* スキャンライン本体 */}
          <div
            className="absolute left-0 right-0"
            style={{
              height: 2,
              background: 'var(--portal-primary, #B91C1C)',
              boxShadow: '0 0 6px 2px color-mix(in srgb, var(--portal-primary, #B91C1C) 60%, transparent)',
              animation: 'ocr-scan 1.6s cubic-bezier(0.4,0,0.6,1) infinite alternate',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* ラベル */}
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
          {label}
        </p>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          AIが身分証の情報を解析しています
        </p>
      </div>

      {/* バウンスドット */}
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: 'var(--portal-primary, #B91C1C)',
              animation: `ocr-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── MemoCard サブコンポーネント ───

const MEMO_STATUS_LABEL: Record<string, string> = {
  pending: '未確認',
  reviewed: '確認済み',
  completed: '対応完了',
}

const MEMO_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  reviewed: 'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
}

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  registered: '登録済み',
  shipped:    '発送済み',
  received:   '受取済み',
  appraised:  '査定完了',
}

const SHIPMENT_STATUS_STYLE: Record<string, string> = {
  registered: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  shipped:    'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  received:   'bg-[var(--status-scheduled-bg,#DBEAFE)] text-[var(--status-scheduled-text,#1D4ED8)]',
  appraised:  'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
}

function ShipmentCard({
  shipment,
  updating,
  onMarkShipped,
}: {
  shipment: DeliveryShipment
  updating: boolean
  onMarkShipped: (id: string) => void
}) {
  const [showImages, setShowImages] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const total = shipment.imageUrls.length

  useEffect(() => {
    if (lightboxIndex === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setLightboxIndex(null) }
      if (e.key === 'ArrowRight') { setLightboxIndex(i => i !== null ? Math.min(i + 1, total - 1) : null) }
      if (e.key === 'ArrowLeft')  { setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex, total])

  useEffect(() => {
    if (lightboxIndex !== null) { document.body.style.overflow = 'hidden' }
    else { document.body.style.overflow = '' }
    return () => { document.body.style.overflow = '' }
  }, [lightboxIndex])

  return (
    <>
    <Card variant="outlined" padding="md">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono font-semibold text-[var(--md-sys-color-on-surface)]">
          {shipment.shipmentNumber}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SHIPMENT_STATUS_STYLE[shipment.status] ?? ''}`}>
          {SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}
        </span>
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {shipment.shipmentMonth.replace('-', '年')}月
        </span>
      </div>
      <div className="mt-1.5">
        {shipment.description && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap">
            {shipment.description}
          </p>
        )}
        {shipment.purchaseAmount !== null && (
          <p className="text-sm font-semibold text-[var(--portal-primary,#B91C1C)] mt-1">
            査定額: ¥{shipment.purchaseAmount.toLocaleString()}
          </p>
        )}
        {shipment.storeNote && (
          <div className="mt-2 px-3 py-2 bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)]">
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-0.5">店舗からのメモ</p>
            <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{shipment.storeNote}</p>
          </div>
        )}
      </div>

      {shipment.status === 'registered' && (
        <div className="mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">
            段ボールを発送したら、店舗へ報告してください
          </p>
          <button
            onClick={() => onMarkShipped(shipment.id)}
            disabled={updating}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--md-sys-shape-small)] bg-[var(--portal-primary,#B91C1C)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {updating ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12v4m4-4v4" />
              </svg>
            )}
            {updating ? '更新中...' : '発送完了を報告する'}
          </button>
        </div>
      )}

      {total > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowImages(v => !v)}
            className="text-xs text-[var(--portal-primary)] hover:underline"
          >
            {showImages ? '画像を非表示' : `画像を見る（${total}枚）`}
          </button>
          {showImages && (
            <div className="flex flex-wrap gap-2 mt-2">
              {shipment.imageUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative w-24 h-24 rounded-[var(--md-sys-shape-small)] overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]"
                >
                  <img src={url} alt={`画像 ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
                    <svg className="w-6 h-6 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0zm-2 0a4 4 0 10-8 0 4 4 0 008 0z" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>

    {lightboxIndex !== null && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85"
        onClick={() => setLightboxIndex(null)}
      >
        <button
          onClick={() => setLightboxIndex(null)}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
          aria-label="閉じる"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {lightboxIndex > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
            aria-label="前の画像"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {lightboxIndex < total - 1 && (
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
            aria-label="次の画像"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <img
            src={shipment.imageUrls[lightboxIndex]}
            alt={`画像 ${lightboxIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
        {total > 1 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {shipment.imageUrls.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setLightboxIndex(i) }}
                className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/70'}`}
                aria-label={`${i + 1}枚目`}
              />
            ))}
          </div>
        )}
      </div>
    )}
  </>
  )
}

function MemoCard({
  memo,
  onDelete,
  onAiAppraisal,
  isAppraising,
  appraisalDisabled,
}: {
  memo: PurchaseMemo
  onDelete: (id: string) => void
  onAiAppraisal: (id: string) => void
  isAppraising: boolean
  appraisalDisabled: boolean
}) {
  const [showImages, setShowImages] = useState(false)
  const [showAppraisal, setShowAppraisal] = useState(!!memo.aiAppraisal)
  // ライトボックス: null=閉じている / number=表示中の画像インデックス
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const total = memo.imageUrls.length

  // キーボード操作（Esc・←→）
  useEffect(() => {
    if (lightboxIndex === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setLightboxIndex(null) }
      if (e.key === 'ArrowRight') { setLightboxIndex(i => i !== null ? Math.min(i + 1, total - 1) : null) }
      if (e.key === 'ArrowLeft')  { setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex, total])

  // ライトボックスが開いている間、背景スクロールを無効化
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [lightboxIndex])

  return (
    <>
      <Card variant="outlined" padding="md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                {memo.title}
              </h4>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${MEMO_STATUS_STYLE[memo.status] ?? ''}`}
              >
                {MEMO_STATUS_LABEL[memo.status] ?? memo.status}
              </span>
            </div>
            {memo.description && (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">
                {memo.description}
              </p>
            )}
            {memo.storeNote && (
              <div className="mt-2 px-3 py-2 bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)]">
                <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-0.5">
                  店舗からのメモ
                </p>
                <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">
                  {memo.storeNote}
                </p>
              </div>
            )}
            <p className="text-xs text-[var(--md-sys-color-outline)] mt-2">
              {format(new Date(memo.createdAt), 'yyyy年M月d日', { locale: ja })}
            </p>
          </div>
          {memo.status === 'pending' && (
            <button
              onClick={() => onDelete(memo.id)}
              className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error,#B3261E)] flex-shrink-0 px-2 py-1"
            >
              削除
            </button>
          )}
        </div>

        {total > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {memo.imageUrls.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="relative w-20 h-20 rounded-lg overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]"
              >
                <img src={url} alt={`画像 ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* ─── AI査定セクション ─── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {memo.aiAppraisal ? (
            <button
              onClick={() => setShowAppraisal(v => !v)}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:from-purple-600 hover:to-blue-600 transition-all shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {showAppraisal ? 'AI査定結果を閉じる' : 'AI査定結果を見る'}
            </button>
          ) : (
            <button
              onClick={() => onAiAppraisal(memo.id)}
              disabled={isAppraising || appraisalDisabled}
              className="text-xs font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white px-3 py-1.5 rounded-full hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isAppraising ? (
                <>
                  <LoadingSpinner size="sm" />
                  AI査定中...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI査定する
                </>
              )}
            </button>
          )}
          {memo.aiAppraisal && !showAppraisal && memo.aiAppraisalAt && (
            <span className="text-xs text-[var(--md-sys-color-outline)]">
              ({format(new Date(memo.aiAppraisalAt), 'M/d実施', { locale: ja })})
            </span>
          )}
          {memo.aiAppraisal && (
            <button
              onClick={() => onAiAppraisal(memo.id)}
              disabled={isAppraising || appraisalDisabled}
              className="text-xs text-[var(--md-sys-color-outline)] hover:text-[var(--portal-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAppraising ? '査定中...' : '再査定'}
            </button>
          )}
        </div>

        {/* AI査定結果表示 */}
        {memo.aiAppraisal && showAppraisal && (
          <div className="mt-3 rounded-xl overflow-hidden border border-purple-300/40 dark:border-purple-700/40">
            {/* ヘッダー */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm font-bold text-white">AI査定結果</span>
              </div>
              {memo.aiAppraisalAt && (
                <span className="text-xs text-white/70">
                  {format(new Date(memo.aiAppraisalAt), 'yyyy/M/d HH:mm', { locale: ja })}
                </span>
              )}
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-[#1a1025] dark:to-[#0f1a2e] p-4 space-y-4">
              {/* 買取提示額（メイン） */}
              <div className="bg-white dark:bg-[#2a1f3d] rounded-lg p-4 text-center shadow-sm">
                <p className="text-xs font-medium text-purple-600 dark:text-purple-300 mb-1">買取提示額（税込）</p>
                <p className="text-3xl font-extrabold text-purple-600 dark:text-purple-300">
                  {memo.aiAppraisal.offerPrice}
                </p>
              </div>

              {/* 商品詳細 */}
              <div className="bg-white/60 dark:bg-white/10 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">商品詳細</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{memo.aiAppraisal.productDetail}</p>
              </div>

              {/* 補足情報 */}
              {memo.aiAppraisal.supplement && (
                <div className="bg-white/60 dark:bg-white/10 rounded-lg p-3">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">補足情報</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{memo.aiAppraisal.supplement}</p>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
                ※ AIによる概算です。実際の買取金額は査定時に確定します。
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ─── ライトボックスモーダル ─── */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85"
          onClick={() => setLightboxIndex(null)}
        >
          {/* 閉じるボタン */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
            aria-label="閉じる"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* 前へ */}
          {lightboxIndex > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
              aria-label="前の画像"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* 次へ */}
          {lightboxIndex < total - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-10"
              aria-label="次の画像"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* 画像本体 */}
          <div
            className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={memo.imageUrls[lightboxIndex]}
              alt={`画像 ${lightboxIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* 枚数カウンター */}
          {total > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
              {memo.imageUrls.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setLightboxIndex(i) }}
                  className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/70'}`}
                  aria-label={`${i + 1}枚目`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** カレンダー+2時間枠で訪問リクエストを入力するフォーム */
function VisitRequestCalendarForm({
  requestForm, setRequestForm, onSubmit, submitting, onCancel,
}: {
  requestForm: any
  setRequestForm: (fn: (prev: any) => any) => void
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
  onCancel: () => void
}) {
  const [bizHours, setBizHours] = useState({ start: '10:00', end: '19:00', days: [0,1,2,3,4,5,6] })
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 1) // Monday
    d.setHours(0,0,0,0)
    return d
  })
  const [activeCandidate, setActiveCandidate] = useState(1)

  // 営業時間を取得
  useEffect(() => {
    fetch('/api/store/business-hours')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          let days = [0,1,2,3,4,5,6]
          try { days = JSON.parse(data.businessDays || '[0,1,2,3,4,5,6]') } catch {}
          setBizHours({ start: data.businessHoursStart || '10:00', end: data.businessHoursEnd || '19:00', days })
        }
      })
      .catch(() => {})
  }, [])

  // 2時間枠を生成
  const timeSlots = useMemo(() => {
    const slots: { start: string; end: string; label: string }[] = []
    const [sh, sm] = bizHours.start.split(':').map(Number)
    const [eh] = bizHours.end.split(':').map(Number)
    let h = sh, m = sm || 0
    while (h + 2 <= eh || (h + 2 === eh && m === 0)) {
      const startStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
      const endH = h + 2
      const endStr = `${String(endH).padStart(2,'0')}:${String(m).padStart(2,'0')}`
      slots.push({ start: startStr, end: endStr, label: `${startStr}〜${endStr}` })
      h += 2
    }
    return slots
  }, [bizHours])

  // 週の日付配列（7日分）
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [currentWeekStart])

  const today = new Date()
  today.setHours(0,0,0,0)
  const minDate = new Date(today)
  minDate.setDate(minDate.getDate() + 2) // 2日後以降のみ選択可能

  const dayLabels = ['日','月','火','水','木','金','土']

  // 選択済みスロットをマッピング
  const selectedSlots = new Map<string, number>()
  for (let n = 1; n <= 3; n++) {
    const d = (requestForm as any)[`candidate${n}Date`]
    const s = (requestForm as any)[`candidate${n}Start`]
    if (d && s) selectedSlots.set(`${d}_${s}`, n)
  }

  function handleSlotClick(dateStr: string, slot: { start: string; end: string }) {
    const key = `${dateStr}_${slot.start}`
    // Already selected → deselect
    const existingN = selectedSlots.get(key)
    if (existingN) {
      setRequestForm(prev => ({
        ...prev,
        [`candidate${existingN}Date`]: '',
        [`candidate${existingN}Start`]: '',
        [`candidate${existingN}End`]: '',
      }))
      return
    }
    // Set to active candidate
    setRequestForm(prev => ({
      ...prev,
      [`candidate${activeCandidate}Date`]: dateStr,
      [`candidate${activeCandidate}Start`]: slot.start,
      [`candidate${activeCandidate}End`]: slot.end,
    }))
    // Auto-advance to next empty candidate
    if (activeCandidate < 3) setActiveCandidate(activeCandidate + 1)
  }

  function formatDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const candidateColors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500']
  const candidateLabels = ['第1希望', '第2希望', '第3希望']

  return (
    <Card variant="elevated" padding="md">
      <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-1">カレンダーから日時を選択</h3>
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">希望の日時枠をタップしてください（最大3つまで）</p>

      {/* 候補タブ */}
      <div className="flex gap-2 mb-4">
        {[1,2,3].map(n => {
          const hasValue = !!(requestForm as any)[`candidate${n}Date`]
          return (
            <button
              key={n}
              type="button"
              onClick={() => setActiveCandidate(n)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${activeCandidate === n
                  ? `${candidateColors[n-1]} text-white shadow-sm`
                  : hasValue
                    ? `bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] ring-2 ring-offset-1 ${n===1?'ring-blue-400':n===2?'ring-green-400':'ring-orange-400'}`
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]'
                }
              `}
            >
              {candidateLabels[n-1]}
              {hasValue && <span>✓</span>}
            </button>
          )
        })}
      </div>

      {/* 週ナビゲーション */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCurrentWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })}
          className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        >
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
          {currentWeekStart.getMonth()+1}月{currentWeekStart.getDate()}日 〜 {weekDays[6].getMonth()+1}月{weekDays[6].getDate()}日
        </p>
        <button
          type="button"
          onClick={() => setCurrentWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })}
          className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        >
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* カレンダーグリッド */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="grid grid-cols-[60px_repeat(7,minmax(80px,1fr))] gap-px bg-[var(--md-sys-color-outline-variant)] rounded-lg overflow-hidden min-w-[640px]">
          {/* Header row */}
          <div className="bg-[var(--md-sys-color-surface-container)] p-2 text-[10px] text-[var(--md-sys-color-on-surface-variant)] font-medium" />
          {weekDays.map((day, i) => {
            const isToday = day.getTime() === today.getTime()
            const dow = day.getDay()
            const isBusinessDay = bizHours.days.includes(dow)
            return (
              <div key={i} className={`bg-[var(--md-sys-color-surface-container)] p-1.5 text-center ${!isBusinessDay ? 'opacity-40' : ''}`}>
                <p className={`text-[10px] ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                  {dayLabels[dow]}
                </p>
                <p className={`text-sm font-semibold ${isToday ? 'bg-[var(--portal-primary)] text-white w-7 h-7 rounded-full flex items-center justify-center mx-auto' : 'text-[var(--md-sys-color-on-surface)]'}`}>
                  {day.getDate()}
                </p>
              </div>
            )
          })}

          {/* Time slots */}
          {timeSlots.map(slot => (
            <Fragment key={slot.start}>
              <div className="bg-[var(--md-sys-color-surface)] p-1.5 flex items-center justify-center">
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{slot.label}</span>
              </div>
              {weekDays.map((day, di) => {
                const dateStr = formatDate(day)
                const isPast = day < minDate
                const dow = day.getDay()
                const isBusinessDay = bizHours.days.includes(dow)
                const isDisabled = isPast || !isBusinessDay
                const selectedN = selectedSlots.get(`${dateStr}_${slot.start}`)

                const activeBorderColor = activeCandidate === 1 ? 'border-blue-400' : activeCandidate === 2 ? 'border-green-400' : 'border-orange-400'
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && handleSlotClick(dateStr, slot)}
                    className={`
                      p-1.5 min-h-[48px] text-center transition-all rounded-md m-0.5
                      ${isDisabled
                        ? 'bg-[var(--md-sys-color-surface-container)] opacity-30 cursor-not-allowed'
                        : selectedN
                          ? `${candidateColors[selectedN-1]} text-white shadow-sm rounded-lg`
                          : `bg-[var(--md-sys-color-surface-container-low)] border-2 border-dashed ${activeBorderColor} border-opacity-40 hover:border-opacity-100 hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer active:scale-95`
                      }
                    `}
                  >
                    {selectedN ? (
                      <span className="text-[10px] font-bold">{candidateLabels[selectedN-1]}</span>
                    ) : !isDisabled ? (
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] opacity-50">＋</span>
                    ) : null}
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* 選択済み一覧 */}
      <div className="mt-4 space-y-1.5">
        {[1,2,3].map(n => {
          const d = (requestForm as any)[`candidate${n}Date`]
          const s = (requestForm as any)[`candidate${n}Start`]
          const e = (requestForm as any)[`candidate${n}End`]
          if (!d) return null
          const dt = new Date(d)
          return (
            <div key={n} className="flex items-center gap-2 text-sm text-[var(--md-sys-color-on-surface)]">
              <span className={`w-2 h-2 rounded-full ${candidateColors[n-1]}`} />
              <span className="font-medium">{candidateLabels[n-1]}:</span>
              <span>{dt.getMonth()+1}/{dt.getDate()}（{dayLabels[dt.getDay()]}）{s}〜{e}</span>
              <button type="button" onClick={() => setRequestForm(prev => ({ ...prev, [`candidate${n}Date`]: '', [`candidate${n}Start`]: '', [`candidate${n}End`]: '' }))}
                className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] ml-1">✕</button>
            </div>
          )
        })}
      </div>

      {/* 備考 + 送信 */}
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <TextField
          label="備考（任意）"
          value={requestForm.customerNote}
          onChange={(v: string) => setRequestForm((prev: any) => ({ ...prev, customerNote: v }))}
          placeholder="希望や注意事項があればご記入ください"
          rows={2}
        />
        <div className="flex gap-3">
          <Button type="submit" disabled={submitting || !requestForm.candidate1Date} loading={submitting}>
            {submitting ? '送信中...' : 'リクエストを送信'}
          </Button>
          <Button type="button" variant="tonal" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </form>
    </Card>
  )
}
