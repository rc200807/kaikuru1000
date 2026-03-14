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
  // 身分証OCR抽出フィールド
  idDocumentType:   string | null
  idName:           string | null
  idBirthDate:      string | null
  idAddress:        string | null
  idLicenseNumber:  string | null
  idExpiryDate:     string | null
  idOcrIssueReport: string | null
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

type PurchaseMemo = {
  id: string
  title: string
  description: string | null
  imageUrls: string[]
  status: string
  storeNote: string | null
  createdAt: string
}

const MEMO_STATUS_OPTIONS = [
  { value: 'pending',   label: '未確認' },
  { value: 'reviewed',  label: '確認済み' },
  { value: 'completed', label: '対応完了' },
]

const MEMO_STATUS_STYLE: Record<string, string> = {
  pending:   'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]',
  reviewed:  'bg-[var(--status-scheduled-bg)] text-[var(--status-scheduled-text)]',
  completed: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]',
}

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: '予定' },
  { value: 'pending',     label: '未対応' },
  { value: 'completed',   label: '対応完了' },
  { value: 'rescheduled', label: 'リスケ' },
  { value: 'absent',      label: '不在' },
  { value: 'cancelled',   label: 'キャンセル' },
]

type ModalTab = 'info' | 'add' | 'history' | 'memos'

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

  // 買取相談メモ
  const [memosList, setMemosList] = useState<PurchaseMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [memosLoaded, setMemosLoaded] = useState(false)
  const [memoStoreNotes, setMemoStoreNotes] = useState<Record<string, string>>({})
  const [savingMemoNote, setSavingMemoNote] = useState<string | null>(null)

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
    setMemosList([])
    setMemosLoaded(false)
    setMemoStoreNotes({})
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

  // メモタブ切り替え時に読み込み
  function handleModalTabChange(key: string) {
    setModalTab(key as ModalTab)
    setScheduleMsg(null)
    if (key === 'memos' && !memosLoaded && selected) {
      setMemosLoading(true)
      fetch(`/api/purchase-memos?userId=${selected.id}`)
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : []
          setMemosList(list)
          const notes: Record<string, string> = {}
          list.forEach((m: PurchaseMemo) => { notes[m.id] = m.storeNote ?? '' })
          setMemoStoreNotes(notes)
          setMemosLoaded(true)
          setMemosLoading(false)
        })
        .catch(() => { setMemosLoaded(true); setMemosLoading(false) })
    }
  }

  async function handleMemoStatusChange(memoId: string, newStatus: string) {
    const res = await fetch(`/api/purchase-memos/${memoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setMemosList(prev => prev.map(m => m.id === memoId ? { ...m, status: newStatus } : m))
    }
  }

  async function handleSaveMemoNote(memoId: string) {
    setSavingMemoNote(memoId)
    const res = await fetch(`/api/purchase-memos/${memoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeNote: memoStoreNotes[memoId] ?? '' }),
    })
    setSavingMemoNote(null)
    if (res.ok) {
      setMemosList(prev => prev.map(m => m.id === memoId ? { ...m, storeNote: memoStoreNotes[memoId] ?? '' } : m))
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
    setMemosList([])
    setMemosLoaded(false)
    setMemoStoreNotes({})
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
    { key: 'memos', label: memosList.length > 0 ? `買取メモ（${memosList.length}）` : '買取メモ' },
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
              onChange={handleModalTabChange}
              className="mb-4"
            />

            {/* 基本情報 */}
            {modalTab === 'info' && (
              <>
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

              {/* 身分証OCR抽出情報 */}
              {selected.idDocumentPath && (selected.idName || selected.idBirthDate || selected.idAddress || selected.idLicenseNumber || selected.idExpiryDate) && (
                <div className="mt-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
                  <div className="px-4 py-2 bg-[var(--md-sys-color-surface-container)] flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                      身分証OCR読み取り結果
                      {selected.idDocumentType && <span className="ml-2 font-normal">（{selected.idDocumentType}）</span>}
                    </span>
                  </div>
                  <dl className="px-4 py-3 space-y-2">
                    {[
                      { label: '氏名（証明書）', value: selected.idName },
                      { label: '生年月日',       value: selected.idBirthDate },
                      { label: '住所（証明書）', value: selected.idAddress },
                      { label: '証明書番号',     value: selected.idLicenseNumber },
                      { label: '有効期限',       value: selected.idExpiryDate },
                    ].filter(item => item.value).map(item => (
                      <div key={item.label} className="flex gap-4">
                        <dt className="w-28 text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                        <dd className="text-xs text-[var(--md-sys-color-on-surface)]">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {/* 顧客からの誤り報告 */}
                  {selected.idOcrIssueReport && (
                    <div className="mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
                      <div className="flex items-center gap-1 mb-1">
                        <svg className="w-3.5 h-3.5 text-[var(--md-sys-color-error,#B3261E)]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-semibold text-[var(--md-sys-color-error,#B3261E)]">顧客からの誤り報告</span>
                      </div>
                      <p className="text-xs text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap pl-5">{selected.idOcrIssueReport}</p>
                    </div>
                  )}
                </div>
              )}
              </>
            )}

            {/* 買取相談メモ */}
            {modalTab === 'memos' && (
              <div>
                {memosLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : memosList.length === 0 ? (
                  <EmptyState
                    title="買取相談メモがありません"
                    description="顧客がメモを登録すると表示されます"
                  />
                ) : (
                  <div className="space-y-4">
                    {memosList.map(memo => (
                      <div
                        key={memo.id}
                        className="border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-medium)] p-4"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                                {memo.title}
                              </span>
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full ${MEMO_STATUS_STYLE[memo.status] ?? ''}`}
                              >
                                {MEMO_STATUS_OPTIONS.find(o => o.value === memo.status)?.label ?? memo.status}
                              </span>
                            </div>
                            {memo.description && (
                              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">
                                {memo.description}
                              </p>
                            )}
                            <p className="text-xs text-[var(--md-sys-color-outline)] mt-1">
                              {format(new Date(memo.createdAt), 'yyyy年M月d日', { locale: ja })}
                            </p>
                          </div>
                          {/* ステータス変更 */}
                          <select
                            value={memo.status}
                            onChange={e => handleMemoStatusChange(memo.id, e.target.value)}
                            className="text-xs border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-2 py-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0"
                          >
                            {MEMO_STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* 画像サムネイル */}
                        {memo.imageUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {memo.imageUrls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={url}
                                  alt=""
                                  className="w-16 h-16 object-cover rounded-[var(--md-sys-shape-small)] hover:opacity-80 transition-opacity"
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* 店舗メモ入力 */}
                        <div className="mt-2">
                          <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                            店舗メモ（顧客に表示されます）
                          </p>
                          <div className="flex gap-2">
                            <textarea
                              value={memoStoreNotes[memo.id] ?? ''}
                              onChange={e => setMemoStoreNotes(prev => ({ ...prev, [memo.id]: e.target.value }))}
                              rows={2}
                              placeholder="事前確認のコメントなどを入力..."
                              className="flex-1 text-sm border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] px-3 py-2 bg-[var(--md-sys-color-surface-container-lowest,#fff)] focus:outline-none focus:border-[var(--portal-primary)] resize-none text-[var(--md-sys-color-on-surface)]"
                            />
                            <button
                              onClick={() => handleSaveMemoNote(memo.id)}
                              disabled={savingMemoNote === memo.id}
                              className="text-xs px-3 py-1 bg-[var(--portal-primary,#B91C1C)] text-white rounded-[var(--md-sys-shape-small)] hover:opacity-90 transition-opacity disabled:opacity-50 self-end flex-shrink-0"
                            >
                              {savingMemoNote === memo.id ? '保存中' : '保存'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
