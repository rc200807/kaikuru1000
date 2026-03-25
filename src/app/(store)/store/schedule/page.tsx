'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'

type Schedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  user: { id: string; name: string; address: string; phone: string }
  store: { id: string; name: string }
  salesContract: { id: string } | null
}

type Customer = {
  id: string
  name: string
  furigana: string
}

const DEFAULT_STATUS_OPTIONS = [
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return `¥${n.toLocaleString()}`
}

export default function StoreSchedulePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState({ userId: '', visitDate: '', note: '' })
  const [saving, setSaving] = useState(false)

  // 訪問リクエスト
  const [visitRequests, setVisitRequests] = useState<any[]>([])
  const [visitRequestsLoading, setVisitRequestsLoading] = useState(true)
  const [counterModal, setCounterModal] = useState<{requestId:string, customerName:string}|null>(null)
  const [counterForm, setCounterForm] = useState({date:'', start:'', end:'', note:''})
  const [counterSubmitting, setCounterSubmitting] = useState(false)

  // 訪問ステータス（動的取得）
  const [visitStatuses, setVisitStatuses] = useState<{key:string,label:string,color:string}[]>([])
  const STATUS_OPTIONS = visitStatuses.length > 0
    ? visitStatuses.map(s => ({ value: s.key, label: s.label }))
    : DEFAULT_STATUS_OPTIONS

  // ページネーション
  const [schedulesPage, setSchedulesPage] = useState(1)
  const [schedulesHasMore, setSchedulesHasMore] = useState(false)
  const [schedulesTotal, setSchedulesTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const SCHEDULES_LIMIT = 50

  // 対応完了モーダル（金額入力）
  const [completionModal, setCompletionModal] = useState<{
    scheduleId: string
    purchaseAmount: string
    billingAmount: string
  } | null>(null)
  const [completing, setCompleting] = useState(false)

  // 金額編集モーダル
  const [editModal, setEditModal] = useState<{
    schedule: Schedule
    note: string
    purchaseAmount: string
    billingAmount: string
  } | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/visit-statuses')
      .then(res => res.ok ? res.json() : [])
      .then(data => setVisitStatuses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/visit-requests?status=pending,counter_proposed')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setVisitRequests(Array.isArray(data) ? data : data.requests || []); setVisitRequestsLoading(false) })
      .catch(() => setVisitRequestsLoading(false))
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      Promise.all([
        fetch(`/api/visit-schedules?storeId=${storeId}&page=1&limit=${SCHEDULES_LIMIT}`).then(r => r.json()),
        fetch(`/api/stores/${storeId}/customers`).then(r => r.json()),
      ]).then(([schedData, custData]) => {
        const schedList = schedData?.schedules ?? (Array.isArray(schedData) ? schedData : [])
        setSchedules(schedList)
        setSchedulesTotal(schedData?.total ?? schedList.length)
        setSchedulesPage(1)
        setSchedulesHasMore((schedData?.total ?? schedList.length) > SCHEDULES_LIMIT)
        const custList = custData?.customers ?? (Array.isArray(custData) ? custData : [])
        setCustomers(custList)
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, session])

  async function loadMoreSchedules() {
    setLoadingMore(true)
    const storeId = (session?.user as any).id
    const nextPage = schedulesPage + 1
    try {
      const res = await fetch(`/api/visit-schedules?storeId=${storeId}&page=${nextPage}&limit=${SCHEDULES_LIMIT}`)
      const data = await res.json()
      const list = data?.schedules ?? (Array.isArray(data) ? data : [])
      setSchedules(prev => [...prev, ...list])
      setSchedulesPage(nextPage)
      setSchedulesHasMore(nextPage * SCHEDULES_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  async function handleApprove(requestId: string, candidate: any) {
    const res = await fetch(`/api/visit-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', approvedCandidate: candidate }),
    })
    if (res.ok) {
      setVisitRequests(prev => prev.filter(r => r.id !== requestId))
      // refresh schedules
      const storeId = (session?.user as any).id
      fetch(`/api/visit-schedules?storeId=${storeId}&page=1&limit=${SCHEDULES_LIMIT}`)
        .then(r => r.json())
        .then(schedData => {
          const schedList = schedData?.schedules ?? (Array.isArray(schedData) ? schedData : [])
          setSchedules(schedList)
          setSchedulesTotal(schedData?.total ?? schedList.length)
          setSchedulesPage(1)
          setSchedulesHasMore((schedData?.total ?? schedList.length) > SCHEDULES_LIMIT)
        })
      setMessage({ type: 'success', text: '訪問リクエストを承認しました' })
    } else {
      setMessage({ type: 'error', text: '承認に失敗しました' })
    }
  }

  async function handleCounterPropose(e: React.FormEvent) {
    e.preventDefault()
    if (!counterModal) return
    setCounterSubmitting(true)
    const res = await fetch(`/api/visit-requests/${counterModal.requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'counter_propose',
        counterDate: counterForm.date,
        counterStart: counterForm.start,
        counterEnd: counterForm.end,
        storeNote: counterForm.note,
      }),
    })
    setCounterSubmitting(false)
    if (res.ok) {
      const updated = await res.json()
      setVisitRequests(prev => prev.map(r => r.id === counterModal.requestId ? { ...r, ...updated, status: 'counter_proposed' } : r))
      setCounterModal(null)
      setCounterForm({ date: '', start: '', end: '', note: '' })
      setMessage({ type: 'success', text: '別の日程を提案しました' })
    } else {
      setMessage({ type: 'error', text: '提案に失敗しました' })
    }
  }

  async function handleStatusChange(scheduleId: string, newStatus: string) {
    // 「対応完了」のときは金額入力モーダルを開く
    if (newStatus === 'completed') {
      setCompletionModal({ scheduleId, purchaseAmount: '', billingAmount: '' })
      return
    }
    const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: newStatus } : s))
    }
  }

  async function handleCompletionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!completionModal) return
    setCompleting(true)
    const res = await fetch(`/api/visit-schedules/${completionModal.scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        purchaseAmount: completionModal.purchaseAmount !== '' ? parseInt(completionModal.purchaseAmount) : null,
        billingAmount: completionModal.billingAmount !== '' ? parseInt(completionModal.billingAmount) : null,
      }),
    })
    setCompleting(false)
    if (res.ok) {
      const updated = await res.json()
      setSchedules(prev => prev.map(s =>
        s.id === completionModal.scheduleId
          ? { ...s, status: 'completed', purchaseAmount: updated.purchaseAmount, billingAmount: updated.billingAmount }
          : s
      ))
      setCompletionModal(null)
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editModal) return
    setEditing(true)
    const res = await fetch(`/api/visit-schedules/${editModal.schedule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: editModal.note || null,
        purchaseAmount: editModal.purchaseAmount !== '' ? parseInt(editModal.purchaseAmount) : null,
        billingAmount: editModal.billingAmount !== '' ? parseInt(editModal.billingAmount) : null,
      }),
    })
    setEditing(false)
    if (res.ok) {
      const updated = await res.json()
      setSchedules(prev => prev.map(s =>
        s.id === editModal.schedule.id
          ? { ...s, note: updated.note, purchaseAmount: updated.purchaseAmount, billingAmount: updated.billingAmount }
          : s
      ))
      setEditModal(null)
    }
  }

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const storeId = (session?.user as any).id

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, storeId }),
    })

    setSaving(false)
    if (res.ok) {
      const newSchedule = await res.json()
      setSchedules(prev => [...prev, newSchedule].sort((a, b) =>
        new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime()
      ))
      setMessage({ type: 'success', text: '訪問スケジュールを登録しました' })
      setShowForm(false)
      setFormData({ userId: '', visitDate: '', note: '' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '登録に失敗しました' })
    }
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = schedules.filter(s =>
    new Date(s.visitDate) >= today && !['completed', 'cancelled', 'absent'].includes(s.status)
  )
  const past = schedules
    .filter(s =>
      new Date(s.visitDate) < today || ['completed', 'cancelled', 'absent'].includes(s.status)
    )
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())

  return (
    <>
      <AppBar
        title="訪問スケジュール"
        subtitle={(session?.user as any)?.name}
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            スケジュール追加
          </Button>
        }
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
            className="mb-6"
          >
            {message.text}
          </MessageBanner>
        )}

        {/* 訪問リクエスト */}
        {!visitRequestsLoading && visitRequests.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide mb-4 flex items-center gap-2">
              訪問リクエスト
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold rounded-full bg-[var(--portal-primary)] text-white">
                {visitRequests.length}
              </span>
            </h3>
            <div className="space-y-3">
              {visitRequests.map(req => (
                <Card key={req.id} variant="elevated" padding="none">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{req.user?.name || req.customerName} 様</p>
                        {(req.user?.phone || req.customerPhone) && (
                          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{req.user?.phone || req.customerPhone}</p>
                        )}
                        {(req.user?.address || req.customerAddress) && (
                          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{req.user?.address || req.customerAddress}</p>
                        )}
                      </div>
                      {req.status === 'counter_proposed' && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                          お客様の返答待ち
                        </span>
                      )}
                    </div>
                    {req.customerNote && (
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3 bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-small)] px-3 py-2">
                        💬 {req.customerNote}
                      </p>
                    )}
                    <div className="space-y-2">
                      {(req.candidates || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 bg-[var(--md-sys-color-surface-container-low)] rounded-[var(--md-sys-shape-small)] px-3 py-2">
                          <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                            {format(new Date(c.date), 'M/d（E）', { locale: ja })} {c.startTime}〜{c.endTime}
                          </span>
                          {req.status !== 'counter_proposed' && (
                            <Button size="sm" onClick={() => handleApprove(req.id, c)}>
                              この日程で承認
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {req.status !== 'counter_proposed' && (
                      <div className="mt-3">
                        <Button
                          variant="outlined"
                          size="sm"
                          onClick={() => setCounterModal({ requestId: req.id, customerName: req.user?.name || req.customerName })}
                        >
                          別の日程を提案
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 今後の予定 */}
        <section className="mb-8">
          <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide mb-4">
            今後の訪問予定
          </h3>
          {upcoming.length === 0 ? (
            <Card variant="outlined" padding="none">
              <EmptyState
                title="スケジュールがありません"
                description="「スケジュール追加」から新しい訪問を登録できます"
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {upcoming.map(schedule => (
                <Card key={schedule.id} variant="elevated" padding="none">
                  <div className="flex items-start gap-4 p-4">
                    <div className="bg-[var(--status-scheduled-bg)] text-[var(--portal-primary)] rounded-[var(--md-sys-shape-medium)] p-3 text-center min-w-16 flex-shrink-0">
                      <div className="text-xs font-medium">{format(new Date(schedule.visitDate), 'M月', { locale: ja })}</div>
                      <div className="text-2xl font-bold leading-none">{format(new Date(schedule.visitDate), 'd', { locale: ja })}</div>
                      <div className="text-xs">{format(new Date(schedule.visitDate), '（E）', { locale: ja })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{schedule.user.name} 様</p>
                      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">{schedule.user.address}</p>
                      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{schedule.user.phone}</p>
                      {schedule.note && (
                        <p className="text-xs text-[var(--portal-primary)] mt-1">{schedule.note}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        <StatusBadge status={schedule.status as Status} />
                        <select
                          value={schedule.status}
                          onChange={e => handleStatusChange(schedule.id, e.target.value)}
                          className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)]"
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <Button
                          variant="outlined"
                          size="sm"
                          onClick={() => window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(schedule.user.address)}&travelmode=driving`,
                            '_blank'
                          )}
                        >
                          ルートを検索
                        </Button>
                        <Button
                          variant="filled"
                          size="sm"
                          onClick={() => router.push(`/store/schedule/${schedule.id}`)}
                        >
                          編集
                        </Button>
                        {schedule.salesContract && (
                          <Button
                            variant="outlined"
                            size="sm"
                            onClick={() => router.push(`/store/schedule/${schedule.id}/agreement`)}
                          >
                            契約書
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* 過去の訪問 */}
        {past.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide mb-4">
              過去の訪問
            </h3>
            <Card variant="outlined" padding="none">
              <div className="overflow-x-auto table-scroll-container relative">
                <table className="w-full text-sm min-w-[540px] md:min-w-[900px]">
                  <thead>
                    <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                      <th className="text-left px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">訪問日</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">顧客名</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider hidden md:table-cell">住所</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">ステータス</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider hidden sm:table-cell">買取金額</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider hidden sm:table-cell">請求金額</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider hidden lg:table-cell">メモ</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">契約書</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map(schedule => (
                      <tr key={schedule.id} className="border-b border-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                        <td className="px-3 py-3 text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                          {format(new Date(schedule.visitDate), 'yyyy/M/d（E）', { locale: ja })}
                        </td>
                        <td className="px-3 py-3 font-medium text-[var(--md-sys-color-on-surface)] whitespace-nowrap">{schedule.user.name}</td>
                        <td className="px-3 py-3 text-[var(--md-sys-color-on-surface-variant)] max-w-40 truncate hidden md:table-cell">{schedule.user.address}</td>
                        <td className="px-3 py-3">
                          <select
                            value={schedule.status}
                            onChange={e => handleStatusChange(schedule.id, e.target.value)}
                            className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)]"
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right text-[var(--md-sys-color-on-surface)] whitespace-nowrap hidden sm:table-cell">{fmt(schedule.purchaseAmount)}</td>
                        <td className="px-3 py-3 text-right text-[var(--md-sys-color-on-surface)] whitespace-nowrap hidden sm:table-cell">{fmt(schedule.billingAmount)}</td>
                        <td className="px-3 py-3 text-[var(--md-sys-color-on-surface-variant)] max-w-32 truncate hidden lg:table-cell">{schedule.note || '—'}</td>
                        <td className="px-3 py-3">
                          {schedule.salesContract ? (
                            <Button variant="text" size="sm" onClick={() => router.push(`/store/schedule/${schedule.id}/agreement`)}>
                              確認
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--md-sys-color-outline)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button
                              variant="outlined"
                              size="sm"
                              onClick={() => window.open(
                                `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(schedule.user.address)}&travelmode=driving`,
                                '_blank'
                              )}
                            >
                              ルートを検索
                            </Button>
                            <Button
                              variant="tonal"
                              size="sm"
                              onClick={() => router.push(`/store/schedule/${schedule.id}`)}
                            >
                              編集
                            </Button>
                            <Button
                              variant="text"
                              size="sm"
                              onClick={() => setEditModal({
                                schedule,
                                note: schedule.note || '',
                                purchaseAmount: schedule.purchaseAmount != null ? String(schedule.purchaseAmount) : '',
                                billingAmount: schedule.billingAmount != null ? String(schedule.billingAmount) : '',
                              })}
                            >
                              金額編集
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {schedulesHasMore && (
          <div className="flex justify-center mt-6">
            <Button
              variant="tonal"
              onClick={loadMoreSchedules}
              loading={loadingMore}
              disabled={loadingMore}
            >
              {loadingMore ? '読み込み中...' : `もっと読み込む（${schedules.length} / ${schedulesTotal}件）`}
            </Button>
          </div>
        )}
      </div>

      {/* スケジュール追加モーダル */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="訪問スケジュール追加"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setShowForm(false)}>キャンセル</Button>
            <Button type="submit" loading={saving} onClick={() => {
              const form = document.getElementById('add-schedule-form') as HTMLFormElement
              form?.requestSubmit()
            }}>
              {saving ? '登録中...' : '登録する'}
            </Button>
          </>
        }
      >
        <form id="add-schedule-form" onSubmit={handleAddSchedule} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
              顧客 <span className="text-[var(--md-sys-color-error)]">*</span>
            </label>
            <select
              value={formData.userId}
              onChange={e => setFormData({ ...formData, userId: e.target.value })}
              required
              className="w-full h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary)] focus:border-2"
            >
              <option value="">顧客を選択...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}（{c.furigana}）</option>
              ))}
            </select>
          </div>
          <TextField
            label="訪問日"
            type="date"
            value={formData.visitDate}
            onChange={v => setFormData({ ...formData, visitDate: v })}
            required
          />
          <TextField
            label="メモ（任意）"
            value={formData.note}
            onChange={v => setFormData({ ...formData, note: v })}
            placeholder="初回訪問、など"
          />
        </form>
      </Modal>

      {/* 対応完了モーダル（買取金額・請求金額入力） */}
      <Modal
        open={!!completionModal}
        onClose={() => setCompletionModal(null)}
        title="対応完了 — 金額を記録"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setCompletionModal(null)}>キャンセル</Button>
            <Button type="submit" loading={completing} onClick={() => {
              const form = document.getElementById('completion-form') as HTMLFormElement
              form?.requestSubmit()
            }}>
              {completing ? '登録中...' : '対応完了にする'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">入力しない場合は空欄のまま登録できます</p>
        <form id="completion-form" onSubmit={handleCompletionSubmit} className="space-y-4">
          <TextField
            label="買取金額（円）"
            type="number"
            value={completionModal?.purchaseAmount ?? ''}
            onChange={v => completionModal && setCompletionModal({ ...completionModal, purchaseAmount: v })}
            placeholder="例: 15000"
          />
          <TextField
            label="請求金額（円）"
            type="number"
            value={completionModal?.billingAmount ?? ''}
            onChange={v => completionModal && setCompletionModal({ ...completionModal, billingAmount: v })}
            placeholder="例: 3000"
          />
        </form>
      </Modal>

      {/* 金額・メモ編集モーダル */}
      <Modal
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title="訪問記録を編集"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setEditModal(null)}>キャンセル</Button>
            <Button type="submit" loading={editing} onClick={() => {
              const form = document.getElementById('edit-form') as HTMLFormElement
              form?.requestSubmit()
            }}>
              {editing ? '保存中...' : '保存する'}
            </Button>
          </>
        }
      >
        {editModal && (
          <>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
              {editModal.schedule.user.name} 様 — {format(new Date(editModal.schedule.visitDate), 'yyyy/M/d', { locale: ja })}
            </p>
            <form id="edit-form" onSubmit={handleEditSubmit} className="space-y-4">
              <TextField
                label="買取金額（円）"
                type="number"
                value={editModal.purchaseAmount}
                onChange={v => setEditModal({ ...editModal, purchaseAmount: v })}
                placeholder="例: 15000"
              />
              <TextField
                label="請求金額（円）"
                type="number"
                value={editModal.billingAmount}
                onChange={v => setEditModal({ ...editModal, billingAmount: v })}
                placeholder="例: 3000"
              />
              <TextField
                label="メモ"
                value={editModal.note}
                onChange={v => setEditModal({ ...editModal, note: v })}
                placeholder="メモを入力..."
              />
            </form>
          </>
        )}
      </Modal>

      {/* 別日程提案モーダル */}
      <Modal
        open={!!counterModal}
        onClose={() => { setCounterModal(null); setCounterForm({ date: '', start: '', end: '', note: '' }) }}
        title={`別の日程を提案 — ${counterModal?.customerName || ''} 様`}
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => { setCounterModal(null); setCounterForm({ date: '', start: '', end: '', note: '' }) }}>キャンセル</Button>
            <Button type="submit" loading={counterSubmitting} onClick={() => {
              const form = document.getElementById('counter-form') as HTMLFormElement
              form?.requestSubmit()
            }}>
              {counterSubmitting ? '送信中...' : '提案する'}
            </Button>
          </>
        }
      >
        <form id="counter-form" onSubmit={handleCounterPropose} className="space-y-4">
          <TextField
            label="訪問日"
            type="date"
            value={counterForm.date}
            onChange={v => setCounterForm({ ...counterForm, date: v })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="開始時間"
              type="time"
              value={counterForm.start}
              onChange={v => setCounterForm({ ...counterForm, start: v })}
              required
            />
            <TextField
              label="終了時間"
              type="time"
              value={counterForm.end}
              onChange={v => setCounterForm({ ...counterForm, end: v })}
              required
            />
          </div>
          <TextField
            label="メモ（任意）"
            value={counterForm.note}
            onChange={v => setCounterForm({ ...counterForm, note: v })}
            placeholder="ご都合が合わず、別日程をご提案します"
          />
        </form>
      </Modal>
    </>
  )
}
