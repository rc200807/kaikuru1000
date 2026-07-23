'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Empty, Pager, FilterChip, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type Resp = {
  summary: { activeTotal: number; byType: { userType: string; count: number }[] }
  items: { id: string; userType: string; userId: string; loginMethod: string; ip: string | null; userAgent: string | null; lastSeenAt: string; createdAt: string; expiresAt: string; revokedAt: string | null }[]
  total: number
  page: number
  totalPages: number
}

const TYPE_LABELS: Record<string, string> = { admin: '管理者', store: '店舗', storeMember: '店舗メンバー' }
const TYPES = ['', 'admin', 'store', 'storeMember']

function shortUa(ua: string | null): string {
  if (!ua) return '—'
  return ua.length > 60 ? ua.slice(0, 60) + '…' : ua
}

export default function SessionsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [userType, setUserType] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (userType) params.set('userType', userType)
    if (activeOnly) params.set('active', '1')
    fetch(`/api/sysadmin/security/sessions?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [page, userType, activeOnly])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const now = Date.now()

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        パスキー等の長期デバイスセッションの一覧（有効・失効の状態）
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="有効セッション" value={`${data.summary.activeTotal} 件`} />
        {data.summary.byType.map(t => (
          <Kpi key={t.userType} label={`${TYPE_LABELS[t.userType] ?? t.userType}`} value={`${t.count} 件`} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {TYPES.map(t => (
          <FilterChip key={t || 'all'} active={userType === t} onClick={() => { setUserType(t); setPage(1) }}>
            {t === '' ? 'すべて' : TYPE_LABELS[t] ?? t}
          </FilterChip>
        ))}
        <span style={{ width: 1, background: 'var(--md-sys-color-outline-variant)', margin: '0 4px' }} />
        <FilterChip active={activeOnly} onClick={() => { setActiveOnly(!activeOnly); setPage(1) }}>有効のみ</FilterChip>
      </div>

      <TableCard>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>種別</th>
              <th style={thStyle}>ログイン方式</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}>IP</th>
              <th style={thStyle}>端末</th>
              <th style={thStyle}>最終アクセス</th>
              <th style={thStyle}>有効期限</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>セッションはありません</td></tr>
            )}
            {data.items.map(s => {
              const revoked = !!s.revokedAt
              const expired = new Date(s.expiresAt).getTime() <= now
              const rowColor = revoked || expired ? 'var(--md-sys-color-on-surface-variant)' : undefined
              return (
                <tr key={s.id} style={{ ...trStyle, color: rowColor }}>
                  <td style={tdStyle}>{TYPE_LABELS[s.userType] ?? s.userType}</td>
                  <td style={tdStyle}>{s.loginMethod === 'passkey' ? 'パスキー' : 'パスワード'}</td>
                  <td style={tdStyle}>
                    {revoked
                      ? <StatusChip label="失効済み" bg="rgba(120,120,120,0.15)" fg="#a3a3a3" />
                      : expired
                        ? <StatusChip label="期限切れ" bg="rgba(120,120,120,0.15)" fg="#a3a3a3" />
                        : <StatusChip label="有効" bg="rgba(46,125,50,0.15)" fg="#66bb6a" />}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--md-sys-color-on-surface-variant)' }}>{s.ip ?? '—'}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{shortUa(s.userAgent)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(s.lastSeenAt)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(s.expiresAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>
      <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  )
}
