'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Button from '@/components/Button'
import Card from '@/components/Card'
import MessageBanner from '@/components/MessageBanner'
import TimeSelect from '@/components/TimeSelect'
import { useBusinessHours } from '@/hooks/useBusinessHours'
import { isSelectableVisitStatus } from '@/lib/visit-status'

/**
 * 訪問詳細。
 *
 * 買取品目・請求項目・集計・書類の作成といった「取引の中身」は案件（Deal）単位に
 * 一本化したため、この画面では扱わない（案件詳細に統合済み）。
 * ここは訪問そのものの情報 —— 日時・訪問担当者・訪問目的・ステータス・メモ・後日引取 ——
 * だけを扱い、取引の中身へは案件詳細へのリンクで移動する。
 */

/* ─── 型定義 ─── */
type VisitDetail = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  note: string | null
  staffName: string | null
  memberId: string | null
  purposeId: string | null
  purposeName: string | null
  revisitDate: string | null
  revisitStart: string | null
  revisitEnd: string | null
  revisitNote: string | null
  revisitPending: boolean
  user: { id: string; name: string; address: string; phone: string; customerType: string }
  store: { id: string; name: string; address?: string; phone?: string }
  deal: { id: string; status: string } | null
}

type StoreMember = { id: string; name: string }
type VisitPurpose = { id: string; name: string }

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

const INPUT_CLS = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40'

/* ─── メイン ─── */
export default function VisitDetailPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const bizHours = useBusinessHours()
  const scheduleId = params.id as string

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [visitStatuses, setVisitStatuses] = useState<{ key: string; label: string; color: string }[]>([])
  const [members, setMembers] = useState<StoreMember[]>([])
  const [purposes, setPurposes] = useState<VisitPurpose[]>([])

  // メモ編集
  const [editNote, setEditNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 訪問担当者・訪問目的
  const [savingAssign, setSavingAssign] = useState(false)

  // 後日引取（日時未定でも登録できる）
  const [showRevisitForm, setShowRevisitForm] = useState(false)
  const [revisitForm, setRevisitForm] = useState({ date: '', start: '', end: '', note: '' })
  const [savingRevisit, setSavingRevisit] = useState(false)

  const fetchVisit = useCallback(async () => {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`)
    if (res.ok) {
      const data = await res.json()
      setVisit(data)
      setEditNote(data.note || '')
    }
    setLoading(false)
  }, [scheduleId])

  useEffect(() => {
    if (session) fetchVisit()
  }, [session, fetchVisit])

  useEffect(() => {
    fetch('/api/visit-statuses')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setVisitStatuses(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch('/api/store/members')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setMembers(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch('/api/visit-purposes')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setPurposes(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  async function patchVisit(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: d.error || '保存に失敗しました' })
      return false
    }
    await fetchVisit()
    return true
  }

  async function saveNote() {
    setSavingNote(true)
    if (await patchVisit({ note: editNote })) {
      setMessage({ type: 'success', text: 'メモを保存しました' })
    }
    setSavingNote(false)
  }

  async function handleStatusChange(newStatus: string) {
    await patchVisit({ status: newStatus })
  }

  /** 訪問担当者を変更する（案件の担当者にも伝播される） */
  async function handleMemberChange(memberId: string) {
    setSavingAssign(true)
    const member = members.find(m => m.id === memberId)
    if (await patchVisit({ staffName: member?.name ?? null })) {
      setMessage({ type: 'success', text: member ? `訪問担当者を「${member.name}」に設定しました` : '訪問担当者を解除しました' })
    }
    setSavingAssign(false)
  }

  /** 訪問目的を変更する */
  async function handlePurposeChange(purposeId: string) {
    setSavingAssign(true)
    if (await patchVisit({ purposeId: purposeId || null })) {
      setMessage({ type: 'success', text: purposeId ? '訪問目的を設定しました' : '訪問目的を解除しました' })
    }
    setSavingAssign(false)
  }

  function openRevisitForm() {
    if (!visit) return
    setRevisitForm({
      date: visit.revisitDate ? new Date(visit.revisitDate).toISOString().slice(0, 10) : '',
      start: visit.revisitStart || '',
      end: visit.revisitEnd || '',
      note: visit.revisitNote || '',
    })
    setShowRevisitForm(true)
  }

  /** 後日引取を登録する。日時が未入力でも「後日引取あり（日時未定）」として登録できる */
  async function saveRevisit() {
    setSavingRevisit(true)
    const ok = await patchVisit({
      revisitPending: true,
      revisitDate: revisitForm.date || null,
      revisitStart: revisitForm.start || null,
      revisitEnd: revisitForm.end || null,
      revisitNote: revisitForm.note || null,
    })
    if (ok) {
      setShowRevisitForm(false)
      setMessage({
        type: 'success',
        text: revisitForm.date ? '後日引取の日程を保存しました' : '後日引取を登録しました（日時は未定）',
      })
    }
    setSavingRevisit(false)
  }

  async function clearRevisit() {
    if (!confirm('後日引取の登録をクリアしますか？')) return
    setSavingRevisit(true)
    if (await patchVisit({ revisitPending: false, revisitDate: null, revisitStart: null, revisitEnd: null, revisitNote: null })) {
      setShowRevisitForm(false)
      setMessage({ type: 'success', text: '後日引取をクリアしました' })
    }
    setSavingRevisit(false)
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
        <Button variant="text" onClick={() => router.push('/store/schedule')} className="mt-4">← 戻る</Button>
      </div>
    )
  }

  const hasRevisit = visit.revisitPending || !!visit.revisitDate
  const currentMemberId = members.find(m => m.name === visit.staffName)?.id ?? ''

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
        <MessageBanner severity={message.type} floating onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      {/* ────────── 案件詳細への導線 ──────────
           買取品目・請求項目・書類の作成はすべて案件詳細で行う */}
      <Card variant="elevated" padding="md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">取引の内容は案件ページで管理します</h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 leading-relaxed">
              事前同意・買取品目・請求項目・見積書／売買契約書の作成・古物台帳は、この訪問が属する案件ページにまとまっています。
            </p>
          </div>
          {visit.deal ? (
            <Link href={`/store/deals/${visit.deal.id}`} className="flex-shrink-0">
              <Button size="sm">案件ページを開く →</Button>
            </Link>
          ) : (
            <span className="flex-shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              案件が紐づいていません
            </span>
          )}
        </div>
      </Card>

      {/* 基本情報カード */}
      <Card variant="elevated" padding="md">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/store/customers/${visit.user.id}`}
              className="text-base font-semibold text-[var(--md-sys-color-on-surface)] hover:underline"
            >
              {visit.user.name}
            </Link>
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
              {visit.startTime && <span className="ml-1">{visit.startTime}{visit.endTime ? `〜${visit.endTime}` : ''}</span>}
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
              )
                .filter(s => isSelectableVisitStatus(s.key) || s.key === visit.status)
                .map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
            </select>
          </div>

          {/* 訪問担当者・訪問目的 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">訪問担当者</label>
              <select
                value={currentMemberId}
                disabled={savingAssign}
                onChange={(e) => handleMemberChange(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">未設定</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {visit.staffName && !currentMemberId && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                  現在の担当: {visit.staffName}（メンバー一覧に無い名前）
                </p>
              )}
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                スケジュールのカレンダーと案件一覧の「担当」に反映されます
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">訪問目的</label>
              <select
                value={visit.purposeId ?? ''}
                disabled={savingAssign}
                onChange={(e) => handlePurposeChange(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">未設定</option>
                {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                {/* マスタから消された目的が設定されている場合も表示を保つ */}
                {visit.purposeId && !purposes.some(p => p.id === visit.purposeId) && (
                  <option value={visit.purposeId}>{visit.purposeName ?? '（削除された目的）'}</option>
                )}
              </select>
              {purposes.length === 0 && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                  選択肢は管理ポータルの「訪問目的の管理」で追加できます
                </p>
              )}
            </div>
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

      {/* ────────── 後日引取 ────────── */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">後日引取</h2>
          {!showRevisitForm && (
            <button onClick={openRevisitForm} className="text-xs text-[var(--portal-primary)] hover:underline">
              {hasRevisit ? '編集' : '登録'}
            </button>
          )}
        </div>

        {showRevisitForm ? (
          <div className="space-y-3 p-3 rounded-lg border border-[var(--portal-primary)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              日時が決まっていない場合は空欄のまま登録できます（「日時未定」として記録され、あとから日程を追記できます）。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">引取日（任意）</label>
                <input type="date" value={revisitForm.date} onChange={e => setRevisitForm(p => ({ ...p, date: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">開始時間（任意）</label>
                <TimeSelect value={revisitForm.start} onChange={v => setRevisitForm(p => ({ ...p, start: v }))} rangeStart={bizHours?.start} rangeEnd={bizHours?.end} selectClassName={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">終了時間（任意）</label>
                <TimeSelect value={revisitForm.end} onChange={v => setRevisitForm(p => ({ ...p, end: v }))} rangeStart={bizHours?.start} rangeEnd={bizHours?.end} selectClassName={INPUT_CLS} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">メモ（任意）</label>
              <textarea value={revisitForm.note} onChange={e => setRevisitForm(p => ({ ...p, note: e.target.value }))} rows={2} className={`${INPUT_CLS} resize-y`} placeholder="引取予定の品物・集荷時の注意点など" />
            </div>
            <div className="flex justify-between gap-2">
              {hasRevisit ? (
                <button onClick={clearRevisit} disabled={savingRevisit} className="text-xs text-[var(--md-sys-color-error)] hover:underline">クリア</button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="text" size="sm" onClick={() => setShowRevisitForm(false)} disabled={savingRevisit}>キャンセル</Button>
                <Button size="sm" onClick={saveRevisit} disabled={savingRevisit} loading={savingRevisit}>
                  {savingRevisit ? '保存中...' : '登録'}
                </Button>
              </div>
            </div>
          </div>
        ) : hasRevisit ? (
          <div className="text-xs text-[var(--md-sys-color-on-surface)] space-y-1 p-3 rounded-lg bg-[var(--md-sys-color-surface-container-low)]">
            {visit.revisitDate ? (
              <div>
                日付: <strong>{format(new Date(visit.revisitDate), 'yyyy年M月d日（E）', { locale: ja })}</strong>
                {(visit.revisitStart || visit.revisitEnd) && <span className="ml-2">{visit.revisitStart} 〜 {visit.revisitEnd}</span>}
              </div>
            ) : (
              <div className="font-semibold" style={{ color: 'var(--status-pending-text)' }}>日時未定（後日調整）</div>
            )}
            {visit.revisitNote && <div className="text-[var(--md-sys-color-on-surface-variant)]">メモ: {visit.revisitNote}</div>}
          </div>
        ) : (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            後日お引き取りの予定があれば登録してください。日時が未定でも登録できます。登録すると売買契約書にも記載されます。
          </p>
        )}
      </Card>
    </div>
  )
}
