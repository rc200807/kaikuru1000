'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, Pager, FilterChip, TableCard, tooltipStyle, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

type Resp = {
  counts: { h24: number; d7: number; d30: number }
  daily: { date: string; count: number }[]
  topActions: { action: string; count: number }[]
  logs: { items: { id: string; action: string; userName: string | null; ip: string | null; userAgent: string | null; createdAt: string }[]; total: number; page: number; totalPages: number; days: number }
}

export default function ErrorLogsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sysadmin/health/errors?days=${days}&page=${page}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [days, page])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        サーバーで発生した未捕捉エラーの記録（Next.js instrumentation 由来）
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="エラー（24時間）" value={`${data.counts.h24} 件`} accent={data.counts.h24 > 0} />
        <Kpi label="エラー（7日間）" value={`${data.counts.d7} 件`} />
        <Kpi label="エラー（30日間）" value={`${data.counts.d30} 件`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Panel title="日次エラー件数（14日）">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.daily.map(d => ({ date: d.date.slice(5), 件数: d.count }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" stroke="#a3a3a3" fontSize={11} />
              <YAxis stroke="#a3a3a3" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="件数" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="発生源 上位10（7日間）">
          {data.topActions.length === 0 ? <Empty text="エラーはありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>発生源</th>
                  <th style={{ ...thStyle, padding: '8px 4px', textAlign: 'right' }}>件数</th>
                </tr>
              </thead>
              <tbody>
                {data.topActions.map(a => (
                  <tr key={a.action} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px', wordBreak: 'break-all' }}>{a.action}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', textAlign: 'right' }}>{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[1, 7, 30].map(d => (
          <FilterChip key={d} active={days === d} onClick={() => { setDays(d); setPage(1) }}>
            {d === 1 ? '24時間' : `${d}日間`}
          </FilterChip>
        ))}
      </div>

      <TableCard>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>日時</th>
              <th style={thStyle}>発生源</th>
              <th style={thStyle}>IP</th>
              <th style={thStyle}>User-Agent</th>
            </tr>
          </thead>
          <tbody>
            {data.logs.items.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>エラーはありません</td></tr>
            )}
            {data.logs.items.map(l => (
              <tr key={l.id} style={trStyle}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(l.createdAt)}</td>
                <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{l.action}</td>
                <td style={{ ...tdStyle, color: 'var(--md-sys-color-on-surface-variant)' }}>{l.ip ?? '—'}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', wordBreak: 'break-all' }}>{l.userAgent ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <Pager page={data.logs.page} totalPages={data.logs.totalPages} onChange={setPage} />
    </div>
  )
}
