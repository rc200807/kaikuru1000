'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type Resp = {
  summary: { pendingApproval: number; pendingPasskey: number; partnersUnaccepted: number }
  admins: { id: string; name: string; email: string | null; loginId: string | null; role: string; authMethod: string; status: string; approvedAt: string | null; createdAt: string }[]
  partners: { id: string; name: string; email: string; isActive: boolean; acceptedAt: string | null; createdAt: string; invitedByName: string | null }[]
}

const ROLE_DEFS: Record<string, { label: string; bg: string; fg: string }> = {
  admin: { label: '管理者', bg: 'rgba(96,165,250,0.15)', fg: '#60a5fa' },
  superadmin: { label: 'スーパー管理者', bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  hr: { label: 'HR', bg: 'rgba(244,114,182,0.15)', fg: '#f472b6' },
  sysadmin: { label: 'システム管理者', bg: 'rgba(251,191,36,0.15)', fg: '#fbbf24' },
}
const STATUS_DEFS: Record<string, { label: string; bg: string; fg: string }> = {
  active: { label: '有効', bg: 'rgba(46,125,50,0.15)', fg: '#66bb6a' },
  pending_passkey: { label: 'パスキー登録待ち', bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
  pending_approval: { label: '承認待ち', bg: 'rgba(211,47,47,0.15)', fg: '#ef5350' },
}

export default function AdminsPartnersTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sysadmin/users/admins')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        管理ポータルの管理者アカウントとセールスパートナーの状態
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="管理者数" value={`${data.admins.length} 人`} />
        <Kpi label="承認待ち" value={`${data.summary.pendingApproval} 人`} accent={data.summary.pendingApproval > 0} />
        <Kpi label="パスキー登録待ち" value={`${data.summary.pendingPasskey} 人`} accent={data.summary.pendingPasskey > 0} />
        <Kpi label="パートナー数" value={`${data.partners.length} 人`} />
        <Kpi label="招待未受諾パートナー" value={`${data.summary.partnersUnaccepted} 人`} accent={data.summary.partnersUnaccepted > 0} />
      </div>

      <Panel title="管理者一覧">
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>名前</th>
                <th style={thStyle}>メール / ログインID</th>
                <th style={thStyle}>ロール</th>
                <th style={thStyle}>認証方式</th>
                <th style={thStyle}>状態</th>
                <th style={thStyle}>登録日</th>
              </tr>
            </thead>
            <tbody>
              {data.admins.map(a => {
                const role = ROLE_DEFS[a.role] ?? { label: a.role, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' }
                const st = STATUS_DEFS[a.status] ?? { label: a.status, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' }
                return (
                  <tr key={a.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{a.name}</td>
                    <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{a.email ?? a.loginId ?? '—'}</td>
                    <td style={tdStyle}><StatusChip {...role} /></td>
                    <td style={tdStyle}>{a.authMethod === 'idpass' ? 'ID+パスワード' : 'メール'}</td>
                    <td style={tdStyle}><StatusChip {...st} /></td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(a.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      </Panel>

      <Panel title="セールスパートナー一覧" style={{ marginTop: 16 }}>
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>名前</th>
                <th style={thStyle}>メール</th>
                <th style={thStyle}>状態</th>
                <th style={thStyle}>招待者</th>
                <th style={thStyle}>受諾日</th>
              </tr>
            </thead>
            <tbody>
              {data.partners.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>パートナーがいません</td></tr>
              )}
              {data.partners.map(p => (
                <tr key={p.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{p.email}</td>
                  <td style={tdStyle}>
                    {!p.acceptedAt
                      ? <StatusChip label="招待未受諾" bg="rgba(234,179,8,0.15)" fg="#eab308" />
                      : p.isActive
                        ? <StatusChip label="有効" bg="rgba(46,125,50,0.15)" fg="#66bb6a" />
                        : <StatusChip label="無効" bg="rgba(120,120,120,0.15)" fg="#a3a3a3" />}
                  </td>
                  <td style={tdStyle}>{p.invitedByName ?? '—'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{p.acceptedAt ? formatJstDateTime(p.acceptedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </Panel>
    </div>
  )
}
