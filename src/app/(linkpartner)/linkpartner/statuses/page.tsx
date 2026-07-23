'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

type Status = { id: string; targetType: string; label: string; color: string | null; sortOrder: number; isActive: boolean }

const COLOR_PRESETS: { name: string; value: string }[] = [
  { name: 'グレー', value: '#6b7280' },
  { name: '青', value: '#3b82f6' },
  { name: '緑', value: '#10b981' },
  { name: '黄', value: '#f59e0b' },
  { name: '赤', value: '#ef4444' },
  { name: '紫', value: '#8b5cf6' },
]

export default function LinkPartnerStatusesPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.partnerRole === 'partner_admin'

  if (session && !isAdmin) {
    return <div className="p-8 text-center text-[#999]">このページは連携パートナー管理者のみが利用できます。</div>
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">対応ステータス設定</h1>
        <p className="text-xs text-[#999] mt-1">問い合わせ・顧客の一覧で設定できる対応ステータスの選択肢を管理します。</p>
      </div>
      <StatusSection targetType="inquiry" title="問い合わせ用ステータス" />
      <div className="h-8" />
      <StatusSection targetType="customer" title="顧客用ステータス" />
    </div>
  )
}

function StatusSection({ targetType, title }: { targetType: 'inquiry' | 'customer'; title: string }) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0].value)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/linkpartner/statuses?targetType=${targetType}`)
      .then((r) => (r.ok ? r.json() : { statuses: [] }))
      .then((d) => setStatuses(d.statuses || []))
      .finally(() => setLoading(false))
  }, [targetType])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true); setError('')
    try {
      const res = await fetch('/api/linkpartner/statuses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, label: newLabel, color: newColor }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? '追加に失敗しました'); return }
      setNewLabel(''); load()
    } finally { setAdding(false) }
  }

  const save = async (id: string, patch: Partial<Pick<Status, 'label' | 'color'>>) => {
    const res = await fetch(`/api/linkpartner/statuses/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (res.ok) load()
  }
  const remove = async (id: string) => {
    if (!confirm('このステータスを削除しますか？（設定済みのレコードは「未設定」に戻ります）')) return
    const res = await fetch(`/api/linkpartner/statuses/${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#141414] p-4">
      <h2 className="text-sm font-bold mb-3">{title}</h2>

      {loading ? (
        <p className="text-sm text-[#999]">読み込み中…</p>
      ) : statuses.length === 0 ? (
        <p className="text-xs text-[#777] mb-3">まだ選択肢がありません。下から追加してください。</p>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {statuses.map((s) => <StatusRow key={s.id} status={s} onSave={save} onRemove={remove} />)}
        </div>
      )}

      <form onSubmit={add} className="flex items-end gap-2 flex-wrap border-t border-[rgba(255,255,255,0.06)] pt-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] text-[#999] mb-1">新しいステータス名</label>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} required maxLength={40} placeholder="例: 対応中"
            className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm" />
        </div>
        <ColorSelect value={newColor} onChange={setNewColor} />
        <button type="submit" disabled={adding || !newLabel} className="px-4 py-2 rounded-md bg-white text-black font-semibold text-sm disabled:opacity-50">
          {adding ? '追加中…' : '追加'}
        </button>
      </form>
      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
    </div>
  )
}

function StatusRow({ status, onSave, onRemove }: { status: Status; onSave: (id: string, patch: Partial<Pick<Status, 'label' | 'color'>>) => void; onRemove: (id: string) => void }) {
  const [label, setLabel] = useState(status.label)
  const [color, setColor] = useState(status.color ?? COLOR_PRESETS[0].value)
  const dirty = label !== status.label || color !== (status.color ?? COLOR_PRESETS[0].value)
  return (
    <div className="flex items-center gap-2 flex-wrap p-2 rounded-md bg-[#1a1a1a]">
      <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40}
        className="flex-1 min-w-[120px] px-2 py-1.5 rounded bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] text-sm" />
      <ColorSelect value={color} onChange={setColor} compact />
      {dirty && <button onClick={() => onSave(status.id, { label, color })} className="px-3 py-1.5 rounded bg-[#222] border border-[rgba(255,255,255,0.08)] text-xs">保存</button>}
      <button onClick={() => onRemove(status.id)} className="px-3 py-1.5 rounded bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-xs text-rose-400">削除</button>
    </div>
  )
}

function ColorSelect({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className={compact ? '' : ''}>
      {!compact && <label className="block text-[11px] text-[#999] mb-1">色</label>}
      <div className="flex items-center gap-1">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            onClick={() => onChange(c.value)}
            className={`w-6 h-6 rounded-full border-2 ${value === c.value ? 'border-white' : 'border-transparent'}`}
            style={{ background: c.value }}
          />
        ))}
      </div>
    </div>
  )
}
