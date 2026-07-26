'use client'

// 空き家管理案件の詳細ビュー（店舗/管理ポータル共用）。
// 基本情報・物件写真ギャラリー・管理記録タイムラインを表示する。
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import { AKIYA_PLAN_OPTIONS, AKIYA_PLAN_BADGE, akiyaPlanLabel } from '@/lib/akiya-plans'
import { AKIYA_STATUS_OPTIONS, AKIYA_STATUS_BADGE, akiyaStatusLabel } from '@/lib/akiya-status'
import { AKIYA_CASE_PHOTO_LIMIT, parsePhotoUrls } from '@/lib/akiya-items'
import { convertToJpegIfNeeded } from '@/lib/image-utils'
import { formatJstDate, formatJstDateTime, jstDateKey } from '@/lib/datetime'

type RecordItem = {
  id: string
  itemMasterId: string | null
  itemName: string
  sortOrder: number
  photoUrls: string
  note: string | null
}

type AkiyaRecord = {
  id: string
  performedAt: string
  gpsLat: number | null
  gpsLng: number | null
  gpsAccuracy: number | null
  staffName: string | null
  createdAt: string
  // 顧客向けレポート
  reportToken: string | null
  reportSubmittedAt: string | null
  reportSentTo: string | null
  reportSentAt: string | null
  items: RecordItem[]
}

type AkiyaCase = {
  id: string
  propertyAddress: string
  startDate: string | null
  endDate: string | null
  plan: string
  status: string
  photoUrls: string
  note: string | null
  lastVisitedAt: string | null
  nextVisitAt: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; name: string; furigana: string | null; phone: string | null; email: string | null; address: string | null }
  store: { id: string; name: string; code: string } | null
  records: AkiyaRecord[]
}

function fmtDate(d?: string | null) {
  if (!d) return '-'
  return formatJstDate(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDateTime(d?: string | null) {
  if (!d) return '-'
  return formatJstDateTime(d, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

const dateInputClass = 'h-9 px-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]'

export default function AkiyaCaseDetailView({
  caseId,
  isAdmin = false,
  backHref,
  recordNewHref,
}: {
  caseId: string
  isAdmin?: boolean
  backHref: string
  recordNewHref: string
}) {
  const router = useRouter()
  const [akiyaCase, setAkiyaCase] = useState<AkiyaCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // プラン・ステータスのインライン更新
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  // 物件情報（住所・期間・次回訪問日）のまとめ編集
  const [addressEdit, setAddressEdit] = useState('')
  const [startEdit, setStartEdit] = useState('')   // yyyy-MM-dd
  const [endEdit, setEndEdit] = useState('')
  const [nextVisitEdit, setNextVisitEdit] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)

  // 物件メモ
  const [noteEdit, setNoteEdit] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 写真
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // 記録
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  // 顧客向けレポートの提出・URLコピー
  const [submittingReportId, setSubmittingReportId] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // 案件削除
  const [deleting, setDeleting] = useState(false)

  const toDateInput = (d: string | null) => (d ? jstDateKey(d) : '')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/akiya-cases/${caseId}`)
      if (res.status === 403) { setError('この案件を閲覧する権限がありません'); setLoading(false); return }
      if (res.status === 404) { setError('案件が見つかりません'); setLoading(false); return }
      if (!res.ok) { setError('案件の取得に失敗しました'); setLoading(false); return }
      const data: AkiyaCase | null = await res.json()
      if (!data) { setError('案件が見つかりません'); setLoading(false); return }
      setAkiyaCase(data)
      setAddressEdit(data.propertyAddress)
      setStartEdit(data.startDate ? jstDateKey(data.startDate) : '')
      setEndEdit(data.endDate ? jstDateKey(data.endDate) : '')
      setNextVisitEdit(data.nextVisitAt ? jstDateKey(data.nextVisitAt) : '')
      setNoteEdit(data.note ?? '')
    } catch {
      setError('案件の取得に失敗しました')
    }
    setLoading(false)
  }, [caseId])

  useEffect(() => { load() }, [load])

  async function patchCase(body: Record<string, unknown>, errText: string): Promise<boolean> {
    const res = await fetch(`/api/akiya-cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setMsg({ type: 'error', text: data?.error || errText })
      return false
    }
    return true
  }

  async function changePlan(plan: string) {
    if (!akiyaCase || plan === akiyaCase.plan) return
    setSavingPlan(true)
    setMsg(null)
    const ok = await patchCase({ plan }, 'プランの変更に失敗しました')
    setSavingPlan(false)
    if (ok) setAkiyaCase(prev => prev ? { ...prev, plan } : prev)
  }

  async function changeStatus(status: string) {
    if (!akiyaCase || status === akiyaCase.status) return
    setSavingStatus(true)
    setMsg(null)
    const ok = await patchCase({ status }, 'ステータスの変更に失敗しました')
    setSavingStatus(false)
    if (ok) setAkiyaCase(prev => prev ? { ...prev, status } : prev)
  }

  const infoDirty = !!akiyaCase && (
    addressEdit.trim() !== akiyaCase.propertyAddress ||
    startEdit !== toDateInput(akiyaCase.startDate) ||
    endEdit !== toDateInput(akiyaCase.endDate) ||
    nextVisitEdit !== toDateInput(akiyaCase.nextVisitAt)
  )

  async function saveInfo() {
    if (!akiyaCase || !addressEdit.trim()) return
    setSavingInfo(true)
    setMsg(null)
    const ok = await patchCase({
      propertyAddress: addressEdit.trim(),
      startDate: startEdit,
      endDate: endEdit,
      nextVisitAt: nextVisitEdit,
    }, '物件情報の保存に失敗しました')
    setSavingInfo(false)
    if (ok) {
      setMsg({ type: 'success', text: '物件情報を保存しました' })
      load()
    }
  }

  async function saveNote() {
    if (!akiyaCase) return
    setSavingNote(true)
    setMsg(null)
    const ok = await patchCase({ note: noteEdit }, 'メモの保存に失敗しました')
    setSavingNote(false)
    if (ok) {
      setAkiyaCase(prev => prev ? { ...prev, note: noteEdit.trim() || null } : prev)
      setMsg({ type: 'success', text: '物件メモを保存しました' })
    }
  }

  // 物件写真の追加（HEIC変換 → 逐次POST）
  async function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!akiyaCase || files.length === 0) return
    const current = parsePhotoUrls(akiyaCase.photoUrls).length
    if (current + files.length > AKIYA_CASE_PHOTO_LIMIT) {
      setMsg({ type: 'error', text: `物件写真は${AKIYA_CASE_PHOTO_LIMIT}枚までです` })
      return
    }
    setUploadingPhotos(true)
    setMsg(null)
    try {
      let latest: string[] | null = null
      for (const file of files) {
        const converted = await convertToJpegIfNeeded(file)
        const fd = new FormData()
        fd.append('file', converted)
        const res = await fetch(`/api/akiya-cases/${caseId}/photos`, { method: 'POST', body: fd })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setMsg({ type: 'error', text: data?.error || '写真のアップロードに失敗しました' })
          break
        }
        const data = await res.json()
        latest = data.photos ?? latest
      }
      if (latest) {
        const photos = latest
        setAkiyaCase(prev => prev ? { ...prev, photoUrls: JSON.stringify(photos) } : prev)
      }
    } catch {
      setMsg({ type: 'error', text: '写真のアップロードに失敗しました' })
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function deletePhoto(index: number) {
    if (!confirm('この写真を削除しますか？')) return
    const res = await fetch(`/api/akiya-cases/${caseId}/photos?index=${index}`, { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      setAkiyaCase(prev => prev ? { ...prev, photoUrls: JSON.stringify(data.photos ?? []) } : prev)
    } else {
      setMsg({ type: 'error', text: '写真の削除に失敗しました' })
    }
  }

  async function deleteRecord(recordId: string) {
    if (!confirm('この管理記録を削除しますか？（記録内の写真・メモも削除されます）')) return
    setDeletingRecordId(recordId)
    const res = await fetch(`/api/akiya-cases/${caseId}/records/${recordId}`, { method: 'DELETE' })
    setDeletingRecordId(null)
    if (res.ok) {
      setAkiyaCase(prev => prev ? { ...prev, records: prev.records.filter(r => r.id !== recordId) } : prev)
      setMsg({ type: 'success', text: '管理記録を削除しました' })
    } else {
      setMsg({ type: 'error', text: '管理記録の削除に失敗しました' })
    }
  }

  /** 管理記録を顧客向けレポートとして提出（URL発行＋メール送信） */
  async function submitReport(recordId: string) {
    if (submittingReportId) return
    setSubmittingReportId(recordId)
    setMsg(null)
    try {
      const res = await fetch(`/api/akiya-cases/${caseId}/records/${recordId}/report`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'レポートの提出に失敗しました')
      setAkiyaCase(prev => prev ? {
        ...prev,
        records: prev.records.map(r => r.id === recordId ? {
          ...r,
          reportToken: data.url.split('/').pop() ?? r.reportToken,
          reportSubmittedAt: data.submittedAt ?? new Date().toISOString(),
          reportSentTo: data.sentTo ?? null,
          reportSentAt: data.sentAt ?? null,
        } : r),
      } : prev)
      setMsg(data.emailSent
        ? { type: 'success', text: `レポートを提出し、${data.sentTo} へ送信しました` }
        : { type: 'error', text: `レポートを提出しました（${data.emailError ?? 'メール未送信'}）。URLをコピーして共有してください` })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'レポートの提出に失敗しました' })
    } finally {
      setSubmittingReportId(null)
    }
  }

  /** レポート閲覧URLをクリップボードにコピー */
  async function copyReportUrl(token: string | null) {
    if (!token) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/akiya-report/${token}`)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      setMsg({ type: 'error', text: 'URLをコピーできませんでした' })
    }
  }

  async function handleDeleteCase() {
    if (!akiyaCase) return
    if (!confirm('この空き家管理案件を削除しますか？')) return
    if (!confirm(`本当に削除しますか？ 管理記録${akiyaCase.records.length}件と写真もすべて削除され、元に戻せません。`)) return
    setDeleting(true)
    const res = await fetch(`/api/akiya-cases/${caseId}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { router.push(backHref); return }
    const data = await res.json().catch(() => null)
    setMsg({ type: 'error', text: data?.error || '削除に失敗しました' })
  }

  if (loading) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  if (error || !akiyaCase) {
    return (
      <div className="min-h-screen bg-[var(--md-sys-color-background)]">
        <AppBar title="空き家管理案件" actions={<Link href={backHref}><Button variant="text" size="sm">← 戻る</Button></Link>} />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {error ?? '案件が見つかりません'}
        </div>
      </div>
    )
  }

  const c = akiyaCase
  const photos = parsePhotoUrls(c.photoUrls)
  const planBadge = AKIYA_PLAN_BADGE[c.plan] ?? AKIYA_PLAN_BADGE.standard
  const statusBadge = AKIYA_STATUS_BADGE[c.status] ?? AKIYA_STATUS_BADGE.pre_contract
  const nextVisitOverdue = !!c.nextVisitAt && new Date(c.nextVisitAt).getTime() < Date.now()

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] pb-16">
      <AppBar
        title={c.user.name}
        subtitle={`空き家管理 ・ ${c.propertyAddress}`}
        actions={<Link href={backHref}><Button variant="text" size="sm">← 一覧</Button></Link>}
      />

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {msg && <MessageBanner severity={msg.type}>{msg.text}</MessageBanner>}

        {/* サマリー */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: planBadge.bg, color: planBadge.fg }}>
                {akiyaPlanLabel(c.plan)}
              </span>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ background: statusBadge.bg, color: statusBadge.fg }}>
                {akiyaStatusLabel(c.status)}
              </span>
              {c.store && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                  {c.store.name}
                </span>
              )}
            </div>
            <Link href={recordNewHref}>
              <Button size="sm">＋ 記録を追加</Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '管理記録', value: `${c.records.length} 件` },
              { label: '前回訪問', value: c.lastVisitedAt ? fmtDate(c.lastVisitedAt) : '未訪問' },
              { label: '次回訪問', value: c.nextVisitAt ? fmtDate(c.nextVisitAt) : '未定', alert: nextVisitOverdue },
              { label: '利用期間', value: `${c.startDate ? fmtDate(c.startDate) : '-'} 〜 ${c.endDate ? fmtDate(c.endDate) : ''}` },
            ].map(s => (
              <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.label}</div>
                <div className={`text-sm font-semibold mt-0.5 ${s.alert ? 'text-[#dc2626]' : 'text-[var(--md-sys-color-on-surface)]'}`}>
                  {s.value}{s.alert ? '（超過）' : ''}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* プラン・ステータス */}
        <Card variant="outlined" padding="md">
          <SectionTitle>プラン・ステータス</SectionTitle>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">プラン</label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {AKIYA_PLAN_OPTIONS.map(opt => {
              const active = c.plan === opt.value
              const b = AKIYA_PLAN_BADGE[opt.value]
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingPlan}
                  onClick={() => changePlan(opt.value)}
                  className="text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
                  style={active
                    ? { background: b.bg, color: b.fg, borderColor: b.fg }
                    : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">ステータス</label>
          <div className="flex flex-wrap gap-1.5">
            {AKIYA_STATUS_OPTIONS.map(opt => {
              const active = c.status === opt.value
              const b = AKIYA_STATUS_BADGE[opt.value]
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingStatus}
                  onClick={() => changeStatus(opt.value)}
                  className="text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
                  style={active
                    ? { background: b.bg, color: b.fg, borderColor: b.fg }
                    : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Card>

        {/* 顧客情報 */}
        <Card variant="outlined" padding="md">
          <SectionTitle>顧客情報</SectionTitle>
          <Row label="氏名" value={c.user.name} />
          <Row label="ふりがな" value={c.user.furigana} />
          <Row label="電話" value={c.user.phone ? <a href={`tel:${c.user.phone}`} className="text-[var(--portal-primary,#374151)] hover:underline">{c.user.phone}</a> : '-'} />
          {isAdmin && <Row label="メール" value={c.user.email} />}
          <Row label="顧客住所" value={c.user.address} />
        </Card>

        {/* 物件情報（編集可） */}
        <Card variant="outlined" padding="md">
          <SectionTitle>物件情報</SectionTitle>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">物件住所</label>
          <input
            type="text"
            value={addressEdit}
            onChange={e => setAddressEdit(e.target.value)}
            placeholder="物件の所在地"
            className="w-full h-11 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] mb-4"
          />
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">利用開始日</label>
              <input type="date" value={startEdit} onChange={e => setStartEdit(e.target.value)} className={dateInputClass} />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">利用終了日</label>
              <input type="date" value={endEdit} onChange={e => setEndEdit(e.target.value)} className={dateInputClass} />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">次回訪問日</label>
              <input type="date" value={nextVisitEdit} onChange={e => setNextVisitEdit(e.target.value)} className={dateInputClass} />
            </div>
            <div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">前回訪問日</div>
              <div className="text-sm text-[var(--md-sys-color-on-surface)] h-9 flex items-center">
                {c.lastVisitedAt ? fmtDateTime(c.lastVisitedAt) : '未訪問'}
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button size="sm" onClick={saveInfo} loading={savingInfo} disabled={savingInfo || !infoDirty || !addressEdit.trim()}>
              保存
            </Button>
          </div>
        </Card>

        {/* 物件メモ */}
        <Card variant="outlined" padding="md">
          <SectionTitle>物件メモ</SectionTitle>
          <textarea
            value={noteEdit}
            onChange={e => setNoteEdit(e.target.value)}
            rows={3}
            placeholder="鍵の保管場所、注意事項など..."
            className="w-full px-3.5 py-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] resize-y"
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={saveNote} loading={savingNote} disabled={savingNote || noteEdit === (c.note ?? '')}>
              保存
            </Button>
          </div>
        </Card>

        {/* 物件写真 */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">物件写真（{photos.length} / {AKIYA_CASE_PHOTO_LIMIT}枚）</h2>
            {photos.length < AKIYA_CASE_PHOTO_LIMIT && (
              <label className={`text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-high)] ${uploadingPhotos ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
                {uploadingPhotos ? 'アップロード中...' : '＋ 写真を追加'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={handleAddPhotos}
                  disabled={uploadingPhotos}
                />
              </label>
            )}
          </div>
          {photos.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">物件写真はありません。「＋ 写真を追加」からアップロードできます。</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {photos.map((url, idx) => (
                <div key={`${url}-${idx}`} className="relative aspect-square">
                  <button type="button" onClick={() => setLightboxUrl(url)} className="w-full h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`物件写真 ${idx + 1}`} className="w-full h-full object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePhoto(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#dc2626] text-white flex items-center justify-center shadow"
                    aria-label="写真を削除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 管理記録タイムライン */}
        <Card variant="outlined" padding="md">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">管理記録（{c.records.length}件）</h2>
            <Link href={recordNewHref}>
              <Button size="sm" variant="outlined">＋ 記録を追加</Button>
            </Link>
          </div>
          {c.records.length === 0 ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">管理記録はまだありません</p>
          ) : (
            <div className="space-y-3">
              {c.records.map(record => {
                const filledItems = record.items.filter(it => parsePhotoUrls(it.photoUrls).length > 0 || (it.note ?? '').trim())
                const emptyItems = record.items.filter(it => parsePhotoUrls(it.photoUrls).length === 0 && !(it.note ?? '').trim())
                return (
                  <div key={record.id} className="rounded-xl border border-[var(--md-sys-color-outline-variant)] p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{fmtDateTime(record.performedAt)}</div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                          <span>担当: {record.staffName || '—'}</span>
                          {record.gpsLat != null && record.gpsLng != null ? (
                            <span>
                              GPS: {record.gpsLat.toFixed(5)}, {record.gpsLng.toFixed(5)}
                              {record.gpsAccuracy != null ? `（精度${Math.round(record.gpsAccuracy)}m）` : ''}
                            </span>
                          ) : (
                            <span>GPSなし</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {record.reportSubmittedAt ? (
                          <>
                            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-[rgba(34,197,94,0.15)] text-[#16a34a]">
                              レポート提出済み
                            </span>
                            <button
                              type="button"
                              onClick={() => copyReportUrl(record.reportToken)}
                              className="text-[11px] text-[var(--portal-primary,#374151)] hover:underline"
                            >
                              {copiedToken === record.reportToken ? 'コピー済' : 'URLをコピー'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => submitReport(record.id)}
                            disabled={submittingReportId === record.id}
                            className="text-[11px] text-[var(--portal-primary,#374151)] hover:underline disabled:opacity-50"
                          >
                            {submittingReportId === record.id ? '提出中...' : 'レポートを提出'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteRecord(record.id)}
                          disabled={deletingRecordId === record.id}
                          className="text-[11px] text-[#dc2626] hover:underline disabled:opacity-50"
                        >
                          {deletingRecordId === record.id ? '削除中...' : '削除'}
                        </button>
                      </div>
                    </div>
                    {record.reportSubmittedAt && record.reportSentTo && (
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                        {record.reportSentTo} へ送信済み
                      </p>
                    )}

                    {/* 入力のあった項目（折りたたみ） */}
                    {filledItems.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {filledItems.map(item => {
                          const itemPhotos = parsePhotoUrls(item.photoUrls)
                          return (
                            <details key={item.id} className="rounded-lg bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 group">
                              <summary className="text-xs font-medium text-[var(--md-sys-color-on-surface)] cursor-pointer select-none flex items-center justify-between gap-2">
                                <span>{item.itemName}</span>
                                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] shrink-0">
                                  {itemPhotos.length > 0 ? `写真${itemPhotos.length}枚` : ''}{itemPhotos.length > 0 && (item.note ?? '').trim() ? ' ・ ' : ''}{(item.note ?? '').trim() ? 'メモあり' : ''}
                                </span>
                              </summary>
                              {itemPhotos.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {itemPhotos.map((url, i) => (
                                    <button key={`${url}-${i}`} type="button" onClick={() => setLightboxUrl(url)}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} alt={`${item.itemName} ${i + 1}`} className="w-16 h-16 object-cover rounded-md border border-[var(--md-sys-color-outline-variant)]" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {(item.note ?? '').trim() && (
                                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-2 whitespace-pre-wrap break-words">{item.note}</p>
                              )}
                            </details>
                          )
                        })}
                      </div>
                    )}

                    {/* 写真もメモも無い項目は薄くまとめ表示 */}
                    {emptyItems.length > 0 && (
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] opacity-60 mt-2">
                        実施のみ: {emptyItems.map(i => i.itemName).join('、')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* 案件情報・削除 */}
        <Card variant="outlined" padding="md">
          <SectionTitle>案件情報</SectionTitle>
          <Row label="作成者" value={c.createdByName} />
          <Row label="作成日時" value={fmtDateTime(c.createdAt)} />
          <Row label="更新日時" value={fmtDateTime(c.updatedAt)} />
          <div className="flex justify-end mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
            <Button size="sm" variant="outlined" danger onClick={handleDeleteCase} loading={deleting} disabled={deleting}>
              この案件を削除
            </Button>
          </div>
        </Card>
      </div>

      {/* ライトボックス（写真拡大） */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="拡大表示" className="max-w-full max-h-full object-contain rounded-lg" />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
