'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import TimeSelect from '@/components/TimeSelect'
import SignaturePad from '@/components/SignaturePad'
import PurchaseItemManager, { type ManagedPurchaseItem } from '@/components/store/PurchaseItemManager'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import { DEAL_CATEGORIES, DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE } from '@/lib/deal-categories'
import { formatYen } from '@/lib/currency'
import { convertToJpegIfNeeded } from '@/lib/image-utils'

type PurchaseItem = { id: string; itemName: string; category: string; quantity: number; purchasePrice: number }
type WorkItem = { id: string; workName: string; unitPrice: number; quantity: number; notes: string | null }
type ContractInfo = { id: string; visitScheduleId?: string | null; agreedAt: string; emailSentAt: string | null; customerEmail: string | null; hasPdf: boolean; hasInvoicePdf: boolean }
type EstimateInfo = { id: string; visitScheduleId?: string | null; validUntil: string; purchaseAmount: number; billingAmount: number; emailSentAt: string | null; customerEmail: string | null; hasPdf: boolean; hasInvoicePdf: boolean }

type VisitSchedule = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  note: string | null
  staffName: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
  salesContract: ContractInfo | null
  estimate: EstimateInfo | null
}

type Deal = {
  id: string
  detail: string | null
  status: string
  category: string | null
  occurredAt: string | null
  createdByType: string | null
  createdByName: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  preConsentAt: string | null
  hasPreConsent: boolean
  createdAt: string
  updatedAt: string
  userId: string
  storeId: string | null
  inquiryId: string | null
  user: { id: string; name: string; furigana: string | null; email: string | null; phone: string | null; address: string | null; customerType: string }
  store: { id: string; name: string; code: string; phone: string | null; address: string | null; prefecture: string | null; email: string | null; invoiceNumber: string | null; antiquePermitNumber: string | null } | null
  inquiry: { id: string; inquiryType: string; details: string | null; createdAt: string } | null
  visitSchedules: VisitSchedule[]
  // 案件直下（再ペアレント後の正）
  purchaseItems: ManagedPurchaseItem[]
  workItems: WorkItem[]
  dealContract: ContractInfo | null
  dealEstimate: EstimateInfo | null
  paperContractImages: string[]
  purchaseUpliftPercent: number
}

function fmtDate(d?: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDateTime(d?: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function timeRange(s: string | null, e: string | null) {
  if (!s && !e) return ''
  return `${s ?? ''}${e ? `〜${e}` : ''}`
}
// ISO日時 → <input type="date"> 用の "yyyy-MM-dd"（ローカル時刻基準）
function toDateInput(d?: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const CREATOR_TYPE_LABEL: Record<string, string> = {
  store: '店舗', admin: '管理者', superadmin: '管理者', hr: '管理者', sysadmin: 'システム', customer: 'お客様', partner: 'パートナー',
}
function creatorLabel(d: { createdByName: string | null; createdByType: string | null }) {
  if (!d.createdByName && !d.createdByType) return '—'
  const t = d.createdByType ? CREATOR_TYPE_LABEL[d.createdByType] ?? d.createdByType : null
  return d.createdByName ? `${d.createdByName}${t ? `（${t}）` : ''}` : (t ?? '—')
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">{children}</h2>
)

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3 py-1.5 text-sm">
    <span className="w-24 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
    <span className="flex-1 text-[var(--md-sys-color-on-surface)] break-words">{value || '-'}</span>
  </div>
)

export default function DealDetailView({
  dealId,
  isAdmin,
  backHref,
  visitHrefBase,
}: {
  dealId: string
  isAdmin: boolean
  backHref: string
  visitHrefBase: string
}) {
  const router = useRouter()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailEdit, setDetailEdit] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 案件発生日の編集
  const [occurredEdit, setOccurredEdit] = useState('') // yyyy-MM-dd
  const [savingOccurred, setSavingOccurred] = useState(false)

  // 担当者候補（店舗ポータルのみ取得）
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])

  // 訪問ごとの担当者編集
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffDraft, setStaffDraft] = useState('')
  const [savingStaff, setSavingStaff] = useState(false)

  // 「この案件に訪問を追加」モーダル
  const [showAddVisit, setShowAddVisit] = useState(false)
  const [addVisit, setAddVisit] = useState({ visitDate: '', startTime: '', endTime: '', staffName: '', note: '' })
  const [addingVisit, setAddingVisit] = useState(false)

  // 買取品目（PurchaseItemManager に委譲）／請求項目の登録（案件キー）
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [showAddWork, setShowAddWork] = useState(false)
  const [workForm, setWorkForm] = useState({ workName: '', unitPrice: '', quantity: 1, notes: '' })
  const [showPreview, setShowPreview] = useState(false)
  const [uploadingContract, setUploadingContract] = useState(false)
  const [savingUplift, setSavingUplift] = useState(false)
  const [savingWork, setSavingWork] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  // 事前同意（案件単位）
  const [savingConsent, setSavingConsent] = useState(false)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [consentDraft, setConsentDraft] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/deals/${dealId}`)
      if (res.status === 403) { setError('この案件を閲覧する権限がありません'); setLoading(false); return }
      if (res.status === 404) { setError('案件が見つかりません'); setLoading(false); return }
      if (!res.ok) { setError('案件の取得に失敗しました'); setLoading(false); return }
      const data: Deal = await res.json()
      setDeal(data)
      setDetailEdit(data.detail ?? '')
      setOccurredEdit(toDateInput(data.occurredAt ?? data.createdAt))
    } catch {
      setError('案件の取得に失敗しました')
    }
    setLoading(false)
  }, [dealId])

  useEffect(() => { load() }, [load])

  // 担当者候補（店舗ポータルのみ）
  useEffect(() => {
    if (isAdmin) return
    fetch('/api/store/members')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setMembers(Array.isArray(d) ? d.map((m: any) => ({ id: m.id, name: m.name })) : []))
      .catch(() => {})
  }, [isAdmin])

  // 買取品目カテゴリ
  useEffect(() => {
    fetch('/api/purchase-categories')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])


  async function addWorkItem() {
    if (!deal || !workForm.workName) return
    setSavingWork(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}/work-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workName: workForm.workName,
        unitPrice: Number(workForm.unitPrice) || 0,
        quantity: Number(workForm.quantity) || 1,
        notes: workForm.notes.trim() || null,
      }),
    })
    setSavingWork(false)
    if (res.ok) {
      setShowAddWork(false)
      setWorkForm({ workName: '', unitPrice: '', quantity: 1, notes: '' })
      load()
    } else setMsg({ type: 'error', text: '請求項目の追加に失敗しました' })
  }

  async function deleteItem(kind: 'purchase' | 'work', itemId: string) {
    if (!confirm('この項目を削除しますか？')) return
    setDeletingItemId(itemId)
    const path = kind === 'purchase' ? `/api/purchase-items/${itemId}` : `/api/work-items/${itemId}`
    const res = await fetch(path, { method: 'DELETE' })
    setDeletingItemId(null)
    if (res.ok) load()
    else setMsg({ type: 'error', text: '削除に失敗しました' })
  }

  // 紙で作成した売買契約書の写真アップロード / 削除
  async function handlePaperContractUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingContract(true)
    setMsg(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const converted = await convertToJpegIfNeeded(files[i])
        const fd = new FormData()
        fd.append('file', converted)
        const res = await fetch(`/api/deals/${dealId}/contract-images`, { method: 'POST', body: fd })
        if (!res.ok) { setMsg({ type: 'error', text: '写真のアップロードに失敗しました' }); break }
      }
      await load()
      setMsg({ type: 'success', text: '契約書の写真をアップロードしました' })
    } catch {
      setMsg({ type: 'error', text: '写真のアップロードに失敗しました' })
    } finally {
      setUploadingContract(false)
      e.target.value = ''
    }
  }

  async function deletePaperContract(index: number) {
    if (!confirm('この写真を削除しますか？')) return
    const res = await fetch(`/api/deals/${dealId}/contract-images?index=${index}`, { method: 'DELETE' })
    if (res.ok) { await load(); setMsg({ type: 'success', text: '写真を削除しました' }) }
    else setMsg({ type: 'error', text: '削除に失敗しました' })
  }

  // 買取金額の上乗せ率（10%/15%）。同じ値を再度押すと解除（排他トグル）
  async function saveUplift(pct: number) {
    if (!deal) return
    const next = (deal.purchaseUpliftPercent ?? 0) === pct ? 0 : pct
    setSavingUplift(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseUpliftPercent: next }),
    })
    setSavingUplift(false)
    if (res.ok) { await load(); setMsg({ type: 'success', text: next > 0 ? `買取金額を${next}%上乗せしました` : '上乗せを解除しました' }) }
    else setMsg({ type: 'error', text: '上乗せの更新に失敗しました' })
  }

  async function savePreConsent(signature: string | null) {
    setSavingConsent(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preConsentSignature: signature }),
    })
    setSavingConsent(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, hasPreConsent: !!signature, preConsentAt: signature ? new Date().toISOString() : null } : prev)
      setShowConsentModal(false)
      setConsentDraft(null)
      setMsg({ type: 'success', text: signature ? '事前同意を保存しました' : '事前同意をクリアしました' })
    } else setMsg({ type: 'error', text: '事前同意の保存に失敗しました' })
  }

  async function saveOccurred() {
    if (!deal || !occurredEdit) return
    setSavingOccurred(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurredAt: occurredEdit }),
    })
    setSavingOccurred(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, occurredAt: new Date(occurredEdit).toISOString() } : prev)
      setMsg({ type: 'success', text: '案件発生日を保存しました' })
    } else setMsg({ type: 'error', text: '発生日の保存に失敗しました' })
  }

  async function saveStaff(visitId: string) {
    setSavingStaff(true)
    setMsg(null)
    const res = await fetch(`/api/visit-schedules/${visitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: staffDraft || null }),
    })
    setSavingStaff(false)
    if (res.ok) {
      setDeal(prev => prev ? { ...prev, visitSchedules: prev.visitSchedules.map(v => v.id === visitId ? { ...v, staffName: staffDraft || null } : v) } : prev)
      setEditingStaffId(null)
    } else setMsg({ type: 'error', text: '担当者の保存に失敗しました' })
  }

  async function handleAddVisit() {
    if (!deal || !deal.store || !addVisit.visitDate) return
    setAddingVisit(true)
    setMsg(null)
    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: deal.user.id,
        storeId: deal.store.id,
        dealId: deal.id,
        visitDate: addVisit.visitDate,
        startTime: addVisit.startTime || undefined,
        endTime: addVisit.endTime || undefined,
        staffName: addVisit.staffName || undefined,
        note: addVisit.note || undefined,
      }),
    })
    setAddingVisit(false)
    if (res.ok) {
      setShowAddVisit(false)
      setAddVisit({ visitDate: '', startTime: '', endTime: '', staffName: '', note: '' })
      setMsg({ type: 'success', text: '訪問を追加しました' })
      load()
    } else {
      const d = await res.json().catch(() => null)
      setMsg({ type: 'error', text: d?.error || '訪問の追加に失敗しました' })
    }
  }

  async function changeStatus(status: string) {
    if (!deal || status === deal.status) return
    setSavingStatus(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSavingStatus(false)
    if (res.ok) setDeal(prev => prev ? { ...prev, status } : prev)
    else setMsg({ type: 'error', text: 'ステータスの変更に失敗しました' })
  }

  async function changeCategory(category: string) {
    if (!deal || category === deal.category) return
    setSavingCategory(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    })
    setSavingCategory(false)
    if (res.ok) setDeal(prev => prev ? { ...prev, category } : prev)
    else setMsg({ type: 'error', text: 'カテゴリーの変更に失敗しました' })
  }

  async function saveDetail() {
    if (!deal) return
    setSavingDetail(true)
    setMsg(null)
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detail: detailEdit }),
    })
    setSavingDetail(false)
    if (res.ok) { setDeal(prev => prev ? { ...prev, detail: detailEdit } : prev); setMsg({ type: 'success', text: '案件内容を保存しました' }) }
    else setMsg({ type: 'error', text: '保存に失敗しました' })
  }

  async function handleDelete() {
    if (!confirm('この案件を削除しますか？（紐づく訪問予定は削除されず、リンクのみ解除されます）')) return
    setDeleting(true)
    const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { router.push(backHref); return }
    const data = await res.json().catch(() => null)
    setMsg({ type: 'error', text: data?.error || '削除に失敗しました' })
  }

  if (loading) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  if (error || !deal) {
    return (
      <div className="min-h-screen bg-[var(--md-sys-color-background)]">
        <AppBar title="案件詳細" actions={<Link href={backHref}><Button variant="text" size="sm">← 戻る</Button></Link>} />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {error ?? '案件が見つかりません'}
        </div>
      </div>
    )
  }

  const badge = DEAL_STATUS_BADGE[deal.status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
  const catBadge = DEAL_CATEGORY_BADGE[deal.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase
  // 案件直下の品目（再ペアレント後の正）
  const purchaseItems = deal.purchaseItems ?? []
  const workItems = deal.workItems ?? []
  const upliftPct = deal.purchaseUpliftPercent ?? 0
  const basePurchase = purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const upliftAmount = Math.round(basePurchase * upliftPct / 100)
  const totalPurchase = basePurchase + upliftAmount
  const totalBilling = deal.billingAmount ?? workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const dealContract = deal.dealContract
  const dealEstimate = deal.dealEstimate
  const editable = !isAdmin // 品目・事前同意の編集は店舗ポータル（管理は閲覧）
  // 書類作成フローの対象訪問（最新）。フローは案件配下の品目で構成され、結果は案件の書類になる。
  const targetVisitId = deal.visitSchedules[0]?.id ?? null

  // 進捗タイムライン（取得可能な日時を時系列で）
  const timeline: { label: string; at: string; sub?: string }[] = [
    { label: '案件発生', at: deal.occurredAt ?? deal.createdAt },
    ...deal.visitSchedules.map(v => ({ label: '訪問', at: v.visitDate, sub: v.staffName ? `担当 ${v.staffName}` : undefined })),
    ...(dealEstimate ? [{ label: '見積作成', at: dealEstimate.validUntil, sub: `有効期限 ${fmtDate(dealEstimate.validUntil)}` }] : []),
    ...(dealContract ? [{ label: '契約締結', at: dealContract.agreedAt }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const pdfUrl = (type: 'contract' | 'estimate', visitId: string, kind: 'sale' | 'invoice') =>
    `/api/magic-link/document-pdf?type=${type}&visitId=${visitId}&kind=${kind}`

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] pb-16">
      <AppBar
        title={deal.user.name}
        subtitle={`案件 ・ 発生 ${fmtDate(deal.occurredAt ?? deal.createdAt)}`}
        actions={<Link href={backHref}><Button variant="text" size="sm">← 一覧</Button></Link>}
      />

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {msg && <MessageBanner severity={msg.type}>{msg.text}</MessageBanner>}

        {/* 案件サマリー */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.fg }}>
                {DEAL_STATUS_LABEL[deal.status as DealStatus] ?? deal.status}
              </span>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: catBadge.bg, color: catBadge.fg }}>
                {DEAL_CATEGORY_LABEL[deal.category ?? 'purchase'] ?? deal.category}
              </span>
            </div>
            <Button size="sm" variant="outlined" onClick={() => setShowPreview(true)}>契約プレビュー</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '訪問回数', value: `${deal.visitSchedules.length} 回` },
              { label: '合計買取金額', value: formatYen(totalPurchase) },
              { label: '合計請求金額', value: formatYen(totalBilling) },
              { label: '見積/契約', value: `${dealEstimate ? 1 : 0} / ${dealContract ? 1 : 0} 件` },
            ].map(s => (
              <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.label}</div>
                <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
          {/* 案件発生日（編集可）＋ 作成者 */}
          <div className="flex flex-wrap items-end gap-4 mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">案件発生日</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={occurredEdit}
                  onChange={e => setOccurredEdit(e.target.value)}
                  className="h-9 px-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
                />
                <Button
                  size="sm"
                  variant="text"
                  onClick={saveOccurred}
                  loading={savingOccurred}
                  disabled={savingOccurred || !occurredEdit || occurredEdit === toDateInput(deal.occurredAt ?? deal.createdAt)}
                >
                  保存
                </Button>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">作成者</div>
              <div className="text-sm text-[var(--md-sys-color-on-surface)] h-9 flex items-center">{creatorLabel(deal)}</div>
            </div>
          </div>
        </Card>

        {/* ステータス変更 ＋ 案件内容 */}
        <Card variant="outlined" padding="md">
          <SectionTitle>ステータス・案件内容</SectionTitle>
          {/* カテゴリー */}
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">カテゴリー</label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {DEAL_CATEGORIES.map(cat => {
              const active = (deal.category ?? 'purchase') === cat
              const c = DEAL_CATEGORY_BADGE[cat]
              return (
                <button
                  key={cat}
                  type="button"
                  disabled={savingCategory}
                  onClick={() => changeCategory(cat)}
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
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">ステータス</label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {DEAL_STATUS_ORDER.map(s => {
              const active = deal.status === s
              const c = DEAL_STATUS_BADGE[s]
              return (
                <button
                  key={s}
                  type="button"
                  disabled={savingStatus}
                  onClick={() => changeStatus(s)}
                  className="text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
                  style={active
                    ? { background: c.bg, color: c.fg, borderColor: c.fg }
                    : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  {DEAL_STATUS_LABEL[s]}
                </button>
              )
            })}
          </div>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">案件内容</label>
          <textarea
            value={detailEdit}
            onChange={e => setDetailEdit(e.target.value)}
            rows={3}
            placeholder="買取内容・状況など..."
            className="w-full px-3.5 py-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2 resize-y"
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={saveDetail} loading={savingDetail} disabled={savingDetail || detailEdit === (deal.detail ?? '')}>
              保存
            </Button>
          </div>
        </Card>

        {/* 顧客情報 */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>顧客情報</SectionTitle>
            {isAdmin && (
              <Link href={`/admin/customers?focus=${deal.user.id}`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">
                顧客ページ →
              </Link>
            )}
          </div>
          <Row label="氏名" value={deal.user.name} />
          <Row label="ふりがな" value={deal.user.furigana} />
          <Row label="電話" value={deal.user.phone} />
          <Row label="メール" value={deal.user.email} />
          <Row label="住所" value={deal.user.address} />
        </Card>

        {/* 担当店舗（管理のみ詳細） */}
        {isAdmin && (
          <Card variant="outlined" padding="md">
            <SectionTitle>担当店舗</SectionTitle>
            {deal.store ? (
              <>
                <Row label="店舗名" value={`${deal.store.name}（${deal.store.code}）`} />
                <Row label="電話" value={deal.store.phone} />
                <Row label="住所" value={`${deal.store.prefecture ?? ''}${deal.store.address ?? ''}`} />
                <Row label="メール" value={deal.store.email} />
                <Row label="インボイス番号" value={deal.store.invoiceNumber} />
                <Row label="古物許可番号" value={deal.store.antiquePermitNumber} />
              </>
            ) : (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">店舗未割当</p>
            )}
          </Card>
        )}

        {/* 問い合わせ由来 */}
        {deal.inquiry && (
          <Card variant="outlined" padding="md">
            <SectionTitle>問い合わせ由来</SectionTitle>
            <Row label="種別" value={deal.inquiry.inquiryType} />
            <Row label="受付日時" value={fmtDateTime(deal.inquiry.createdAt)} />
            {deal.inquiry.details && <Row label="内容" value={<span className="whitespace-pre-wrap">{deal.inquiry.details}</span>} />}
          </Card>
        )}

        {/* 進捗タイムライン */}
        <Card variant="outlined" padding="md">
          <SectionTitle>進捗タイムライン</SectionTitle>
          <ol className="relative border-l border-[var(--md-sys-color-outline-variant)] ml-1.5 space-y-3">
            {timeline.map((t, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full" style={{ background: 'var(--portal-primary,#374151)' }} />
                <div className="text-sm text-[var(--md-sys-color-on-surface)]">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] ml-2 text-xs">{fmtDate(t.at)}</span>
                </div>
                {t.sub && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{t.sub}</div>}
              </li>
            ))}
          </ol>
        </Card>

        {/* 訪問スケジュール一覧 */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">訪問スケジュール（{deal.visitSchedules.length}件）</h2>
            {deal.store ? (
              <Button size="sm" variant="outlined" onClick={() => setShowAddVisit(true)}>＋ 訪問を追加</Button>
            ) : (
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">店舗未割当のため追加不可</span>
            )}
          </div>
          {deal.visitSchedules.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">紐づく訪問はありません</p>
          ) : (
            <div className="space-y-2.5">
              {deal.visitSchedules.map(v => (
                <div key={v.id} className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusBadge status={v.status as any} />
                      <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{fmtDate(v.visitDate)}</span>
                      {timeRange(v.startTime, v.endTime) && (
                        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{timeRange(v.startTime, v.endTime)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link href={`${visitHrefBase}/${v.id}`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">訪問詳細 →</Link>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {/* 担当者（訪問ごと・編集可） */}
                    {editingStaffId === v.id ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          list="deal-staff-options"
                          value={staffDraft}
                          onChange={e => setStaffDraft(e.target.value)}
                          placeholder="担当者名"
                          className="h-8 px-2 text-xs bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
                        />
                        <button type="button" disabled={savingStaff} onClick={() => saveStaff(v.id)} className="text-[var(--portal-primary,#374151)] hover:underline disabled:opacity-50">保存</button>
                        <button type="button" onClick={() => setEditingStaffId(null)} className="hover:underline">取消</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        担当: {v.staffName || '未設定'}
                        <button type="button" onClick={() => { setEditingStaffId(v.id); setStaffDraft(v.staffName ?? '') }} className="text-[var(--portal-primary,#374151)] hover:underline">変更</button>
                      </span>
                    )}
                    <span>買取: {formatYen(v.purchaseAmount)}</span>
                    <span>請求: {formatYen(v.billingAmount)}</span>
                  </div>
                  {v.note && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">{v.note}</p>}
                  {/* 契約/見積DL */}
                  {(v.salesContract || v.estimate) && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                      {v.salesContract?.hasPdf && (
                        <a href={pdfUrl('contract', v.id, 'sale')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">売買契約書PDF</a>
                      )}
                      {v.salesContract?.hasInvoicePdf && (
                        <a href={pdfUrl('contract', v.id, 'invoice')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求書PDF</a>
                      )}
                      {v.estimate?.hasPdf && (
                        <a href={pdfUrl('estimate', v.id, 'sale')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">買取見積PDF</a>
                      )}
                      {v.estimate?.hasInvoicePdf && (
                        <a href={pdfUrl('estimate', v.id, 'invoice')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求見積PDF</a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 事前同意（案件単位） */}
        <Card variant="outlined" padding="md">
          <SectionTitle>事前同意</SectionTitle>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              {deal.hasPreConsent
                ? <span className="text-green-600 dark:text-green-400 font-medium">取得済み（{fmtDateTime(deal.preConsentAt)}）</span>
                : <span className="text-[var(--md-sys-color-on-surface-variant)]">未取得</span>}
            </div>
            {editable && (
              <div className="flex items-center gap-2">
                <Button variant="outlined" size="sm" onClick={() => { setConsentDraft(null); setShowConsentModal(true) }}>
                  {deal.hasPreConsent ? '署名し直す' : '署名して同意取得'}
                </Button>
                {deal.hasPreConsent && (
                  <Button variant="text" size="sm" onClick={() => savePreConsent(null)} loading={savingConsent} disabled={savingConsent}>クリア</Button>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* 買取品目（案件直下・訪問詳細と同等の機能：画像/AI査定/1000円ボックス/在庫化） */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">買取品目（{purchaseItems.length}件）</h2>
            <div className="text-right">
              <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">合計 {formatYen(totalPurchase)}</span>
              {upliftPct > 0 && (
                <div className="text-[11px] text-[var(--portal-primary)]">（買取 {formatYen(basePurchase)} ＋{upliftPct}%上乗せ {formatYen(upliftAmount)}）</div>
              )}
            </div>
          </div>

          {/* 買取金額の上乗せ（10%/15%・排他トグル） */}
          {editable && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">買取金額の上乗せ:</span>
              {[10, 15].map(pct => {
                const active = upliftPct === pct
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => saveUplift(pct)}
                    disabled={savingUplift}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${active ? 'bg-[var(--portal-primary)] text-white border-[var(--portal-primary)]' : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}
                  >
                    {pct}%UP{active ? ' ✓' : ''}
                  </button>
                )
              })}
              {upliftPct > 0 && (
                <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">（同じボタンをもう一度押すと解除）</span>
              )}
            </div>
          )}

          <PurchaseItemManager
            parentType="deal"
            parentId={deal.id}
            items={purchaseItems}
            categories={categories}
            editable={editable}
            onChanged={load}
            onMessage={setMsg}
          />
        </Card>

        {/* 請求項目（案件直下） */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">請求項目（{workItems.length}件）</h2>
            {editable && <Button size="sm" variant="outlined" onClick={() => setShowAddWork(true)}>＋ 追加</Button>}
          </div>
          {workItems.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">請求項目はありません</p>
          ) : (
            <div className="space-y-1.5">
              {workItems.map(wi => (
                <div key={wi.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
                  <div className="min-w-0">
                    <div className="text-[var(--md-sys-color-on-surface)] truncate">{wi.workName}</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{formatYen(wi.unitPrice)} ・ ×{wi.quantity}</div>
                    {wi.notes && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap break-words">備考: {wi.notes}</div>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-medium text-[var(--md-sys-color-on-surface)]">{formatYen(wi.unitPrice * wi.quantity)}</span>
                    {editable && <button type="button" onClick={() => deleteItem('work', wi.id)} disabled={deletingItemId === wi.id} className="text-[11px] text-[var(--md-sys-color-error,#B3261E)] hover:underline disabled:opacity-50">削除</button>}
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                <span>合計請求金額</span><span>{formatYen(totalBilling)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* 売買契約書・見積（案件単位） */}
        <Card variant="outlined" padding="md">
          <SectionTitle>売買契約書・見積</SectionTitle>
          {!dealContract && !dealEstimate ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">作成された書類はありません</p>
          ) : (
            <div className="space-y-3">
              {dealContract && (
                <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                  <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">売買契約書・請求書</div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">締結: {fmtDateTime(dealContract.agreedAt)}</div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    メール: {dealContract.emailSentAt ? `${fmtDateTime(dealContract.emailSentAt)}（${dealContract.customerEmail ?? '-'}）` : '未送信'}
                  </div>
                  {dealContract.visitScheduleId && (dealContract.hasPdf || dealContract.hasInvoicePdf) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {dealContract.hasPdf && <a href={pdfUrl('contract', dealContract.visitScheduleId, 'sale')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">売買契約書PDF</a>}
                      {dealContract.hasInvoicePdf && <a href={pdfUrl('contract', dealContract.visitScheduleId, 'invoice')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求書PDF</a>}
                    </div>
                  )}
                </div>
              )}
              {dealEstimate && (
                <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                  <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">見積</div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    有効期限: {fmtDate(dealEstimate.validUntil)} ・ 買取 {formatYen(dealEstimate.purchaseAmount)} / 請求 {formatYen(dealEstimate.billingAmount)}
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    メール: {dealEstimate.emailSentAt ? `${fmtDateTime(dealEstimate.emailSentAt)}（${dealEstimate.customerEmail ?? '-'}）` : '未送信'}
                  </div>
                  {dealEstimate.visitScheduleId && (dealEstimate.hasPdf || dealEstimate.hasInvoicePdf) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {dealEstimate.hasPdf && <a href={pdfUrl('estimate', dealEstimate.visitScheduleId, 'sale')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">買取見積PDF</a>}
                      {dealEstimate.hasInvoicePdf && <a href={pdfUrl('estimate', dealEstimate.visitScheduleId, 'invoice')} className="text-[11px] px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80">請求見積PDF</a>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 紙の売買契約書（写真） */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3 gap-2">
            <SectionTitle>紙の売買契約書（写真）</SectionTitle>
            {editable && (
              <label className={`text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--portal-primary)] hover:bg-[var(--md-sys-color-surface-container-high)] ${uploadingContract ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
                {uploadingContract ? 'アップロード中...' : '＋ 写真を追加'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="hidden" onChange={handlePaperContractUpload} disabled={uploadingContract} />
              </label>
            )}
          </div>
          {deal.paperContractImages.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">紙で作成した売買契約書の写真はありません{editable ? '。「＋ 写真を追加」からアップロードできます。' : ''}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {deal.paperContractImages.map((url, idx) => (
                <div key={idx} className="relative">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`紙契約書 ${idx + 1}`} className="w-24 h-24 object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)]" />
                  </a>
                  {editable && (
                    <button type="button" onClick={() => deletePaperContract(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--md-sys-color-error)] text-white text-xs flex items-center justify-center shadow">×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 書類を作成（店舗ポータル） */}
        {editable && (
          <Card variant="outlined" padding="md">
            <SectionTitle>書類を作成</SectionTitle>
            {targetVisitId ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outlined" onClick={() => router.push(`/store/schedule/${targetVisitId}/estimate?dealId=${deal.id}`)}>見積書を作成</Button>
                  <Button onClick={() => router.push(`/store/schedule/${targetVisitId}/agreement?dealId=${deal.id}`)}>売買契約書を作成</Button>
                </div>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-2">この案件の買取品目・請求項目をもとに、署名・同意のうえ書類を作成します。</p>
              </>
            ) : (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">書類作成には訪問が必要です。先に「訪問を追加」してください。</p>
            )}
          </Card>
        )}

        {/* 管理のみ: 削除 */}
        {isAdmin && (
          <div className="flex justify-end pt-2">
            <Button variant="outlined" size="sm" onClick={handleDelete} loading={deleting} disabled={deleting}>
              案件を削除
            </Button>
          </div>
        )}
      </div>

      {/* 担当者候補（店舗メンバー） */}
      <datalist id="deal-staff-options">
        {members.map(m => <option key={m.id} value={m.name} />)}
      </datalist>

      {/* 契約プレビュー（顧客と買取・請求・お支払い金額を確認） */}
      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="契約プレビュー" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg px-3 py-2" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
            <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{deal.user.name} 様</span>
            {deal.store ? <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]"> ・ {deal.store.name}</span> : null}
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">お客様と一緒に、買取内容・請求内容・お支払い金額をご確認ください。</p>
          </div>

          {/* 買取品目 */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-2">買取品目</h3>
            {purchaseItems.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">買取品目はありません</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">品名</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseItems.map(it => (
                      <tr key={it.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50 last:border-0">
                        <td className="px-2 py-1.5 text-[var(--md-sys-color-on-surface)]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{it.itemName}</span>
                            {it.isAdditionalRequest && <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">追加依頼品</span>}
                            <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{it.category}</span>
                          </div>
                          {it.notes && <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap break-words">備考: {it.notes}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{it.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{formatYen(it.purchasePrice)}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{formatYen(it.purchasePrice * it.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {upliftPct > 0 && (
                      <>
                        <tr>
                          <td colSpan={3} className="px-2 py-1 text-right text-[var(--md-sys-color-on-surface-variant)]">小計</td>
                          <td className="px-2 py-1 text-right text-[var(--md-sys-color-on-surface)]">{formatYen(basePurchase)}</td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="px-2 py-1 text-right text-[var(--portal-primary)]">買取金額 {upliftPct}%上乗せ</td>
                          <td className="px-2 py-1 text-right text-[var(--portal-primary)]">＋{formatYen(upliftAmount)}</td>
                        </tr>
                      </>
                    )}
                    <tr className="bg-[var(--md-sys-color-surface-container-low)]">
                      <td colSpan={3} className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">買取合計</td>
                      <td className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">{formatYen(totalPurchase)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* 請求項目 */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-2">請求項目</h3>
            {workItems.length === 0 ? (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">請求項目はありません</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                      <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">作業名</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                      <th className="text-right px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workItems.map(wi => (
                      <tr key={wi.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50 last:border-0">
                        <td className="px-2 py-1.5 text-[var(--md-sys-color-on-surface)]">
                          <div>{wi.workName}</div>
                          {wi.notes && <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] whitespace-pre-wrap break-words">備考: {wi.notes}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{wi.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--md-sys-color-on-surface)]">{formatYen(wi.unitPrice)}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-[var(--md-sys-color-on-surface)]">{formatYen(wi.unitPrice * wi.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--md-sys-color-surface-container-low)]">
                      <td colSpan={3} className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">請求合計</td>
                      <td className="px-2 py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">{formatYen(totalBilling)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* お支払い金額 */}
          <div className="rounded-xl p-4 border border-[var(--portal-primary,#374151)]/30" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
            <div className="space-y-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <div className="flex justify-between"><span>買取合計</span><span>{formatYen(totalPurchase)}</span></div>
              <div className="flex justify-between"><span>請求合計</span><span>− {formatYen(totalBilling)}</span></div>
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex justify-between items-center">
              <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">お支払い金額</span>
              <span className="text-xl font-bold text-[var(--portal-primary,#374151)]">{formatYen(totalPurchase - totalBilling)}</span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
              お支払い金額 = 買取合計 − 請求合計
              {totalPurchase - totalBilling < 0 && '（マイナスの場合はお客様からのお支払いとなります）'}
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="text" onClick={() => setShowPreview(false)}>閉じる</Button>
          </div>
        </div>
      </Modal>

      {/* この案件に訪問を追加 */}
      <Modal open={showAddVisit} onClose={() => setShowAddVisit(false)} title="この案件に訪問を追加" size="md">
        <div className="space-y-4">
          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
            <span className="font-semibold">{deal.user.name}</span>{deal.store ? ` ・ ${deal.store.name}` : ''}
          </div>
          <TextField
            label="訪問日"
            type="date"
            value={addVisit.visitDate}
            onChange={v => setAddVisit(prev => ({ ...prev, visitDate: v }))}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="開始時間（任意）" value={addVisit.startTime} onChange={v => setAddVisit(prev => ({ ...prev, startTime: v }))} />
            <TimeSelect label="終了時間（任意）" value={addVisit.endTime} onChange={v => setAddVisit(prev => ({ ...prev, endTime: v }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">担当者（任意）</label>
            <input
              list="deal-staff-options"
              value={addVisit.staffName}
              onChange={e => setAddVisit(prev => ({ ...prev, staffName: e.target.value }))}
              placeholder="担当者名を選択または入力"
              className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
            />
          </div>
          <TextField
            label="メモ（任意）"
            value={addVisit.note}
            onChange={v => setAddVisit(prev => ({ ...prev, note: v }))}
            placeholder="訪問に関するメモ..."
            rows={3}
          />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outlined" type="button" onClick={() => setShowAddVisit(false)}>キャンセル</Button>
            <Button onClick={handleAddVisit} loading={addingVisit} disabled={addingVisit || !addVisit.visitDate}>
              訪問を追加
            </Button>
          </div>
        </div>
      </Modal>


      {/* 請求項目を追加 */}
      <Modal open={showAddWork} onClose={() => setShowAddWork(false)} title="請求項目を追加" size="md">
        <div className="space-y-4">
          <TextField label="作業名" value={workForm.workName} onChange={v => setWorkForm(prev => ({ ...prev, workName: v }))} required />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="単価（円）" type="number" value={workForm.unitPrice} onChange={v => setWorkForm(prev => ({ ...prev, unitPrice: v }))} />
            <TextField label="数量" type="number" value={String(workForm.quantity)} onChange={v => setWorkForm(prev => ({ ...prev, quantity: Number(v) || 1 }))} />
          </div>
          <TextField label="備考" rows={2} value={workForm.notes} onChange={v => setWorkForm(prev => ({ ...prev, notes: v }))} />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outlined" type="button" onClick={() => setShowAddWork(false)}>キャンセル</Button>
            <Button onClick={addWorkItem} loading={savingWork} disabled={savingWork || !workForm.workName}>追加</Button>
          </div>
        </div>
      </Modal>

      {/* 事前同意（署名） */}
      <Modal open={showConsentModal} onClose={() => setShowConsentModal(false)} title="事前同意の取得" size="md">
        <div className="space-y-4">
          {/* 同意文面（訪問詳細の事前同意と同一文面） */}
          <div className="rounded-[var(--md-sys-shape-small,8px)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4 max-h-[40vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">弊社サービスをご利用のお客様へ</h3>
            <div className="text-sm text-[var(--md-sys-color-on-surface-variant)] space-y-3 leading-relaxed">
              <p className="indent-4">この度は、弊社高価古物買取サービスにお申込みいただき、ありがとうございます。お手数ではありますが、担当査定員がお客様のご自宅に訪問し、査定をさせていただく前に必ずご一読ください。</p>
              <p className="indent-4">法令を遵守したお取引をさせていただくために、必要な内容となっておりますのでご協力の程、よろしくお願いいたします。</p>
              <p className="indent-4">弊社コールセンター受付担当のご案内により、お客様のご自宅で買取に関する提案のご承諾をいただきました品種は下記になります。</p>
              <p className="font-semibold text-[var(--md-sys-color-on-surface)]">家電類／ブランド家具類／骨董品類／着物類／ブランド類／金券類／金／宝飾品類／酒類／車／玩具類／楽器類</p>
              <p className="indent-4">弊社ではお客様からの申し込み時に、査定員から上記品種に関する買取の提案について、ご承諾いただいております。査定員による買取の提案について、ご承諾いただけないお客様のご自宅への訪問購入は行っておりません。</p>
              <p className="indent-4">また、いただきました個人情報については、個人情報保護法に従い取り扱い、適切に管理させていただきます。</p>
            </div>
          </div>
          <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
            上記内容に同意します。下の枠内にご署名をお願いします。
          </p>
          <SignaturePad onSignatureChange={setConsentDraft} initialDataUrl={null} />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outlined" type="button" onClick={() => setShowConsentModal(false)}>キャンセル</Button>
            <Button onClick={() => savePreConsent(consentDraft)} loading={savingConsent} disabled={savingConsent || !consentDraft}>同意を保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
