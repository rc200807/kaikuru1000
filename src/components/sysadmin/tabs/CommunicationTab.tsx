'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, tooltipStyle, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

type Resp = {
  chat: { count24h: number; count7d: number; daily: { date: string; count: number }[]; activeRooms7d: number; staleUnreadRooms: number }
  line: {
    count24h: number; count7d: number; daily: { date: string; count: number }[]
    byDirection: { direction: string; count: number }[]
    failedCount: number
    byChannel: { channelId: string; channelName: string; count: number }[]
    channels: { id: string; name: string; isActive: boolean }[]
  }
}

export default function CommunicationTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sysadmin/activity/communication')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const daily = data.chat.daily.map((d, i) => ({
    date: d.date.slice(5),
    チャット: d.count,
    LINE: data.line.daily[i]?.count ?? 0,
  }))
  const inbound = data.line.byDirection.find(d => d.direction === 'inbound')?.count ?? 0
  const outbound = data.line.byDirection.find(d => d.direction === 'outbound')?.count ?? 0

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        店舗↔本部チャットと LINE の活動量（プライバシー保護のため本文・氏名は表示されません）
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="チャット（24h）" value={`${data.chat.count24h} 件`} />
        <Kpi label="チャット（7日）" value={`${data.chat.count7d} 件`} />
        <Kpi label="活動ルーム（7日）" value={`${data.chat.activeRooms7d} 室`} />
        <Kpi label="未読滞留ルーム" value={`${data.chat.staleUnreadRooms} 室`} accent={data.chat.staleUnreadRooms > 0} />
        <Kpi label="LINE（24h）" value={`${data.line.count24h} 件`} />
        <Kpi label="LINE（7日）" value={`${data.line.count7d} 件`} />
        <Kpi label="LINE 送信失敗" value={`${data.line.failedCount} 件`} accent={data.line.failedCount > 0} />
      </div>

      <Panel title="日次メッセージ数（30日）">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="g-chat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-line" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" stroke="#a3a3a3" fontSize={11} />
            <YAxis stroke="#a3a3a3" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="チャット" stroke="#34d399" fill="url(#g-chat)" strokeWidth={2} />
            <Area type="monotone" dataKey="LINE" stroke="#22d3ee" fill="url(#g-line)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        <Panel title="LINE 送受信内訳（30日）">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Kpi label="受信（inbound）" value={`${inbound} 件`} />
            <Kpi label="送信（outbound）" value={`${outbound} 件`} />
          </div>
        </Panel>
        <Panel title="LINE チャネル別メッセージ数（30日）">
          {data.line.byChannel.length === 0 ? <Empty text="メッセージはありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>チャネル</th>
                  <th style={{ ...thStyle, padding: '8px 4px', textAlign: 'right' }}>件数</th>
                </tr>
              </thead>
              <tbody>
                {data.line.byChannel.map(c => (
                  <tr key={c.channelId} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{c.channelName}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', textAlign: 'right' }}>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}
