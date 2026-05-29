'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type Member = {
  id: string
  name: string
  email: string
  createdAt: string
}

export default function SysAdminMembersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const myId = (session?.user as any)?.id as string | undefined

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  const [saving, setSaving] = useState(false)

  // edit modal
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '' })

  // password reissue / credentials display
  const [credential, setCredential] = useState<{ name: string; email: string; password: string; emailSent: boolean } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/sysadmin/login')
    if (status === 'authenticated' && role !== 'sysadmin') router.push('/sysadmin/login')
  }, [status, role, router])

  function load() {
    return fetch('/api/sysadmin/members')
      .then(r => (r.ok ? r.json() : []))
      .then(setMembers)
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    load().finally(() => setLoading(false))
  }, [status])

  async function handleInvite() {
    setError('')
    if (!form.name.trim() || !form.email.trim()) { setError('氏名とメールアドレスは必須です'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/sysadmin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? '招待に失敗しました'); return }
      setInviteOpen(false)
      setForm({ name: '', email: '' })
      setCredential({ name: j.name, email: j.email, password: j.temporaryPassword, emailSent: j.emailSent })
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editTarget) return
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/sysadmin/members/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editForm.name.trim(), email: editForm.email.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? '更新に失敗しました'); return }
      setEditTarget(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleReissue(m: Member) {
    if (!confirm(`${m.name} さんのパスワードを再発行しますか？\n現在のパスワードは無効になります。`)) return
    setBusyId(m.id)
    try {
      const res = await fetch(`/api/sysadmin/members/${m.id}/reset-password`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j.error ?? '再発行に失敗しました'); return }
      setCredential({ name: m.name, email: m.email, password: j.temporaryPassword, emailSent: j.emailSent })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(m: Member) {
    if (!confirm(`${m.name} さんのアカウントを削除しますか？この操作は取り消せません。`)) return
    setBusyId(m.id)
    try {
      const res = await fetch(`/api/sysadmin/members/${m.id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j.error ?? '削除に失敗しました'); return }
      load()
    } finally {
      setBusyId(null)
    }
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>メンバー</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            この画面にログインできるシステム管理者を招待・管理します（{members.length}人）
          </p>
        </div>
        <button onClick={() => { setForm({ name: '', email: '' }); setError(''); setInviteOpen(true) }} style={primaryBtn}>
          ＋ メンバーを招待
        </button>
      </div>

      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', background: 'var(--md-sys-color-surface-container)', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
              <th style={{ padding: '10px 16px' }}>氏名</th>
              <th style={{ padding: '10px 16px' }}>メールアドレス</th>
              <th style={{ padding: '10px 16px' }}>追加日</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const isSelf = m.id === myId
              return (
                <tr key={m.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                    {m.name}{isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>(あなた)</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{m.email}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{new Date(m.createdAt).toLocaleDateString('ja-JP')}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isSelf ? (
                      <button onClick={() => router.push('/sysadmin/profile')} style={linkBtn}>プロフィールで編集</button>
                    ) : (
                      <div style={{ display: 'inline-flex', gap: 12 }}>
                        <button onClick={() => { setEditTarget(m); setEditForm({ name: m.name, email: m.email }); setError('') }} style={linkBtn} disabled={busyId === m.id}>編集</button>
                        <button onClick={() => handleReissue(m)} style={linkBtn} disabled={busyId === m.id}>パスワード再発行</button>
                        <button onClick={() => handleDelete(m)} style={{ ...linkBtn, color: 'var(--md-sys-color-error)' }} disabled={busyId === m.id}>削除</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 招待モーダル */}
      {inviteOpen && (
        <Modal onClose={() => !saving && setInviteOpen(false)} title="メンバーを招待">
          {error && <p style={errStyle}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="氏名"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="メールアドレス"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} /></Field>
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
              初期パスワードを自動生成し、メール設定があれば本人に送信します。生成されたパスワードはこの後表示されます。
            </p>
          </div>
          <div style={modalActions}>
            <button onClick={() => setInviteOpen(false)} disabled={saving} style={cancelBtn}>キャンセル</button>
            <button onClick={handleInvite} disabled={saving} style={primaryBtn}>{saving ? '招待中…' : '招待する'}</button>
          </div>
        </Modal>
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <Modal onClose={() => !saving && setEditTarget(null)} title="メンバー情報を編集">
          {error && <p style={errStyle}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="氏名"><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="メールアドレス"><input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={inputStyle} /></Field>
          </div>
          <div style={modalActions}>
            <button onClick={() => setEditTarget(null)} disabled={saving} style={cancelBtn}>キャンセル</button>
            <button onClick={handleEdit} disabled={saving} style={primaryBtn}>{saving ? '保存中…' : '保存'}</button>
          </div>
        </Modal>
      )}

      {/* 認証情報表示モーダル（招待 / 再発行後） */}
      {credential && (
        <Modal onClose={() => setCredential(null)} title="ログイン情報">
          <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>
            {credential.emailSent
              ? '本人にメールで送信しました。下記の初期パスワードはこの画面でのみ確認できます。'
              : '⚠️ メール送信は設定されていないため未送信です。下記情報を本人に安全に共有してください（この画面でのみ表示されます）。'}
          </p>
          <div style={{ background: 'var(--md-sys-color-surface)', borderRadius: 8, padding: 14, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--md-sys-color-outline-variant)' }}>
            <div><span style={credLabel}>氏名</span>{credential.name}</div>
            <div><span style={credLabel}>メール</span>{credential.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={credLabel}>パスワード</span>
              <code style={{ fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1 }}>{credential.password}</code>
              <button onClick={() => navigator.clipboard?.writeText(credential.password)} style={{ ...linkBtn, fontSize: 12 }}>コピー</button>
            </div>
            <div><span style={credLabel}>ログインURL</span>/sysadmin/login</div>
          </div>
          <div style={modalActions}>
            <button onClick={() => setCredential(null)} style={primaryBtn}>閉じる</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 460, color: 'var(--md-sys-color-on-surface)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 14, width: '100%', boxSizing: 'border-box',
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)',
  border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const cancelBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, background: 'transparent', color: 'var(--md-sys-color-on-surface)',
  border: '1px solid var(--md-sys-color-outline)', fontSize: 14, cursor: 'pointer',
}
const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--md-sys-color-primary)', cursor: 'pointer', fontSize: 13, padding: 0,
}
const modalActions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }
const errStyle: React.CSSProperties = { color: 'var(--md-sys-color-error)', fontSize: 13, margin: '0 0 12px' }
const credLabel: React.CSSProperties = { display: 'inline-block', width: 96, color: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }
