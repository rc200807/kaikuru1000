'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

type Dashboard = {
  revenue: { total: number; grossProfit: number; byMonth: { month: string; amount: number }[]; productRanking: { name: string; revenue: number; quantity: number; profit: number }[] }
}

const yen = (n: number) => `¥${n.toLocaleString()}`

export default function SysAdminRevenuePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/sysadmin/login')
    if (status === 'authenticated' && role !== 'sysadmin') router.push('/sysadmin/login')
  }, [status, role, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/sysadmin/dashboard').then(r => (r.ok ? r.json() : null)).then(setData).finally(() => setLoading(false))
  }, [status])

  if (status === 'loading' || loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface)' }}>データを取得できませんでした</div>

  const r = data.revenue

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1080, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>売上</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>Stripe で決済された備品発注の売上データ</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="累計売上（決済済）" value={yen(r.total)} />
        <Kpi label="累計粗利" value={yen(r.grossProfit)} />
        <Kpi label="粗利率" value={r.total > 0 ? `${Math.round((r.grossProfit / r.total) * 100)}%` : '—'} />
      </div>

      <Panel title="売上推移（12ヶ月）">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={r.byMonth.map(x => ({ month: x.month.slice(2), 売上: x.amount }))}>
            <defs>
              <linearGradient id="g-rev2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
            <YAxis stroke="#a3a3a3" fontSize={12} tickFormatter={v => `¥${(v / 1000).toLocaleString()}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={((v: any) => yen(Number(v))) as any} />
            <Area type="monotone" dataKey="売上" stroke="#34d399" fill="url(#g-rev2)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="商品別売上ランキング（上位10）" style={{ marginTop: 16 }}>
        {r.productRanking.length === 0 ? (
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40, fontSize: 13 }}>売上データがありません</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}>
                <th style={{ padding: '8px 4px' }}>商品名</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>数量</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>売上</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>粗利</th>
              </tr>
            </thead>
            <tbody>
              {r.productRanking.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <td style={{ padding: '8px 4px' }}>{p.name}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>{p.quantity}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>{yen(p.revenue)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>{yen(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

const tooltipStyle: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#ededed', fontSize: 12 }

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 16, border: '1px solid var(--md-sys-color-outline-variant)' }}>
      <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  )
}
function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)', ...style }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {children}
    </div>
  )
}
