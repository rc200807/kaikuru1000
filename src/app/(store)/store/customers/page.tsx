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
import Tabs from '@/components/Tabs'
import SearchFilterBar from '@/components/SearchFilterBar'
import DataTable from '@/components/DataTable'
import type { Column } from '@/components/DataTable'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import type { Status } from '@/components/StatusBadge'
import MessageBanner from '@/components/MessageBanner'
import EmptyState from '@/components/EmptyState'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  idDocumentPath: string | null
  createdAt: string
  visitSchedules: Array<{ visitDate: string; status: string }>
}

type VisitSchedule = {
  id: string
  visitDate: string
  status: string
  note: string | null
  store: { id: string; name: string }
  user: { id: string; name: string }
}

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

type ModalTab = 'info' | 'add' | 'history'

export default function StoreCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // モーダル
  const [selected, setSelected] = useState<Customer | null>(null)
  const [modalTab, setModalTab] = useState<ModalTab>('info')
  const [schedules, setSchedules] = useState<VisitSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)

  // スケジュール追加フォーム
  const [addForm, setAddForm] = useState({ visitDate: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      fetch(`/api/stores/${storeId}/customers`)
        .then(r => r.json())
        .then(data => {
          setCustomers(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  // 顧客選択時にスケジュール一覧を取得
  useEffect(() => {
    if (!selected) return
    setModalTab('info')
    setScheduleMsg(null)
    setAddForm({ visitDate: '', note: '' })
    setSchedulesLoading(true)
    setSchedules([])
    fetch(`/api/visit-schedules?userId=${selected.id}`)
      .then(r => r.json())
      .then(data => {
        setSchedules(Array.isArray(data) ? data : [])
        setSchedulesLoading(false)
      })
      .catch(() => setSchedulesLoading(false))
  }, [selected])

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !addForm.visitDate) return
    const storeId = (session?.user as any).id
    setSubmitting(true)
    setScheduleMsg(null)

    const res = await fetch('/api/visit-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selected.id,
        storeId,
        visitDate: addForm.visitDate,
        note: addForm.note || undefined,
      }),
    })

    setSubmitting(false)

    if (res.ok) {
      const created = await res.json()
      setSchedules(prev => [created, ...prev])
      // 顧客一覧の次回訪問日を更新
      setCustomers(prev => prev.map(c =>
        c.id === selected.id
          ? { ...c, visitSchedules: [{ visitDate: created.visitDate, status: 'scheduled' }] }
          : c
      ))
      setScheduleMsg({ type: 'success', text: '訪問スケジュールを追加しました' })
      setAddForm({ visitDate: '', note: '' })
    } else {
      setScheduleMsg({ type: 'error', text: 'スケジュールの追加に失敗しました' })
    }
  }

  async function handleStatusChange(scheduleId: string, newStatus: string) {
    const res = await fetch(`/api/visit-schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: newStatus } : s))
    }
  }

  function closeModal() {
    setSelected(null)
    setSchedules([])
    setScheduleMsg(null)
  }

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.furigana.includes(search) ||
    c.email.includes(search) || c.phone.includes(search)
  )

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
  )

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const customerColumns: Column<Customer>[] = [
    {
      key: 'name',
      header: '氏名',
      render: (c) => (
        <div>
          <div className="font-medium text-[var(--md-sys-color-on-surface)]">{c.name}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.furigana}</div>
        </div>
      ),
      sortable: true,
      sortValue: (c) => c.furigana,
    },
    {
      key: 'contact',
      header: '連絡先',
      hideOnMobile: true,
      render: (c) => (
        <div>
          <div className="text-[var(--md-sys-color-on-surface)]">{c.phone}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'address',
      header: '住所',
      hideOnMobile: true,
      render: (c) => (
        <div className="text-[var(--md-sys-color-on-surface-variant)] max-w-48 truncate">{c.address}</div>
      ),
    },
    {
      key: 'nextVisit',
      header: '次回訪問',
      render: (c) => {
        const nextVisit = c.visitSchedules?.[0]
        return nextVisit ? (
          <span className="font-medium text-[var(--portal-primary)]">
            {format(new Date(nextVisit.visitDate), 'M/d（E）', { locale: ja })}
          </span>
        ) : (
          <span className="text-[var(--md-sys-color-on-surface-variant)]">未定</span>
        )
      },
    },
    {
      key: 'idDoc',
      header: '身分証',
      hideOnMobile: true,
      render: (c) => c.idDocumentPath ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]">提出済</span>
      ) : (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">未提出</span>
      ),
    },
    {
      key: 'action',
      header: '',
      render: (c) => (
        <Button variant="text" size="sm" onClick={() => setSelected(c)}>
          詳細
        </Button>
      ),
    },
  ]

  const modalTabs = [
    { key: 'info', label: '基本情報' },
    { key: 'add', label: 'スケジュール追加' },
    { key: 'history', label: schedules.length > 0 ? `訪問履歴（${schedules.length}）` : '訪問履歴' },
  ]

  return (
    <>
      <AppBar
        title="担当顧客"
        subtitle={`${customers.length}名`}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <SearchFilterBar
          filters={[
            { key: 'search', label: '検索', type: 'text', placeholder: '氏名・メール・電話で検索...' },
          ]}
          values={{ search }}
          onChange={(_, v) => setSearch(v)}
          onClear={() => setSearch('')}
          className="mb-6"
        />

        <Card variant="outlined" padding="none">
          <DataTable
            columns={customerColumns}
            data={filtered}
            rowKey={(c) => c.id}
            emptyTitle={customers.length === 0 ? '担当顧客がいません' : '検索結果がありません'}
          />
        </Card>
      </div>

      {/* 顧客詳細モーダル */}
      <Modal
        open={!!selected}
        onClose={closeModal}
        title={selected ? `${selected.name} 様` : ''}
        size="md"
        footer={
          <Button variant="tonal" onClick={closeModal}>閉じる</Button>
        }
      >
        {selected && (
          <>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">{selected.furigana}</p>

            <Tabs
              tabs={modalTabs}
              activeKey={modalTab}
              onChange={(key) => { setModalTab(key as ModalTab); setScheduleMsg(null) }}
              className="mb-4"
            />

            {/* 基本情報 */}
            {modalTab === 'info' && (
              <dl className="space-y-3">
                {[
                  { label: 'メール', value: selected.email },
                  { label: '電話番号', value: selected.phone },
                  { label: '訪問先住所', value: selected.address },
                  { label: '登録日', value: format(new Date(selected.createdAt), 'yyyy年M月d日', { locale: ja }) },
                ].map(item => (
                  <div key={item.label} className="flex gap-4">
                    <dt className="w-28 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                    <dd className="text-sm text-[var(--md-sys-color-on-surface)]">{item.value}</dd>
                  </div>
                ))}
                <div className="flex gap-4">
                  <dt className="w-28 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">身分証</dt>
                  <dd className="text-sm">
                    {selected.idDocumentPath
                      ? <a href={selected.idDocumentPath} target="_blank" rel="noopener noreferrer" className="text-[var(--portal-primary)] underline">確認する</a>
                      : <span className="text-[var(--status-pending-text)]">未提出</span>
                    }
                  </dd>
                </div>
              </dl>
            )}

            {/* スケジュール追加 */}
            {modalTab === 'add' && (
              <form onSubmit={handleAddSchedule} className="space-y-4">
                {scheduleMsg && (
                  <MessageBanner severity={scheduleMsg.type} dismissible onDismiss={() => setScheduleMsg(null)}>
                    {scheduleMsg.text}
                  </MessageBanner>
                )}
                <TextField
                  label="訪問日"
                  type="date"
                  value={addForm.visitDate}
                  onChange={v => setAddForm({ ...addForm, visitDate: v })}
                  required
                />
                <TextField
                  label="メモ（任意）"
                  value={addForm.note}
                  onChange={v => setAddForm({ ...addForm, note: v })}
                  placeholder="訪問に関するメモを入力..."
                  rows={3}
                />
                <Button
                  type="submit"
                  disabled={submitting || !addForm.visitDate}
                  loading={submitting}
                  fullWidth
                >
                  {submitting ? '追加中...' : 'スケジュールを追加'}
                </Button>
              </form>
            )}

            {/* 訪問履歴 */}
            {modalTab === 'history' && (
              <div>
                {schedulesLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : sortedSchedules.length === 0 ? (
                  <EmptyState
                    title="訪問スケジュールがありません"
                    description="「スケジュール追加」タブから登録できます"
                  />
                ) : (
                  <div>
                    {sortedSchedules.map(vs => (
                      <div key={vs.id} className="flex items-start gap-3 py-3 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0">
                        <div className="w-9 h-9 bg-[var(--status-scheduled-bg)] rounded-[var(--md-sys-shape-medium)] flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
                              {format(new Date(vs.visitDate), 'yyyy年M月d日（E）', { locale: ja })}
                            </span>
                            <StatusBadge status={vs.status as Status} />
                            <select
                              value={vs.status}
                              onChange={e => handleStatusChange(vs.id, e.target.value)}
                              className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)]"
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          {vs.note && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 truncate">{vs.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  )
}
