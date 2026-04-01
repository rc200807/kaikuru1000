'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'

const STEPS = [
  { label: '発送準備', desc: '商品を梱包して写真を記録' },
  { label: '発送前準備', desc: '伝票を記入して写真を記録' },
  { label: '発送', desc: '発送完了を店舗に報告' },
  { label: '店舗受取確認', desc: '店舗が荷物を受け取り' },
  { label: '査定', desc: '査定結果を通知' },
  { label: '振込', desc: '代金のお振り込み' },
]

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  registered: '登録済み',
  shipped: '発送済み',
  received: '査定中',
  appraised: '振込準備中',
  transferred: '振込完了',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registered: 'bg-orange-100 text-orange-700',
  shipped: 'bg-amber-100 text-amber-700',
  received: 'bg-blue-100 text-blue-700',
  appraised: 'bg-emerald-100 text-emerald-700',
  transferred: 'bg-emerald-100 text-emerald-700',
}

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

function getStepSubStatus(idx: number, status: string): { text: string; color: string } | null {
  if (idx === 3) {
    if (status === 'shipped') return { text: '受取前', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    if (['received', 'appraised', 'transferred'].includes(status)) return { text: '受取完了', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  }
  if (idx === 4) {
    if (status === 'received') return { text: '査定中', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    if (['appraised', 'transferred'].includes(status)) return { text: '査定完了', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  }
  if (idx === 5) {
    if (status === 'appraised') return { text: '振込準備中', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    if (status === 'transferred') return { text: '振込完了', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  }
  return null
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
  transferredAt: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    furigana: string
    phone: string
    email: string | null
    address: string | null
    store: { id: string; name: string; address: string | null; phone: string | null } | null
  }
}

export default function AdminDeliveryDetailPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const shipmentId = params.id as string

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Appraisal form state
  const [showAppraisal, setShowAppraisal] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/admin/login')
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus === 'authenticated' && shipmentId) {
      setLoading(true)
      fetch(`/api/delivery-shipments/${shipmentId}/detail`)
        .then(res => {
          if (!res.ok) throw new Error('Not found')
          return res.json()
        })
        .then(data => setShipment(data))
        .catch(() => setMsg({ type: 'error', text: '送付記録の取得に失敗しました' }))
        .finally(() => setLoading(false))
    }
  }, [authStatus, shipmentId])

  async function handleStatusUpdate(newStatus: string, extra?: { purchaseAmount?: number; storeNote?: string }) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/delivery-shipments/${shipmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, ...extra }),
      })
      if (res.ok) {
        const updated = await res.json()
        setShipment(prev => prev ? { ...prev, ...updated } : prev)
        setMsg({ type: 'success', text: 'ステータスを更新しました' })
        setShowAppraisal(false)
        setAmount('')
        setNote('')
      } else {
        const err = await res.json().catch(() => ({}))
        setMsg({ type: 'error', text: err.error || '更新に失敗しました' })
      }
    } catch {
      setMsg({ type: 'error', text: 'ネットワークエラーが発生しました' })
    }
    setSaving(false)
  }

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  if (!shipment) {
    return (
      <>
        <AppBar title="送付詳細" actions={<button onClick={() => router.push('/admin/deliveries')} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]">← 一覧に戻る</button>} />
        <div className="max-w-3xl mx-auto px-4 py-6">
          {msg && <MessageBanner severity={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</MessageBanner>}
          <p className="text-center text-[var(--md-sys-color-on-surface-variant)] py-12">
            送付記録が見つかりません
          </p>
        </div>
      </>
    )
  }

  const stepsDone = getStepsDone(shipment.status)

  return (
    <>
      <AppBar
        title={`送付詳細: ${shipment.shipmentNumber}`}
        actions={<button onClick={() => router.push('/admin/deliveries')} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]">← 一覧に戻る</button>}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {msg && (
          <MessageBanner severity={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</MessageBanner>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-3">
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_STYLE[shipment.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[shipment.status] || shipment.status}
          </span>
          <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {shipment.shipmentMonth}
          </span>
        </div>

        {/* Customer info card */}
        <Card variant="elevated" padding="md">
          <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">
            顧客情報
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">氏名</p>
              <p className="text-[var(--md-sys-color-on-surface)] font-medium">
                {shipment.user.name}
                {shipment.user.furigana && (
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] ml-1">
                    ({shipment.user.furigana})
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">電話番号</p>
              <p className="text-[var(--md-sys-color-on-surface)]">{shipment.user.phone || '\u2014'}</p>
            </div>
            {shipment.user.email && (
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">メール</p>
                <p className="text-[var(--md-sys-color-on-surface)]">{shipment.user.email}</p>
              </div>
            )}
            {shipment.user.address && (
              <div className="sm:col-span-2">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">住所</p>
                <p className="text-[var(--md-sys-color-on-surface)]">{shipment.user.address}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Store info card (admin only) */}
        {shipment.user.store && (
          <Card variant="elevated" padding="md">
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">
              担当店舗情報
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">店舗名</p>
                <p className="text-[var(--md-sys-color-on-surface)] font-medium">
                  {shipment.user.store.name}
                </p>
              </div>
              {shipment.user.store.phone && (
                <div>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">電話番号</p>
                  <p className="text-[var(--md-sys-color-on-surface)]">{shipment.user.store.phone}</p>
                </div>
              )}
              {shipment.user.store.address && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">住所</p>
                  <p className="text-[var(--md-sys-color-on-surface)]">{shipment.user.store.address}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Shipment info card */}
        <Card variant="elevated" padding="md">
          <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">
            送付情報
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">送付番号</p>
              <p className="text-[var(--md-sys-color-on-surface)] font-medium">{shipment.shipmentNumber}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">送付月</p>
              <p className="text-[var(--md-sys-color-on-surface)]">{shipment.shipmentMonth}</p>
            </div>
            {shipment.description && (
              <div className="sm:col-span-2">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">品物の説明</p>
                <p className="text-[var(--md-sys-color-on-surface)]">{shipment.description}</p>
              </div>
            )}
            {shipment.purchaseAmount != null && (
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">査定金額</p>
                <p className="text-[var(--md-sys-color-on-surface)] font-bold">
                  ¥{shipment.purchaseAmount.toLocaleString()}
                </p>
              </div>
            )}
            {shipment.storeNote && (
              <div className="sm:col-span-2">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">店舗メモ</p>
                <p className="text-[var(--md-sys-color-on-surface)]">{shipment.storeNote}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">登録日</p>
              <p className="text-[var(--md-sys-color-on-surface)]">
                {new Date(shipment.createdAt).toLocaleDateString('ja-JP')}
              </p>
            </div>
            {shipment.transferredAt && (
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">振込日</p>
                <p className="text-[var(--md-sys-color-on-surface)]">
                  {new Date(shipment.transferredAt).toLocaleDateString('ja-JP')}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* 6-step vertical timeline */}
        <Card variant="elevated" padding="md">
          <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4">
            進捗タイムライン
          </h3>
          <div className="relative pl-6">
            {STEPS.map((step, idx) => {
              const done = idx < stepsDone
              const current = idx === stepsDone
              const sub = getStepSubStatus(idx, shipment.status)

              return (
                <div key={idx} className="relative pb-6 last:pb-0">
                  {/* Vertical line */}
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`absolute left-[-14px] top-6 w-0.5 h-full ${
                        done ? 'bg-emerald-400' : 'bg-[var(--md-sys-color-outline-variant)]'
                      }`}
                    />
                  )}

                  {/* Circle */}
                  <div
                    className={`absolute left-[-20px] top-0.5 w-3 h-3 rounded-full border-2 ${
                      done
                        ? 'bg-emerald-500 border-emerald-500'
                        : current
                          ? 'bg-white border-[var(--portal-primary,#374151)]'
                          : 'bg-white border-[var(--md-sys-color-outline-variant)]'
                    }`}
                  />

                  {/* Content */}
                  <div className="ml-2">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${
                        done
                          ? 'text-emerald-700'
                          : current
                            ? 'text-[var(--md-sys-color-on-surface)]'
                            : 'text-[var(--md-sys-color-outline)]'
                      }`}>
                        {step.label}
                      </p>
                      {sub && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sub.color}`}>
                          {sub.text}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                      {step.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Images section */}
        {(shipment.imageUrls.length > 0 || shipment.trackingImageUrls.length > 0) && (
          <Card variant="elevated" padding="md">
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">
              写真
            </h3>

            {shipment.imageUrls.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">商品写真</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {shipment.imageUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`商品写真 ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)]"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {shipment.trackingImageUrls.length > 0 && (
              <div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">伝票写真</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {shipment.trackingImageUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`伝票写真 ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)]"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Action panel */}
        <Card variant="elevated" padding="md">
          <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4">
            アクション
          </h3>

          {/* Received: show "受取完了" button */}
          {shipment.status === 'shipped' && (
            <Button
              onClick={() => handleStatusUpdate('received')}
              disabled={saving}
              className="w-full"
            >
              {saving ? '処理中...' : '受取完了にする'}
            </Button>
          )}

          {/* Received: show appraisal button/form */}
          {shipment.status === 'received' && (
            <>
              {!showAppraisal ? (
                <Button
                  onClick={() => setShowAppraisal(true)}
                  className="w-full"
                >
                  査定する
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)]">
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-3">
                      査定情報を入力
                    </p>
                    <div className="space-y-3">
                      <TextField
                        label="査定金額（円）"
                        type="number"
                        value={amount}
                        onChange={setAmount}
                        placeholder="例: 15000"
                      />
                      <TextField
                        label="メモ（任意）"
                        value={note}
                        onChange={setNote}
                        placeholder="査定に関するメモ"
                        rows={3}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (!amount || Number(amount) < 0) {
                          setMsg({ type: 'error', text: '正しい査定金額を入力してください' })
                          return
                        }
                        handleStatusUpdate('appraised', {
                          purchaseAmount: Number(amount),
                          storeNote: note || undefined,
                        })
                      }}
                      disabled={saving}
                      className="flex-1"
                    >
                      {saving ? '処理中...' : '査定を確定'}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setShowAppraisal(false)
                        setAmount('')
                        setNote('')
                      }}
                      disabled={saving}
                    >
                      キャンセル
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Appraised: show "振込完了" button */}
          {shipment.status === 'appraised' && (
            <Button
              onClick={() => handleStatusUpdate('transferred')}
              disabled={saving}
              className="w-full"
            >
              {saving ? '処理中...' : '振込完了にする'}
            </Button>
          )}

          {/* Transferred: completed */}
          {shipment.status === 'transferred' && (
            <p className="text-sm text-emerald-700 text-center py-2">
              この送付は振込完了済みです
            </p>
          )}

          {/* Draft/Registered: no admin action */}
          {['draft', 'registered'].includes(shipment.status) && (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-2">
              {shipment.status === 'draft' ? '顧客が入力中です' : '顧客からの発送待ちです'}
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
