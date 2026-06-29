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
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import { formatYen } from '@/lib/currency'

type PurchaseItem = { id: string; itemName: string; category: string; quantity: number; purchasePrice: number }
type WorkItem = { id: string; workName: string; unitPrice: number; quantity: number }
type ContractInfo = { id: string; agreedAt: string; emailSentAt: string | null; customerEmail: string | null; hasPdf: boolean; hasInvoicePdf: boolean }
type EstimateInfo = { id: string; validUntil: string; purchaseAmount: number; billingAmount: number; emailSentAt: string | null; customerEmail: string | null; hasPdf: boolean; hasInvoicePdf: boolean }

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
  occurredAt: string | null
  createdByType: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  userId: string
  storeId: string | null
  inquiryId: string | null
  user: { id: string; name: string; furigana: string | null; email: string | null; phone: string | null; address: string | null; customerType: string }
  store: { id: string; name: string; code: string; phone: string | null; address: string | null; prefecture: string | null; email: string | null; invoiceNumber: string | null; antiquePermitNumber: string | null } | null
  inquiry: { id: string; inquiryType: string; details: string | null; createdAt: string } | null
  visitSchedules: VisitSchedule[]
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
  const totalPurchase = deal.visitSchedules.reduce((s, v) => s + (v.purchaseAmount ?? 0), 0)
  const totalBilling = deal.visitSchedules.reduce((s, v) => s + (v.billingAmount ?? 0), 0)
  const contracts = deal.visitSchedules.filter(v => v.salesContract)
  const estimates = deal.visitSchedules.filter(v => v.estimate)
  const allPurchaseItems = deal.visitSchedules.flatMap(v => v.purchaseItems.map(pi => ({ ...pi, visitDate: v.visitDate })))
  const allWorkItems = deal.visitSchedules.flatMap(v => v.workItems.map(wi => ({ ...wi, visitDate: v.visitDate })))

  // 進捗タイムライン（取得可能な日時を時系列で）
  const timeline: { label: string; at: string; sub?: string }[] = [
    { label: '案件発生', at: deal.occurredAt ?? deal.createdAt },
    ...deal.visitSchedules.map(v => ({ label: '訪問', at: v.visitDate, sub: v.staffName ? `担当 ${v.staffName}` : undefined })),
    ...estimates.map(v => ({ label: '見積作成', at: v.estimate!.validUntil, sub: `有効期限 ${fmtDate(v.estimate!.validUntil)}` })),
    ...contracts.map(v => ({ label: '契約締結', at: v.salesContract!.agreedAt })),
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
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.fg }}>
              {DEAL_STATUS_LABEL[deal.status as DealStatus] ?? deal.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '訪問回数', value: `${deal.visitSchedules.length} 回` },
              { label: '合計買取金額', value: formatYen(totalPurchase) },
              { label: '合計請求金額', value: formatYen(totalBilling) },
              { label: '見積/契約', value: `${estimates.length} / ${contracts.length} 件` },
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
                      {!isAdmin && (
                        <>
                          <Link href={`/store/schedule/${v.id}/estimate`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">見積作成</Link>
                          <Link href={`/store/schedule/${v.id}/agreement`} className="text-xs text-[var(--portal-primary,#374151)] hover:underline">契約作成</Link>
                        </>
                      )}
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

        {/* 買取品目（集約） */}
        <Card variant="outlined" padding="md">
          <SectionTitle>買取品目（{allPurchaseItems.length}件）</SectionTitle>
          {allPurchaseItems.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">買取品目はありません</p>
          ) : (
            <div className="space-y-1.5">
              {allPurchaseItems.map(pi => (
                <div key={pi.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
                  <div className="min-w-0">
                    <div className="text-[var(--md-sys-color-on-surface)] truncate">{pi.itemName}</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{pi.category} ・ {fmtDate(pi.visitDate)} ・ ×{pi.quantity}</div>
                  </div>
                  <span className="font-medium text-[var(--md-sys-color-on-surface)] flex-shrink-0">{formatYen(pi.purchasePrice)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                <span>合計買取金額</span><span>{formatYen(totalPurchase)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* 請求項目（集約） */}
        <Card variant="outlined" padding="md">
          <SectionTitle>請求項目（{allWorkItems.length}件）</SectionTitle>
          {allWorkItems.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">請求項目はありません</p>
          ) : (
            <div className="space-y-1.5">
              {allWorkItems.map(wi => (
                <div key={wi.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
                  <div className="min-w-0">
                    <div className="text-[var(--md-sys-color-on-surface)] truncate">{wi.workName}</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{formatYen(wi.unitPrice)} ・ ×{wi.quantity} ・ {fmtDate(wi.visitDate)}</div>
                  </div>
                  <span className="font-medium text-[var(--md-sys-color-on-surface)] flex-shrink-0">{formatYen(wi.unitPrice * wi.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                <span>合計請求金額</span><span>{formatYen(totalBilling)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* 売買契約書・見積 ＋ メール送信履歴 */}
        <Card variant="outlined" padding="md">
          <SectionTitle>売買契約書・見積</SectionTitle>
          {contracts.length === 0 && estimates.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">作成された書類はありません</p>
          ) : (
            <div className="space-y-3">
              {deal.visitSchedules.filter(v => v.salesContract || v.estimate).map(v => (
                <div key={v.id} className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                  <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">{fmtDate(v.visitDate)} の訪問</div>
                  {v.salesContract && (
                    <div className="mb-2">
                      <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">売買契約書</div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">締結: {fmtDateTime(v.salesContract.agreedAt)}</div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        メール: {v.salesContract.emailSentAt ? `${fmtDateTime(v.salesContract.emailSentAt)}（${v.salesContract.customerEmail ?? '-'}）` : '未送信'}
                      </div>
                    </div>
                  )}
                  {v.estimate && (
                    <div>
                      <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">見積</div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        有効期限: {fmtDate(v.estimate.validUntil)} ・ 買取 {formatYen(v.estimate.purchaseAmount)} / 請求 {formatYen(v.estimate.billingAmount)}
                      </div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        メール: {v.estimate.emailSentAt ? `${fmtDateTime(v.estimate.emailSentAt)}（${v.estimate.customerEmail ?? '-'}）` : '未送信'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

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
    </div>
  )
}
