'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// 店舗スケジュールのカレンダービュー（月間 / 週間 / 日間）。
// 予定をクリックすると紐づく案件詳細（/store/deals/{dealId}）へ遷移する。
// データは日付範囲フィルタ付きの /api/visit-schedules から表示範囲ぶんを取得（店舗セッションは自店舗に自動絞り込み）。

type RawSchedule = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  revisitDate: string | null
  revisitStart: string | null
  revisitEnd: string | null
  user?: { name: string } | null
  deal?: { id: string } | null
}

type CalEvent = {
  id: string
  dateKey: string       // yyyy-MM-dd
  start: string | null  // HH:MM
  end: string | null
  title: string
  status: string
  dealId: string | null
  kind: 'visit' | 'revisit'
}

type View = 'month' | 'week' | 'day'

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function addDays(d: Date, n: number) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function startOfWeekMonday(d: Date) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(r, -((r.getDay() + 6) % 7)) }
function sameKey(d: Date, key: string) { return ymd(d) === key }

const WEEKDAY = ['月', '火', '水', '木', '金', '土', '日']

// ステータス別の色（チップ）
function statusStyle(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    case 'rescheduled': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'absent': return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
    case 'revisit': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
    case 'pending': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
    default: return 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]'
  }
}

export default function ScheduleCalendar() {
  const router = useRouter()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState<Date>(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) })
  const [schedules, setSchedules] = useState<RawSchedule[]>([])
  const [loading, setLoading] = useState(false)

  // 表示範囲（fetch用）
  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor }
    if (view === 'week') { const s = startOfWeekMonday(cursor); return { from: s, to: addDays(s, 6) } }
    // month: 6週グリッド（月初の週の月曜〜42日）
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeekMonday(first)
    return { from: gridStart, to: addDays(gridStart, 41) }
  }, [view, cursor])

  const fetchRange = useCallback(async () => {
    setLoading(true)
    try {
      const from = ymd(range.from)
      const to = ymd(range.to)
      const res = await fetch(`/api/visit-schedules?from=${from}T00:00:00&to=${to}T23:59:59&limit=200`)
      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules ?? [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [range.from, range.to])

  useEffect(() => { fetchRange() }, [fetchRange])

  // スケジュール → イベント（訪問＋後日引取）
  const events = useMemo(() => {
    const list: CalEvent[] = []
    for (const s of schedules) {
      const name = s.user?.name ?? '予定'
      if (s.status !== 'cancelled') {
        list.push({ id: s.id, dateKey: ymd(new Date(s.visitDate)), start: s.startTime, end: s.endTime, title: name, status: s.status, dealId: s.deal?.id ?? null, kind: 'visit' })
      }
      if (s.revisitDate) {
        list.push({ id: `${s.id}-rev`, dateKey: ymd(new Date(s.revisitDate)), start: s.revisitStart, end: s.revisitEnd, title: `引取: ${name}`, status: 'revisit', dealId: s.deal?.id ?? null, kind: 'revisit' })
      }
    }
    return list
  }, [schedules])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events) (map[e.dateKey] ??= []).push(e)
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'))
    }
    return map
  }, [events])

  const openEvent = (e: CalEvent) => {
    const baseId = e.id.replace(/-rev$/, '')
    router.push(e.dealId ? `/store/deals/${e.dealId}` : `/store/schedule/${baseId}`)
  }

  const goPrev = () => setCursor(c => view === 'month' ? addMonths(c, -1) : addDays(c, view === 'week' ? -7 : -1))
  const goNext = () => setCursor(c => view === 'month' ? addMonths(c, 1) : addDays(c, view === 'week' ? 7 : 1))
  const goToday = () => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), n.getDate())) }

  const periodLabel = useMemo(() => {
    if (view === 'day') return `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月${cursor.getDate()}日（${WEEKDAY[(cursor.getDay() + 6) % 7]}）`
    if (view === 'week') { const s = startOfWeekMonday(cursor); const e = addDays(s, 6); return `${s.getFullYear()}年 ${s.getMonth() + 1}/${s.getDate()} 〜 ${e.getMonth() + 1}/${e.getDate()}` }
    return `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`
  }, [view, cursor])

  const todayKey = ymd(new Date())

  return (
    <div>
      {/* ツールバー */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button type="button" onClick={goPrev} className="px-2 py-1 rounded hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]" aria-label="前へ">‹</button>
          <button type="button" onClick={goToday} className="text-xs px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]">今日</button>
          <button type="button" onClick={goNext} className="px-2 py-1 rounded hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]" aria-label="次へ">›</button>
          <span className="ml-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{periodLabel}</span>
          {loading && <span className="ml-1 w-3 h-3 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />}
        </div>
        <div className="inline-flex rounded-lg border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
          {([['month', '月'], ['week', '週'], ['day', '日']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${view === v ? 'bg-[var(--portal-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && <MonthView cursor={cursor} eventsByDate={eventsByDate} todayKey={todayKey} onEvent={openEvent} onPickDay={(d) => { setCursor(d); setView('day') }} />}
      {view === 'week' && <WeekView cursor={cursor} eventsByDate={eventsByDate} todayKey={todayKey} onEvent={openEvent} onPickDay={(d) => { setCursor(d); setView('day') }} />}
      {view === 'day' && <DayView cursor={cursor} eventsByDate={eventsByDate} onEvent={openEvent} />}
    </div>
  )
}

function Chip({ e, onEvent }: { e: CalEvent; onEvent: (e: CalEvent) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEvent(e)}
      title={`${e.start ?? ''}${e.end ? `〜${e.end}` : ''} ${e.title}`}
      className={`block w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] leading-tight hover:opacity-80 transition-opacity ${statusStyle(e.status)}`}
    >
      {e.start ? <span className="font-medium">{e.start} </span> : null}{e.title}
    </button>
  )
}

function MonthView({ cursor, eventsByDate, todayKey, onEvent, onPickDay }: {
  cursor: Date; eventsByDate: Record<string, CalEvent[]>; todayKey: string; onEvent: (e: CalEvent) => void; onPickDay: (d: Date) => void
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeekMonday(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const month = cursor.getMonth()
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-7">
          {WEEKDAY.map((w, i) => (
            <div key={w} className={`text-center text-[11px] font-medium py-1 ${i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-600' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-[var(--md-sys-color-outline-variant)] rounded-lg overflow-hidden border border-[var(--md-sys-color-outline-variant)]">
          {cells.map((d) => {
            const key = ymd(d)
            const inMonth = d.getMonth() === month
            const dayEvents = eventsByDate[key] ?? []
            const isToday = key === todayKey
            return (
              <div key={key} className={`min-h-[92px] p-1 ${inMonth ? 'bg-[var(--md-sys-color-surface)]' : 'bg-[var(--md-sys-color-surface-container-low)]'}`}>
                <button type="button" onClick={() => onPickDay(d)} className={`text-[11px] mb-0.5 w-6 h-6 rounded-full inline-flex items-center justify-center ${isToday ? 'bg-[var(--portal-primary)] text-white font-bold' : inMonth ? 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                  {d.getDate()}
                </button>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(e => <Chip key={e.id} e={e} onEvent={onEvent} />)}
                  {dayEvents.length > 3 && (
                    <button type="button" onClick={() => onPickDay(d)} className="block w-full text-left text-[10px] text-[var(--md-sys-color-on-surface-variant)] hover:underline px-1.5">＋{dayEvents.length - 3}件</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekView({ cursor, eventsByDate, todayKey, onEvent, onPickDay }: {
  cursor: Date; eventsByDate: Record<string, CalEvent[]>; todayKey: string; onEvent: (e: CalEvent) => void; onPickDay: (d: Date) => void
}) {
  const start = startOfWeekMonday(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-px bg-[var(--md-sys-color-outline-variant)] rounded-lg overflow-hidden border border-[var(--md-sys-color-outline-variant)] min-w-[640px]">
        {days.map((d, i) => {
          const key = ymd(d)
          const isToday = key === todayKey
          const dayEvents = eventsByDate[key] ?? []
          return (
            <div key={key} className="bg-[var(--md-sys-color-surface)] min-h-[220px] p-1.5">
              <button type="button" onClick={() => onPickDay(d)} className="w-full text-center mb-1.5">
                <div className={`text-[10px] ${i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-600' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>{WEEKDAY[i]}</div>
                <div className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? 'bg-[var(--portal-primary)] text-white' : 'text-[var(--md-sys-color-on-surface)]'}`}>{d.getDate()}</div>
              </button>
              <div className="space-y-1">
                {dayEvents.length === 0 ? (
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] text-center">—</p>
                ) : dayEvents.map(e => <Chip key={e.id} e={e} onEvent={onEvent} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({ cursor, eventsByDate, onEvent }: {
  cursor: Date; eventsByDate: Record<string, CalEvent[]>; onEvent: (e: CalEvent) => void
}) {
  const key = ymd(cursor)
  const dayEvents = eventsByDate[key] ?? []
  return (
    <div className="rounded-lg border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
      {dayEvents.length === 0 ? (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-8">この日の予定はありません</p>
      ) : dayEvents.map(e => (
        <button
          key={e.id}
          type="button"
          onClick={() => onEvent(e)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
        >
          <div className="w-20 flex-shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {e.start ? `${e.start}${e.end ? `〜${e.end}` : ''}` : '時間未定'}
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusStyle(e.status)}`}>{e.kind === 'revisit' ? '引取' : '訪問'}</span>
          <span className="flex-1 text-sm text-[var(--md-sys-color-on-surface)] truncate">{e.title}</span>
          <span className="text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">›</span>
        </button>
      ))}
    </div>
  )
}
