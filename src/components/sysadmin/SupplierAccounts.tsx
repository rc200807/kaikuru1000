'use client'

import { useEffect, useState } from 'react'

type Account = {
  id: string
  name: string
  url: string | null
  loginId: string
  password: string
  phone: string | null
  note: string | null
}

type FormState = { name: string; loginId: string; password: string; url: string; phone: string; note: string }
const EMPTY: FormState = { name: '', loginId: '', password: '', url: '', phone: '', note: '' }

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
  }
}

export default function SupplierAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  function load() {
    return fetch('/api/sysadmin/supplier-accounts').then(r => (r.ok ? r.json() : [])).then(setAccounts)
  }
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  function doCopy(key: string, text: string) {
    if (!text) return
    copyText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500)
  }
  function toggleReveal(id: string) {
    setRevealed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function openAdd() { setEditId(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  function openEdit(a: Account) {
    setEditId(a.id)
    setForm({ name: a.name, loginId: a.loginId, password: '', url: a.url ?? '', phone: a.phone ?? '', note: a.note ?? '' })
    setError(''); setModalOpen(true)
  }

  async function handleSave() {
    setError('')
    if (!form.name.trim() || !form.loginId.trim()) { setError('発注先名とメール/IDは必須です'); return }
    setSaving(true)
    try {
      const url = editId ? `/api/sysadmin/supplier-accounts/${editId}` : '/api/sysadmin/supplier-accounts'
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), loginId: form.loginId.trim(),
          password: form.password, // 編集時は空ならパスワード変更なし
          url: form.url.trim() || null, phone: form.phone.trim() || null, note: form.note.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? '保存に失敗しました'); return }
      setModalOpen(false); load()
    } finally { setSaving(false) }
  }

  async function handleDelete(a: Account) {
    if (!confirm(`発注先アカウント「${a.name}」を削除しますか？`)) return
    await fetch(`/api/sysadmin/supplier-accounts/${a.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <section style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)', marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>発注先アカウント管理</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            仕入先サイトのログイン情報を保管。各項目はタップでコピーできます（パスワードは暗号化保存）。
          </p>
        </div>
        <button onClick={openAdd} style={primaryBtn}>＋ 発注先アカウントを追加</button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', padding: 16 }}>読み込み中…</p>
      ) : accounts.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', padding: 16 }}>登録された発注先アカウントはありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {accounts.map(a => (
            <div key={a.id} style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {a.name}
                  {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 10, fontSize: 12, color: 'var(--md-sys-color-primary)' }}>サイトを開く ↗</a>}
                </div>
                <div style={{ display: 'inline-flex', gap: 12 }}>
                  <button onClick={() => openEdit(a)} style={linkBtn}>編集</button>
                  <button onClick={() => handleDelete(a)} style={{ ...linkBtn, color: 'var(--md-sys-color-error)' }}>削除</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                <CredRow label="メール / ID" value={a.loginId} copyKey={`${a.id}:id`} copiedKey={copiedKey} onCopy={doCopy} />
                <CredRow
                  label="パスワード"
                  value={a.password}
                  display={revealed.has(a.id) ? a.password : (a.password ? '••••••••' : '（未設定）')}
                  copyKey={`${a.id}:pw`} copiedKey={copiedKey} onCopy={doCopy}
                  extra={a.password ? <button onClick={() => toggleReveal(a.id)} style={miniBtn}>{revealed.has(a.id) ? '隠す' : '表示'}</button> : null}
                />
                {a.phone && <CredRow label="電話番号" value={a.phone} copyKey={`${a.id}:tel`} copiedKey={copiedKey} onCopy={doCopy} />}
              </div>
              {a.note && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>メモ: {a.note}</p>}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={() => !saving && setModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 460, color: 'var(--md-sys-color-on-surface)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>{editId ? '発注先アカウントを編集' : '発注先アカウントを追加'}</h2>
            {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="発注先名 *"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="ラクスル など" /></Field>
              <Field label="ログインURL"><input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
              <Field label="メールアドレス / ID *"><input value={form.loginId} onChange={e => setForm({ ...form, loginId: e.target.value })} style={inputStyle} autoComplete="off" /></Field>
              <Field label={editId ? 'パスワード（変更する場合のみ入力）' : 'パスワード'}><input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} autoComplete="off" /></Field>
              <Field label="電話番号（任意）"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></Field>
              <Field label="メモ（任意）"><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={{ ...inputStyle, minHeight: 56 }} /></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setModalOpen(false)} disabled={saving} style={cancelBtn}>キャンセル</button>
              <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function CredRow({ label, value, display, copyKey, copiedKey, onCopy, extra }: {
  label: string; value: string; display?: string; copyKey: string; copiedKey: string | null; onCopy: (k: string, v: string) => void; extra?: React.ReactNode
}) {
  const copied = copiedKey === copyKey
  return (
    <div style={{ background: 'var(--md-sys-color-surface)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--md-sys-color-outline-variant)' }}>
      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display ?? value}</span>
        {extra}
        <button
          onClick={() => onCopy(copyKey, value)}
          disabled={!value}
          style={{ ...miniBtn, background: copied ? '#4ade80' : 'var(--md-sys-color-primary)', color: copied ? '#04250f' : 'var(--md-sys-color-on-primary)', border: 'none' }}
        >
          {copied ? 'コピー済' : 'コピー'}
        </button>
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
  padding: '9px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const cancelBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, background: 'transparent', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline)', fontSize: 14, cursor: 'pointer',
}
const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--md-sys-color-primary)', cursor: 'pointer', fontSize: 13, padding: 0 }
const miniBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
}
