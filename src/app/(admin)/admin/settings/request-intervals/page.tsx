'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type Intervals = {
  visitRequestIntervalMonths: number
  deliveryShipmentIntervalMonths: number
}

export default function RequestIntervalsPage() {
  return (
    <SettingsShell title="訪問リクエスト・宅配の利用間隔">
      <RequestIntervalSection />
    </SettingsShell>
  )
}

const MONTH_OPTIONS = [0, 1, 2, 3, 4, 6, 12]

function RequestIntervalSection() {
  const [form, setForm] = useState<Intervals>({ visitRequestIntervalMonths: 1, deliveryShipmentIntervalMonths: 3 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/request-intervals')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setForm(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/request-intervals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForm(data)
        setMessage({ type: 'success', text: '利用間隔を保存しました' })
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setSaving(false)
  }

  function Field({
    label, help, value, onChange,
  }: { label: string; help: string; value: number; onChange: (v: number) => void }) {
    return (
      <div>
        <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">{label}</label>
        <select
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full max-w-xs h-11 px-3 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
        >
          {MONTH_OPTIONS.map(m => (
            <option key={m} value={m}>{m === 0 ? '制限なし' : `${m}ヶ月に1回`}</option>
          ))}
        </select>
        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">{help}</p>
      </div>
    )
  }

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-center gap-3 mb-1">
        <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">利用間隔の既定値</h3>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        お客様が訪問リクエスト・宅配の送付登録を何ヶ月に1回まで利用できるかの既定値です。
        新しく登録するお客様にはこの値が設定され、顧客ごとの変更は顧客詳細の「訪問頻度」から行えます。
      </p>

      <div className="ml-8 space-y-5">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {loading ? (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中...</p>
        ) : (
          <>
            <Field
              label="訪問リクエスト"
              help="訪問型のお客様が訪問リクエストを送れる間隔。既定は月1回。"
              value={form.visitRequestIntervalMonths}
              onChange={v => setForm(f => ({ ...f, visitRequestIntervalMonths: v }))}
            />
            <Field
              label="定期宅配の送付登録"
              help="定期宅配のお客様が段ボールの送付を登録できる間隔。既定は3ヶ月に1回。"
              value={form.deliveryShipmentIntervalMonths}
              onChange={v => setForm(f => ({ ...f, deliveryShipmentIntervalMonths: v }))}
            />
            <Button variant="filled" onClick={handleSave} loading={saving} disabled={saving}>保存</Button>
          </>
        )}
      </div>
    </Card>
  )
}
