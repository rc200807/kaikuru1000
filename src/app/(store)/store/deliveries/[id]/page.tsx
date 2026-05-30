'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import MessageBanner from '@/components/MessageBanner'

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
    store: { id: string; name: string; address: string; phone: string } | null
  }
}

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
    const amount = appraisalAmount !== '' ? Number(appraisalAmount) : null
    updateStatus('appraised', { purchaseAmount: amount, storeNote: appraisalNote || null })
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
                    <img
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
                    <img
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
              <input
                type="number"
                value={appraisalAmount}
                onChange={e => setAppraisalAmount(e.target.value)}
                placeholder="例: 5000"
                min="0"
                className="w-full text-sm border border-[var(--md-sys-color-outline-variant)] rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] text-[var(--md-sys-color-on-surface)]"
              />
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
    </div>
  )
}
