'use client'

import { useState } from 'react'

export type StatusDef = { id: string; label: string; color: string | null }
export type RecordStatus = { statusId: string | null; label: string | null; color: string | null } | null

// 一覧行のインライン対応ステータス選択。変更時に endpoint へ PUT { statusId } する。
export function StatusSelect({
  endpoint,
  statuses,
  current,
  onChange,
}: {
  endpoint: string
  statuses: StatusDef[]
  current: RecordStatus
  onChange: (next: RecordStatus) => void
}) {
  const [saving, setSaving] = useState(false)
  const currentId = current?.statusId ?? ''
  const currentColor = current?.color ?? null

  const handle = async (statusId: string) => {
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: statusId || null }),
      })
      if (res.ok) {
        if (!statusId) onChange(null)
        else {
          const def = statuses.find((s) => s.id === statusId)
          onChange({ statusId, label: def?.label ?? null, color: def?.color ?? null })
        }
      }
    } finally {
      setSaving(false)
    }
  }

  if (statuses.length === 0) {
    return <span className="text-[11px] text-[#666]">選択肢なし</span>
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: currentColor ?? '#3f3f3f' }} />
      <select
        value={currentId}
        disabled={saving}
        onChange={(e) => handle(e.target.value)}
        className="w-full max-w-[170px] px-2 py-1 rounded bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-xs disabled:opacity-50"
      >
        <option value="">未設定</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
