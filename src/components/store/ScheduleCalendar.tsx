'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusinessHours } from '@/hooks/useBusinessHours'
import { useStoreScope } from '@/components/store/StoreScopeContext'

// 店舗スケジュールのカレンダービュー（月間 / 週間 / 日間）。
// 週間・日間は時間目盛り付きのタイムライン表示（開始時刻で配置・所要時間で高さ）。
// 予定をクリックすると紐づく案件詳細（/store/deals/{dealId}）へ遷移する。
// データは日付範囲フィルタ付きの /api/visit-schedules から表示範囲ぶんを取得（店舗セッションは自店舗に自動絞り込み）。

type RawSchedule = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  note: string | null
  revisitDate: string | null
  revisitStart: string | null
  revisitEnd: string | null
  revisitNote: string | null
  user?: { name: string; address?: string | null; phone?: string | null } | null
  store?: { id: string; name: string } | null
  deal?: { id: string } | null
}

type CalEvent = {
  id: string
  dateKey: string       // yyyy-MM-dd
  start: string | null  // HH:MM
  end: string | null
  name: string
  address: string | null
  note: string | null
  status: string
  dealId: string | null
  kind: 'visit' | 'revisit'
  storeName: string | null
}

type View = 'month' | 'week' | 'day'

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function addDays(d: Date, n: number) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function startOfWeekMonday(d: Date) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(r, -((r.getDay() + 6) % 7)) }
function toMin(t?: string | null): number | null { if (!t) return null; const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null }
function hourFromTime(t?: string | null): number | null { const m = toMin(t); return m === null ? null : Math.floor(m / 60) }

const WEEKDAY = ['月', '火', '水', '木', '金', '土', '日']
const STATUS_LABEL: Record<string, string> = {
  scheduled: '予定', pending: '未対応', completed: '対応完了', rescheduled: 'リスケ', absent: '不在', cancelled: 'キャンセル', revisit: '後日引取',
}

// ステータス別の色（チップ・ブロック）
function statusStyle(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-900 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700'
    case 'scheduled': return 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700'
    case 'rescheduled': return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700'
    case 'absent': return 'bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600'
    case 'revisit': return 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700'
    case 'pending': return 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700'
    default: return 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]'
  }
}

export default function ScheduleCalendar() {
  const router = useRouter()
  const biz = useBusinessHours()
  const scope = useStoreScope()
  const [view, setView] = useState<View>('week')
  const [cursor, setCursor] = useState<Date>(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) })
  const [schedules, setSchedules] = useState<RawSchedule[]>([])
  const [loading, setLoading] = useState(false)
  // クリックした予定の簡易詳細ポップオーバー（Googleカレンダー風）
  const [popover, setPopover] = useState<{ event: CalEvent; x: number; y: number } | null>(null)

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor }
    if (view === 'week') { const s = startOfWeekMonday(cursor); return { from: s, to: addDays(s, 6) } }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeekMonday(first)
    return { from: gridStart, to: addDays(gridStart, 41) }
  }, [view, cursor])

  const fetchRange = useCallback(async () => {
    setLoading(true)
    try {
      const scopeQs = scope.scopeQuery ? `&${scope.scopeQuery}` : ''
      const res = await fetch(`/api/visit-schedules?from=${ymd(range.from)}T00:00:00&to=${ymd(range.to)}T23:59:59&limit=200${scopeQs}`)
      if (res.ok) { const data = await res.json(); setSchedules(data.schedules ?? []) }
    } catch { /* ignore */ }
    setLoading(false)
  }, [range.from, range.to, scope.scopeQuery])

  useEffect(() => { fetchRange() }, [fetchRange])

  const events = useMemo(() => {
    const list: CalEvent[] = []
    for (const s of schedules) {
      const name = s.user?.name ?? '予定'
      const address = s.user?.address ?? null
      const storeName = scope.isMulti ? (s.store?.name ?? null) : null
      if (s.status !== 'cancelled') {
        list.push({ id: s.id, dateKey: ymd(new Date(s.visitDate)), start: s.startTime, end: s.endTime, name, address, note: s.note, status: s.status, dealId: s.deal?.id ?? null, kind: 'visit', storeName })
      }
      if (s.revisitDate) {
        list.push({ id: `${s.id}-rev`, dateKey: ymd(new Date(s.revisitDate)), start: s.revisitStart, end: s.revisitEnd, name, address, note: s.revisitNote, status: 'revisit', dealId: s.deal?.id ?? null, kind: 'revisit', storeName })
      }
    }
    return list
  }, [schedules, scope.isMulti])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events) (map[e.dateKey] ??= []).push(e)
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'))
    return map
  }, [events])

  // 予定クリック → 直接遷移せず簡易詳細ポップオーバーを開く
  const handleEventClick = (e: CalEvent, ev: React.MouseEvent) => {
    setPopover({ event: e, x: ev.clientX, y: ev.clientY })
  }
  const goToDeal = (e: CalEvent) => {
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

  const bizStartH = hourFromTime(biz?.start) ?? 8
  const bizEndH = (() => { const h = hourFromTime(biz?.end); return h === null ? 20 : (toMin(biz?.end)! % 60 > 0 ? h + 1 : h) })()
  const todayKey = ymd(new Date())

  const weekDays = useMemo(() => { const s = startOfWeekMonday(cursor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)) }, [cursor])

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
            <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1 text-xs font-medium transition-colors ${view === v ? 'bg-[var(--portal-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'}`}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'month' && <MonthView cursor={cursor} eventsByDate={eventsByDate} todayKey={todayKey} onEvent={handleEventClick} onPickDay={(d) => { setCursor(d); setView('day') }} />}
      {view === 'week' && <TimeGrid days={weekDays} eventsByDate={eventsByDate} todayKey={todayKey} bizStartH={bizStartH} bizEndH={bizEndH} hourHeight={48} onEvent={handleEventClick} onPickDay={(d) => { setCursor(d); setView('day') }} />}
      {view === 'day' && <TimeGrid days={[cursor]} eventsByDate={eventsByDate} todayKey={todayKey} bizStartH={bizStartH} bizEndH={bizEndH} hourHeight={60} onEvent={handleEventClick} single />}

      {/* 予定の簡易詳細ポップオーバー */}
      {popover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopover(null)} />
          <div
            className="fixed z-50 w-[280px] max-w-[calc(100vw-16px)] rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-xl p-4"
            style={{
              left: typeof window !== 'undefined' ? Math.min(popover.x, window.innerWidth - 296) : popover.x,
              top: typeof window !== 'undefined' ? Math.min(popover.y, window.innerHeight - 240) : popover.y,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusStyle(popover.event.status)}`}>
                {popover.event.kind === 'revisit' ? '引取' : '訪問'}・{STATUS_LABEL[popover.event.status] ?? popover.event.status}
              </span>
              <button type="button" onClick={() => setPopover(null)} className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] leading-none text-lg" aria-label="閉じる">×</button>
            </div>
            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              {popover.event.name} 様
              {popover.event.storeName && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] font-normal align-middle">{popover.event.storeName}</span>
              )}
            </p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              {popover.event.start ? `${popover.event.start}${popover.event.end ? `〜${popover.event.end}` : ''}` : '時間未定'}
            </p>
            {popover.event.address && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 break-words">{popover.event.address}</p>}
            {popover.event.note && <p className="text-xs text-[var(--md-sys-color-on-surface-faint)] mt-1 break-words whitespace-pre-wrap">{popover.event.note}</p>}
            <button
              type="button"
              onClick={() => { const e = popover.event; setPopover(null); goToDeal(e) }}
              className="mt-3 w-full text-center text-sm font-medium px-3 py-2 rounded-lg bg-[var(--portal-primary)] text-white hover:opacity-90"
            >
              案件ページへ
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ───────────── 月間 ───────────── */
function MonthChip({ e, onEvent }: { e: CalEvent; onEvent: (e: CalEvent, ev: React.MouseEvent) => void }) {
  return (
    <button type="button" onClick={(ev) => onEvent(e, ev)} title={`${e.start ?? ''}${e.end ? `〜${e.end}` : ''} ${e.name}`} className={`block w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] leading-tight border hover:opacity-80 ${statusStyle(e.status)}`}>
      {e.start ? <span className="font-medium">{e.start} </span> : null}{e.name}
    </button>
  )
}

function MonthView({ cursor, eventsByDate, todayKey, onEvent, onPickDay }: {
  cursor: Date; eventsByDate: Record<string, CalEvent[]>; todayKey: string; onEvent: (e: CalEvent, ev: React.MouseEvent) => void; onPickDay: (d: Date) => void
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
                <button type="button" onClick={() => onPickDay(d)} className={`text-[11px] mb-0.5 w-6 h-6 rounded-full inline-flex items-center justify-center ${isToday ? 'bg-[var(--portal-primary)] text-white font-bold' : inMonth ? 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>{d.getDate()}</button>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(e => <MonthChip key={e.id} e={e} onEvent={onEvent} />)}
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

/* ───────────── 時間軸グリッド（週間・日間共通） ───────────── */
// クラスタ単位で重なりをレーン分割し、重なる予定を横並びに配置する
function layoutDay(events: CalEvent[]): Record<string, { left: number; width: number }> {
  const res: Record<string, { left: number; width: number }> = {}
  const timed = events.filter(e => toMin(e.start) !== null).sort((a, b) => (toMin(a.start)! - toMin(b.start)!) || (endMinOf(a) - endMinOf(b)))
  let i = 0
  while (i < timed.length) {
    let clusterEnd = endMinOf(timed[i])
    const cluster = [timed[i]]
    let j = i + 1
    while (j < timed.length && toMin(timed[j].start)! < clusterEnd) { clusterEnd = Math.max(clusterEnd, endMinOf(timed[j])); cluster.push(timed[j]); j++ }
    const laneEnds: number[] = []
    const laneOf: Record<string, number> = {}
    for (const e of cluster) {
      let placed = false
      for (let l = 0; l < laneEnds.length; l++) { if (laneEnds[l] <= toMin(e.start)!) { laneEnds[l] = endMinOf(e); laneOf[e.id] = l; placed = true; break } }
      if (!placed) { laneOf[e.id] = laneEnds.length; laneEnds.push(endMinOf(e)) }
    }
    const lanes = laneEnds.length || 1
    for (const e of cluster) res[e.id] = { left: laneOf[e.id] / lanes, width: 1 / lanes }
    i = j
  }
  return res
}
function endMinOf(e: CalEvent): number { const s = toMin(e.start)!; const en = toMin(e.end); return en !== null && en > s ? en : s + 60 }

function TimeGrid({ days, eventsByDate, todayKey, bizStartH, bizEndH, hourHeight, onEvent, onPickDay, single }: {
  days: Date[]
  eventsByDate: Record<string, CalEvent[]>
  todayKey: string
  bizStartH: number
  bizEndH: number
  hourHeight: number
  onEvent: (e: CalEvent, ev: React.MouseEvent) => void
  onPickDay?: (d: Date) => void
  single?: boolean
}) {
  // 表示時間帯 = 営業時間を基準に、範囲外の予定があれば拡張
  let startH = bizStartH
  let endH = bizEndH
  for (const d of days) {
    for (const e of (eventsByDate[ymd(d)] ?? [])) {
      const s = hourFromTime(e.start); if (s !== null) startH = Math.min(startH, s)
      const em = toMin(e.end); if (em !== null) endH = Math.max(endH, Math.ceil(em / 60))
    }
  }
  startH = Math.max(0, Math.min(startH, 23))
  endH = Math.min(24, Math.max(endH, startH + 1))
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i)
  const bodyHeight = (endH - startH) * hourHeight

  // 時間未定の予定があるか
  const hasUntimed = days.some(d => (eventsByDate[ymd(d)] ?? []).some(e => toMin(e.start) === null))

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: single ? 320 : 640 }}>
        {/* 日付ヘッダー */}
        <div className="grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => {
            const isToday = ymd(d) === todayKey
            const wd = (d.getDay() + 6) % 7
            const header = (
              <div className={`text-center py-1.5 ${wd === 5 ? 'text-blue-600' : wd === 6 ? 'text-red-600' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                <div className="text-[10px]">{WEEKDAY[wd]}</div>
                <div className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? 'bg-[var(--portal-primary)] text-white' : 'text-[var(--md-sys-color-on-surface)]'}`}>{d.getDate()}</div>
              </div>
            )
            return onPickDay
              ? <button key={ymd(d)} type="button" onClick={() => onPickDay(d)} className="hover:bg-[var(--md-sys-color-surface-container-high)] rounded-t-md">{header}</button>
              : <div key={ymd(d)}>{header}</div>
          })}
        </div>

        {/* 時間未定ストリップ */}
        {hasUntimed && (
          <div className="grid border-y border-[var(--md-sys-color-outline-variant)]" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
            <div className="text-[9px] text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-end pr-1">未定</div>
            {days.map((d) => (
              <div key={ymd(d)} className="p-0.5 space-y-0.5 border-l border-[var(--md-sys-color-outline-variant)]">
                {(eventsByDate[ymd(d)] ?? []).filter(e => toMin(e.start) === null).map(e => (
                  <button key={e.id} type="button" onClick={(ev) => onEvent(e, ev)} className={`block w-full text-left truncate rounded px-1 py-0.5 text-[10px] border ${statusStyle(e.status)}`}>{e.kind === 'revisit' ? '引取: ' : ''}{e.name}</button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* タイムライン本体 */}
        <div className="grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
          {/* 時刻軸 */}
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((h, idx) => (
              <div key={h} className="absolute right-1 text-[10px] text-[var(--md-sys-color-on-surface-variant)]" style={{ top: idx * hourHeight - 6 }}>{pad(h)}:00</div>
            ))}
          </div>
          {/* 日ごとの列 */}
          {days.map((d) => {
            const key = ymd(d)
            const dayEvents = (eventsByDate[key] ?? []).filter(e => toMin(e.start) !== null)
            const lay = layoutDay(dayEvents)
            return (
              <div key={key} className="relative border-l border-[var(--md-sys-color-outline-variant)]" style={{ height: bodyHeight }}>
                {/* 時間の横罫線 */}
                {hours.map((h, idx) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-[var(--md-sys-color-outline-variant)]/60" style={{ top: idx * hourHeight }} />
                ))}
                {/* 予定ブロック */}
                {dayEvents.map((e) => {
                  const s = toMin(e.start)!
                  const en = endMinOf(e)
                  const top = ((s - startH * 60) / 60) * hourHeight
                  const height = Math.max(20, ((en - s) / 60) * hourHeight - 2)
                  const pos = lay[e.id] ?? { left: 0, width: 1 }
                  const tall = height >= 46
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => onEvent(e, ev)}
                      title={`${e.start ?? ''}${e.end ? `〜${e.end}` : ''} ${e.name}${e.address ? ` / ${e.address}` : ''}${e.note ? ` / ${e.note}` : ''}`}
                      className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left leading-tight hover:opacity-90 hover:z-10 shadow-sm ${statusStyle(e.status)}`}
                      style={{ top, height, left: `calc(${pos.left * 100}% + 2px)`, width: `calc(${pos.width * 100}% - 4px)` }}
                    >
                      <div className="text-[10px] font-semibold truncate">
                        {e.start}{e.end ? `〜${e.end}` : ''}{e.kind === 'revisit' ? '（引取）' : ''}
                      </div>
                      <div className="text-[11px] font-medium truncate">{e.name} 様</div>
                      {tall && (
                        <div className="text-[9px] opacity-80 truncate">{STATUS_LABEL[e.status] ?? e.status}{e.address ? ` ・ ${e.address}` : ''}</div>
                      )}
                      {tall && e.note && <div className="text-[9px] opacity-70 truncate">{e.note}</div>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
