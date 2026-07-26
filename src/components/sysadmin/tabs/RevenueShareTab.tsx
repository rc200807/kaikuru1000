'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Panel } from '@/components/sysadmin/ui'

// アキクル請求の分配割合設定タブ

type RecipientType = 'platform' | 'connect'

type Setting = {
  systemPercent: number
  hqPercent: number
  storePercent: number
  systemRecipientType: RecipientType
  systemStripeAccountId: string | null
  hqRecipientType: RecipientType
  hqStripeAccountId: string | null
}

export default function RevenueShareTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  const [systemPercent, setSystemPercent] = useState('0')
  const [hqPercent, setHqPercent] = useState('0')
  const [storePercent, setStorePercent] = useState('0')
  const [systemRecipientType, setSystemRecipientType] = useState<RecipientType>('platform')
  const [systemStripeAccountId, setSystemStripeAccountId] = useState('')
  const [hqRecipientType, setHqRecipientType] = useState<RecipientType>('platform')
  const [hqStripeAccountId, setHqStripeAccountId] = useState('')

  useEffect(() => {
    fetch('/api/sysadmin/revenue-share')
      .then(r => (r.ok ? r.json() : null))
      .then((s: Setting | null) => {
        if (!s) { setLoadFailed(true); return }
        setSystemPercent(String(s.systemPercent))
        setHqPercent(String(s.hqPercent))
        setStorePercent(String(s.storePercent))
        setSystemRecipientType(s.systemRecipientType)
        setSystemStripeAccountId(s.systemStripeAccountId ?? '')
        setHqRecipientType(s.hqRecipientType)
        setHqStripeAccountId(s.hqStripeAccountId ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  const total = (Number(systemPercent) || 0) + (Number(hqPercent) || 0) + (Number(storePercent) || 0)
  const totalOk = total === 100

  async function handleSave() {
    setError('')
    setSavedMsg('')
    setSaving(true)
    try {
      const res = await fetch('/api/sysadmin/revenue-share', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPercent: Number(systemPercent) || 0,
          hqPercent: Number(hqPercent) || 0,
          storePercent: Number(storePercent) || 0,
          systemRecipientType,
          systemStripeAccountId: systemRecipientType === 'connect' ? (systemStripeAccountId.trim() || null) : null,
          hqRecipientType,
          hqStripeAccountId: hqRecipientType === 'connect' ? (hqStripeAccountId.trim() || null) : null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? '保存に失敗しました'); return }
      setSavedMsg('分配設定を保存しました')
      setTimeout(() => setSavedMsg(''), 5000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (loadFailed) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface)' }}>データを取得できませんでした</div>

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        アキクル案件のStripe請求で回収した売上の分配割合です。支払確定時に自動でStripe Connect送金されます。
      </p>

      {savedMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontSize: 13 }}>
          {savedMsg}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      <Panel title="分配割合">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <PercentField label="システム管理者" value={systemPercent} onChange={setSystemPercent} />
          <PercentField label="本部" value={hqPercent} onChange={setHqPercent} />
          <PercentField label="加盟店" value={storePercent} onChange={setStorePercent} />
        </div>
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: totalOk ? '#4ade80' : '#f87171' }}>
          合計: {total}%{!totalOk && '（100%になるように調整してください）'}
        </div>
      </Panel>

      <Panel title="受取先の設定" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <RecipientRow
            label="システム管理者"
            type={systemRecipientType}
            onTypeChange={setSystemRecipientType}
            accountId={systemStripeAccountId}
            onAccountIdChange={setSystemStripeAccountId}
            name="system-recipient"
          />
          <RecipientRow
            label="本部"
            type={hqRecipientType}
            onTypeChange={setHqRecipientType}
            accountId={hqStripeAccountId}
            onAccountIdChange={setHqStripeAccountId}
            name="hq-recipient"
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>加盟店</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
              各店舗のConnectアカウントへ自動送金（店舗詳細からオンボーディング）
            </p>
          </div>
        </div>
      </Panel>

      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
        Stripe決済手数料と分配の端数はプラットフォームが負担・保持します。
      </p>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving || !totalOk}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
            background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)',
            cursor: (saving || !totalOk) ? 'default' : 'pointer', opacity: (saving || !totalOk) ? 0.5 : 1,
          }}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

function PercentField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, textAlign: 'right' }}
        />
        <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>%</span>
      </div>
    </label>
  )
}

function RecipientRow({ label, type, onTypeChange, accountId, onAccountIdChange, name }: {
  label: string
  type: 'platform' | 'connect'
  onTypeChange: (t: 'platform' | 'connect') => void
  accountId: string
  onAccountIdChange: (v: string) => void
  name: string
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="radio" name={name} checked={type === 'platform'} onChange={() => onTypeChange('platform')} />
          プラットフォーム（RC GroupのStripeアカウント）が保持
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="radio" name={name} checked={type === 'connect'} onChange={() => onTypeChange('connect')} />
          別のConnectアカウントへ送金
        </label>
        {type === 'connect' && (
          <input
            value={accountId}
            onChange={e => onAccountIdChange(e.target.value)}
            placeholder="acct_..."
            style={{ ...inputStyle, maxWidth: 320, marginLeft: 24, fontFamily: 'monospace' }}
          />
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 14, width: '100%', boxSizing: 'border-box',
}
