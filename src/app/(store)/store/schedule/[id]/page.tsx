'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Button from '@/components/Button'
import Card from '@/components/Card'
import MessageBanner from '@/components/MessageBanner'

/* ─── 型定義 ─── */
type PurchaseItem = {
  id: string
  itemName: string
  category: string
  imageUrls: string[]
  quantity: number
  purchasePrice: number
  aiResearch: MarketResearch | null
  aiResearchedAt: string | null
}

type WorkItem = {
  id: string
  workName: string
  unitPrice: number
  quantity: number
}

type MarketResearch = {
  productDetail: string
  estimatedCondition: string
  maxPrice: string
  minPrice: string
  platforms: string
  supplement: string
}

type VisitDetail = {
  id: string
  visitDate: string
  status: string
  note: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  user: { id: string; name: string; address: string; phone: string; customerType: string }
  store: { id: string; name: string }
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: '予定',
  pending: '未対応',
  completed: '対応完了',
  rescheduled: 'リスケ',
  absent: '不在',
  cancelled: 'キャンセル',
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
  rescheduled: 'bg-[var(--status-rescheduled-bg)] text-[var(--status-rescheduled-text)]',
  absent: 'bg-[var(--status-absent-bg)] text-[var(--status-absent-text)]',
  cancelled: 'bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)]',
}

/* ─── メイン ─── */
export default function VisitDetailPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const scheduleId = params.id as string

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 買取品目フォーム
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<PurchaseItem | null>(null)
  const [purchaseForm, setPurchaseForm] = useState({ itemName: '', category: '', quantity: 1, purchasePrice: 0, imageUrls: [] as string[] })
  const [uploading, setUploading] = useState(false)
  const [savingPurchase, setSavingPurchase] = useState(false)

  // 作業品目フォーム
  const [showWorkForm, setShowWorkForm] = useState(false)
  const [editingWork, setEditingWork] = useState<WorkItem | null>(null)
  const [workForm, setWorkForm] = useState({ workName: '', unitPrice: 0, quantity: 1 })
  const [savingWork, setSavingWork] = useState(false)

  // AI調査
  const [researchingItemId, setResearchingItemId] = useState<string | null>(null)
  const [researchResults, setResearchResults] = useState<Record<string, MarketResearch>>({})
  const [researchErrors, setResearchErrors] = useState<Record<string, string>>({})
  const [expandedResearch, setExpandedResearch] = useState<Record<string, boolean>>({})

  // メモ編集
  const [editNote, setEditNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const fetchVisit = useCallback(async () => {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`)
    if (res.ok) {
      const data = await res.json()
      setVisit(data)
      setEditNote(data.note || '')

      // 保存済みのAI調査結果をstateにロード
      const saved: Record<string, MarketResearch> = {}
      for (const item of data.purchaseItems ?? []) {
        if (item.aiResearch) {
          saved[item.id] = item.aiResearch
        }
      }
      if (Object.keys(saved).length > 0) {
        setResearchResults((prev) => ({ ...prev, ...saved }))
        // 保存済み結果は畳んだ状態で表示（expandedはfalseのまま）
      }
    }
    setLoading(false)
  }, [scheduleId])

  useEffect(() => {
    if (session) fetchVisit()
  }, [session, fetchVisit])

  /* ─── 買取品目 ─── */
  function resetPurchaseForm() {
    setPurchaseForm({ itemName: '', category: '', quantity: 1, purchasePrice: 0, imageUrls: [] })
    setEditingPurchase(null)
    setShowPurchaseForm(false)
  }

  function startEditPurchase(item: PurchaseItem) {
    setPurchaseForm({
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      imageUrls: item.imageUrls,
    })
    setEditingPurchase(item)
    setShowPurchaseForm(true)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return

    const remaining = 3 - purchaseForm.imageUrls.length
    if (remaining <= 0) {
      setMessage({ type: 'error', text: '画像は最大3枚までです' })
      return
    }

    setUploading(true)
    const newUrls = [...purchaseForm.imageUrls]

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const fd = new FormData()
      fd.append('file', files[i])
      const res = await fetch('/api/purchase-items/images', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json()
        newUrls.push(url)
      }
    }

    setPurchaseForm({ ...purchaseForm, imageUrls: newUrls })
    setUploading(false)
    e.target.value = ''
  }

  function removeImage(idx: number) {
    setPurchaseForm({
      ...purchaseForm,
      imageUrls: purchaseForm.imageUrls.filter((_, i) => i !== idx),
    })
  }

  async function savePurchaseItem() {
    if (!purchaseForm.itemName || !purchaseForm.category) {
      setMessage({ type: 'error', text: '品名とカテゴリーは必須です' })
      return
    }

    setSavingPurchase(true)

    if (editingPurchase) {
      // 更新
      await fetch(`/api/purchase-items/${editingPurchase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseForm),
      })
    } else {
      // 新規
      await fetch(`/api/visit-schedules/${scheduleId}/purchase-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseForm),
      })
    }

    setSavingPurchase(false)
    resetPurchaseForm()
    fetchVisit()
    setMessage({ type: 'success', text: '買取品目を保存しました' })
  }

  async function deletePurchaseItem(id: string) {
    if (!confirm('この品目を削除しますか？')) return
    await fetch(`/api/purchase-items/${id}`, { method: 'DELETE' })
    fetchVisit()
    setMessage({ type: 'success', text: '品目を削除しました' })
  }

  /* ─── AI調査 ─── */
  async function handleAiResearch(itemId: string) {
    setResearchingItemId(itemId)
    setResearchErrors((prev) => { const next = { ...prev }; delete next[itemId]; return next })

    try {
      const res = await fetch(`/api/purchase-items/${itemId}/ai-research`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setResearchErrors((prev) => ({ ...prev, [itemId]: data.error || 'AI調査に失敗しました' }))
        return
      }
      const result: MarketResearch = await res.json()
      setResearchResults((prev) => ({ ...prev, [itemId]: result }))
      setExpandedResearch((prev) => ({ ...prev, [itemId]: false }))
    } catch {
      setResearchErrors((prev) => ({ ...prev, [itemId]: 'AI調査に失敗しました。ネットワークエラーの可能性があります。' }))
    } finally {
      setResearchingItemId(null)
    }
  }

  function toggleResearch(itemId: string) {
    setExpandedResearch((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  /* ─── 作業品目 ─── */
  function resetWorkForm() {
    setWorkForm({ workName: '', unitPrice: 0, quantity: 1 })
    setEditingWork(null)
    setShowWorkForm(false)
  }

  function startEditWork(item: WorkItem) {
    setWorkForm({ workName: item.workName, unitPrice: item.unitPrice, quantity: item.quantity })
    setEditingWork(item)
    setShowWorkForm(true)
  }

  async function saveWorkItem() {
    if (!workForm.workName) {
      setMessage({ type: 'error', text: '作業名は必須です' })
      return
    }

    setSavingWork(true)

    if (editingWork) {
      await fetch(`/api/work-items/${editingWork.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workForm),
      })
    } else {
      await fetch(`/api/visit-schedules/${scheduleId}/work-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workForm),
      })
    }

    setSavingWork(false)
    resetWorkForm()
    fetchVisit()
    setMessage({ type: 'success', text: '作業品目を保存しました' })
  }

  async function deleteWorkItem(id: string) {
    if (!confirm('この作業を削除しますか？')) return
    await fetch(`/api/work-items/${id}`, { method: 'DELETE' })
    fetchVisit()
    setMessage({ type: 'success', text: '作業を削除しました' })
  }

  /* ─── メモ保存 ─── */
  async function saveNote() {
    setSavingNote(true)
    await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: editNote }),
    })
    setSavingNote(false)
    fetchVisit()
    setMessage({ type: 'success', text: 'メモを保存しました' })
  }

  /* ─── ステータス変更 ─── */
  async function handleStatusChange(newStatus: string) {
    await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchVisit()
  }

  /* ─── 買取品目フォーム共通 ─── */
  function renderPurchaseFormFields() {
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">品名 *</label>
            <input
              className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
              value={purchaseForm.itemName}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, itemName: e.target.value })}
              placeholder="例: ルイヴィトン バッグ"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">カテゴリー *</label>
            <input
              className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
              value={purchaseForm.category}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, category: e.target.value })}
              placeholder="例: バッグ / 時計 / 貴金属"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">数量</label>
            <input
              type="number"
              min={1}
              className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
              value={purchaseForm.quantity}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">買取金額（円）</label>
            <input
              type="number"
              min={0}
              className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
              value={purchaseForm.purchasePrice}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, purchasePrice: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* 画像アップロード */}
        <div>
          <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            写真（最大3枚）
          </label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {purchaseForm.imageUrls.map((url, idx) => (
              <div key={idx} className="relative">
                <img src={url} alt="" className="w-16 h-16 object-cover rounded border border-[var(--md-sys-color-outline-variant)]" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--md-sys-color-error)] text-white text-xs flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {purchaseForm.imageUrls.length < 3 && (
              <label className="w-16 h-16 rounded border-2 border-dashed border-[var(--md-sys-color-outline-variant)] flex items-center justify-center cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors">
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-between">
          {editingPurchase ? (
            <button
              onClick={() => { deletePurchaseItem(editingPurchase.id); resetPurchaseForm() }}
              className="text-xs text-[var(--md-sys-color-error)] hover:underline"
            >
              この品目を削除
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="text" size="sm" onClick={resetPurchaseForm}>キャンセル</Button>
            <Button size="sm" onClick={savePurchaseItem} disabled={savingPurchase} loading={savingPurchase}>
              {savingPurchase ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </>
    )
  }

  /* ─── ヘルパー ─── */
  const fmtYen = (n: number) => `¥${n.toLocaleString()}`

  const purchaseTotal = visit?.purchaseItems.reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0) ?? 0
  const workTotal = visit?.workItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) ?? 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="p-6">
        <MessageBanner severity="error">訪問スケジュールが見つかりません</MessageBanner>
        <Button variant="text" onClick={() => router.back()} className="mt-4">← 戻る</Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/store/schedule')} className="text-[var(--portal-primary)] hover:underline text-sm">
          ← スケジュール
        </button>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">訪問詳細</h1>
      </div>

      {message && (
        <MessageBanner severity={message.type}>
          {message.text}
        </MessageBanner>
      )}

      {/* 基本情報カード */}
      <Card variant="elevated" padding="md">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              {visit.user.name}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[visit.status] || ''}`}>
              {STATUS_LABELS[visit.status] || visit.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
            <div>
              <span className="font-medium">訪問日: </span>
              {format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
            </div>
            <div>
              <span className="font-medium">電話: </span>{visit.user.phone}
            </div>
            <div className="sm:col-span-2">
              <span className="font-medium">住所: </span>{visit.user.address}
            </div>
          </div>

          {/* ステータス変更 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">ステータス:</span>
            <select
              className="text-xs px-2 py-1 rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
              value={visit.status}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* メモ */}
          <div>
            <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">メモ</label>
            <textarea
              className="w-full mt-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-low)] p-2 min-h-[60px] resize-y"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
            />
            <div className="flex justify-end mt-1">
              <Button size="sm" onClick={saveNote} disabled={savingNote} loading={savingNote}>
                {savingNote ? '保存中...' : 'メモ保存'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ────────── 買取品目セクション ────────── */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">買取品目</h2>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              合計: {fmtYen(purchaseTotal)}（{visit.purchaseItems.length}品）
            </span>
          </div>
          {!showPurchaseForm && (
            <Button size="sm" onClick={() => { resetPurchaseForm(); setShowPurchaseForm(true) }}>
              + 品目を追加
            </Button>
          )}
        </div>

        {/* 品目リスト */}
        {visit.purchaseItems.length > 0 && (
          <div className="space-y-2 mb-3">
            {visit.purchaseItems.map((item) => (
              <div key={item.id} className="rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-low)] overflow-hidden">
                <div className="flex items-start gap-3 p-3">
                  {/* サムネイル */}
                  {item.imageUrls.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0">
                      {item.imageUrls.map((url, i) => (
                        <div key={i} className="relative w-12 h-12 overflow-hidden rounded">
                          <img
                            src={url}
                            alt=""
                            className={`w-full h-full object-cover border border-[var(--md-sys-color-outline-variant)] rounded ${researchingItemId === item.id ? 'animate-pulse' : ''}`}
                          />
                          {researchingItemId === item.id && (
                            <>
                              <div className="absolute inset-0 bg-gradient-to-b from-purple-500/30 to-blue-500/30 rounded" />
                              <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-300 to-transparent animate-scan rounded" />
                              <div className="absolute inset-0 border-2 border-purple-400 rounded animate-pulse" />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{item.itemName}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                      数量: {item.quantity} × {fmtYen(item.purchasePrice)} = <strong>{fmtYen(item.purchasePrice * item.quantity)}</strong>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {researchResults[item.id] ? (
                      <button
                        onClick={() => toggleResearch(item.id)}
                        className="text-xs px-2 py-1 rounded-full font-medium transition-all flex items-center gap-1 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        調査済
                        <svg className={`w-3 h-3 transition-transform ${expandedResearch[item.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAiResearch(item.id)}
                        disabled={researchingItemId === item.id}
                        className="text-xs px-2 py-1 rounded-full font-medium disabled:opacity-50 disabled:cursor-wait transition-all flex items-center gap-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
                      >
                        {researchingItemId === item.id ? (
                          <>
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            調査中...
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            AI調査
                          </>
                        )}
                      </button>
                    )}
                    <button onClick={() => startEditPurchase(item)} className="text-xs text-[var(--portal-primary)] hover:underline">編集</button>
                  </div>
                </div>

                {/* AI調査中バー */}
                {researchingItemId === item.id && !researchResults[item.id] && (
                  <div className="mx-3 mb-3 relative rounded-[var(--md-sys-shape-small,8px)] bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-800 dark:to-blue-800 border border-purple-400 dark:border-purple-600 overflow-hidden">
                    <div className="flex items-center gap-2 p-3">
                      <div className="relative w-5 h-5 flex-shrink-0">
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" />
                        <div className="absolute inset-0.5 rounded-full border-[1.5px] border-transparent border-b-purple-200 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                      </div>
                      <span className="text-xs font-bold text-white tracking-wider">AI 調査中</span>
                      <div className="flex gap-1 ml-1">
                        <span className="w-1 h-1 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-scan" />
                  </div>
                )}

                {/* AI調査結果アコーディオン */}
                {researchResults[item.id] && (
                  <div className={`mx-3 mb-3 relative rounded-[var(--md-sys-shape-small,8px)] overflow-hidden border ${
                    researchingItemId === item.id
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-800 dark:to-blue-800 border-purple-400 dark:border-purple-600'
                      : 'bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950 border-purple-200 dark:border-purple-700'
                  }`}>
                    {/* スキャンラインアニメーション（再調査中） */}
                    {researchingItemId === item.id && (
                      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-scan" />
                    )}
                    {/* 折りたたみヘッダー（常に表示） */}
                    <button
                      onClick={() => researchingItemId === item.id ? undefined : toggleResearch(item.id)}
                      className={`w-full flex items-center justify-between p-3 transition-colors ${researchingItemId === item.id ? 'cursor-default' : 'hover:bg-purple-100/50 dark:hover:bg-purple-900/20'}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {researchingItemId === item.id ? (
                          <div className="relative w-4 h-4 flex-shrink-0">
                            <div className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-white animate-spin" />
                            <div className="absolute inset-0.5 rounded-full border border-transparent border-b-purple-200 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                          </div>
                        ) : (
                          <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        )}
                        <span className={`text-xs font-bold tracking-wider ${researchingItemId === item.id ? 'text-white' : 'text-purple-700 dark:text-purple-300'}`}>
                          {researchingItemId === item.id ? 'AI 再調査中' : 'AI 市場調査結果'}
                        </span>
                        {researchingItemId === item.id ? (
                          <div className="flex gap-1 ml-0.5">
                            <span className="w-1 h-1 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : item.aiResearchedAt && (
                          <span className="text-[10px] text-purple-500 dark:text-purple-400">
                            ({format(new Date(item.aiResearchedAt), 'M/d HH:mm', { locale: ja })} 調査)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {researchingItemId !== item.id && !expandedResearch[item.id] && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-300 truncate max-w-[200px]">
                            {researchResults[item.id].maxPrice}
                          </span>
                        )}
                        {researchingItemId !== item.id && (
                          <svg className={`w-4 h-4 text-purple-500 transition-transform ${expandedResearch[item.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        )}
                      </div>
                    </button>

                    {/* 展開コンテンツ */}
                    {expandedResearch[item.id] && (
                      <div className="px-3 pb-3">
                        <dl className="space-y-2 text-xs">
                          {[
                            { label: '商品詳細', value: researchResults[item.id].productDetail, icon: '📦' },
                            { label: '想定コンディション', value: researchResults[item.id].estimatedCondition, icon: '📊' },
                            { label: '中古最高値', value: researchResults[item.id].maxPrice, icon: '📈', highlight: true },
                            { label: '中古最安値', value: researchResults[item.id].minPrice, icon: '📉' },
                            { label: '取引プラットフォーム', value: researchResults[item.id].platforms, icon: '🏪' },
                            { label: '補足情報', value: researchResults[item.id].supplement, icon: '💡' },
                          ].map((row) => (
                            <div key={row.label} className="flex gap-2">
                              <dt className="flex items-start gap-1 w-32 flex-shrink-0 font-medium text-purple-800 dark:text-purple-200">
                                <span>{row.icon}</span>
                                <span>{row.label}</span>
                              </dt>
                              <dd className={`flex-1 break-all ${row.highlight ? 'font-bold text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <div className="flex justify-end mt-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAiResearch(item.id) }}
                            disabled={researchingItemId === item.id}
                            className="text-[10px] px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900 disabled:opacity-50 transition-colors flex items-center gap-1"
                          >
                            {researchingItemId === item.id ? (
                              <>
                                <span className="w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                                調査中...
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                再調査
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI調査エラー */}
                {researchErrors[item.id] && (
                  <div className="mx-3 mb-3 p-2 rounded text-xs text-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)]">
                    {researchErrors[item.id]}
                  </div>
                )}

                {/* インライン編集フォーム */}
                {showPurchaseForm && editingPurchase?.id === item.id && (
                  <div className="mx-3 mb-3 p-3 rounded-[var(--md-sys-shape-small,8px)] border border-[var(--portal-primary)] bg-[var(--md-sys-color-surface-container-lowest)] space-y-3">
                    <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">品目を編集</h3>
                    {renderPurchaseFormFields()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 品目追加フォーム（新規のみ） */}
        {showPurchaseForm && !editingPurchase && (
          <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] space-y-3">
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">品目を追加</h3>
            {renderPurchaseFormFields()}
          </div>
        )}
      </Card>

      {/* ────────── 作業品目セクション ────────── */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">作業品目</h2>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              請求合計: {fmtYen(workTotal)}
            </span>
          </div>
          {!showWorkForm && (
            <Button size="sm" onClick={() => { resetWorkForm(); setShowWorkForm(true) }}>
              + 作業を追加
            </Button>
          )}
        </div>

        {/* 作業リスト */}
        {visit.workItems.length > 0 && (
          <div className="space-y-2 mb-3">
            {visit.workItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-low)]">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{item.workName}</span>
                  <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    {fmtYen(item.unitPrice)} × {item.quantity} = <strong>{fmtYen(item.unitPrice * item.quantity)}</strong>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEditWork(item)} className="text-xs text-[var(--portal-primary)] hover:underline">編集</button>
                  <button onClick={() => deleteWorkItem(item.id)} className="text-xs text-[var(--md-sys-color-error)] hover:underline">削除</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 作業追加/編集フォーム */}
        {showWorkForm && (
          <div className="p-3 rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] space-y-3">
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
              {editingWork ? '作業を編集' : '作業を追加'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">作業名 *</label>
                <input
                  className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
                  value={workForm.workName}
                  onChange={(e) => setWorkForm({ ...workForm, workName: e.target.value })}
                  placeholder="例: 搬出作業 / 清掃"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">単価（円）</label>
                <input
                  type="number"
                  min={0}
                  className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
                  value={workForm.unitPrice}
                  onChange={(e) => setWorkForm({ ...workForm, unitPrice: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">数量</label>
                <input
                  type="number"
                  min={1}
                  className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
                  value={workForm.quantity}
                  onChange={(e) => setWorkForm({ ...workForm, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-end">
                <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                  小計: <strong>{fmtYen(workForm.unitPrice * workForm.quantity)}</strong>
                </span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="text" size="sm" onClick={resetWorkForm}>キャンセル</Button>
              <Button size="sm" onClick={saveWorkItem} disabled={savingWork} loading={savingWork}>
                {savingWork ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ────────── 集計カード ────────── */}
      <Card variant="elevated" padding="md">
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">集計</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--status-completed-bg)]">
            <div className="text-xs text-[var(--status-completed-text)]">買取金額合計</div>
            <div className="text-xl font-bold text-[var(--status-completed-text)] mt-1">
              {fmtYen(purchaseTotal)}
            </div>
          </div>
          <div className="text-center p-3 rounded-[var(--md-sys-shape-small,8px)] bg-[var(--status-scheduled-bg)]">
            <div className="text-xs text-[var(--status-scheduled-text)]">請求金額合計</div>
            <div className="text-xl font-bold text-[var(--status-scheduled-text)] mt-1">
              {fmtYen(workTotal)}
            </div>
          </div>
        </div>
      </Card>

      {/* ────────── 売買契約書ボタン ────────── */}
      {visit.purchaseItems.length > 0 && (
        <div className="flex justify-center">
          <Button
            onClick={() => router.push(`/store/schedule/${scheduleId}/agreement`)}
            className="w-full sm:w-auto"
          >
            📝 売買契約書を作成
          </Button>
        </div>
      )}
    </div>
  )
}
