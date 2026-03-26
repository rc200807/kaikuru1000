'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Button from '@/components/Button'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import dynamic from 'next/dynamic'

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false })

/* ─── 型定義 ─── */
type RakutenProduct = {
  productName: string
  brandName: string | null
  makerName: string | null
  janCode: string
  mediumImageUrl: string | null
  productUrlPC: string | null
  averagePrice: number | null
  genreName: string | null
  reviewCount: number | null
  reviewAverage: number | null
}

type PurchaseItem = {
  id: string
  itemName: string
  category: string
  imageUrls: string[]
  quantity: number
  purchasePrice: number
  janCode: string | null
  rakutenData: RakutenProduct | null
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
  preConsentSignature: string | null
  preConsentAt: string | null
  staffName: string | null
  revisitDate: string | null
  revisitStart: string | null
  revisitEnd: string | null
  revisitNote: string | null
  user: { id: string; name: string; address: string; phone: string; customerType: string }
  store: { id: string; name: string; address?: string; phone?: string }
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
  revisit: '後日引取',
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
  rescheduled: 'bg-[var(--status-rescheduled-bg)] text-[var(--status-rescheduled-text)]',
  absent: 'bg-[var(--status-absent-bg)] text-[var(--status-absent-text)]',
  cancelled: 'bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)]',
  revisit: 'bg-orange-100 text-orange-700',
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

  // 訪問ステータス（動的取得）
  const [visitStatuses, setVisitStatuses] = useState<{key:string,label:string,color:string}[]>([])

  // 買取カテゴリー
  const [purchaseCategories, setPurchaseCategories] = useState<{id: string; name: string}[]>([])

  // 買取品目フォーム
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<PurchaseItem | null>(null)
  const [purchaseForm, setPurchaseForm] = useState({ itemName: '', category: '', quantity: 1, purchasePrice: 0, imageUrls: [] as string[], janCode: '', rakutenData: null as RakutenProduct | null })
  const [uploading, setUploading] = useState(false)
  const [savingPurchase, setSavingPurchase] = useState(false)

  // バーコードスキャン
  const [showScanner, setShowScanner] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [janLookupLoading, setJanLookupLoading] = useState(false)
  const [janLookupError, setJanLookupError] = useState<string | null>(null)

  // 事前同意モーダル
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [consentSaving, setConsentSaving] = useState(false)
  const consentCanvasRef = useRef<HTMLCanvasElement>(null)
  const consentDrawingRef = useRef(false)
  const consentHasDrawnRef = useRef(false)

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

  // 再訪問日
  const [showRevisitForm, setShowRevisitForm] = useState(false)
  const [revisitForm, setRevisitForm] = useState({ date: '', start: '', end: '', note: '' })
  const [savingRevisit, setSavingRevisit] = useState(false)

  const fetchVisit = useCallback(async () => {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`)
    if (res.ok) {
      const data = await res.json()
      setVisit(data)
      setEditNote(data.note || '')
      if (data.staffName) setStaffName(data.staffName)

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

  useEffect(() => {
    fetch('/api/purchase-categories')
      .then(res => res.ok ? res.json() : [])
      .then(data => setPurchaseCategories(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/visit-statuses')
      .then(res => res.ok ? res.json() : [])
      .then(data => setVisitStatuses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  /* ─── 買取品目 ─── */
  function resetPurchaseForm() {
    setPurchaseForm({ itemName: '', category: '', quantity: 1, purchasePrice: 0, imageUrls: [], janCode: '', rakutenData: null })
    setEditingPurchase(null)
    setShowPurchaseForm(false)
    setJanLookupError(null)
  }

  function startEditPurchase(item: PurchaseItem) {
    setPurchaseForm({
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      imageUrls: item.imageUrls,
      janCode: item.janCode || '',
      rakutenData: item.rakutenData || null,
    })
    setEditingPurchase(item)
    setShowPurchaseForm(true)
  }

  /* ─── バーコード検出 → 楽天API検索 ─── */
  async function handleBarcodeDetected(code: string) {
    setShowScanner(false)
    setJanLookupLoading(true)
    setJanLookupError(null)

    // フォームにJANコードをセット
    setPurchaseForm(prev => ({ ...prev, janCode: code }))

    try {
      const res = await fetch('/api/jan-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ janCode: code }),
      })

      if (res.ok) {
        const product: RakutenProduct = await res.json()
        // 商品情報でフォームを自動入力
        setPurchaseForm(prev => ({
          ...prev,
          itemName: prev.itemName || product.productName,
          category: prev.category || product.genreName || '',
          janCode: code,
          rakutenData: product,
        }))
        setMessage({ type: 'success', text: `商品を特定しました: ${product.productName}` })
      } else {
        const err = await res.json()
        setJanLookupError(err.error || '商品が見つかりませんでした')
        // JANコードはフォームに残す
      }
    } catch {
      setJanLookupError('商品検索に失敗しました')
    } finally {
      setJanLookupLoading(false)
    }

    // フォームを開く（閉じている場合）
    if (!showPurchaseForm) {
      setShowPurchaseForm(true)
    }
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

    const payload = {
      itemName: purchaseForm.itemName,
      category: purchaseForm.category,
      quantity: purchaseForm.quantity,
      purchasePrice: purchaseForm.purchasePrice,
      imageUrls: purchaseForm.imageUrls,
      janCode: purchaseForm.janCode || null,
      rakutenData: purchaseForm.rakutenData || null,
    }

    if (editingPurchase) {
      // 更新
      await fetch(`/api/purchase-items/${editingPurchase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      // 新規
      await fetch(`/api/visit-schedules/${scheduleId}/purchase-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setSavingPurchase(false)
    resetPurchaseForm()
    fetchVisit()
    setMessage({ type: 'success', text: '買取品目を保存しました' })
  }

  async function addThousandYenBox() {
    setSavingPurchase(true)
    await fetch(`/api/visit-schedules/${scheduleId}/purchase-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemName: '1000円ボックス',
        category: '1000円ボックス',
        quantity: 1,
        purchasePrice: 1000,
        imageUrls: [],
      }),
    })
    setSavingPurchase(false)
    fetchVisit()
    setMessage({ type: 'success', text: '1000円ボックスを追加しました' })
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

  /* ─── 再訪問日保存 ─── */
  async function saveRevisit() {
    if (!revisitForm.date) return
    setSavingRevisit(true)
    await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revisitDate: revisitForm.date,
        revisitStart: revisitForm.start || null,
        revisitEnd: revisitForm.end || null,
        revisitNote: revisitForm.note || null,
      }),
    })
    setSavingRevisit(false)
    setShowRevisitForm(false)
    fetchVisit()
    setMessage({ type: 'success', text: '再訪問日を設定しました' })
  }

  async function deleteRevisit() {
    setSavingRevisit(true)
    await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revisitDate: null,
        revisitStart: null,
        revisitEnd: null,
        revisitNote: null,
      }),
    })
    setSavingRevisit(false)
    setShowRevisitForm(false)
    setRevisitForm({ date: '', start: '', end: '', note: '' })
    fetchVisit()
    setMessage({ type: 'success', text: '再訪問日を削除しました' })
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
        {/* JANコード / 楽天情報 */}
        {purchaseForm.janCode && (
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span className="text-xs font-mono font-medium text-blue-700 dark:text-blue-300">JAN: {purchaseForm.janCode}</span>
              <button
                onClick={() => setPurchaseForm({ ...purchaseForm, janCode: '', rakutenData: null })}
                className="ml-auto text-xs text-blue-500 hover:underline"
              >
                クリア
              </button>
            </div>
            {purchaseForm.rakutenData && (
              <div className="mt-2 space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <div className="font-medium">{purchaseForm.rakutenData.productName}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-blue-600 dark:text-blue-400">
                  {purchaseForm.rakutenData.makerName && <span>メーカー: {purchaseForm.rakutenData.makerName}</span>}
                  {purchaseForm.rakutenData.brandName && <span>ブランド: {purchaseForm.rakutenData.brandName}</span>}
                  {purchaseForm.rakutenData.genreName && <span>ジャンル: {purchaseForm.rakutenData.genreName}</span>}
                  {purchaseForm.rakutenData.averagePrice && <span>参考価格: ¥{purchaseForm.rakutenData.averagePrice.toLocaleString()}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {janLookupLoading && (
          <div className="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            商品情報を検索中...
          </div>
        )}

        {janLookupError && (
          <div className="p-2 rounded text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            {janLookupError}（手動で品名を入力してください）
          </div>
        )}

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
            <select
              className="w-full mt-0.5 text-sm border border-[var(--md-sys-color-outline-variant)] rounded px-2 py-1.5 bg-[var(--md-sys-color-surface-container-low)]"
              value={purchaseForm.category}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, category: e.target.value })}
            >
              <option value="">カテゴリーを選択</option>
              {purchaseCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
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

  /* ─── 事前同意キャンバス ─── */
  function getConsentPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = consentCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }
  function consentStartDraw(e: React.TouchEvent | React.MouseEvent) {
    consentDrawingRef.current = true
    consentHasDrawnRef.current = true
    const ctx = consentCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getConsentPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }
  function consentDraw(e: React.TouchEvent | React.MouseEvent) {
    if (!consentDrawingRef.current) return
    const ctx = consentCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getConsentPos(e)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }
  function consentEndDraw() { consentDrawingRef.current = false }
  function consentClear() {
    const canvas = consentCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    consentHasDrawnRef.current = false
  }

  async function handleSaveConsent() {
    if (!consentHasDrawnRef.current) {
      setMessage({ type: 'error', text: '署名してください' })
      return
    }
    setConsentSaving(true)
    try {
      const signature = consentCanvasRef.current?.toDataURL('image/png') || ''
      const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preConsentSignature: signature, staffName }),
      })
      if (res.ok) {
        await fetchVisit()
        setShowConsentModal(false)
        setMessage({ type: 'success', text: '事前同意を保存しました' })
      }
    } catch { /* ignore */ }
    finally { setConsentSaving(false) }
  }

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
            {(() => {
              const dynStatus = visitStatuses.find(s => s.key === visit.status)
              if (dynStatus) {
                return (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: dynStatus.color }}
                  >
                    {dynStatus.label}
                  </span>
                )
              }
              return (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[visit.status] || ''}`}>
                  {STATUS_LABELS[visit.status] || visit.status}
                </span>
              )
            })()}
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
              {(visitStatuses.length > 0
                ? visitStatuses.map(s => ({ key: s.key, label: s.label }))
                : Object.entries(STATUS_LABELS).map(([k, v]) => ({ key: k, label: v }))
              ).map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
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

      {/* ────────── 事前同意ボタン ────────── */}
      <Card variant="elevated" padding="md">
        <button
          onClick={() => { if (!visit.preConsentAt) { consentHasDrawnRef.current = false; setShowConsentModal(true) } }}
          className={`
            w-full flex items-center justify-center gap-3 px-6 py-5 rounded-2xl text-base font-semibold transition-all
            ${visit.preConsentAt
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
            }
          `}
        >
          {visit.preConsentAt ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          )}
          {visit.preConsentAt ? '事前同意済み' : '事前同意を取得する'}
        </button>
        {visit.preConsentAt && (
          <p className="text-center text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2">
            {format(new Date(visit.preConsentAt), 'M月d日 HH:mm', { locale: ja })} に同意済み
          </p>
        )}
      </Card>

      {/* ────────── 事前同意モーダル ────────── */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[var(--md-sys-color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">弊社サービスをご利用のお客様へ</h2>
                <button onClick={() => setShowConsentModal(false)} className="p-1 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="text-sm text-[var(--md-sys-color-on-surface-variant)] space-y-3 leading-relaxed mb-5">
                <p className="indent-4">この度は、弊社高価古物買取サービスにお申込みいただき、ありがとうございます。お手数ではありますが、担当査定員がお客様のご自宅に訪問し、査定をさせていただく前に必ずご一読ください。</p>
                <p className="indent-4">法令を遵守したお取引をさせていただくために、必要な内容となっておりますのでご協力の程、よろしくお願いいたします。</p>
                <p className="indent-4">弊社コールセンター受付担当のご案内により、お客様のご自宅で買取に関する提案のご承諾をいただきました品種は下記になります。</p>
                <p className="font-semibold text-[var(--md-sys-color-on-surface)]">家電類／ブランド家具類／骨董品類／着物類／ブランド類／金券類／金／宝飾品類／酒類／車／玩具類／楽器類</p>
                <p className="indent-4">弊社ではお客様からの申し込み時に、査定員から上記品種に関する買取の提案について、ご承諾いただいております。査定員による買取の提案について、ご承諾いただけないお客様のご自宅への訪問購入は行っておりません。</p>
                <p className="indent-4">また、いただきました個人情報については、個人情報保護法に従い取り扱い、適切に管理させていただきます。</p>
              </div>

              {/* 担当者名 */}
              <div className="mb-4">
                <TextField
                  label="担当者名"
                  value={staffName}
                  onChange={v => setStaffName(v)}
                  placeholder="査定担当者のお名前"
                />
              </div>

              {/* 署名欄 */}
              <div className="mb-4">
                <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">上記内容に同意します。（署名してください）</p>
                <div className="border border-[var(--md-sys-color-outline-variant)] rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={consentCanvasRef}
                    width={500}
                    height={150}
                    className="w-full touch-none cursor-crosshair"
                    onMouseDown={consentStartDraw}
                    onMouseMove={consentDraw}
                    onMouseUp={consentEndDraw}
                    onMouseLeave={consentEndDraw}
                    onTouchStart={(e) => { e.preventDefault(); consentStartDraw(e) }}
                    onTouchMove={(e) => { e.preventDefault(); consentDraw(e) }}
                    onTouchEnd={consentEndDraw}
                  />
                </div>
                <button onClick={consentClear} className="text-xs text-[var(--md-sys-color-primary)] hover:underline mt-1">
                  署名をクリア
                </button>
              </div>

              {/* ボタン */}
              <div className="flex gap-3 justify-end">
                <Button variant="text" onClick={() => setShowConsentModal(false)}>キャンセル</Button>
                <Button variant="filled" loading={consentSaving} onClick={handleSaveConsent}>同意して保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────── 再訪問日セクション ────────── */}
      <Card variant="elevated" padding="md">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">再訪問日（後日引取）</h3>
          </div>

          {visit.revisitDate && !showRevisitForm ? (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    {format(new Date(visit.revisitDate), 'yyyy年M月d日（E）', { locale: ja })}
                    {visit.revisitStart && visit.revisitEnd && (
                      <span className="ml-2 text-orange-600 dark:text-orange-400">{visit.revisitStart}〜{visit.revisitEnd}</span>
                    )}
                  </p>
                  {visit.revisitNote && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">{visit.revisitNote}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outlined"
                    size="sm"
                    onClick={() => {
                      setRevisitForm({
                        date: visit.revisitDate ? new Date(visit.revisitDate).toISOString().split('T')[0] : '',
                        start: visit.revisitStart || '',
                        end: visit.revisitEnd || '',
                        note: visit.revisitNote || '',
                      })
                      setShowRevisitForm(true)
                    }}
                  >
                    編集
                  </Button>
                  <Button
                    variant="text"
                    size="sm"
                    onClick={deleteRevisit}
                    disabled={savingRevisit}
                  >
                    削除
                  </Button>
                </div>
              </div>
            </div>
          ) : showRevisitForm ? (
            <div className="space-y-3 bg-[var(--md-sys-color-surface-container-low)] rounded-lg p-3">
              <div>
                <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">再訪問日 *</label>
                <input
                  type="date"
                  className="w-full mt-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-2"
                  value={revisitForm.date}
                  onChange={e => setRevisitForm({ ...revisitForm, date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">開始時間</label>
                  <input
                    type="time"
                    className="w-full mt-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-2"
                    value={revisitForm.start}
                    onChange={e => setRevisitForm({ ...revisitForm, start: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">終了時間</label>
                  <input
                    type="time"
                    className="w-full mt-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-2"
                    value={revisitForm.end}
                    onChange={e => setRevisitForm({ ...revisitForm, end: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">メモ</label>
                <textarea
                  className="w-full mt-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small,8px)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-2 min-h-[50px] resize-y"
                  value={revisitForm.note}
                  onChange={e => setRevisitForm({ ...revisitForm, note: e.target.value })}
                  placeholder="例: 大型家具の引取、要トラック"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="text" size="sm" onClick={() => { setShowRevisitForm(false); setRevisitForm({ date: '', start: '', end: '', note: '' }) }}>
                  キャンセル
                </Button>
                <Button variant="filled" size="sm" onClick={saveRevisit} disabled={savingRevisit || !revisitForm.date} loading={savingRevisit}>
                  {savingRevisit ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setShowRevisitForm(true)}
            >
              再訪問日を設定
            </Button>
          )}
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={addThousandYenBox}
                disabled={savingPurchase}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-red-600 text-white hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                1000円ボックスで買取
              </button>
              <button
                onClick={() => { resetPurchaseForm(); setShowScanner(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                JANコード
              </button>
              <Button size="sm" onClick={() => { resetPurchaseForm(); setShowPurchaseForm(true) }}>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  品目を追加
                </span>
              </Button>
            </div>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{item.itemName}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                        {item.category}
                      </span>
                      {item.janCode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-mono">
                          JAN: {item.janCode}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                      数量: {item.quantity} × {fmtYen(item.purchasePrice)} = <strong>{fmtYen(item.purchasePrice * item.quantity)}</strong>
                    </div>
                    {item.rakutenData && (
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                        {item.rakutenData.makerName && <span>{item.rakutenData.makerName}</span>}
                        {item.rakutenData.averagePrice && <span> / 参考: ¥{item.rakutenData.averagePrice.toLocaleString()}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {item.category === '1000円ボックス' ? null : researchResults[item.id] ? (
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
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">品目を追加</h3>
              {!purchaseForm.janCode && (
                <button
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  バーコードで入力
                </button>
              )}
            </div>
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
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                作業を追加
              </span>
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
        <Card variant="elevated" padding="md">
          <div className="space-y-3">
            <TextField
              label="担当者名"
              value={staffName}
              onChange={v => setStaffName(v)}
              placeholder="契約書に記載する担当者名を入力"
            />
            <div className="flex justify-center">
              <Button
                onClick={() => router.push(`/store/schedule/${scheduleId}/agreement?staff=${encodeURIComponent(staffName)}`)}
                className="w-full sm:w-auto"
              >
                📝 売買契約書を作成
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* バーコードスキャナーオーバーレイ */}
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
