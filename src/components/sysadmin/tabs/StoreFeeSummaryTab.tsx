'use client'

// 店舗利用状況 > 利用料集計タブ
// システム利用料（月額）の月次集計。請求は行わず、料金設定 × 対応サービスからの想定額を表示する。

import { useMemo, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import {
  yen, Kpi, Panel, Empty, TableCard, FilterChip, StatusChip,
  tableStyle, theadRowStyle, thStyle, tdStyle, trStyle, tooltipStyle,
} from '@/components/sysadmin/ui'
import { useStoreUsage, type UsageStoreRow } from '@/components/sysadmin/useStoreUsage'
import { STORE_STATUSES } from '@/lib/store-status'
import { formatJstDate } from '@/lib/datetime'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, fontSize: 13,
  background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)',
  border: '1px solid var(--md-sys-color-outline-variant)',
}

type StatusFilter = 'all' | 'active' | 'billable' | 'loggedIn' | 'neverLoggedIn' | string

export default function StoreFeeSummaryTab() {
  const { data, loading, reload } = useStoreUsage()
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [keyword, setKeyword] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const rows = data?.rows ?? []
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const presets = ['all', 'active', 'billable', 'loggedIn', 'neverLoggedIn']
    return rows.filter(r => {
      if (filter === 'active' && !r.isActiveStore) return false
      if (filter === 'billable' && !(r.isActiveStore && r.effectiveAmount > 0)) return false
      if (filter === 'loggedIn' && !r.hasLoggedIn) return false
      if (filter === 'neverLoggedIn' && r.hasLoggedIn) return false
      if (!presets.includes(filter) && r.status !== filter) return false
      if (kw && !`${r.name} ${r.code} ${r.prefecture ?? ''}`.toLowerCase().includes(kw)) return false
      return true
    })
  }, [rows, filter, keyword])

  const filteredTotal = filtered.reduce((sum, r) => sum + r.effectiveAmount, 0)

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  function editOf(row: UsageStoreRow) {
    return edits[row.id] ?? (row.overrideAmount > 0 ? String(row.overrideAmount) : '')
  }
  function isDirty(row: UsageStoreRow) {
    const e = edits[row.id]
    if (e === undefined) return false
    return (Number(e) || 0) !== row.overrideAmount
  }

  async function saveOverride(row: UsageStoreRow) {
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/sysadmin/system-fees/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyAmount: Number(editOf(row)) || 0,
          isActive: row.billingActive, // 自動課金の設定は変更しない
          note: row.note,
        }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '保存に失敗しました'); return }
      setEdits(prev => { const next = { ...prev }; delete next[row.id]; return next })
      flash('success', `${row.name} の月額を保存しました`)
      await reload()
    } finally {
      setSavingId(null)
    }
  }

  function exportCsv() {
    if (!data) return
    const header = ['店舗コード', '店舗名', '都道府県', '営業ステータス', 'ログイン状態', '最終ログイン', '対応サービス', '自動算出額', '上書き額', '適用月額']
    const lines = filtered.map(r => [
      r.code, r.name, r.prefecture ?? '', r.statusLabel,
      r.hasLoggedIn ? 'アクティブ' : '未ログイン',
      r.lastLoginAt ? formatJstDate(r.lastLoginAt) : '',
      r.services.map(s => s.label).join('・'),
      String(r.autoAmount), r.overrideAmount > 0 ? String(r.overrideAmount) : '', String(r.effectiveAmount),
    ])
    const csv = [header, ...lines]
      .map(cols => cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `システム利用料_${data.month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>データを取得できませんでした</div>

  const { fee, services, month } = data
  const chartData = fee.byMonth.map(m => ({ month: m.month.slice(2), 月額合計: m.amount, 対象店舗: m.stores }))
  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'active', label: 'アクティブのみ' },
    { key: 'billable', label: '課金対象のみ' },
    { key: 'loggedIn', label: 'ログイン済み' },
    { key: 'neverLoggedIn', label: '未ログイン' },
    { key: 'all', label: 'すべて' },
    ...STORE_STATUSES.filter(s => s.value !== 'active').map(s => ({ key: s.value as StatusFilter, label: s.label })),
  ]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, fontSize: 13,
          background: message.type === 'success' ? '#14532d' : '#450a0a',
          color: message.type === 'success' ? '#4ade80' : '#fca5a5',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        <Kpi label={`月額合計（${month}）`} value={yen(fee.monthlyTotal)} />
        <Kpi label="課金対象店舗" value={`${fee.billableStores} 店舗`} />
        <Kpi label="1店舗あたり平均" value={yen(fee.avgPerStore)} />
        <Kpi label="年換算（12ヶ月）" value={yen(fee.annualTotal)} />
        <Kpi label="金額なしのアクティブ店舗" value={`${fee.unbillableActiveStores} 店舗`} accent={fee.unbillableActiveStores > 0} />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
        金額は「料金設定」タブの月額 × 各店舗の対応サービス（店舗別の上書きがあればその額）から算出した想定額です。
        請求処理は行いません。集計対象は営業ステータスが「営業中」の店舗のみ。
      </p>

      <Panel title="月次推移（過去12ヶ月・推計）">
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>
          各月の対象店舗は開業日・閉店日から判定しています。閉店日が未登録の店舗は現在の営業ステータスで代用するため、
          過去月は推計値です（料金設定は現在の金額を適用）。
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
            <YAxis yAxisId="left" stroke="#a3a3a3" fontSize={12} tickFormatter={v => `¥${(v / 10000).toLocaleString()}万`} />
            <YAxis yAxisId="right" orientation="right" stroke="#a3a3a3" fontSize={12} tickFormatter={v => `${v}店`} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((v: any, name: any) => (name === '月額合計' ? yen(Number(v)) : `${v} 店舗`)) as any}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="月額合計" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="対象店舗" stroke="#34d399" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="サービス別の内訳（当月）">
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>サービス</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>月額</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>対応店舗</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>うちアクティブ</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>月額合計</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => (
              <tr key={s.serviceKey} style={trStyle}>
                <td style={tdStyle}>
                  {s.label}
                  {s.inMaster && !s.isActive && <span style={{ marginLeft: 6, fontSize: 11, color: '#fb923c' }}>無効</span>}
                  {!s.inMaster && <span style={{ marginLeft: 6, fontSize: 11, color: '#fb923c' }}>料金項目なし</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{yen(s.monthlyAmount)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{s.stores}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{s.activeStores}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{yen(s.monthlyRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', margin: '10px 0 0' }}>
          月額合計はアクティブ店舗のうち上書き設定のない店舗の合計です（上書き設定の {fee.overrideStores} 店舗はサービス別に按分せず、上のKPIにのみ含みます）。
        </p>
      </Panel>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {statusChips.map(c => (
          <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>{c.label}</FilterChip>
        ))}
        <input
          type="search"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="店舗名・コード・都道府県で検索"
          style={{ ...inputStyle, minWidth: 220, marginLeft: 'auto' }}
        />
        <button
          onClick={exportCsv}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            border: '1px solid var(--md-sys-color-outline)', background: 'transparent',
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          CSV出力
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        {filtered.length} 店舗 / 月額合計 <strong style={{ color: 'var(--md-sys-color-on-surface)' }}>{yen(filteredTotal)}</strong>
      </div>

      {filtered.length === 0 ? <Empty text="該当する店舗がありません" /> : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>店舗</th>
                <th style={thStyle}>ステータス</th>
                <th style={thStyle}>ログイン状態</th>
                <th style={thStyle}>対応サービス</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>自動算出</th>
                <th style={thStyle}>上書き（円）</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>適用月額</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const e = editOf(row)
                const overridden = (Number(e) || 0) > 0
                return (
                  <tr key={row.id} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                        {row.code}{row.prefecture ? ` ・ ${row.prefecture}` : ''}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: row.isActiveStore ? '#34d399' : 'var(--md-sys-color-on-surface-variant)' }}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <StatusChip
                        label={row.hasLoggedIn ? 'アクティブ' : '未ログイン'}
                        bg={row.hasLoggedIn ? '#14532d' : 'var(--md-sys-color-surface-container-highest)'}
                        fg={row.hasLoggedIn ? '#4ade80' : 'var(--md-sys-color-on-surface-variant)'}
                      />
                      {row.lastLoginAt && (
                        <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>
                          {formatJstDate(row.lastLoginAt)}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {row.services.length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.services.map(s => (
                            <span key={s.serviceKey} style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 999,
                              background: 'var(--md-sys-color-surface-container-highest)',
                            }}>
                              {s.label} {yen(s.amount)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', opacity: overridden ? 0.5 : 1, textDecoration: overridden ? 'line-through' : 'none' }}>
                      {yen(row.autoAmount)}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min={0}
                        placeholder="自動"
                        value={e}
                        onChange={ev => setEdits(prev => ({ ...prev, [row.id]: ev.target.value }))}
                        style={{ ...inputStyle, width: 90, textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                      {yen(overridden ? Number(e) || 0 : row.autoAmount)}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => saveOverride(row)}
                        disabled={!isDirty(row) || savingId === row.id}
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 12,
                          border: '1px solid var(--md-sys-color-outline)', background: 'transparent',
                          color: isDirty(row) ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
                          cursor: isDirty(row) ? 'pointer' : 'default', opacity: savingId === row.id ? 0.5 : 1,
                        }}
                      >
                        {savingId === row.id ? '保存中…' : '保存'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  )
}
