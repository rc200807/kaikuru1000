'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDate, formatJstDateTime } from '@/lib/datetime'

type Resp = {
  summary: { active: number; closed: number; total: number }
  stores: {
    id: string; name: string; code: string; prefecture: string | null
    isActive: boolean; storeStatus: string | null
    openingDate: string | null; closingDate: string | null
    operatorName: string | null; memberCount: number; lastLoginAt: string | null
  }[]
  operators: { id: string; name: string; entityType: string; supportedServices: string; storeCount: number; createdAt: string }[]
}

function parseServices(json: string): string {
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr) || arr.length === 0) return '—'
    const labels: Record<string, string> = { kaikuru: '買いクル', akikuru: 'アキクル', ecotoku: 'エコトク' }
    return arr.map(s => labels[s] ?? s).join(' / ')
  } catch {
    return '—'
  }
}

export default function StoresOperatorsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sysadmin/users/stores')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        店舗と運営者の稼働状況
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="稼働中の店舗" value={`${data.summary.active} 店`} />
        <Kpi label="閉店" value={`${data.summary.closed} 店`} />
        <Kpi label="店舗合計" value={`${data.summary.total} 店`} />
        <Kpi label="運営者" value={`${data.operators.length} 者`} />
      </div>

      <Panel title="店舗一覧">
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>店舗名</th>
                <th style={thStyle}>コード</th>
                <th style={thStyle}>都道府県</th>
                <th style={thStyle}>運営者</th>
                <th style={thStyle}>状態</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>メンバー</th>
                <th style={thStyle}>最終ログイン</th>
                <th style={thStyle}>開業日</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>店舗がありません</td></tr>
              )}
              {data.stores.map(s => {
                const closed = s.storeStatus === 'closed'
                return (
                  <tr key={s.id} style={{ ...trStyle, color: closed ? 'var(--md-sys-color-on-surface-variant)' : undefined }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{s.name}</td>
                    <td style={tdStyle}>{s.code}</td>
                    <td style={tdStyle}>{s.prefecture ?? '—'}</td>
                    <td style={tdStyle}>{s.operatorName ?? '—'}</td>
                    <td style={tdStyle}>
                      {closed
                        ? <StatusChip label="閉店" bg="rgba(120,120,120,0.15)" fg="#a3a3a3" />
                        : s.isActive
                          ? <StatusChip label="稼働中" bg="rgba(46,125,50,0.15)" fg="#66bb6a" />
                          : <StatusChip label="停止" bg="rgba(234,179,8,0.15)" fg="#eab308" />}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{s.memberCount}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{s.lastLoginAt ? formatJstDateTime(s.lastLoginAt) : '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{s.openingDate ? formatJstDate(s.openingDate) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      </Panel>

      <Panel title="運営者一覧" style={{ marginTop: 16 }}>
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>形態</th>
                <th style={thStyle}>対応サービス</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>店舗数</th>
              </tr>
            </thead>
            <tbody>
              {data.operators.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>運営者がありません</td></tr>
              )}
              {data.operators.map(o => (
                <tr key={o.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{o.name}</td>
                  <td style={tdStyle}>{o.entityType === 'corporation' ? '法人' : '個人事業主'}</td>
                  <td style={tdStyle}>{parseServices(o.supportedServices)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{o.storeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </Panel>
    </div>
  )
}
