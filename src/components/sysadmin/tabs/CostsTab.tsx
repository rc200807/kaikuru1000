'use client'

import { useEffect, useMemo, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { yen } from '@/components/sysadmin/ui'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

type Cost = {
  id: string
  month: string
  category: string
  label: string
  amount: number
  note: string | null
  isRecurring?: boolean
  source?: string
}

const CATEGORIES = ['hosting', 'api', 'email', 'labor', 'marketing', 'other'] // 手動入力で選べるカテゴリ
const CHART_CATEGORIES = [...CATEGORIES, 'stripe'] // 積み上げ対象（自動取得のstripeを含む）
const CATEGORY_LABELS: Record<string, string> = {
  hosting: 'ホスティング', api: 'API利用料', email: 'メール', labor: '人件費', marketing: '広告', other: 'その他', stripe: 'Stripe手数料',
}
const CAT_COLORS: Record<string, string> = {
  hosting: '#60a5fa', api: '#34d399', email: '#fbbf24', labor: '#f87171', marketing: '#a78bfa', other: '#94a3b8', stripe: '#f472b6',
}

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function CostsTab() {
  const [costs, setCosts] = useState<Cost[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ month: thisMonth(), category: 'hosting', label: '', amount: '', note: '', isRecurring: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autoMsg, setAutoMsg] = useState('')
  const [autoBusy, setAutoBusy] = useState<'stripe' | 'recurring' | null>(null)

  function load() {
    return fetch('/api/sysadmin/operating-costs')
      .then(r => (r.ok ? r.json() : []))
      .then(setCosts)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    setError('')
    if (!form.label.trim()) { setError('項目名を入力してください'); return }
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 0) { setError('金額を正しく入力してください'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/sysadmin/operating-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: form.month,
          category: form.category,
          label: form.label.trim(),
          amount,
          note: form.note.trim() || null,
          isRecurring: form.isRecurring,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? '登録に失敗しました'); return }
      setForm({ month: form.month, category: form.category, label: '', amount: '', note: '', isRecurring: false })
      load()
    } finally {
      setSaving(false)
    }
  }

  function flashAuto(text: string) {
    setAutoMsg(text)
    setTimeout(() => setAutoMsg(''), 5000)
  }

  async function handleStripeFees() {
    setAutoBusy('stripe')
    try {
      const res = await fetch('/api/sysadmin/operating-costs/stripe-fees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: form.month }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flashAuto(j.error ?? 'Stripe手数料の取得に失敗しました'); return }
      flashAuto(`${form.month} のStripe手数料 ¥${(j.amount ?? 0).toLocaleString()} を記録しました`)
      load()
    } finally {
      setAutoBusy(null)
    }
  }

  async function handleApplyRecurring() {
    setAutoBusy('recurring')
    try {
      const res = await fetch('/api/sysadmin/operating-costs/apply-recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: form.month }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flashAuto(j.error ?? '定期コストの反映に失敗しました'); return }
      flashAuto(j.created > 0 ? `${form.month} に定期コストを ${j.created} 件反映しました` : `${form.month} に反映する定期コストはありませんでした`)
      load()
    } finally {
      setAutoBusy(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('この費用を削除しますか？')) return
    await fetch(`/api/sysadmin/operating-costs/${id}`, { method: 'DELETE' })
    load()
  }

  // 月×カテゴリ積み上げ
  const chartData = useMemo(() => {
    const byMonth: Record<string, any> = {}
    for (const c of costs) {
      if (!byMonth[c.month]) byMonth[c.month] = { month: c.month }
      byMonth[c.month][c.category] = (byMonth[c.month][c.category] ?? 0) + c.amount
    }
    return Object.values(byMonth).sort((a: any, b: any) => a.month.localeCompare(b.month))
  }, [costs])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  const total = costs.reduce((s, c) => s + c.amount, 0)

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        システム運用にかかる費用を月別・カテゴリ別に記録します（累計 {yen(total)}）
      </p>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 16, border: '1px solid var(--md-sys-color-outline-variant)', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="対象月"><input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} style={inputStyle} /></Field>
          <Field label="カテゴリ">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="項目名"><input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Vercel / Neon など" style={inputStyle} /></Field>
          <Field label="金額（円）"><input type="number" min={0} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={inputStyle} /></Field>
          <Field label="メモ（任意）"><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={inputStyle} /></Field>
          <button onClick={handleAdd} disabled={saving} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', height: 38 }}>
            {saving ? '追加中…' : '追加'}
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, color: 'var(--md-sys-color-on-surface-variant)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isRecurring} onChange={e => setForm({ ...form, isRecurring: e.target.checked })} />
          毎月発生する固定費として登録（🔁 翌月以降に自動で繰り越し）
        </label>
        {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
      </div>

      {/* 自動取得 */}
      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 16, border: '1px solid var(--md-sys-color-outline-variant)', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>自動取得（対象月: {form.month}）：</span>
        <button onClick={handleStripeFees} disabled={autoBusy !== null} style={autoBtn}>
          {autoBusy === 'stripe' ? '取得中…' : 'Stripe手数料を取得'}
        </button>
        <button onClick={handleApplyRecurring} disabled={autoBusy !== null} style={autoBtn}>
          {autoBusy === 'recurring' ? '反映中…' : '定期コストを反映'}
        </button>
        {autoMsg && <span style={{ fontSize: 13, color: '#66bb6a' }}>{autoMsg}</span>}
      </div>

      {/* チャート */}
      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)', marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>月別コスト推移（カテゴリ積み上げ）</h2>
        {chartData.length === 0 ? (
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40, fontSize: 13 }}>費用が登録されていません</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#a3a3a3" fontSize={12} />
              <YAxis stroke="#a3a3a3" fontSize={12} tickFormatter={v => `¥${(v / 1000).toLocaleString()}k`} />
              <Tooltip contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#ededed', fontSize: 12 }} formatter={((v: any) => yen(Number(v))) as any} />
              <Legend formatter={(v) => CATEGORY_LABELS[v] ?? v} />
              {CHART_CATEGORIES.map(c => (
                <Bar key={c} dataKey={c} stackId="cost" fill={CAT_COLORS[c]} name={c} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 一覧 */}
      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', background: 'var(--md-sys-color-surface-container)', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
              <th style={{ padding: '10px 16px' }}>対象月</th>
              <th style={{ padding: '10px 16px' }}>カテゴリ</th>
              <th style={{ padding: '10px 16px' }}>項目</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>金額</th>
              <th style={{ padding: '10px 16px' }}>メモ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>費用が登録されていません</td></tr>
            )}
            {costs.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                <td style={{ padding: '10px 16px' }}>{c.month}</td>
                <td style={{ padding: '10px 16px' }}>{CATEGORY_LABELS[c.category] ?? c.category}</td>
                <td style={{ padding: '10px 16px' }}>
                  {c.label}
                  {c.isRecurring && <span title="毎月の定期コスト" style={{ marginLeft: 6, fontSize: 11, color: '#60a5fa' }}>🔁定期</span>}
                  {c.source === 'stripe' && <span title="Stripeから自動取得" style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'rgba(244,114,182,0.15)', color: '#f472b6' }}>自動</span>}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>{yen(c.amount)}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{c.note ?? '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-error)', cursor: 'pointer', fontSize: 13 }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 14, width: '100%', boxSizing: 'border-box',
}

const autoBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)',
  background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
