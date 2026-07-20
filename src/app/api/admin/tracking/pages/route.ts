import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import type { PageStatRow } from '@/lib/tracking-types'
import { resolveTrackingParams, dateWhere, PV_FETCH_CAP } from '../_lib/common'

export const dynamic = 'force-dynamic'

// ページ分析: PV / 平均滞在 / 平均スクロール / 離脱率 / CV寄与率
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range } = resolveTrackingParams(request)

  const pvs = await prisma.trackingPageView.findMany({
    where: { occurredAt: dateWhere(range) },
    select: { sessionId: true, path: true, title: true, occurredAt: true, durationSec: true, scrollDepth: true },
    orderBy: { occurredAt: 'asc' },
    take: PV_FETCH_CAP,
  })
  if (pvs.length === 0) return NextResponse.json({ pages: [] })

  const sessionIds = [...new Set(pvs.map(p => p.sessionId))]
  const cvSessions = await prisma.trackingSession.findMany({
    where: { id: { in: sessionIds.slice(0, 20000) }, hasConversion: true },
    select: { id: true },
  })
  const cvSessionSet = new Set(cvSessions.map(s => s.id))

  type Agg = {
    title: string | null
    pv: number
    durations: number[]
    scrolls: number[]
    exits: number
    sessions: Set<string>
    cvSessions: Set<string>
  }
  const byPath = new Map<string, Agg>()
  const lastPvBySession = new Map<string, string>() // sessionId -> path

  for (const pv of pvs) {
    let agg = byPath.get(pv.path)
    if (!agg) {
      agg = { title: pv.title, pv: 0, durations: [], scrolls: [], exits: 0, sessions: new Set(), cvSessions: new Set() }
      byPath.set(pv.path, agg)
    }
    agg.pv++
    if (!agg.title && pv.title) agg.title = pv.title
    if (pv.durationSec !== null) agg.durations.push(pv.durationSec)
    if (pv.scrollDepth !== null) agg.scrolls.push(pv.scrollDepth)
    agg.sessions.add(pv.sessionId)
    if (cvSessionSet.has(pv.sessionId)) agg.cvSessions.add(pv.sessionId)
    lastPvBySession.set(pv.sessionId, pv.path)
  }
  for (const [, path] of lastPvBySession) {
    const agg = byPath.get(path)
    if (agg) agg.exits++
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const pages: PageStatRow[] = [...byPath.entries()]
    .map(([path, agg]) => ({
      path,
      title: agg.title,
      pv: agg.pv,
      avgDuration: avg(agg.durations),
      avgScroll: avg(agg.scrolls),
      exitRate: agg.sessions.size > 0 ? agg.exits / agg.sessions.size : 0,
      sessions: agg.sessions.size,
      cvContribution: agg.sessions.size > 0 ? agg.cvSessions.size / agg.sessions.size : 0,
    }))
    .sort((a, b) => b.pv - a.pv)
    .slice(0, 100)

  return NextResponse.json({ pages })
}
