'use client'

import { useEffect, useState, useCallback } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import {
  yen, Kpi, Empty, TableCard, StatusChip, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle,
} from '@/components/sysadmin/ui'

// 店舗ごとの月額システム利用料の設定・当月課金の実行タブ

type StoreFeeRow = {
  storeId: string
  name: string
  code: string
  storeStatus: string | null
  hasCustomer: boolean
  monthlyAmount: number
  isActive: boolean
  note: string
  currentPayment: { status: string; amount: number; failureMessage: string | null; paidAt: string | null } | null
}

const PAYMENT_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: '支払い済み', bg: '#14532d', fg: '#4ade80' },
  pending: { label: '処理中', bg: '#172554', fg: '#60a5fa' },
  failed: { label: '失敗', bg: '#450a0a', fg: '#fca5a5' },
  no_card: { label: 'カード未登録', bg: '#431407', fg: '#fb923c' },
}

export default function SystemFeesTab() {
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [rows, setRows] = useState<StoreFeeRow[]>([])
  const [edits, setEdits] = useState<Record<string, { monthlyAmount: string; isActive: boolean; note: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runningStoreId, setRunningStoreId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/sysadmin/system-fees')
    if (!res.ok) return
    const d = await res.json()
    setMonth(d.month)
    setRows(d.stores)
    setEdits({})
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  function editOf(row: StoreFeeRow) {
    return edits[row.storeId] ?? { monthlyAmount: String(row.monthlyAmount), isActive: row.isActive, note: row.note }
  }

  function setEdit(storeId: string, patch: Partial<{ monthlyAmount: string; isActive: boolean; note: string }>) {
    setEdits(prev => {
      const row = rows.find(r => r.storeId === storeId)!
      const cur = prev[storeId] ?? { monthlyAmount: String(row.monthlyAmount), isActive: row.isActive, note: row.note }
      return { ...prev, [storeId]: { ...cur, ...patch } }
    })
  }

  function isDirty(row: StoreFeeRow) {
    const e = edits[row.storeId]
    if (!e) return false
    return Number(e.monthlyAmount) !== row.monthlyAmount || e.isActive !== row.isActive || e.note !== row.note
  }

  async function save(row: StoreFeeRow) {
    const e = editOf(row)
    setSavingId(row.storeId)
    try {
      const res = await fetch(`/api/sysadmin/system-fees/${row.storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyAmount: Number(e.monthlyAmount) || 0, isActive: e.isActive, note: e.note }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '保存に失敗しました'); return }
      flash('success', `${row.name} の設定を保存しました`)
      await load()
    } finally {
      setSavingId(null)
    }
  }

  async function runBilling(storeId?: string) {
    const target = storeId ? rows.find(r => r.storeId === storeId)?.name : '全店舗'
    if (!confirm(`${month} 分のシステム利用料を${target}に課金します。よろしいですか？\n（支払い済み・処理中の店舗はスキップされます）`)) return
    if (storeId) setRunningStoreId(storeId)
    else setRunning(true)
    try {
      const res = await fetch('/api/sysadmin/system-fees/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeId ? { storeId } : {}),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '課金の実行に失敗しました'); return }
      flash('success', `課金を実行しました（成功 ${j.paid} / 失敗 ${j.failed} / カード未登録 ${j.noCard} / スキップ ${j.skipped}）`)
      await load()
    } finally {
      setRunning(false)
      setRunningStoreId(null)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner size="lg" label="読み込み中..." /></div>

  const activeRows = rows.filter(r => r.isActive && r.monthlyAmount > 0)
  const expectedTotal = activeRows.reduce((s, r) => s + r.monthlyAmount, 0)
  const paidCount = rows.filter(r => r.currentPayment?.status === 'paid').length
  const failedCount = rows.filter(r => r.currentPayment && ['failed', 'no_card'].includes(r.currentPayment.status)).length

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Kpi label="課金対象店舗（当月）" value={`${activeRows.length} 店舗`} />
        <Kpi label="月額合計（想定）" value={yen(expectedTotal)} />
        <Kpi label={`${month} 支払い済み`} value={`${paidCount} 店舗`} />
        <Kpi label={`${month} 失敗・未登録`} value={`${failedCount} 店舗`} accent={failedCount > 0} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
          有効にした店舗へ毎月1日に自動課金されます（店舗が「お支払い情報」で登録したカードへ請求）。
        </p>
        <button
          onClick={() => runBilling()}
          disabled={running}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: running ? 'wait' : 'pointer',
            background: 'var(--md-sys-color-on-surface)', color: 'var(--md-sys-color-surface)', fontSize: 13, fontWeight: 600,
          }}
        >
          {running ? '実行中…' : `当月分（${month}）を一括実行`}
        </button>
      </div>

      {rows.length === 0 ? <Empty text="店舗がありません" /> : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>店舗</th>
                <th style={thStyle}>月額（円）</th>
                <th style={thStyle}>課金</th>
                <th style={thStyle}>決済アカウント</th>
                <th style={thStyle}>当月の状態</th>
                <th style={thStyle}>メモ</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const e = editOf(row)
                const chip = row.currentPayment ? PAYMENT_CHIP[row.currentPayment.status] : null
                return (
                  <tr key={row.storeId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{row.code}</div>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min={0}
                        value={e.monthlyAmount}
                        onChange={ev => setEdit(row.storeId, { monthlyAmount: ev.target.value })}
                        style={{
                          width: 110, padding: '6px 10px', borderRadius: 6, fontSize: 13, textAlign: 'right',
                          background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)',
                          border: '1px solid var(--md-sys-color-outline-variant)',
                        }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={e.isActive}
                          onChange={ev => setEdit(row.storeId, { isActive: ev.target.checked })}
                        />
                        有効
                      </label>
                    </td>
                    <td style={tdStyle}>
                      {/* Store.stripeCustomerId の有無（カード自体の有無は課金結果=当月の状態で判る） */}
                      {row.hasCustomer
                        ? <span style={{ fontSize: 12, color: '#4ade80' }}>作成済み</span>
                        : <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>未作成</span>}
                    </td>
                    <td style={tdStyle}>
                      {chip ? (
                        <div>
                          <StatusChip label={chip.label} bg={chip.bg} fg={chip.fg} />
                          {row.currentPayment?.failureMessage && (
                            <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4, maxWidth: 220 }}>{row.currentPayment.failureMessage}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={e.note}
                        onChange={ev => setEdit(row.storeId, { note: ev.target.value })}
                        placeholder="メモ"
                        style={{
                          width: 140, padding: '6px 10px', borderRadius: 6, fontSize: 12,
                          background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)',
                          border: '1px solid var(--md-sys-color-outline-variant)',
                        }}
                      />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => save(row)}
                        disabled={!isDirty(row) || savingId === row.storeId}
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 12, marginRight: 8,
                          border: '1px solid var(--md-sys-color-outline)', background: 'transparent',
                          color: isDirty(row) ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
                          cursor: isDirty(row) ? 'pointer' : 'default', opacity: savingId === row.storeId ? 0.5 : 1,
                        }}
                      >
                        {savingId === row.storeId ? '保存中…' : '保存'}
                      </button>
                      {row.isActive && row.monthlyAmount > 0 && row.currentPayment?.status !== 'paid' && (
                        <button
                          onClick={() => runBilling(row.storeId)}
                          disabled={runningStoreId === row.storeId}
                          style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 12, border: 'none',
                            background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)',
                            cursor: 'pointer', opacity: runningStoreId === row.storeId ? 0.5 : 1,
                          }}
                        >
                          {runningStoreId === row.storeId ? '課金中…' : '今すぐ課金'}
                        </button>
                      )}
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
