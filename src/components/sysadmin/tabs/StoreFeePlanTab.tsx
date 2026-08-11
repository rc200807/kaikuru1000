'use client'

// 店舗利用状況 > 料金設定タブ
// システム利用料の料金項目マスタ（対応サービスごとの月額）を編集する。
// 保存先は SystemFeeService（売上・コスト＞システム利用料タブと同じマスタ＝設定は一箇所）。

import { useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import {
  yen, Kpi, Panel, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle,
} from '@/components/sysadmin/ui'
import { useStoreUsage, type UsageServiceRow } from '@/components/sysadmin/useStoreUsage'

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, fontSize: 13,
  background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)',
  border: '1px solid var(--md-sys-color-outline-variant)',
}

type Edit = { label: string; monthlyAmount: string; isActive: boolean }

export default function StoreFeePlanTab() {
  const { data, loading, reload } = useStoreUsage()
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [newSvc, setNewSvc] = useState({ serviceKey: '', label: '', monthlyAmount: '' })
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  function editOf(s: UsageServiceRow): Edit {
    return edits[s.serviceKey] ?? { label: s.label, monthlyAmount: String(s.monthlyAmount), isActive: s.isActive }
  }
  function setEdit(s: UsageServiceRow, patch: Partial<Edit>) {
    setEdits(prev => ({ ...prev, [s.serviceKey]: { ...editOf(s), ...patch } }))
  }
  function isDirty(s: UsageServiceRow) {
    const e = edits[s.serviceKey]
    if (!e) return false
    return e.label !== s.label || (Number(e.monthlyAmount) || 0) !== s.monthlyAmount || e.isActive !== s.isActive
  }

  /** 料金項目マスタの id は集計APIに含めないため、保存時に一覧から引き当てる */
  async function resolveServiceId(serviceKey: string): Promise<string | null> {
    const res = await fetch('/api/sysadmin/system-fees/services')
    if (!res.ok) return null
    const list: { id: string; serviceKey: string }[] = await res.json()
    return list.find(x => x.serviceKey === serviceKey)?.id ?? null
  }

  async function save(s: UsageServiceRow) {
    const e = editOf(s)
    setSavingKey(s.serviceKey)
    try {
      const id = await resolveServiceId(s.serviceKey)
      if (!id) { flash('error', '料金項目が見つかりません'); return }
      const res = await fetch(`/api/sysadmin/system-fees/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: e.label.trim(), monthlyAmount: Number(e.monthlyAmount) || 0, isActive: e.isActive }),
      })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '保存に失敗しました'); return }
      setEdits(prev => { const next = { ...prev }; delete next[s.serviceKey]; return next })
      flash('success', `「${j.label}」を保存しました`)
      await reload()
    } finally {
      setSavingKey(null)
    }
  }

  async function remove(s: UsageServiceRow) {
    if (!confirm(`料金項目「${s.label}」を削除しますか？\n対応している ${s.stores} 店舗の月額から、この項目の金額が除外されます。`)) return
    setSavingKey(s.serviceKey)
    try {
      const id = await resolveServiceId(s.serviceKey)
      if (!id) { flash('error', '料金項目が見つかりません'); return }
      const res = await fetch(`/api/sysadmin/system-fees/services/${id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) { flash('error', j.error ?? '削除に失敗しました'); return }
      flash('success', `「${s.label}」を削除しました`)
      await reload()
    } finally {
      setSavingKey(null)
    }
  }

  async function create() {
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
      flash('success', `「${j.label}」を追加しました`)
      await reload()
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>データを取得できませんでした</div>

  const { services, fee } = data
  const canCreate = !!newSvc.label.trim() && !!newSvc.serviceKey.trim()

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
        <Kpi label="料金項目" value={`${services.filter(s => s.inMaster).length} 件`} />
        <Kpi label="現在の月額合計" value={yen(fee.monthlyTotal)} />
        <Kpi label="上書き設定の店舗" value={`${fee.overrideStores} 店舗`} />
      </div>

      <Panel title="料金項目（対応サービスごとの月額・税込）">
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 14px' }}>
          店舗の「対応サービス」に応じて、有効な項目の合計が各店舗の月額になります。
          キーは店舗の対応サービスのキー（kaikuru / akikuru 等）と一致させてください。
          店舗ごとの例外金額は「利用料集計」タブの上書き欄で設定します。
        </p>
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle}>項目名</th>
                <th style={thStyle}>キー</th>
                <th style={thStyle}>月額（円・税込）</th>
                <th style={thStyle}>有効</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>対応店舗</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>うちアクティブ</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>月額合計</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {services.map(s => {
                const e = editOf(s)
                const dirty = isDirty(s)
                if (!s.inMaster) {
                  return (
                    <tr key={s.serviceKey} style={trStyle}>
                      <td style={tdStyle}>{s.label}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{s.serviceKey}</td>
                      <td style={{ ...tdStyle, color: '#fb923c', fontSize: 12 }} colSpan={2}>料金項目が未登録（下の行から追加できます）</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.stores}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.activeStores}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>—</td>
                      <td style={tdStyle}></td>
                    </tr>
                  )
                }
                return (
                  <tr key={s.serviceKey} style={trStyle}>
                    <td style={tdStyle}>
                      <input type="text" value={e.label} onChange={ev => setEdit(s, { label: ev.target.value })} style={{ ...inputStyle, width: 140 }} />
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{s.serviceKey}</td>
                    <td style={tdStyle}>
                      <input type="number" min={0} value={e.monthlyAmount} onChange={ev => setEdit(s, { monthlyAmount: ev.target.value })} style={{ ...inputStyle, width: 110, textAlign: 'right' }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="checkbox" checked={e.isActive} onChange={ev => setEdit(s, { isActive: ev.target.checked })} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{s.stores}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{s.activeStores}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{yen(s.monthlyRevenue)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => save(s)}
                        disabled={!dirty || savingKey === s.serviceKey}
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 12, marginRight: 8,
                          border: '1px solid var(--md-sys-color-outline)', background: 'transparent',
                          color: dirty ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
                          cursor: dirty ? 'pointer' : 'default', opacity: savingKey === s.serviceKey ? 0.5 : 1,
                        }}
                      >
                        {savingKey === s.serviceKey ? '保存中…' : '保存'}
                      </button>
                      <button
                        onClick={() => remove(s)}
                        disabled={savingKey === s.serviceKey}
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
                <td style={tdStyle} colSpan={4}></td>
                <td style={tdStyle}>
                  <button
                    onClick={create}
                    disabled={creating || !canCreate}
                    style={{
                      padding: '6px 14px', borderRadius: 6, fontSize: 12, border: 'none',
                      background: 'var(--md-sys-color-on-surface)', color: 'var(--md-sys-color-surface)',
                      cursor: canCreate ? 'pointer' : 'default', opacity: creating || !canCreate ? 0.4 : 1,
                    }}
                  >
                    ＋ 追加
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </TableCard>
      </Panel>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
        ここでの設定は「売上・コスト ＞ システム利用料」タブと同じマスタです。
        このページは集計のみで請求は行いません（Stripe への自動課金は同タブの「課金」設定が有効な店舗のみ対象）。
      </p>
    </div>
  )
}
