'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, StatusChip, tooltipStyle, PIE_COLORS, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

type Resp = {
  sessions: { count30d: number; daily: { date: string; count: number }[]; byChannel: { channel: string; count: number }[] }
  pageViews: { count30d: number }
  conversions: { count30d: number; daily: { date: string; count: number }[]; byType: { type: string; count: number }[] }
  sites: { id: string; name: string; isActive: boolean }[]
}

const CHANNEL_LABELS: Record<string, string> = {
  search: '検索', social: 'SNS', ad: '広告', referral: '参照', direct: '直接',
}
const CV_TYPE_LABELS: Record<string, string> = {
  button_click: 'ボタンクリック', inquiry_submit: '問い合わせ送信', form_submit: 'フォーム送信',
}

export default function TrackingActivityTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sysadmin/activity/tracking')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const daily = data.sessions.daily.map((d, i) => ({
    date: d.date.slice(5),
    セッション: d.count,
    CV: data.conversions.daily[i]?.count ?? 0,
  }))
  const channelPie = data.sessions.byChannel.map(c => ({ name: CHANNEL_LABELS[c.channel] ?? c.channel, value: c.count }))

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        外部サイト向けクロスドメイン計測の全体状況（詳細分析は管理ポータル→分析→アクセス解析）
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="セッション（30日）" value={`${data.sessions.count30d.toLocaleString()} 件`} />
        <Kpi label="ページビュー（30日）" value={`${data.pageViews.count30d.toLocaleString()} 件`} />
        <Kpi label="コンバージョン（30日）" value={`${data.conversions.count30d.toLocaleString()} 件`} />
        <Kpi label="計測サイト" value={`${data.sites.filter(s => s.isActive).length} / ${data.sites.length} 稼働`} />
      </div>

      <Panel title="日次セッション・CV（30日）">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="g-sess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-cv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" stroke="#a3a3a3" fontSize={11} />
            <YAxis stroke="#a3a3a3" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="セッション" stroke="#60a5fa" fill="url(#g-sess)" strokeWidth={2} />
            <Area type="monotone" dataKey="CV" stroke="#fbbf24" fill="url(#g-cv)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        <Panel title="チャネル内訳（30日）">
          {channelPie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={channelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {channelPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="CV 種別内訳（30日）">
          {data.conversions.byType.length === 0 ? <Empty text="コンバージョンはありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>種別</th>
                  <th style={{ ...thStyle, padding: '8px 4px', textAlign: 'right' }}>件数</th>
                </tr>
              </thead>
              <tbody>
                {data.conversions.byType.map(t => (
                  <tr key={t.type} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{CV_TYPE_LABELS[t.type] ?? t.type}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', textAlign: 'right' }}>{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="計測サイト一覧">
          {data.sites.length === 0 ? <Empty text="計測サイトが未登録です" /> : (
            <table style={tableStyle}>
              <tbody>
                {data.sites.map(s => (
                  <tr key={s.id} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{s.name}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', textAlign: 'right' }}>
                      {s.isActive
                        ? <StatusChip label="稼働中" bg="rgba(46,125,50,0.15)" fg="#66bb6a" />
                        : <StatusChip label="停止" bg="rgba(120,120,120,0.15)" fg="#a3a3a3" />}
                    </td>
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
