'use client'

import { useEffect, useState, useCallback } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import {
  yen, Kpi, Empty, Panel, TableCard, StatusChip, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle,
} from '@/components/sysadmin/ui'

// 店舗ごとの月額システム利用料タブ
// - 料金項目マスタ（対応サービスごとの月額）の追加・編集
// - 店舗一覧: 対応サービスから自動算出（上書きも可能）・有効切替・当月課金/分配状態・手動課金

type FeeService = {
  id: string
  serviceKey: string
  label: string
  monthlyAmount: number
  isActive: boolean
  sortOrder: number
}

type BreakdownItem = { serviceKey: string; label: string; amount: number }

type StoreFeeRow = {
  storeId: string
  name: string
  code: string
  storeStatus: string | null
  hasCustomer: boolean
  services: BreakdownItem[]
  autoAmount: number
  overrideAmount: number
  effectiveAmount: number
  isActive: boolean
  note: string
  currentPayment: {
    id: string
    status: string
    amount: number
    failureMessage: string | null
    paidAt: string | null
    distributionStatus: string
    distributionError: string | null
  } | null
}

const PAYMENT_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: '支払い済み', bg: '#14532d', fg: '#4ade80' },
  pending: { label: '処理中', bg: '#172554', fg: '#60a5fa' },
  failed: { label: '失敗', bg: '#450a0a', fg: '#fca5a5' },
  no_card: { label: 'カード未登録', bg: '#431407', fg: '#fb923c' },
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, fontSize: 13,
  background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)',
  border: '1px solid var(--md-sys-color-outline-variant)',
}

export default function SystemFeesTab() {
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [services, setServices] = useState<FeeService[]>([])
  const [rows, setRows] = useState<StoreFeeRow[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 料金項目マスタの編集
  const [svcEdits, setSvcEdits] = useState<Record<string, { label: string; monthlyAmount: string; isActive: boolean }>>({})
  const [svcSavingId, setSvcSavingId] = useState<string | null>(null)
  const [newSvc, setNewSvc] = useState({ serviceKey: '', label: '', monthlyAmount: '' })
  const [creating, setCreating] = useState(false)

  // 店舗設定の編集
  const [edits, setEdits] = useState<Record<string, { overrideAmount: string; isActive: boolean; note: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runningStoreId, setRunningStoreId] = useState<string | null>(null)
  const [distributingId, setDistributingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/sysadmin/system-fees')
    if (!res.ok) return
    const d = await res.json()
    setMonth(d.month)
    setServices(d.services)
    setRows(d.stores)
    setEdits({})
    setSvcEdits({})
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  // ─── 料金項目マスタ ───
  function svcEditOf(s: FeeService) {
    return svcEdits[s.id] ?? { label: s.label, monthlyAmount: String(s.monthlyAmount), isActive: s.isActive }
  }
  function setSvcEdit(id: string, patch: Partial<{ label: string; monthlyAmount: string; isActive: boolean }>) {
    setSvcEdits(prev => {
      const s = services.find(x => x.id === id)!
      const cur = prev[id] ?? { label: s.label, monthlyAmount: String(s.monthlyAmount), isActive: s.isActive }
      return { ...prev, [id]: { ...cur, ...patch } }
    })
  }
  function svcDirty(s: FeeService) {
    const e = svcEdits[s.id]
    if (!e) return false
    return e.label !== s.label || Number(e.monthlyAmount) !== s.monthlyAmount || e.isActive !== s.isActive
  }

  async function saveService(s: FeeService) {
    const e = svcEditOf(s)
    setSvcSavingId(s.id)
    try {
      const res = await fetch(`/api/sysadmin/system-fees/services/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: e.label, monthlyAmount: Number(e.monthlyAmount) || 0, isActive: e.isActive }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '保存に失敗しました'); return }
      flash('success', `料金項目「${j.label}」を保存しました`)
      await load()
    } finally {
      setSvcSavingId(null)
    }
  }

  async function deleteService(s: FeeService) {
    if (!confirm(`料金項目「${s.label}」を削除しますか？\n（この項目に対応する店舗の自動算出額から除外されます）`)) return
    setSvcSavingId(s.id)
    try {
      const res = await fetch(`/api/sysadmin/system-fees/services/${s.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '削除に失敗しました'); return }
      flash('success', `料金項目「${s.label}」を削除しました`)
      await load()
    } finally {
      setSvcSavingId(null)
    }
  }

  async function createService() {
    setCreating(true)
    try {
      const res = await fetch('/api/sysadmin/system-fees/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceKey: newSvc.serviceKey.trim(),
          label: newSvc.label.trim(),
          monthlyAmount: Number(newSvc.monthlyAmount) || 0,
        }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '追加に失敗しました'); return }
      setNewSvc({ serviceKey: '', label: '', monthlyAmount: '' })
      flash('success', `料金項目「${j.label}」を追加しました`)
      await load()
    } finally {
      setCreating(false)
    }
  }

  // ─── 店舗設定 ───
  function editOf(row: StoreFeeRow) {
    return edits[row.storeId] ?? { overrideAmount: row.overrideAmount > 0 ? String(row.overrideAmount) : '', isActive: row.isActive, note: row.note }
  }
  function setEdit(storeId: string, patch: Partial<{ overrideAmount: string; isActive: boolean; note: string }>) {
    setEdits(prev => {
      const row = rows.find(r => r.storeId === storeId)!
      const cur = prev[storeId] ?? { overrideAmount: row.overrideAmount > 0 ? String(row.overrideAmount) : '', isActive: row.isActive, note: row.note }
      return { ...prev, [storeId]: { ...cur, ...patch } }
    })
  }
  function isDirty(row: StoreFeeRow) {
    const e = edits[row.storeId]
    if (!e) return false
    return (Number(e.overrideAmount) || 0) !== row.overrideAmount || e.isActive !== row.isActive || e.note !== row.note
  }

  async function save(row: StoreFeeRow) {
    const e = editOf(row)
    setSavingId(row.storeId)
    try {
      const res = await fetch(`/api/sysadmin/system-fees/${row.storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyAmount: Number(e.overrideAmount) || 0, isActive: e.isActive, note: e.note }),
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

  async function retryDistribution(row: StoreFeeRow) {
    if (!row.currentPayment) return
    setDistributingId(row.storeId)
    try {
      const res = await fetch('/api/sysadmin/system-fees/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: row.currentPayment.id }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '分配に失敗しました'); return }
      flash(j.distributionStatus === 'done' ? 'success' : 'error',
        j.distributionStatus === 'done' ? '分配が完了しました' : '分配が一部失敗しました（分配設定を確認してください）')
      await load()
    } finally {
      setDistributingId(null)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner size="lg" label="読み込み中..." /></div>

  const activeRows = rows.filter(r => r.isActive && r.effectiveAmount > 0)
  const expectedTotal = activeRows.reduce((s, r) => s + r.effectiveAmount, 0)
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

      {/* 料金項目マスタ */}
      <Panel title="料金項目（対応サービスごとの月額・税込）">
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>
          店舗の「対応サービス」に応じて、有効な項目の合計が月額として自動算出されます。
          キーは店舗の対応サービスのキー（kaikuru / akikuru 等）と一致させてください。
        </p>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>項目名</th>
              <th style={thStyle}>キー</th>
              <th style={thStyle}>月額（円・税込）</th>
              <th style={thStyle}>有効</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const e = svcEditOf(s)
              return (
                <tr key={s.id} style={trStyle}>
                  <td style={tdStyle}>
                    <input type="text" value={e.label} onChange={ev => setSvcEdit(s.id, { label: ev.target.value })} style={{ ...inputStyle, width: 140 }} />
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{s.serviceKey}</td>
                  <td style={tdStyle}>
                    <input type="number" min={0} value={e.monthlyAmount} onChange={ev => setSvcEdit(s.id, { monthlyAmount: ev.target.value })} style={{ ...inputStyle, width: 110, textAlign: 'right' }} />
                  </td>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={e.isActive} onChange={ev => setSvcEdit(s.id, { isActive: ev.target.checked })} />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => saveService(s)}
                      disabled={!svcDirty(s) || svcSavingId === s.id}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 12, marginRight: 8,
                        border: '1px solid var(--md-sys-color-outline)', background: 'transparent',
                        color: svcDirty(s) ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
                        cursor: svcDirty(s) ? 'pointer' : 'default', opacity: svcSavingId === s.id ? 0.5 : 1,
                      }}
                    >
                      保存
                    </button>
                    <button
                      onClick={() => deleteService(s)}
                      disabled={svcSavingId === s.id}
                      style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer' }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              )
            })}
            {/* 追加行 */}
            <tr style={trStyle}>
              <td style={tdStyle}>
                <input type="text" placeholder="項目名（例: エコトク）" value={newSvc.label} onChange={ev => setNewSvc({ ...newSvc, label: ev.target.value })} style={{ ...inputStyle, width: 140 }} />
              </td>
              <td style={tdStyle}>
                <input type="text" placeholder="キー（例: ecotoku）" value={newSvc.serviceKey} onChange={ev => setNewSvc({ ...newSvc, serviceKey: ev.target.value })} style={{ ...inputStyle, width: 130, fontFamily: 'monospace', fontSize: 12 }} />
              </td>
              <td style={tdStyle}>
                <input type="number" min={0} placeholder="8800" value={newSvc.monthlyAmount} onChange={ev => setNewSvc({ ...newSvc, monthlyAmount: ev.target.value })} style={{ ...inputStyle, width: 110, textAlign: 'right' }} />
              </td>
              <td style={tdStyle}></td>
              <td style={tdStyle}>
                <button
                  onClick={createService}
                  disabled={creating || !newSvc.label.trim() || !newSvc.serviceKey.trim()}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, border: 'none',
                    background: 'var(--md-sys-color-on-surface)', color: 'var(--md-sys-color-surface)',
                    cursor: 'pointer', opacity: creating || !newSvc.label.trim() || !newSvc.serviceKey.trim() ? 0.4 : 1,
                  }}
                >
                  ＋ 追加
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Kpi label="課金対象店舗（当月）" value={`${activeRows.length} 店舗`} />
        <Kpi label="月額合計（想定）" value={yen(expectedTotal)} />
        <Kpi label={`${month} 支払い済み`} value={`${paidCount} 店舗`} />
        <Kpi label={`${month} 失敗・未登録`} value={`${failedCount} 店舗`} accent={failedCount > 0} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
          有効にした店舗へ毎月1日に自動課金されます（店舗が「お支払い情報」で登録したカードへ請求）。
          金額は対応サービスから自動算出。個別の上書きも可能です。
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
                <th style={thStyle}>対応サービス</th>
                <th style={thStyle}>月額</th>
                <th style={thStyle}>上書き（円）</th>
                <th style={thStyle}>課金</th>
                <th style={thStyle}>当月の状態</th>
                <th style={thStyle}>メモ</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const e = editOf(row)
                const chip = row.currentPayment ? PAYMENT_CHIP[row.currentPayment.status] : null
                const overridden = (Number(e.overrideAmount) || 0) > 0
                return (
                  <tr key={row.storeId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                        {row.code}
                        {!row.hasCustomer && <span style={{ marginLeft: 6, color: '#fb923c' }}>決済未設定</span>}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {row.services.length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.services.map(b => (
                            <span key={b.serviceKey} style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 999,
                              background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)',
                            }}>
                              {b.label} {yen(b.amount)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700, textDecoration: overridden ? 'line-through' : 'none', opacity: overridden ? 0.5 : 1 }}>
                        {yen(row.autoAmount)}
                      </span>
                      {overridden && <span style={{ fontWeight: 700, marginLeft: 6 }}>{yen(Number(e.overrideAmount) || 0)}</span>}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min={0}
                        placeholder="自動"
                        value={e.overrideAmount}
                        onChange={ev => setEdit(row.storeId, { overrideAmount: ev.target.value })}
                        style={{ ...inputStyle, width: 90, textAlign: 'right' }}
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
                      {chip ? (
                        <div>
                          <StatusChip label={chip.label} bg={chip.bg} fg={chip.fg} />
                          {row.currentPayment?.status === 'paid' && row.currentPayment.distributionStatus === 'partial' && (
                            <button
                              onClick={() => retryDistribution(row)}
                              disabled={distributingId === row.storeId}
                              style={{ display: 'block', marginTop: 4, padding: '3px 8px', borderRadius: 6, fontSize: 11, border: '1px solid #fb923c', background: 'transparent', color: '#fb923c', cursor: 'pointer' }}
                            >
                              {distributingId === row.storeId ? '分配中…' : '分配リトライ'}
                            </button>
                          )}
                          {row.currentPayment?.failureMessage && ['failed', 'no_card'].includes(row.currentPayment.status) && (
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
                        style={{ ...inputStyle, width: 120, fontSize: 12 }}
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
                      {row.isActive && row.effectiveAmount > 0 && row.currentPayment?.status !== 'paid' && (
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
