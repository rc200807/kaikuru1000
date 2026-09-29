'use client'

import { useState, useEffect } from 'react'
import { OCCUPATION_OPTIONS, OCCUPATION_OTHER, splitOccupation, joinOccupation } from '@/lib/occupation'

const FIELD_CLASS =
  'w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40'

/**
 * 職業のプルダウン。「その他」を選ぶと自由入力欄が出る。
 * value / onChange は保存する文字列（プリセット名、または「その他」で入力した文字列）。
 */
export default function OccupationSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [select, setSelect] = useState(() => splitOccupation(value).select)
  const [other, setOther] = useState(() => splitOccupation(value).other)

  // 親が後から値を入れてきた（顧客情報の読み込み完了など）ときに追従する。
  // 自分が出した値と同じなら触らない（「その他」を選んで未入力の間に選択が外れるのを防ぐ）
  useEffect(() => {
    if (value === joinOccupation(select, other)) return
    const next = splitOccupation(value)
    setSelect(next.select)
    setOther(next.other)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="space-y-2">
      <select
        value={select}
        onChange={(e) => {
          const nextSelect = e.target.value
          setSelect(nextSelect)
          onChange(joinOccupation(nextSelect, other))
        }}
        className={FIELD_CLASS}
      >
        <option value="">選択してください</option>
        {OCCUPATION_OPTIONS.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OCCUPATION_OTHER}>{OCCUPATION_OTHER}</option>
      </select>
      {select === OCCUPATION_OTHER && (
        <input
          type="text"
          value={other}
          onChange={(e) => {
            setOther(e.target.value)
            onChange(joinOccupation(OCCUPATION_OTHER, e.target.value))
          }}
          placeholder="職業を入力してください"
          className={FIELD_CLASS}
        />
      )}
    </div>
  )
}
