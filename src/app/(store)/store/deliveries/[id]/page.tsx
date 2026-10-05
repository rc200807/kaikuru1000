'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import MessageBanner from '@/components/MessageBanner'
import PurchaseItemManager, { type ManagedPurchaseItem, type PurchaseItemChange } from '@/components/store/PurchaseItemManager'
import DeliveryContractDocument from '@/components/delivery/DeliveryContractDocument'
import { useStoreMasters } from '@/components/store/StoreMastersContext'
import { formatYen } from '@/lib/currency'

/* ── 6-step timeline definition ── */
const STEPS = [
  { label: '発送準備', desc: '商品を梱包して写真を記録' },
  { label: '発送前準備', desc: '伝票を記入して写真を記録' },
  { label: '発送', desc: '発送完了を店舗に報告' },
  { label: '店舗受取確認', desc: '店舗が荷物を受け取り' },
  { label: '査定', desc: '査定結果を通知' },
  { label: '振込', desc: '代金のお振り込み' },
]

function getStepsDone(status: string): number {
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

/* ── Sub-status badges for steps 4-6 ── */
function getSubStatus(stepIdx: number, status: string): { label: string; cls: string } | null {
  if (stepIdx === 3) {
    // 店舗受取確認
    const done = getStepsDone(status) > 3
    return done
      ? { label: '受取完了', cls: 'bg-emerald-100 text-emerald-700' }
      : status === 'shipped'
        ? { label: '受取前', cls: 'bg-amber-100 text-amber-700' }
        : null
  }
  if (stepIdx === 4) {
    // 査定
    const done = getStepsDone(status) > 4
    return done
      ? { label: '査定完了', cls: 'bg-emerald-100 text-emerald-700' }
      : status === 'received'
        ? { label: '査定中', cls: 'bg-blue-100 text-blue-700' }
        : null
  }
  if (stepIdx === 5) {
    // 振込
    return status === 'transferred'
      ? { label: '振込完了', cls: 'bg-emerald-100 text-emerald-700' }
      : status === 'appraised'
        ? { label: '振込準備中', cls: 'bg-green-100 text-green-700' }
        : null
  }
  return null
}

const STATUS_LABEL: Record<string, string> = {
  registered: '登録済み',
  shipped: '発送済み',
  received: '査定中',
  appraised: '振込準備中',
  transferred: '振込完了',
}

type ShipmentDetail = {
  id: string
  shipmentNumber: string
  shipmentMonth: string
  description: string | null
  imageUrls: string[]
  trackingImageUrls: string[]
  purchaseAmount: number | null
  status: string
  storeNote: string | null
  createdAt: string
  updatedAt: string
  transferredAt: string | null
  user: {
    id: string
    name: string
    furigana: string
    phone: string
    email: string | null
    address: string | null
    idName: string | null
    idAddress: string | null
    idBackAddress: string | null
    birthDate: string | null
    idBirthDate: string | null
    occupation: string | null
    idDocumentType: string | null
    store: {
      id: string; name: string; address: string; phone: string
      antiquePermitNumber: string | null
      operator: { antiquePermitNumber: string | null } | null
    } | null
  }
  purchaseItems: ManagedPurchaseItem[]
  contract: {
    id: string
    contractNo: string
    agreedAt: string
    purchaseAmount: number
    remarks: string | null
    emailSentAt: string | null
    customerEmail: string | null
    issuedByName: string | null
    hasPdf: boolean
  } | null
}

/** 売買契約書を発行できる状態（荷物の受取後） */
const CONTRACT_ISSUABLE = ['received', 'appraised', 'transferred']

export default function StoreDeliveryDetailPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const shipmentId = params.id as string

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Appraisal form
  const [appraisalOpen, setAppraisalOpen] = useState(false)
  const [appraisalAmount, setAppraisalAmount] = useState('')
  const [appraisalNote, setAppraisalNote] = useState('')

  // 宅配の買取品目・売買契約書
  const masters = useStoreMasters()
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [remarks, setRemarks] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const contractRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (masters) { setCategories(masters.purchaseCategories); return }
    fetch('/api/form-masters')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCategories(Array.isArray(d.purchaseCategories) ? d.purchaseCategories : []) })
      .catch(() => {})
  }, [masters])

  const fetchShipment = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/delivery-shipments/${shipmentId}/detail`)
    if (res.ok) {
      const data = await res.json()
      setShipment(data)
    }
    setLoading(false)
  }, [shipmentId])

  useEffect(() => {
    if (authStatus === 'authenticated' && shipmentId) {
      fetchShipment()
    }
  }, [authStatus, shipmentId, fetchShipment])

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.replace('/store/login')
  }, [authStatus, router])

  /* ── Status update helper ── */
  async function updateStatus(newStatus: string, extra?: { purchaseAmount?: number | null; storeNote?: string | null }) {
    if (!shipment) return
    setSaving(true)
    setMsg(null)

    const body: Record<string, unknown> = { status: newStatus }
    if (extra?.purchaseAmount !== undefined) body.purchaseAmount = extra.purchaseAmount
    if (extra?.storeNote !== undefined) body.storeNote = extra.storeNote

    try {
      const res = await fetch(`/api/delivery-shipments/${shipment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        // Re-fetch full detail to get updated user info etc.
        await fetchShipment()
        setAppraisalOpen(false)
        const labels: Record<string, string> = {
          received: '受取完了を記録しました',
          appraised: '査定が完了しました',
          transferred: '振込完了を記録しました',
        }
        setMsg({ type: 'success', text: labels[newStatus] ?? '更新しました' })
      } else {
        const err = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: err.error ?? '更新に失敗しました' })
      }
    } catch {
      setMsg({ type: 'error', text: '通信エラーが発生しました' })
    }
    setSaving(false)
  }

  /* ── Open appraisal form with pre-filled values ── */
  function openAppraisalForm() {
    if (!shipment) return
    setAppraisalAmount(shipment.purchaseAmount !== null ? String(shipment.purchaseAmount) : '')
    setAppraisalNote(shipment.storeNote ?? '')
    setAppraisalOpen(true)
  }

  function handleAppraisalSubmit() {
    // 品目を登録している場合、金額は品目合計が正（サーバー側も手入力値では上書きしない）
    const hasItems = (shipment?.purchaseItems.length ?? 0) > 0
    const amount = appraisalAmount !== '' ? Number(appraisalAmount) : null
    updateStatus('appraised', hasItems ? { storeNote: appraisalNote || null } : { purchaseAmount: amount, storeNote: appraisalNote || null })
  }

  /** 品目の追加・更新・削除を画面に反映（送付の査定金額も品目合計に揃える） */
  function applyPurchaseItemChange(change: PurchaseItemChange) {
    if (change.kind === 'reload') { fetchShipment(); return }
    setShipment(prev => {
      if (!prev) return prev
      const items = change.kind === 'upsert'
        ? (prev.purchaseItems.some(i => i.id === change.item.id)
            ? prev.purchaseItems.map(i => (i.id === change.item.id ? change.item : i))
            : [...prev.purchaseItems, change.item])
        : prev.purchaseItems.filter(i => i.id !== change.id)
      return {
        ...prev,
        purchaseItems: items,
        purchaseAmount: change.purchaseAmount !== undefined ? change.purchaseAmount ?? null : prev.purchaseAmount,
      }
    })
  }

  /** 売買契約書を発行する（画面の契約書をPDF化して保存し、お客様へメール送付） */
  async function issueContract() {
    if (!shipment) return
    if (!confirm('売買契約書を発行します。発行後は買取品目を変更できません。よろしいですか？')) return
    // 契約書（PDF化する要素）はプレビューを閉じていると描画されていないので、同期で描画してから1フレーム待つ
    flushSync(() => { setIssuing(true); setMsg(null) })
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    try {
      let pdfBase64: string | null = null
      try {
        const { elementToPdf } = await import('@/lib/pdf-export')
        if (contractRef.current) pdfBase64 = await elementToPdf(contractRef.current, { mode: 'base64' })
      } catch (e) {
        console.error('PDF生成エラー:', e)
      }
      if (!pdfBase64) {
        setMsg({ type: 'error', text: 'PDFの作成に失敗しました。もう一度お試しください' })
        return
      }
      const res = await fetch(`/api/delivery-shipments/${shipment.id}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, remarks }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || '発行に失敗しました' })
        return
      }
      await fetchShipment()
      setShowPreview(false)
      setMsg({
        type: 'success',
        text: data.emailQueued
          ? '売買契約書を発行しました。PDFを添付してお客様へ順次メールで送信します'
          : data.emailErrorReason === 'no-email'
            ? '売買契約書を発行しました（お客様のメールアドレスが未登録のため、メールは送信していません）'
            : '売買契約書を発行しました（メールの送信予約に失敗しました）',
      })
    } catch {
      setMsg({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      setIssuing(false)
    }
  }

  /* ── Loading / Not found ── */
  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  if (!shipment) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <AppBar title="送付詳細" />
        <EmptyState title="送付記録が見つかりません" description="一覧に戻って再度お試しください" />
        <div className="flex justify-center mt-4">
          <Button variant="tonal" onClick={() => router.push('/store/deliveries')}>一覧に戻る</Button>
        </div>
      </div>
    )
  }

  const stepsDone = getStepsDone(shipment.status)
  const user = shipment.user

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <AppBar title="送付詳細" subtitle={shipment.shipmentNumber} />

      {/* Back link */}
      <button
        onClick={() => router.push('/store/deliveries')}
        className="flex items-center gap-1 text-sm text-[var(--portal-primary)] hover:underline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        宅配買取一覧
      </button>

      {msg && <MessageBanner severity={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</MessageBanner>}

      {/* ── Customer info card ── */}
      <Card variant="outlined" padding="md">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">顧客情報</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">氏名</p>
            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{user.name}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">フリガナ</p>
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">{user.furigana}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">電話番号</p>
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">{user.phone}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">メールアドレス</p>
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">{user.email || '\u2014'}</p>
          </div>
        </div>
      </Card>

      {/* ── Shipment info card ── */}
      <Card variant="outlined" padding="md">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">送付情報</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">発送番号</p>
            <p className="text-sm font-mono font-semibold text-[var(--md-sys-color-on-surface)]">{shipment.shipmentNumber}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">送付月</p>
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">{shipment.shipmentMonth.replace('-', '年')}月</p>
          </div>
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">ステータス</p>
            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{STATUS_LABEL[shipment.status] ?? shipment.status}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">登録日</p>
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">{new Date(shipment.createdAt).toLocaleDateString('ja-JP')}</p>
          </div>
          {shipment.description && (
            <div className="sm:col-span-2">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">説明</p>
              <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">{shipment.description}</p>
            </div>
          )}
        </div>
      </Card>

      {/* ── 6-step vertical timeline ── */}
      <Card variant="outlined" padding="md">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-4">進捗状況</h3>
        <div className="relative pl-8">
          {STEPS.map((step, idx) => {
            const done = idx < stepsDone
            const active = idx === stepsDone && stepsDone < 6
            const isLast = idx === STEPS.length - 1
            const sub = getSubStatus(idx, shipment.status)

            return (
              <div key={idx} className="relative pb-6 last:pb-0">
                {/* Connector line */}
                {!isLast && (
                  <div
                    className={`absolute left-[-20px] top-6 w-0.5 h-full ${
                      idx < stepsDone - 1 ? 'bg-emerald-400' : 'bg-gray-200'
                    }`}
                  />
                )}

                {/* Circle */}
                <div
                  className={`absolute left-[-28px] top-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    done
                      ? 'bg-emerald-500 text-white'
                      : active
                        ? 'bg-[var(--portal-primary)] text-white ring-2 ring-[var(--portal-primary)] ring-offset-1'
                        : 'bg-gray-100 border border-gray-300 text-gray-400'
                  }`}
                >
                  {done ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>

                {/* Content */}
                <div className="min-h-[24px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={`text-sm font-semibold ${
                        done ? 'text-emerald-700' : active ? 'text-[var(--portal-primary)]' : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </p>
                    {sub && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sub.cls}`}>
                        {sub.label}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${done || active ? 'text-[var(--md-sys-color-on-surface-variant)]' : 'text-gray-300'}`}>
                    {step.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Images section ── */}
      {(shipment.imageUrls.length > 0 || shipment.trackingImageUrls.length > 0) && (
        <Card variant="outlined" padding="md">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">写真</h3>

          {shipment.imageUrls.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">荷物の写真</p>
              <div className="flex flex-wrap gap-2">
                {shipment.imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img loading="lazy" decoding="async"
                      src={url}
                      alt={`荷物写真 ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)] hover:opacity-80 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {shipment.trackingImageUrls.length > 0 && (
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">伝票の写真</p>
              <div className="flex flex-wrap gap-2">
                {shipment.trackingImageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img loading="lazy" decoding="async"
                      src={url}
                      alt={`伝票写真 ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)] hover:opacity-80 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Action panel ── */}
      <Card variant="outlined" padding="md">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">アクション</h3>

        {/* registered: waiting for customer to ship */}
        {shipment.status === 'registered' && (
          <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-orange-800">顧客の発送待ち</p>
            </div>
            <p className="text-xs text-orange-600">顧客が発送報告をするとアクションが可能になります</p>
          </div>
        )}

        {/* shipped: confirm receipt */}
        {shipment.status === 'shipped' && !appraisalOpen && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-sm font-semibold text-amber-800">荷物が発送されました</p>
            </div>
            <p className="text-xs text-amber-600 mb-4">受け取りが完了したら記録してください</p>
            <button
              onClick={() => updateStatus('received')}
              disabled={saving}
              className="w-full py-3 text-base font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {saving ? '処理中...' : '受取完了'}
            </button>
          </div>
        )}

        {/* received: start appraisal */}
        {shipment.status === 'received' && !appraisalOpen && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm font-semibold text-blue-800">荷物を受け取りました</p>
            </div>
            <p className="text-xs text-blue-600 mb-4">査定が完了したら金額を入力してください</p>
            <button
              onClick={openAppraisalForm}
              className="w-full py-3 text-base font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              査定する
            </button>
          </div>
        )}

        {/* appraised: show result + transfer button + re-appraise */}
        {shipment.status === 'appraised' && !appraisalOpen && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-green-50 border border-green-200">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs font-medium text-green-700">査定結果</p>
                  <p className="text-xl font-bold text-green-700 mt-1">
                    {shipment.purchaseAmount !== null ? `\u00a5${shipment.purchaseAmount.toLocaleString()}` : '金額未入力'}
                  </p>
                  {shipment.storeNote && (
                    <p className="text-xs text-green-600 mt-2 whitespace-pre-wrap">{shipment.storeNote}</p>
                  )}
                </div>
                <button
                  onClick={openAppraisalForm}
                  className="text-xs px-3 py-1.5 border border-green-300 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                >
                  再査定
                </button>
              </div>
            </div>
            <button
              onClick={() => updateStatus('transferred')}
              disabled={saving}
              className="w-full py-3 text-base font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {saving ? '処理中...' : '振込完了を記録する'}
            </button>
          </div>
        )}

        {/* transferred: complete */}
        {shipment.status === 'transferred' && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-bold text-emerald-800">振込完了</p>
                {shipment.purchaseAmount !== null && (
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">&yen;{shipment.purchaseAmount.toLocaleString()}</p>
                )}
                {shipment.storeNote && (
                  <p className="text-xs text-emerald-600 mt-1 whitespace-pre-wrap">{shipment.storeNote}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Appraisal form (inline expandable) ── */}
        {appraisalOpen && (
          <div className="p-4 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low,#f7f7f7)] space-y-4 mt-3">
            <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">査定入力</h4>

            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">
                査定金額（円）
              </label>
              {shipment.purchaseItems.length > 0 ? (
                <p className="text-sm text-[var(--md-sys-color-on-surface)]">
                  <span className="font-bold">{formatYen(shipment.purchaseAmount ?? 0)}</span>
                  <span className="ml-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">買取品目の合計で自動計算されます</span>
                </p>
              ) : (
              <input
                type="number"
                value={appraisalAmount}
                onChange={e => setAppraisalAmount(e.target.value)}
                placeholder="例: 5000"
                min="0"
                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] text-[var(--md-sys-color-on-surface)]"
              />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">
                メモ（顧客に表示されます）
              </label>
              <textarea
                value={appraisalNote}
                onChange={e => setAppraisalNote(e.target.value)}
                rows={3}
                placeholder="査定結果の詳細や連絡事項など..."
                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAppraisalOpen(false)}
                className="text-sm px-5 py-2 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] rounded-lg hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleAppraisalSubmit}
                disabled={saving}
                className="text-sm px-5 py-2 bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold"
              >
                {saving ? '保存中...' : '査定完了'}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 買取品目（宅配）── */}
      <Card variant="outlined" padding="md">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">買取品目</h3>
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {shipment.purchaseItems.length}件 ・ 合計 <strong className="text-[var(--md-sys-color-on-surface)]">{formatYen(shipment.purchaseItems.reduce((s, i) => s + i.purchasePrice, 0))}</strong>
          </span>
        </div>
        {CONTRACT_ISSUABLE.includes(shipment.status) || shipment.purchaseItems.length > 0 ? (
          <>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-3">
              査定した品目を登録すると、査定金額は品目の合計で自動計算され、売買契約書と古物台帳に1品目ずつ記載されます。
            </p>
            <PurchaseItemManager
              parentId={shipment.id}
              parentKind="shipment"
              items={shipment.purchaseItems}
              categories={categories}
              editable={CONTRACT_ISSUABLE.includes(shipment.status)}
              frozen={!!shipment.contract}
              onChanged={applyPurchaseItemChange}
              onMessage={setMsg}
            />
          </>
        ) : (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">荷物の受取後に、査定した品目を登録できます。</p>
        )}
      </Card>

      {/* ── 売買契約書（宅配・署名なし）── */}
      <Card variant="outlined" padding="md">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-3">売買契約書</h3>
        {shipment.contract ? (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 space-y-1">
              <p className="font-bold">発行済み（契約番号 {shipment.contract.contractNo}）</p>
              <p className="text-xs">発行日時: {new Date(shipment.contract.agreedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}{shipment.contract.issuedByName ? ` ・ 発行者: ${shipment.contract.issuedByName}` : ''}</p>
              <p className="text-xs">買取金額: {formatYen(shipment.contract.purchaseAmount)}</p>
              <p className="text-xs">
                メール: {shipment.contract.emailSentAt
                  ? `送信済み（${new Date(shipment.contract.emailSentAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}・${shipment.contract.customerEmail ?? ''}）`
                  : shipment.contract.customerEmail ? `送信待ち（${shipment.contract.customerEmail}）` : 'メールアドレス未登録のため未送信'}
              </p>
            </div>
            {shipment.contract.hasPdf && (
              <div className="flex flex-wrap gap-2">
                <Button variant="tonal" onClick={() => window.open(`/api/delivery-shipments/${shipment.id}/contract`, '_blank')}>売買契約書PDFを開く</Button>
                <Button variant="outlined" onClick={() => { window.location.href = `/api/delivery-shipments/${shipment.id}/contract?download=1` }}>ダウンロード</Button>
              </div>
            )}
          </div>
        ) : !CONTRACT_ISSUABLE.includes(shipment.status) ? (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">荷物の受取後、買取品目を登録すると発行できます。</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              宅配買取はお客様が非対面のため、署名なしで店舗が発行します。発行するとPDFを保存してお客様へメールで送付し、古物台帳に記載されます。
              発行後は買取品目を変更できません。
            </p>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">備考（契約書に記載されます）</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="お客様へのご連絡事項など（任意）"
                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2.5 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] resize-y text-[var(--md-sys-color-on-surface)]"
              />
            </div>
            {shipment.purchaseItems.length === 0 && (
              <MessageBanner severity="warning">買取品目を1件以上登録すると発行できます。</MessageBanner>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outlined" onClick={() => setShowPreview(v => !v)}>{showPreview ? 'プレビューを閉じる' : '契約書をプレビュー'}</Button>
              <Button onClick={issueContract} disabled={issuing || shipment.purchaseItems.length === 0}>
                {issuing ? '発行中...' : '売買契約書を発行'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 契約書の本体。発行時はこの要素をそのままPDF化するので、発行操作中は必ず描画しておく */}
      {!shipment.contract && CONTRACT_ISSUABLE.includes(shipment.status) && (showPreview || issuing) && (
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
          <DeliveryContractDocument
            ref={contractRef}
            contractNo={`HK-${shipment.shipmentNumber.replace(/^HD-/, '')}`}
            contractDate={new Date()}
            shipmentNumber={shipment.shipmentNumber}
            customer={{
              name: user.idName || user.name,
              address: user.idBackAddress || user.idAddress || user.address,
              phone: user.phone,
              birthDate: user.birthDate || user.idBirthDate,
              occupation: user.occupation,
              idDocumentType: user.idDocumentType,
            }}
            store={{
              name: user.store?.name ?? '',
              address: user.store?.address ?? null,
              phone: user.store?.phone ?? null,
              antiquePermitNumber: user.store?.antiquePermitNumber || user.store?.operator?.antiquePermitNumber || null,
            }}
            staffName={(session?.user as { memberName?: string | null } | undefined)?.memberName ?? null}
            items={shipment.purchaseItems}
            remarks={remarks}
          />
        </div>
      )}
    </div>
  )
}
