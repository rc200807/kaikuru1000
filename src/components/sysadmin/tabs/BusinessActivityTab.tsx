'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, FilterChip, tooltipStyle, PIE_COLORS, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

type Resp = {
  days: number
  deals: { total: number; byStatus: { status: string; count: number }[]; byCategory: { category: string; count: number }[]; newInPeriod: number; dailyNew: { date: string; count: number }[] }
  visits: { byStatus: { status: string; count: number }[]; upcoming: number; newInPeriod: number; dailyNew: { date: string; count: number }[] }
  purchaseItems: { countInPeriod: number; dailyNew: { date: string; count: number }[] }
}

const DEAL_STATUS_LABELS: Record<string, string> = {
  inquiry: '問い合わせ', visit_decided: '訪問確定', estimate_only: '見積のみ', contract: '成約', completed: '完了', lost: '失注',
}
const CATEGORY_LABELS: Record<string, string> = { purchase: '買取', akikuru: 'アキクル', ecotoku: 'エコトク' }
const VISIT_STATUS_LABELS: Record<string, string> = { scheduled: '予定', completed: '完了', cancelled: 'キャンセル' }

export default function BusinessActivityTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sysadmin/activity/business?days=${days}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [days])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const dailyData = data.deals.dailyNew.map((d, i) => ({
    date: d.date.slice(5),
    案件: d.count,
    買取品目: data.purchaseItems.dailyNew[i]?.count ?? 0,
  }))
  const statusPie = data.deals.byStatus.map(s => ({ name: DEAL_STATUS_LABELS[s.status] ?? s.status, value: s.count }))
  const categoryPie = data.deals.byCategory.map(c => ({ name: CATEGORY_LABELS[c.category] ?? c.category, value: c.count }))

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        全店舗の案件・訪問・買取の発生状況
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[7, 30, 90].map(d => (
          <FilterChip key={d} active={days === d} onClick={() => setDays(d)}>{d}日間</FilterChip>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="案件総数" value={`${data.deals.total} 件`} />
        <Kpi label={`新規案件（${days}日）`} value={`${data.deals.newInPeriod} 件`} />
        <Kpi label="今後の訪問予定" value={`${data.visits.upcoming} 件`} />
        <Kpi label={`新規訪問予定（${days}日）`} value={`${data.visits.newInPeriod} 件`} />
        <Kpi label={`買取品目登録（${days}日）`} value={`${data.purchaseItems.countInPeriod} 件`} />
      </div>

      <Panel title={`日次 新規案件・買取品目（${days}日）`}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={dailyData}>
            <defs>
              <linearGradient id="g-deal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-item" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" stroke="#a3a3a3" fontSize={11} />
            <YAxis stroke="#a3a3a3" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="案件" stroke="#60a5fa" fill="url(#g-deal)" strokeWidth={2} />
            <Area type="monotone" dataKey="買取品目" stroke="#a78bfa" fill="url(#g-item)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        <Panel title="案件ステータス内訳">
          {statusPie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="案件カテゴリー内訳">
          {categoryPie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={categoryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {categoryPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="訪問ステータス内訳">
          {data.visits.byStatus.length === 0 ? <Empty /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>ステータス</th>
                  <th style={{ ...thStyle, padding: '8px 4px', textAlign: 'right' }}>件数</th>
                </tr>
              </thead>
              <tbody>
                {data.visits.byStatus.map(v => (
                  <tr key={v.status} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{VISIT_STATUS_LABELS[v.status] ?? v.status}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', textAlign: 'right' }}>{v.count}</td>
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
