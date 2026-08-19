'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { formAdminLabel } from '@/lib/forms/types'

type Member = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  mustChangePassword: boolean
  acceptedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}
type AssignedForm = {
  id: string
  formId: string
  createdAt: string
  form: { id: string; title: string; internalName: string | null; slug: string; status: string; _count: { submissions: number } }
}
type Detail = {
  id: string
  name: string
  isActive: boolean
  note: string | null
  createdAt: string
  updatedAt: string
  invitedByAdmin: { id: string; name: string } | null
  members: Member[]
  forms: AssignedForm[]
  _count: { members: number; forms: number; activityLogs: number }
}

const cardStyle: React.CSSProperties = { borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', padding: 16 }
const miniBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }

export default function AdminLinkPartnerDetailPage() {
  const { status, data: session } = useSession()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null)
  const [showFormPicker, setShowFormPicker] = useState(false)

  const role = (session?.user as any)?.role
  const canDelete = role === 'superadmin' || role === 'admin'

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/link-partners/${id}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null } return r.ok ? r.json() : null })
      .then((d) => { if (d) setDetail(d) })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    load()
  }, [status, load])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (notFound || !detail) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>
        <p>連携パートナーが見つかりません。</p>
        <button onClick={() => router.push('/admin/link-partners')} style={{ ...miniBtn, marginTop: 12 }}>一覧へ戻る</button>
      </div>
    )
  }

  const toggleActive = async () => {
    const res = await fetch(`/api/admin/link-partners/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !detail.isActive }),
    })
    if (res.ok) load()
  }

  const saveField = async (patch: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/link-partners/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (res.ok) load()
  }

  const removePartner = async () => {
    if (!confirm(`連携パートナー「${detail.name}」を削除します。メンバー・招待・共有割当・利用ログもすべて削除されます（フォームや顧客データは削除されません）。よろしいですか？`)) return
    const res = await fetch(`/api/admin/link-partners/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/admin/link-partners')
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? '削除に失敗しました') }
  }

  const setMember = async (memberId: string, patch: { isActive?: boolean; resetPassword?: boolean }) => {
    const res = await fetch(`/api/admin/link-partners/${id}/members`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, ...patch }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      if (d.initialPassword) setReveal({ email: d.email, password: d.initialPassword })
      load()
    } else {
      alert(d.error ?? '更新に失敗しました')
    }
  }

  const unassignForm = async (formId: string) => {
    const res = await fetch(`/api/admin/link-partners/${id}/forms?formId=${encodeURIComponent(formId)}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <button onClick={() => router.push('/admin/link-partners')} style={{ ...miniBtn, marginBottom: 8 }}>← 一覧</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{detail.name}</h1>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: detail.isActive ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-highest)', color: detail.isActive ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)' }}>
            {detail.isActive ? '有効' : '無効'}
          </span>
        </div>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        {/* 概要・統計 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <Stat label="メンバー" value={`${detail._count.members} 名`} />
          <Stat label="共有フォーム" value={`${detail._count.forms} 件`} />
          <Stat label="活動ログ" value={`${detail._count.activityLogs} 件`} />
          <Stat label="作成日" value={new Date(detail.createdAt).toLocaleDateString('ja-JP')} />
        </div>

        {/* 基本情報 */}
        <div style={cardStyle}>
          <SectionTitle>基本情報</SectionTitle>
          <EditableName current={detail.name} onSave={(name) => saveField({ name })} />
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>内部メモ（管理者のみ）</label>
            <EditableNote current={detail.note ?? ''} onSave={(note) => saveField({ note: note || null })} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={toggleActive} style={{ ...miniBtn, padding: '6px 14px' }}>
              {detail.isActive ? '無効化する' : '有効化する'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
              無効化するとこの組織の全メンバーがログインできなくなります。
            </span>
          </div>
          {detail.invitedByAdmin && (
            <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>作成者: {detail.invitedByAdmin.name}</p>
          )}
        </div>

        {/* メンバー */}
        <div style={cardStyle}>
          <SectionTitle>メンバー（{detail.members.length}）</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {detail.members.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-highest)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.name}
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: m.role === 'partner_admin' ? 'var(--md-sys-color-tertiary-container)' : 'var(--md-sys-color-surface-container)', color: m.role === 'partner_admin' ? 'var(--md-sys-color-on-tertiary-container)' : 'var(--md-sys-color-on-surface-variant)' }}>
                      {m.role === 'partner_admin' ? '管理者' : '閲覧者'}
                    </span>
                    {!m.isActive && <span style={{ fontSize: 10, color: 'var(--md-sys-color-error)' }}>無効</span>}
                    {!m.acceptedAt && m.isActive && <span style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>未受諾</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', wordBreak: 'break-all' }}>{m.email}</div>
                  <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>
                    最終ログイン: {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString('ja-JP') : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setMember(m.id, { isActive: !m.isActive })} style={miniBtn}>{m.isActive ? '無効化' : '有効化'}</button>
                  <button onClick={() => { if (confirm(`${m.name} のパスワードを再発行しますか？`)) setMember(m.id, { resetPassword: true }) }} style={miniBtn}>PW再発行</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 共有フォーム（割当） */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle>共有フォーム（{detail.forms.length}）</SectionTitle>
            <button onClick={() => setShowFormPicker(true)} style={{ ...miniBtn, padding: '6px 12px' }}>+ フォームを追加</button>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
            割り当てたフォームの問い合わせ・作成顧客のみがこの連携パートナーに共有されます。解除してもフォーム自体は削除されません。
          </p>
          {detail.forms.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', padding: '8px 0' }}>まだフォームが割り当てられていません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.forms.map((f) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-highest)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formAdminLabel(f.form)}</div>
                    <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>/f/{f.form.slug} ・ 回答 {f.form._count.submissions} 件 ・ {f.form.status}</div>
                  </div>
                  <button onClick={() => { if (confirm('このフォームの共有を解除しますか？')) unassignForm(f.formId) }} style={miniBtn}>解除</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 対応ステータス定義の管理（本部も編集可） */}
        <AdminStatusSection partnerId={id} />

        {/* 共有中の問い合わせ・顧客（ステータス付き） */}
        <SharedRecordsSection partnerId={id} type="inquiry" title="共有中の問い合わせ" />
        <SharedRecordsSection partnerId={id} type="customer" title="共有中の顧客" />

        {/* 利用状況（活動ログ・ステータス変更履歴を含む） */}
        <ActivitySection partnerId={id} />

        {/* 危険な操作 */}
        {canDelete && (
          <div style={{ ...cardStyle, borderColor: 'var(--md-sys-color-error)' }}>
            <SectionTitle>危険な操作</SectionTitle>
            <button onClick={removePartner} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-error)', background: 'transparent', color: 'var(--md-sys-color-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              この連携パートナーを削除
            </button>
          </div>
        )}
      </div>

      {showFormPicker && (
        <FormPickerModal
          partnerId={id}
          onClose={() => setShowFormPicker(false)}
          onDone={() => { setShowFormPicker(false); load() }}
        />
      )}
      {reveal && <RevealModal email={reveal.email} password={reveal.password} onClose={() => setReveal(null)} />}
    </div>
  )
}

const STATUS_COLORS = ['#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

type StatusDef = { id: string; targetType: string; label: string; color: string | null; sortOrder: number; isActive: boolean }

function AdminStatusSection({ partnerId }: { partnerId: string }) {
  const [statuses, setStatuses] = useState<StatusDef[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/link-partners/${partnerId}/statuses`)
      .then((r) => (r.ok ? r.json() : { statuses: [] }))
      .then((d) => setStatuses(d.statuses || []))
      .finally(() => setLoading(false))
  }, [partnerId])
  useEffect(() => { load() }, [load])

  return (
    <div style={cardStyle}>
      <SectionTitle>対応ステータス設定</SectionTitle>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
        問い合わせ・顧客の一覧でパートナーが設定できる選択肢です。本部・パートナー管理者のどちらからでも編集できます。
      </p>
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>読み込み中…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <StatusGroup partnerId={partnerId} targetType="inquiry" title="問い合わせ用" statuses={statuses.filter((s) => s.targetType === 'inquiry')} onChange={load} />
          <StatusGroup partnerId={partnerId} targetType="customer" title="顧客用" statuses={statuses.filter((s) => s.targetType === 'customer')} onChange={load} />
        </div>
      )}
    </div>
  )
}

function StatusGroup({ partnerId, targetType, title, statuses, onChange }: { partnerId: string; targetType: 'inquiry' | 'customer'; title: string; statuses: StatusDef[]; onChange: () => void }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(STATUS_COLORS[0])
  const inputStyle: React.CSSProperties = { flex: 1, minWidth: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }
  const add = async () => {
    if (!label) return
    const res = await fetch(`/api/admin/link-partners/${partnerId}/statuses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType, label, color }) })
    if (res.ok) { setLabel(''); onChange() }
  }
  const del = async (sid: string) => {
    if (!confirm('このステータスを削除しますか？（設定済みのレコードは未設定に戻ります）')) return
    const res = await fetch(`/api/admin/link-partners/${partnerId}/statuses/${sid}`, { method: 'DELETE' })
    if (res.ok) onChange()
  }
  const patch = async (sid: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/link-partners/${partnerId}/statuses/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) onChange()
  }
  return (
    <div style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {statuses.length === 0 && <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>選択肢なし</span>}
        {statuses.map((s) => <StatusGroupRow key={s.id} status={s} onSave={(b) => patch(s.id, b)} onDelete={() => del(s.id)} />)}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 対応中" maxLength={40} style={inputStyle} />
        <div style={{ display: 'flex', gap: 3 }}>
          {STATUS_COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--md-sys-color-on-surface)' : '2px solid transparent', cursor: 'pointer' }} />)}
        </div>
        <button onClick={add} disabled={!label} style={{ ...miniBtn, padding: '6px 12px', opacity: label ? 1 : 0.5 }}>追加</button>
      </div>
    </div>
  )
}

function StatusGroupRow({ status, onSave, onDelete }: { status: StatusDef; onSave: (body: Record<string, unknown>) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(status.label)
  const [color, setColor] = useState(status.color ?? STATUS_COLORS[0])
  useEffect(() => { setLabel(status.label); setColor(status.color ?? STATUS_COLORS[0]) }, [status.label, status.color])
  const dirty = label !== status.label || color !== (status.color ?? STATUS_COLORS[0])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} style={{ flex: 1, minWidth: 90, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }} />
      <div style={{ display: 'flex', gap: 2 }}>
        {STATUS_COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--md-sys-color-on-surface)' : '2px solid transparent', cursor: 'pointer' }} />)}
      </div>
      {dirty && <button onClick={() => onSave({ label, color })} style={miniBtn}>保存</button>}
      <button onClick={onDelete} style={{ ...miniBtn, color: 'var(--md-sys-color-error)' }}>削除</button>
    </div>
  )
}

type SharedRecord = { id: string; createdAt: string; title: string; subtitle: string | null; status: { statusId: string | null; label: string | null; color: string | null; updatedByName: string | null; updatedAt: string | null } | null }

function StatusBadge({ status }: { status: SharedRecord['status'] }) {
  if (!status || !status.label) return <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>未設定</span>
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: status.color ?? 'var(--md-sys-color-surface-container-highest)', color: '#fff' }}>{status.label}</span>
}

function SharedRecordsSection({ partnerId, type, title }: { partnerId: string; type: 'inquiry' | 'customer'; title: string }) {
  const [records, setRecords] = useState<SharedRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(30)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/link-partners/${partnerId}/shared-records?type=${type}&page=${page}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRecords(d.records); setTotal(d.total); setPageSize(d.pageSize) } })
      .finally(() => setLoading(false))
  }, [partnerId, type, page])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div style={cardStyle}>
      <SectionTitle>{title}（{total}）</SectionTitle>
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>読み込み中…</p>
      ) : records.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>共有中のレコードはありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {records.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--md-sys-color-surface-container-highest)', fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--md-sys-color-on-surface-variant)', width: 150, flexShrink: 0 }}>{new Date(r.createdAt).toLocaleString('ja-JP')}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}{r.subtitle ? ` ・ ${r.subtitle}` : ''}</span>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ ...miniBtn, opacity: page <= 1 ? 0.5 : 1 }}>前へ</button>
          <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ ...miniBtn, opacity: page >= totalPages ? 0.5 : 1 }}>次へ</button>
        </div>
      )}
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  login: 'ログイン',
  invite_member: 'メンバー招待',
  accept_invite: '招待受諾',
  view_customer: '顧客閲覧',
  view_inquiry: '問い合わせ閲覧',
  export_customers: '顧客エクスポート',
  export_inquiries: '問い合わせエクスポート',
  set_status: '対応ステータス変更',
}

type ActivityLog = {
  id: string
  memberId: string | null
  memberName: string | null
  action: string
  targetType: string | null
  targetId: string | null
  detail: string | null
  ip: string | null
  createdAt: string
}

function ActivitySection({ partnerId }: { partnerId: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [byAction, setByAction] = useState<Record<string, number>>({})
  const [lastActivityAt, setLastActivityAt] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    p.set('page', String(page))
    if (action) p.set('action', action)
    fetch(`/api/admin/link-partners/${partnerId}/activity?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) { setLogs(d.logs); setTotal(d.total); setPageSize(d.pageSize); setByAction(d.stats.byAction); setLastActivityAt(d.stats.lastActivityAt) }
      })
      .finally(() => setLoading(false))
  }, [partnerId, page, action])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div style={cardStyle}>
      <SectionTitle>利用状況</SectionTitle>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
        最終活動: {lastActivityAt ? new Date(lastActivityAt).toLocaleString('ja-JP') : '—'} ・ 下のバッジは直近30日のアクション件数
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {Object.keys(ACTION_LABEL).map((k) => (
          <div key={k} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-highest)', fontSize: 11 }}>
            <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{ACTION_LABEL[k]}</span>{' '}
            <b>{byAction[k] ?? 0}</b>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <select value={action} onChange={(e) => { setPage(1); setAction(e.target.value) }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}>
          <option value="">すべてのアクション</option>
          {Object.keys(ACTION_LABEL).map((k) => <option key={k} value={k}>{ACTION_LABEL[k]}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{total} 件</span>
      </div>
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>読み込み中…</p>
      ) : logs.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>活動ログはまだありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {logs.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--md-sys-color-surface-container-highest)', fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--md-sys-color-on-surface-variant)', width: 150, flexShrink: 0 }}>{new Date(l.createdAt).toLocaleString('ja-JP')}</span>
              <span style={{ fontWeight: 600, width: 130, flexShrink: 0 }}>{ACTION_LABEL[l.action] ?? l.action}</span>
              <span style={{ minWidth: 0, flex: 1, color: 'var(--md-sys-color-on-surface-variant)' }}>
                {l.memberName ?? '—'}{l.detail ? ` ・ ${l.detail}` : (l.targetType ? ` ・ ${l.targetType}` : '')}
              </span>
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ ...miniBtn, opacity: page <= 1 ? 0.5 : 1 }}>前へ</button>
          <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ ...miniBtn, opacity: page >= totalPages ? 0.5 : 1 }}>次へ</button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>{children}</h2>
}

function EditableName({ current, onSave }: { current: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(current)
  const [editing, setEditing] = useState(false)
  useEffect(() => setV(current), [current])
  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>組織名</label>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{current}</span>
        <button onClick={() => setEditing(true)} style={miniBtn}>編集</button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input value={v} onChange={(e) => setV(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }} />
      <button onClick={() => { onSave(v.trim() || current); setEditing(false) }} style={miniBtn}>保存</button>
      <button onClick={() => { setV(current); setEditing(false) }} style={miniBtn}>取消</button>
    </div>
  )
}

function EditableNote({ current, onSave }: { current: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(current)
  useEffect(() => setV(current), [current])
  const dirty = v !== current
  return (
    <div>
      <textarea value={v} onChange={(e) => setV(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', minHeight: 50, resize: 'vertical', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }} />
      {dirty && <button onClick={() => onSave(v)} style={{ ...miniBtn, marginTop: 6 }}>メモを保存</button>}
    </div>
  )
}

function FormPickerModal({ partnerId, onClose, onDone }: { partnerId: string; onClose: () => void; onDone: () => void }) {
  const [forms, setForms] = useState<{ id: string; title: string; internalName: string | null; slug: string; status: string; _count: { submissions: number } }[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/link-partners/${partnerId}/forms`)
      .then((r) => (r.ok ? r.json() : { assignedFormIds: [], forms: [] }))
      .then((d) => { setForms(d.forms || []); setAssignedIds(new Set(d.assignedFormIds || [])) })
      .finally(() => setLoading(false))
  }, [partnerId])

  const toggle = (fid: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(fid)) n.delete(fid); else n.add(fid); return n })
  }

  const submit = async () => {
    const formIds = Array.from(selected)
    if (formIds.length === 0) { onClose(); return }
    setSaving(true)
    const res = await fetch(`/api/admin/link-partners/${partnerId}/forms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formIds }),
    })
    setSaving(false)
    if (res.ok) onDone()
  }

  const available = forms.filter((f) => !assignedIds.has(f.id))

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>フォームを追加</h2>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><LoadingSpinner /></div>
      ) : available.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>追加できるフォームがありません（すべて割当済み、またはフォーム未作成）。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {available.map((f) => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-highest)', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formAdminLabel(f)}</div>
                <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>/f/{f.slug} ・ 回答 {f._count.submissions} 件 ・ {f.status}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onClose} style={{ ...miniBtn, padding: '8px 16px' }}>キャンセル</button>
        <button type="button" onClick={submit} disabled={saving || selected.size === 0} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving || selected.size === 0 ? 0.6 : 1 }}>
          {saving ? '追加中…' : `${selected.size}件を追加`}
        </button>
      </div>
    </Overlay>
  )
}

function RevealModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState('')
  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(() => { setCopied(label); setTimeout(() => setCopied(''), 1500) }).catch(() => {})
  }
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-highest)', fontSize: 13 }
  return (
    <Overlay onClose={onClose}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>再発行したパスワード</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--md-sys-color-error)' }}>この画面を閉じるとパスワードは二度と表示されません。必ず控えてください。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={rowStyle}><div style={{ minWidth: 0 }}><div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>メール</div><code style={{ wordBreak: 'break-all' }}>{email}</code></div></div>
        <div style={rowStyle}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>新パスワード</div><code style={{ wordBreak: 'break-all' }}>{password}</code></div>
          <button type="button" onClick={() => copy('pw', password)} style={miniBtn}>{copied === 'pw' ? 'コピー済' : 'コピー'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>閉じる</button>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, padding: 24, color: 'var(--md-sys-color-on-surface)' }}>
        {children}
      </div>
    </div>
  )
}
