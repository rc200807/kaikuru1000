'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// 週間カレンダー：既存の訪問予定（空き枠）を確認しながら日時を選択するためのピッカー。
// 店舗ポータルで使用（セッションが店舗のため /api/visit-schedules は自店舗分に自動絞り込み）。

type WeekVisit = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  user?: { name: string } | null
}

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
/** 月曜始まりの週初日を返す */
function startOfWeekMonday(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (r.getDay() + 6) % 7 // 月=0 ... 日=6
  return addDays(r, -day)
}
function parseHour(t?: string | null): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):/.exec(t)
  return m ? parseInt(m[1], 10) : null
}

const WEEKDAY = ['月', '火', '水', '木', '金', '土', '日']

export default function WeekSchedulePicker({
  value,
  onSelect,
  bizStart,
  bizEnd,
}: {
  value: { visitDate: string; startTime: string }
  onSelect: (visitDate: string, startTime: string) => void
  bizStart?: string
  bizEnd?: string
}) {
  const initialBase = value.visitDate ? new Date(value.visitDate) : new Date()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(isNaN(initialBase.getTime()) ? new Date() : initialBase))
  const [visits, setVisits] = useState<WeekVisit[]>([])
  const [loading, setLoading] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const startHour = Math.max(0, Math.min(23, parseHour(bizStart) ?? 10))
  const endHour = Math.max(startHour + 1, Math.min(24, parseHour(bizEnd) ?? 19))
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  )

  const fetchWeek = useCallback(async () => {
    setLoading(true)
    try {
      const from = ymd(weekStart)
      const to = ymd(addDays(weekStart, 7)) // 排他側は翌週初日まで含めて取りこぼしを防ぐ
      const res = await fetch(`/api/visit-schedules?from=${from}T00:00:00&to=${to}T23:59:59&limit=200`)
      if (res.ok) {
        const data = await res.json()
        setVisits((data.schedules ?? []).filter((s: WeekVisit) => s.status !== 'cancelled'))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [weekStart])

  useEffect(() => { fetchWeek() }, [fetchWeek])

  // 日付(yyyy-MM-dd) → その日の訪問一覧
  const byDate = useMemo(() => {
    const map: Record<string, WeekVisit[]> = {}
    for (const v of visits) {
      const key = ymd(new Date(v.visitDate))
      ;(map[key] ??= []).push(v)
    }
    return map
  }, [visits])

  const label = `${weekStart.getFullYear()}年 ${weekStart.getMonth() + 1}/${weekStart.getDate()} 〜 ${addDays(weekStart, 6).getMonth() + 1}/${addDays(weekStart, 6).getDate()}`
  const todayKey = ymd(new Date())

  return (
    <div className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-2">
      {/* 週ナビゲーション */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button type="button" onClick={() => setWeekStart(w => addDays(w, -7))} className="px-2 py-1 rounded hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]" aria-label="前の週">‹</button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">{label}</span>
          <button type="button" onClick={() => setWeekStart(startOfWeekMonday(new Date()))} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]">今週</button>
          {loading && <span className="w-3 h-3 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />}
        </div>
        <button type="button" onClick={() => setWeekStart(w => addDays(w, 7))} className="px-2 py-1 rounded hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]" aria-label="次の週">›</button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          {/* ヘッダー: 曜日・日付 */}
          <div className="grid" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
            <div />
            {days.map((d, i) => {
              const key = ymd(d)
              const isToday = key === todayKey
              const isSel = key === value.visitDate
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key, '')}
                  className={`text-center py-1 mx-0.5 rounded-t-md text-[11px] leading-tight transition-colors ${isSel ? 'bg-[var(--portal-primary)] text-white' : isToday ? 'bg-[var(--status-scheduled-bg)] text-[var(--portal-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}
                >
                  <div>{WEEKDAY[i]}</div>
                  <div className="font-bold text-[var(--md-sys-color-on-surface)]" style={isSel ? { color: '#fff' } : undefined}>{d.getMonth() + 1}/{d.getDate()}</div>
                </button>
              )
            })}
          </div>

          {/* 時間なし訪問（時間未定）のチップ行 */}
          <div className="grid border-b border-[var(--md-sys-color-outline-variant)]" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
            <div className="text-[9px] text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-end pr-1">未定</div>
            {days.map((d) => {
              const key = ymd(d)
              const noTime = (byDate[key] ?? []).filter(v => parseHour(v.startTime) === null)
              return (
                <div key={key} className="mx-0.5 min-h-[18px] py-0.5 flex flex-wrap gap-0.5">
                  {noTime.map(v => (
                    <span key={v.id} className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 truncate max-w-full" title={v.user?.name ?? ''}>{v.user?.name ?? '予定'}</span>
                  ))}
                </div>
              )
            })}
          </div>

          {/* 時間帯グリッド */}
          {hours.map(hour => (
            <div key={hour} className="grid" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
              <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-start justify-end pr-1 pt-1">{pad(hour)}:00</div>
              {days.map((d) => {
                const key = ymd(d)
                const hhmm = `${pad(hour)}:00`
                const dayVisits = byDate[key] ?? []
                const booked = dayVisits.filter(v => {
                  const sh = parseHour(v.startTime)
                  if (sh === null) return false
                  const eh = parseHour(v.endTime) ?? sh + 1
                  return hour >= sh && hour < Math.max(eh, sh + 1)
                })
                const startsHere = booked.find(v => parseHour(v.startTime) === hour)
                const isSel = key === value.visitDate && value.startTime === hhmm
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelect(key, hhmm)}
                    className={`mx-0.5 my-0.5 min-h-[34px] rounded text-left px-1 py-0.5 border transition-colors ${
                      isSel
                        ? 'border-[var(--portal-primary)] ring-2 ring-[var(--portal-primary)]/40 bg-[var(--status-scheduled-bg)]'
                        : booked.length > 0
                        ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                        : 'border-transparent hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                    title={booked.map(v => `${v.startTime ?? ''} ${v.user?.name ?? ''}`).join('\n')}
                  >
                    {startsHere && (
                      <span className="block text-[9px] leading-tight text-red-700 dark:text-red-300 truncate">
                        {startsHere.startTime} {startsHere.user?.name ?? '予定'}
                      </span>
                    )}
                    {booked.length > 0 && !startsHere && (
                      <span className="block text-[9px] leading-tight text-red-400 dark:text-red-500">〃</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1.5 px-1">
        赤枠は既存の訪問予定。空いている枠をタップすると日時が入力されます（曜日見出しで日付のみ選択）。
      </p>
    </div>
  )
}
