'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type LinkPartner = {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { members: number; forms: number }
}

type CreatedResult = {
  id: string
  name: string
  adminEmail: string
  initialPassword: string
  emailSent: boolean
}

export default function AdminLinkPartnersPage() {
  const { status } = useSession()
  const router = useRouter()

  const [partners, setPartners] = useState<LinkPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [created, setCreated] = useState<CreatedResult | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  const load = () => {
    setLoading(true)
    fetch('/api/admin/link-partners')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPartners(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    load()
  }, [status])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  const activeCount = partners.filter((p) => p.isActive).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>連携パートナー</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
            外部連携パートナー（{partners.length}組織 / 有効 {activeCount}）。割り当てたフォームの問い合わせ・顧客のみを共有します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + 新規作成
        </button>
      </div>

      {/* 一覧 */}
      <div style={{ padding: 20, flex: 1 }}>
        {partners.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            連携パートナーはまだありません。「新規作成」から追加してください。
          </p>
        ) : (
          <div style={{ borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface-container)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', gap: 12, padding: '10px 14px', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', borderBottom: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-high)' }}>
              <span>組織名</span>
              <span>メンバー</span>
              <span>共有フォーム</span>
              <span>状態</span>
              <span>作成日</span>
            </div>
            {partners.map((p, i) => (
              <div
                key={p.id}
                onClick={() => router.push(`/admin/link-partners/${p.id}`)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--md-sys-color-surface-container-high)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                style={{ padding: '12px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-surface)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', gap: 12, alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{p._count.members} 名</div>
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{p._count.forms} 件</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: p.isActive ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-highest)', color: p.isActive ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)' }}>
                    {p.isActive ? '有効' : '無効'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{new Date(p.createdAt).toLocaleDateString('ja-JP')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(res) => { setShowCreate(false); setCreated(res); load() }}
        />
      )}
      {created && <RevealModal result={created} onClose={() => setCreated(null)} />}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: CreatedResult) => void }) {
  const [name, setName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/link-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, adminName, adminEmail, note: note || undefined, sendEmail }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '作成に失敗しました'); return }
      onCreated({ id: data.id, name: data.name, adminEmail: data.adminEmail, initialPassword: data.initialPassword, emailSent: data.emailSent })
    } catch {
      setError('作成に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>連携パートナーを新規作成</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>組織と最初の管理者アカウントを作成します。管理者は初回ログイン時にパスワード変更が必要です。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle}>連携パートナー名（組織名）</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="株式会社〇〇" /></div>
        <div><label style={labelStyle}>管理者氏名</label><input style={inputStyle} value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="山田 太郎" /></div>
        <div><label style={labelStyle}>管理者メールアドレス（ログインID）</label><input style={inputStyle} type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@example.com" /></div>
        <div><label style={labelStyle}>内部メモ（任意・管理者のみ閲覧）</label><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--md-sys-color-on-surface)', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          初期ログイン情報をメールで送信する（SMTP設定時のみ）
        </label>
      </div>
      {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
        <button type="button" onClick={submit} disabled={submitting || !name || !adminName || !adminEmail} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting || !name || !adminName || !adminEmail ? 0.6 : 1 }}>
          {submitting ? '作成中…' : '作成'}
        </button>
      </div>
    </Overlay>
  )
}

function RevealModal({ result, onClose }: { result: CreatedResult; onClose: () => void }) {
  const [copied, setCopied] = useState<string>('')
  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(() => { setCopied(label); setTimeout(() => setCopied(''), 1500) }).catch(() => {})
  }
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-highest)', fontSize: 13 }
  return (
    <Overlay onClose={onClose}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>初期ログイン情報</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--md-sys-color-error)' }}>
        この画面を閉じるとパスワードは二度と表示されません。必ず控えて先方の管理者へ安全に共有してください。
        {result.emailSent ? '（メールでも送信済み）' : ''}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={rowStyle}>
          <div><div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>ログインURL</div><code>/linkpartner/login</code></div>
        </div>
        <div style={rowStyle}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>メールアドレス</div><code style={{ wordBreak: 'break-all' }}>{result.adminEmail}</code></div>
          <button type="button" onClick={() => copy('email', result.adminEmail)} style={miniBtn}>{copied === 'email' ? 'コピー済' : 'コピー'}</button>
        </div>
        <div style={rowStyle}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>初期パスワード</div><code style={{ wordBreak: 'break-all' }}>{result.initialPassword}</code></div>
          <button type="button" onClick={() => copy('pw', result.initialPassword)} style={miniBtn}>{copied === 'pw' ? 'コピー済' : 'コピー'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>閉じる</button>
      </div>
    </Overlay>
  )
}

const miniBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, padding: 24, color: 'var(--md-sys-color-on-surface)' }}>
        {children}
      </div>
    </div>
  )
}
