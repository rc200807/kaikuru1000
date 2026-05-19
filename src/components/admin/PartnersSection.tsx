'use client'

import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import LoadingSpinner from '@/components/LoadingSpinner'
import LicenseKeysSection from '@/components/admin/LicenseKeysSection'

type Partner = {
  id: string
  name: string
  email: string
  isActive: boolean
  acceptedAt: string | null
  createdAt: string
  invitedBy: { id: string; name: string } | null
  _count: { customerNotes: number }
}

type Invitation = {
  id: string
  token: string
  email: string
  name: string | null
  expiresAt: string
  usedAt: string | null
  inviteUrl: string
  createdAt: string
  createdBy: { id: string; name: string } | null
  salesPartner: { id: string; name: string } | null
}

type ImportLog = {
  id: string
  fileName: string
  totalRows: number
  createdCount: number
  updatedCount: number
  errorCount: number
  errors: { row: number; licenseKey?: string; message: string }[] | null
  createdAt: string
  partner: { id: string; name: string; email: string } | null
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)',
  color: 'var(--md-sys-color-on-surface)',
  fontSize: 14, width: '100%', boxSizing: 'border-box',
}

/** セールスパートナー管理セクション。/admin/eco-box のタブから利用される。 */
export default function PartnersSection() {
  const searchParams = useSearchParams()
  const subParam = searchParams.get('sub') as 'partners' | 'invitations' | 'imports' | 'licenses' | null
  const [tab, setTab] = useState<'partners' | 'invitations' | 'imports' | 'licenses'>(
    subParam && ['partners', 'invitations', 'imports', 'licenses'].includes(subParam) ? subParam : 'partners',
  )
  const [partners, setPartners] = useState<Partner[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [imports, setImports] = useState<ImportLog[]>([])
  const [expandedImportId, setExpandedImportId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteDays, setInviteDays] = useState('7')
  const [inviting, setInviting] = useState(false)
  const [newlyCreatedInvite, setNewlyCreatedInvite] = useState<Invitation | null>(null)

  function load() {
    Promise.all([
      fetch('/api/admin/partners').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/partners/invitations').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/partners/imports').then(r => r.ok ? r.json() : []),
    ]).then(([p, inv, imp]) => {
      setPartners(p)
      setInvitations(inv)
      setImports(imp)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    const res = await fetch('/api/admin/partners/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, name: inviteName || null, expiresInDays: Number(inviteDays) || 7 }),
    })
    setInviting(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      flash('error', data.error ?? '招待の発行に失敗しました')
      return
    }
    setNewlyCreatedInvite(data)
    setInviteEmail(''); setInviteName(''); setInviteDays('7')
    setShowInviteForm(false)
    load()
  }

  async function handleToggleActive(p: Partner) {
    const res = await fetch(`/api/admin/partners/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    if (res.ok) {
      flash('success', `${p.name} さんを${!p.isActive ? '有効' : '無効'}化しました`)
      load()
    }
  }

  async function handleRevokeInvitation(inv: Invitation) {
    if (!confirm('この招待リンクを取り消しますか？')) return
    const res = await fetch(`/api/admin/partners/invitations/${inv.id}`, { method: 'DELETE' })
    if (res.ok) {
      flash('success', '招待を取り消しました')
      load()
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedToken(key)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          セールスパートナー専用画面のアカウント管理と招待発行
        </p>
        <button
          onClick={() => { setShowInviteForm(true); setNewlyCreatedInvite(null) }}
          style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + 招待リンクを発行
        </button>
      </div>

      {msg && (
        <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13, background: msg.kind === 'success' ? 'rgba(46, 125, 50, 0.15)' : 'rgba(211, 47, 47, 0.15)', color: msg.kind === 'success' ? '#66bb6a' : '#ef5350' }}>
          {msg.text}
        </div>
      )}

      {newlyCreatedInvite && (
        <div style={{ padding: 16, borderRadius: 12, marginBottom: 16, background: 'rgba(74, 222, 128, 0.10)', border: '1px solid rgba(74, 222, 128, 0.30)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', margin: '0 0 8px' }}>✓ 招待リンクを発行しました</p>
          <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 8px' }}>
            このリンクを <code>{newlyCreatedInvite.email}</code> にお送りください。
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: 'var(--md-sys-color-surface-container-high)', fontSize: 12, wordBreak: 'break-all' }}>{newlyCreatedInvite.inviteUrl}</code>
            <button
              onClick={() => copy(newlyCreatedInvite.inviteUrl, newlyCreatedInvite.token)}
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
            >
              {copiedToken === newlyCreatedInvite.token ? '✓ コピー済み' : 'コピー'}
            </button>
          </div>
        </div>
      )}

      {showInviteForm && (
        <div
          onClick={() => !inviting && setShowInviteForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleInvite}
            style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>セールスパートナー招待</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>メールアドレス *</span>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required style={inputStyle} />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>想定氏名（任意）</span>
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>有効期限（日）</span>
                <input type="number" min={1} max={30} value={inviteDays} onChange={e => setInviteDays(e.target.value)} style={inputStyle} />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setShowInviteForm(false)} style={{ padding: '8px 16px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline)', fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
              <button type="submit" disabled={inviting} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {inviting ? '発行中…' : '招待リンクを発行'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <button onClick={() => setTab('partners')} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: tab === 'partners' ? '2px solid var(--md-sys-color-primary)' : '2px solid transparent', color: tab === 'partners' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)', fontWeight: 600, cursor: 'pointer' }}>
          パートナー ({partners.length})
        </button>
        <button onClick={() => setTab('invitations')} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: tab === 'invitations' ? '2px solid var(--md-sys-color-primary)' : '2px solid transparent', color: tab === 'invitations' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)', fontWeight: 600, cursor: 'pointer' }}>
          招待リンク ({invitations.length})
        </button>
        <button onClick={() => setTab('imports')} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: tab === 'imports' ? '2px solid var(--md-sys-color-primary)' : '2px solid transparent', color: tab === 'imports' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)', fontWeight: 600, cursor: 'pointer' }}>
          インポート履歴 ({imports.length})
        </button>
        <button onClick={() => setTab('licenses')} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: tab === 'licenses' ? '2px solid var(--md-sys-color-primary)' : '2px solid transparent', color: tab === 'licenses' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)', fontWeight: 600, cursor: 'pointer' }}>
          ライセンスキー
        </button>
      </div>

      {tab === 'partners' && (
        <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>氏名</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>メール</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>招待者</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>状態</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>メモ数</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>登録日</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {partners.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>パートナーは登録されていません</td></tr>
              ) : partners.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '12px 16px' }}>{p.email}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12 }}>{p.invitedBy?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, background: p.isActive ? 'rgba(46, 125, 50, 0.15)' : 'rgba(180, 180, 180, 0.15)', color: p.isActive ? '#66bb6a' : '#999' }}>
                      {p.isActive ? (p.acceptedAt ? '有効' : '招待中') : '無効'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>{p._count.customerNotes}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{format(new Date(p.createdAt), 'yyyy/M/d', { locale: ja })}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => handleToggleActive(p)} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-primary)', border: '1px solid var(--md-sys-color-outline)', fontSize: 13, cursor: 'pointer' }}>
                      {p.isActive ? '無効化' : '有効化'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'imports' && (
        <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>実行日時</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>パートナー</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>ファイル名</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>合計</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>新規</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>更新</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>エラー</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>インポート履歴はありません</td></tr>
              ) : imports.map(log => {
                const expanded = expandedImportId === log.id
                const hasErrors = log.errorCount > 0 && log.errors && log.errors.length > 0
                return (
                  <Fragment key={log.id}>
                    <tr style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>{format(new Date(log.createdAt), 'yyyy/M/d HH:mm', { locale: ja })}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{log.partner?.name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{log.partner?.email ?? ''}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace' }}>{log.fileName}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>{log.totalRows}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#66bb6a' }}>{log.createdCount}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#42a5f5' }}>{log.updatedCount}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: log.errorCount > 0 ? '#ef5350' : 'var(--md-sys-color-on-surface-variant)' }}>{log.errorCount}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {hasErrors && (
                          <button
                            onClick={() => setExpandedImportId(expanded ? null : log.id)}
                            style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-primary)', border: '1px solid var(--md-sys-color-outline)', fontSize: 12, cursor: 'pointer' }}
                          >
                            {expanded ? '閉じる' : 'エラー詳細'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && hasErrors && (
                      <tr style={{ background: 'var(--md-sys-color-surface-container)' }}>
                        <td colSpan={8} style={{ padding: '12px 16px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ textAlign: 'left', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                <th style={{ padding: '6px 8px', width: 60 }}>行</th>
                                <th style={{ padding: '6px 8px', width: 220 }}>ライセンスキー</th>
                                <th style={{ padding: '6px 8px' }}>エラー内容</th>
                              </tr>
                            </thead>
                            <tbody>
                              {log.errors!.map((e, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{e.row}</td>
                                  <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{e.licenseKey ?? '—'}</td>
                                  <td style={{ padding: '4px 8px', color: '#ef5350' }}>{e.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invitations' && (
        <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>メール</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>想定氏名</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>状態</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>有効期限</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>発行者</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>招待はありません</td></tr>
              ) : invitations.map(inv => {
                const expired = new Date(inv.expiresAt) < new Date()
                const used = !!inv.usedAt
                return (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                    <td style={{ padding: '12px 16px' }}>{inv.email}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>{inv.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, background: used ? 'rgba(46, 125, 50, 0.15)' : expired ? 'rgba(180, 180, 180, 0.15)' : 'rgba(33, 150, 243, 0.15)', color: used ? '#66bb6a' : expired ? '#999' : '#42a5f5' }}>
                        {used ? '使用済み' : expired ? '期限切れ' : '招待中'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{format(new Date(inv.expiresAt), 'yyyy/M/d HH:mm', { locale: ja })}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>{inv.createdBy?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {!used && !expired && (
                        <>
                          <button onClick={() => copy(inv.inviteUrl, inv.token)} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-primary)', border: '1px solid var(--md-sys-color-outline)', fontSize: 13, cursor: 'pointer', marginRight: 6 }}>
                            {copiedToken === inv.token ? '✓ コピー済み' : 'リンクをコピー'}
                          </button>
                          <button onClick={() => handleRevokeInvitation(inv)} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-error)', border: '1px solid var(--md-sys-color-outline)', fontSize: 13, cursor: 'pointer' }}>
                            取消
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'licenses' && (
        <LicenseKeysSection />
      )}
    </div>
  )
}
