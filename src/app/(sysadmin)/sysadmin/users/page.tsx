'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

type Dashboard = {
  users: { total: number; byType: { type: string; count: number }[]; storeTotal: number; storeMemberTotal: number; adminTotal: number; partnerTotal: number; newByMonth: { month: string; count: number }[] }
}

const PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6']
const TYPE_LABELS: Record<string, string> = { visit: '訪問', delivery: '宅配', regular: '常連', akikuru: 'アキクル' }

export default function SysAdminUsersPage() {
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

  const u = data.users
  const pie = u.byType.map(x => ({ name: TYPE_LABELS[x.type] ?? x.type, value: x.count }))

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1080, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>ユーザー</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>全体のユーザー数とその内訳</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="顧客（合計）" value={`${u.total} 人`} />
        <Kpi label="店舗" value={`${u.storeTotal}`} />
        <Kpi label="店舗メンバー" value={`${u.storeMemberTotal}`} />
        <Kpi label="管理者" value={`${u.adminTotal}`} />
        <Kpi label="セールスパートナー" value={`${u.partnerTotal}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Panel title="顧客タイプ内訳">
          {pie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="新規顧客推移（12ヶ月）">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={u.newByMonth.map(x => ({ month: x.month.slice(2), 新規: x.count }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
              <YAxis stroke="#a3a3a3" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="新規" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
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
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {children}
    </div>
  )
}
function Empty() {
  return <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40, fontSize: 13 }}>データがありません</p>
}
