'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import DataTable, { type Column } from '@/components/DataTable'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'
import {
  COMPLAINT_STATUSES, COMPLAINT_STATUS_COLOR, complaintStatusLabel,
  STORE_OWNERSHIPS, storeOwnershipLabel,
  COMPLAINT_HANDLER_ROLES, type ComplaintHandlerKey,
  formatOccurredOn, formatOccurredOnJa,
} from '@/lib/complaint'

type Ref = { id: string; name: string } | null

type Complaint = {
  id: string
  occurredOn: string
  storeId: string
  store: { id: string; name: string; code: string }
  storeOwnership: string
  status: string
  primaryHandlerId: string | null
  secondaryHandlerId: string | null
  finalHandlerId: string | null
  primaryHandler: Ref
  secondaryHandler: Ref
  finalHandler: Ref
  content: string
  createdAt: string
  updatedAt: string
}

type StoreOpt = { id: string; name: string; code: string }
type MemberOpt = { id: string; name: string }

type FormState = {
  occurredOn: string
  storeId: string
  storeOwnership: string
  status: string
  primaryHandlerId: string
  secondaryHandlerId: string
  finalHandlerId: string
  content: string
}

/** 今日の日付（発生日の初期値。ローカル暦日で求める） */
function todayYmd(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function emptyForm(): FormState {
  return {
    occurredOn: todayYmd(),
    storeId: '',
    storeOwnership: 'direct',
    status: 'in_progress',
    primaryHandlerId: '',
    secondaryHandlerId: '',
    finalHandlerId: '',
    content: '',
  }
}

function formFrom(c: Complaint): FormState {
  return {
    occurredOn: formatOccurredOn(c.occurredOn),
    storeId: c.storeId,
    storeOwnership: c.storeOwnership,
    status: c.status,
    primaryHandlerId: c.primaryHandlerId ?? '',
    secondaryHandlerId: c.secondaryHandlerId ?? '',
    finalHandlerId: c.finalHandlerId ?? '',
    content: c.content,
  }
}

// 幅指定を含まない共通スタイル。全幅にするかは利用側で w-full / 固定幅を足す
const controlBase =
  'h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2'
const inputCls = `w-full ${controlBase}`

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">
        {label}{required && <span className="text-[var(--md-sys-color-error)] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function StatusBadge({ status }: { status: string }) {
  const c = COMPLAINT_STATUS_COLOR[status as keyof typeof COMPLAINT_STATUS_COLOR]
    ?? { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' }
  return (
    <span
      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      {complaintStatusLabel(status)}
    </span>
  )
}

export default function ComplaintsPage() {
  const { status: sessionStatus } = useSession()
  const router = useRouter()

  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [stores, setStores] = useState<StoreOpt[]>([])
  const [members, setMembers] = useState<MemberOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // フィルタ
  const [search, setSearch] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState('')

  // 登録・編集モーダル
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Complaint | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // 詳細・削除
  const [detail, setDetail] = useState<Complaint | null>(null)
  const [deleting, setDeleting] = useState<Complaint | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/admin/login')
  }, [sessionStatus, router])

  function refresh() {
    return fetch('/api/admin/complaints')
      .then(r => (r.ok ? r.json() : []))
      .then((d) => setComplaints(Array.isArray(d) ? d : []))
  }

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    Promise.all([
      refresh(),
      fetch('/api/stores').then(r => (r.ok ? r.json() : [])).then((d) => setStores(Array.isArray(d) ? d : [])),
      fetch('/api/admin/members').then(r => (r.ok ? r.json() : [])).then((d) => setMembers(Array.isArray(d) ? d : [])),
    ]).finally(() => setLoading(false))
  }, [sessionStatus])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return complaints.filter(c => {
      if (storeFilter && c.storeId !== storeFilter) return false
      if (statusFilter && c.status !== statusFilter) return false
      if (ownershipFilter && c.storeOwnership !== ownershipFilter) return false
      if (!q) return true
      const hay = [
        c.content, c.store.name, c.store.code,
        c.primaryHandler?.name ?? '', c.secondaryHandler?.name ?? '', c.finalHandler?.name ?? '',
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [complaints, search, storeFilter, statusFilter, ownershipFilter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(c: Complaint) {
    setEditing(c)
    setForm(formFrom(c))
    setFormError('')
    setDetail(null)
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.storeId) { setFormError('対象店舗を選択してください'); return }
    if (!form.occurredOn) { setFormError('発生日を入力してください'); return }
    if (!form.content.trim()) { setFormError('クレーム内容を入力してください'); return }

    setSaving(true)
    setFormError('')
    try {
      const url = editing ? `/api/admin/complaints/${editing.id}` : '/api/admin/complaints'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error || '保存に失敗しました')
        return
      }
      setFormOpen(false)
      setMessage({ type: 'success', text: editing ? 'クレームを更新しました' : 'クレームを登録しました' })
      await refresh()
    } catch {
      setFormError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/admin/complaints/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
        return
      }
      setDeleting(null)
      setDetail(null)
      setMessage({ type: 'success', text: 'クレームを削除しました' })
      await refresh()
    } finally {
      setDeleteBusy(false)
    }
  }

  const columns: Column<Complaint>[] = [
    {
      key: 'occurredOn', header: '発生日',
      render: (c) => <span className="whitespace-nowrap text-sm">{formatOccurredOnJa(c.occurredOn)}</span>,
    },
    {
      key: 'store', header: '対象店舗',
      render: (c) => (
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{c.store.name}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{c.store.code}</div>
        </div>
      ),
    },
    {
      key: 'storeOwnership', header: '区分',
      render: (c) => <span className="text-sm whitespace-nowrap">{storeOwnershipLabel(c.storeOwnership)}</span>,
    },
    {
      key: 'status', header: '状況・結果',
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: 'handlers', header: '対応者',
      render: (c) => {
        const names = [c.primaryHandler?.name, c.secondaryHandler?.name, c.finalHandler?.name].filter(Boolean)
        return names.length > 0
          ? <span className="text-sm">{names.join(' → ')}</span>
          : <span className="text-sm text-[var(--md-sys-color-outline)]">未設定</span>
      },
    },
    {
      key: 'content', header: 'クレーム内容',
      render: (c) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)] line-clamp-2">
          {c.content}
        </span>
      ),
    },
  ]

  if (sessionStatus === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  return (
    <>
      <AppBar
        title="クレーム対応"
        actions={
          <Button
            size="sm"
            onClick={openCreate}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            クレームを登録
          </Button>
        }
      />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {message && (
          <MessageBanner severity={message.type} className="mb-6" dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">
            クレーム一覧
            <span className="ml-3 text-sm font-normal text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 rounded-full">
              {filtered.length}件{filtered.length !== complaints.length && ` / 全${complaints.length}件`}
            </span>
          </h2>
        </div>

        {/* 検索・フィルタ */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-outline)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="内容・店舗・対応者で検索..."
              className={`${inputCls} pl-9`}
            />
          </div>
          <StoreFilterSelect value={storeFilter} onChange={setStoreFilter} stores={stores} style={{ minWidth: 200 }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={controlBase}>
            <option value="">すべての状況</option>
            {COMPLAINT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)} className={controlBase}>
            <option value="">直営・加盟店すべて</option>
            {STORE_OWNERSHIPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-1)] overflow-hidden mb-8">
          <DataTable<Complaint>
            columns={columns}
            data={filtered}
            rowKey={(c) => c.id}
            emptyTitle={complaints.length === 0 ? 'クレームの記録がまだありません' : '条件に一致するクレームがありません'}
            onRowClick={(c) => setDetail(c)}
          />
        </div>
      </div>

      {/* ─── 登録・編集モーダル ─── */}
      <Modal
        open={formOpen}
        onClose={() => { if (!saving) setFormOpen(false) }}
        title={editing ? 'クレームを編集' : 'クレームを登録'}
        size="lg"
      >
        <div className="space-y-4">
          {formError && <MessageBanner severity="error">{formError}</MessageBanner>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="発生日" required>
              <input
                type="date"
                value={form.occurredOn}
                onChange={e => setForm({ ...form, occurredOn: e.target.value })}
                className={inputCls}
              />
            </Field>

            <Field label="対象店舗" required>
              <StoreFilterSelect
                value={form.storeId}
                onChange={(id) => setForm({ ...form, storeId: id })}
                stores={stores}
                allLabel="店舗を選択してください"
                style={{ width: '100%' }}
              />
            </Field>

            <Field label="直営 or 加盟店" required>
              <select
                value={form.storeOwnership}
                onChange={e => setForm({ ...form, storeOwnership: e.target.value })}
                className={inputCls}
              >
                {STORE_OWNERSHIPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>

            <Field label="状況・結果" required>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className={inputCls}
              >
                {COMPLAINT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>

            {COMPLAINT_HANDLER_ROLES.map(role => (
              <Field key={role.key} label={role.label}>
                <select
                  value={form[role.key as ComplaintHandlerKey]}
                  onChange={e => setForm({ ...form, [role.key]: e.target.value })}
                  className={inputCls}
                >
                  <option value="">未設定</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            ))}
          </div>

          <Field label="クレーム内容" required>
            <textarea
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              rows={8}
              placeholder="発生した経緯・お客様の申し出内容・対応の記録などを記入してください"
              className="w-full px-3 py-2 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2 resize-y"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => setFormOpen(false)} disabled={saving}>キャンセル</Button>
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              {editing ? '更新する' : '登録する'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── 詳細モーダル ─── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="クレーム詳細" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">発生日</div>
                <div className="text-sm font-medium">{formatOccurredOnJa(detail.occurredOn)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">区分</div>
                <div className="text-sm font-medium">{storeOwnershipLabel(detail.storeOwnership)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">状況・結果</div>
                <StatusBadge status={detail.status} />
              </div>
              <div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">対象店舗</div>
                <div className="text-sm font-medium">{detail.store.name}</div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{detail.store.code}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {([
                ['一次対応者', detail.primaryHandler],
                ['二次対応者', detail.secondaryHandler],
                ['最終対応者', detail.finalHandler],
              ] as const).map(([label, handler]) => (
                <div key={label} className="rounded-lg p-3 bg-[var(--md-sys-color-surface-container-low)]">
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">{label}</div>
                  <div className="text-sm font-medium">
                    {handler?.name ?? <span className="text-[var(--md-sys-color-outline)]">未設定</span>}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1.5">クレーム内容</div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed rounded-lg p-3 bg-[var(--md-sys-color-surface-container-low)]">
                {detail.content}
              </div>
            </div>

            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              登録: {new Date(detail.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
              {detail.updatedAt !== detail.createdAt && (
                <> ・ 最終更新: {new Date(detail.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="text" onClick={() => setDeleting(detail)}>削除</Button>
              <div className="flex gap-2">
                <Button variant="text" onClick={() => setDetail(null)}>閉じる</Button>
                <Button onClick={() => openEdit(detail)}>編集する</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── 削除確認 ─── */}
      <Modal open={!!deleting} onClose={() => { if (!deleteBusy) setDeleting(null) }} title="クレームを削除しますか？" size="sm">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              {formatOccurredOnJa(deleting.occurredOn)}・{deleting.store.name} のクレーム記録を削除します。
              この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setDeleting(null)} disabled={deleteBusy}>キャンセル</Button>
              <Button onClick={handleDelete} loading={deleteBusy} disabled={deleteBusy}>削除する</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
