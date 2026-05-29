'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function SysAdminProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/sysadmin/login')
    if (status === 'authenticated' && role !== 'sysadmin') router.push('/sysadmin/login')
  }, [status, role, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const u = session?.user as any
    setName(u?.name ?? '')
    setEmail(u?.email ?? '')
  }, [status, session])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (password && password !== confirmPw) {
      flash('error', 'パスワードが一致しません')
      return
    }
    if (password && password.length < 8) {
      flash('error', 'パスワードは8文字以上にしてください')
      return
    }
    setSaving(true)
    try {
      const payload: any = { name, email }
      if (password) payload.password = password
      const res = await fetch('/api/sysadmin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        flash('error', j.error ?? '更新に失敗しました')
        return
      }
      await update({ name: j.name, email: j.email })
      setPassword('')
      setConfirmPw('')
      flash('success', 'プロフィールを更新しました')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 640, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>プロフィール</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        ログイン中のアカウント情報を変更できます
      </p>

      {msg && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, background: msg.kind === 'success' ? 'rgba(46,125,50,0.15)' : 'rgba(211,47,47,0.15)', color: msg.kind === 'success' ? '#66bb6a' : '#ef5350' }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="氏名">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} required />
        </Field>
        <Field label="メールアドレス">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required autoComplete="username" />
        </Field>

        <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: 16 }}>
          <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-primary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>
            {showPw ? '− パスワード変更を閉じる' : '＋ パスワードを変更する'}
          </button>
          {showPw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <Field label="新しいパスワード（8文字以上）">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="new-password" />
              </Field>
              <Field label="新しいパスワード（確認）">
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={inputStyle} autoComplete="new-password" />
              </Field>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
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
