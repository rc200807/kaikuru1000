'use client'

// 店舗利用状況 > 利用状況タブ
// 店舗数（有効アカウント / アクティブ）、営業ステータス別、対応サービス別の対応店舗数とうちアクティブ数。

import LoadingSpinner from '@/components/LoadingSpinner'
import {
  Kpi, Panel, Empty, PIE_COLORS, tooltipStyle,
  tableStyle, theadRowStyle, thStyle, tdStyle, trStyle,
} from '@/components/sysadmin/ui'
import { useStoreUsage, type UsageServiceRow } from '@/components/sysadmin/useStoreUsage'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

const STATUS_COLOR: Record<string, string> = {
  active: '#34d399',
  preopen: '#60a5fa',
  hiatus: '#fbbf24',
  closed: '#f87171',
  transferred: '#a78bfa',
}

function ServiceCard({ s, totalStores }: { s: UsageServiceRow; totalStores: number }) {
  const rate = totalStores > 0 ? Math.round((s.stores / totalStores) * 100) : 0
  const activeRate = s.stores > 0 ? Math.round((s.activeStores / s.stores) * 100) : 0
  return (
    <div style={{
      background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 16,
      border: '1px solid var(--md-sys-color-outline-variant)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{s.label}</div>
        <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', fontFamily: 'monospace' }}>{s.serviceKey}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>{s.stores}</span>
        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>店舗が対応（全体の {rate}%）</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>{s.activeStores}</span>
        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>うちアクティブ（{activeRate}%）</span>
      </div>

      {/* 対応店舗のうちアクティブの割合バー */}
      <div style={{ height: 6, borderRadius: 999, background: 'var(--md-sys-color-surface-container-highest)', marginTop: 12, overflow: 'hidden' }}>
        <div style={{ width: `${activeRate}%`, height: '100%', background: '#34d399' }} />
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
        月額 {s.inMaster ? `¥${s.monthlyAmount.toLocaleString()}` : '未設定（料金項目なし）'}
        {s.inMaster && !s.isActive && <span style={{ marginLeft: 6, color: '#fb923c' }}>料金項目が無効</span>}
      </div>
    </div>
  )
}

export default function StoreUsageTab() {
  const { data, loading } = useStoreUsage()

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>データを取得できませんでした</div>

  const { stores, services, combos } = data
  const activeRate = stores.total > 0 ? Math.round((stores.active / stores.total) * 100) : 0
  const pieData = stores.byStatus.filter(s => s.count > 0)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        <Kpi label="登録店舗（有効アカウント）" value={`${stores.total} 店舗`} />
        <Kpi label="アクティブ店舗（営業中）" value={`${stores.active} 店舗`} />
        <Kpi label="アクティブ率" value={`${activeRate}%`} />
        <Kpi label="対応サービス未設定" value={`${stores.withoutServices} 店舗`} accent={stores.withoutServices > 0} />
        <Kpi label="停止アカウント" value={`${stores.disabledAccounts} 店舗`} />
      </div>

      <Panel title="対応サービス別の店舗数">
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 14px' }}>
          店舗情報の「対応サービス」をもとに集計しています。アクティブ＝営業ステータスが「営業中」の店舗。
        </p>
        {services.length === 0 ? <Empty text="対応サービスが登録されていません" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {services.map(s => <ServiceCard key={s.serviceKey} s={s} totalStores={stores.total} />)}
          </div>
        )}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Panel title="営業ステータス別">
          {pieData.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                    {pieData.map((s, i) => <Cell key={s.value} fill={STATUS_COLOR[s.value] ?? PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={((v: any) => `${v} 店舗`) as any} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <table style={{ ...tableStyle, marginTop: 12 }}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>ステータス</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>店舗数</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>構成比</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.byStatus.map(s => (
                    <tr key={s.value} style={trStyle}>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: STATUS_COLOR[s.value] ?? '#666', marginRight: 8 }} />
                        {s.label}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{s.count}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--md-sys-color-on-surface-variant)' }}>
                        {stores.total > 0 ? `${Math.round((s.count / stores.total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        <Panel title="対応サービスの組み合わせ">
          {combos.length === 0 ? <Empty /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={thStyle}>組み合わせ</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>店舗数</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>うちアクティブ</th>
                </tr>
              </thead>
              <tbody>
                {combos.map(c => (
                  <tr key={c.key} style={trStyle}>
                    <td style={tdStyle}>{c.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{c.count}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{c.activeCount}</td>
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
