'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, tooltipStyle, yen, PIE_COLORS } from '@/components/sysadmin/ui'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

type Dashboard = {
  months: string[]
  revenue: { total: number; grossProfit: number; byMonth: { month: string; amount: number }[]; productRanking: { name: string; revenue: number; quantity: number; profit: number }[] }
  cost: { total: number; byMonth: { month: string; amount: number }[]; byCategory: { category: string; amount: number }[] }
  users: { total: number; byType: { type: string; count: number }[]; storeTotal: number; storeMemberTotal: number; adminTotal: number; partnerTotal: number; newByMonth: { month: string; count: number }[] }
  purchase: { itemTotal: number; categoryTotal: number; byMonth: { month: string; count: number }[] }
  accessLog: { today: number; last7d: number; last30d: number; byType: { type: string; count: number }[] }
  ops: { pendingOrders: number; activeStores: number; unusedLicenses: number; usedLicenses: number; openInquiries: number; openBugReports: number }
  health?: { emailFailed: number; emailPending: number; errors24h: number; recordingErrors: number; blockedLogins: number; chat24h: number; line24h: number }
}

const TYPE_LABELS: Record<string, string> = { visit: '訪問', delivery: '宅配', regular: '常連', akikuru: 'アキクル' }

export default function SysAdminDashboardPage() {
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
    fetch('/api/sysadmin/dashboard')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [status])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface)' }}>データを取得できませんでした</div>

  const revenueCostData = data.months.map((m, i) => ({
    month: m.slice(2),
    売上: data.revenue.byMonth[i]?.amount ?? 0,
    コスト: data.cost.byMonth[i]?.amount ?? 0,
  }))
  const userPie = data.users.byType.map(u => ({ name: TYPE_LABELS[u.type] ?? u.type, value: u.count }))
  const costPie = data.cost.byCategory.map(c => ({ name: c.category, value: c.amount }))

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>ダッシュボード</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>システム全体の運用状況</p>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="累計売上（決済済）" value={yen(data.revenue.total)} href="/sysadmin/finance" />
        <Kpi label="累計粗利" value={yen(data.revenue.grossProfit)} href="/sysadmin/finance" />
        <Kpi label="累計運用コスト" value={yen(data.cost.total)} href="/sysadmin/finance?tab=costs" />
        <Kpi label="未対応の発注" value={`${data.ops.pendingOrders} 件`} accent={data.ops.pendingOrders > 0} href="/sysadmin/supplies" />
        <Kpi label="総ユーザー数" value={`${data.users.total} 人`} href="/sysadmin/users" />
        <Kpi label="店舗数（稼働中）" value={`${data.ops.activeStores} / ${data.users.storeTotal}`} href="/sysadmin/users?tab=stores" />
        <Kpi label="買取品目登録数" value={`${data.purchase.itemTotal} 件`} href="/sysadmin/activity" />
        <Kpi label="ログイン（24h）" value={`${data.accessLog.today} 回`} href="/sysadmin/security" />
        <Kpi label="ライセンス未使用" value={`${data.ops.unusedLicenses} 件`} />
        <Kpi label="未対応の問い合わせ" value={`${data.ops.openInquiries} 件`} accent={data.ops.openInquiries > 0} href="/sysadmin/support" />
        <Kpi label="未解決の不具合報告" value={`${data.ops.openBugReports} 件`} accent={data.ops.openBugReports > 0} href="/sysadmin/support?tab=bugs" />
      </div>

      {/* システムヘルス */}
      {data.health && (
        <>
          <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)' }}>システムヘルス</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Kpi label="メールキュー失敗" value={`${data.health.emailFailed} 件`} accent={data.health.emailFailed > 0} href="/sysadmin/health" />
            <Kpi label="メール送信待ち" value={`${data.health.emailPending} 件`} accent={data.health.emailPending > 10} href="/sysadmin/health" />
            <Kpi label="未捕捉エラー（24h）" value={`${data.health.errors24h} 件`} accent={data.health.errors24h > 0} href="/sysadmin/health?tab=errors" />
            <Kpi label="文字起こしエラー" value={`${data.health.recordingErrors} 件`} accent={data.health.recordingErrors > 0} href="/sysadmin/health" />
            <Kpi label="ブロック中ログイン" value={`${data.health.blockedLogins} 件`} accent={data.health.blockedLogins > 0} href="/sysadmin/security?tab=login-attempts" />
            <Kpi label="チャット（24h）" value={`${data.health.chat24h} 件`} href="/sysadmin/activity?tab=communication" />
            <Kpi label="LINE（24h）" value={`${data.health.line24h} 件`} href="/sysadmin/activity?tab=communication" />
          </div>
        </>
      )}

      {/* 売上 vs コスト */}
      <Panel title="売上・運用コスト推移（12ヶ月）">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={revenueCostData}>
            <defs>
              <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-cost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
            <YAxis stroke="#a3a3a3" fontSize={12} tickFormatter={v => `¥${(v / 1000).toLocaleString()}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={((v: any) => yen(Number(v))) as any} />
            <Legend />
            <Area type="monotone" dataKey="売上" stroke="#34d399" fill="url(#g-rev)" strokeWidth={2} />
            <Area type="monotone" dataKey="コスト" stroke="#f87171" fill="url(#g-cost)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        {/* ユーザー内訳 */}
        <Panel title="顧客タイプ内訳">
          {userPie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={userPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {userPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 8 }}>
            店舗メンバー {data.users.storeMemberTotal} ／ 管理者 {data.users.adminTotal} ／ パートナー {data.users.partnerTotal}
          </div>
        </Panel>

        {/* コスト内訳 */}
        <Panel title="運用コスト内訳（カテゴリ別）">
          {costPie.length === 0 ? <Empty text="運用コストが未登録です" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={costPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {costPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={((v: any) => yen(Number(v))) as any} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* 新規ユーザー推移 */}
        <Panel title="新規顧客推移（12ヶ月）">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.users.newByMonth.map(x => ({ month: x.month.slice(2), 新規: x.count }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
              <YAxis stroke="#a3a3a3" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="新規" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* 買取品目推移 */}
        <Panel title="買取品目 登録数推移（12ヶ月）">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.purchase.byMonth.map(x => ({ month: x.month.slice(2), 登録: x.count }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
              <YAxis stroke="#a3a3a3" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="登録" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* 商品別売上ランキング */}
      <Panel title="備品 商品別売上ランキング（上位10）" style={{ marginTop: 16 }}>
        {data.revenue.productRanking.length === 0 ? <Empty text="売上データがありません" /> : (
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
              {data.revenue.productRanking.map((p, i) => (
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

