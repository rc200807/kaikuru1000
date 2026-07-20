import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import type { ParamStatRow } from '@/lib/tracking-types'
import { resolveTrackingParams, fetchSessions, parseJsonSafe, urlToPath } from '../_lib/common'

export const dynamic = 'force-dynamic'

// パラメータ分析: 自動検出された全パラメータを key=value 単位で集計（ラスト/ファーストタッチ両軸）
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range } = resolveTrackingParams(request)
  const { sessions } = await fetchSessions(range)

  type Agg = { sessions: number; cvSessions: number; firstTouchCv: number; landings: Map<string, number> }
  const byParam = new Map<string, Agg>()
  const ensure = (key: string) => {
    let a = byParam.get(key)
    if (!a) { a = { sessions: 0, cvSessions: 0, firstTouchCv: 0, landings: new Map() }; byParam.set(key, a) }
    return a
  }

  // ラストタッチ: 各セッションの entryParams で集計
  for (const s of sessions) {
    const params = parseJsonSafe<Record<string, string>>(s.entryParams, {})
    const landing = urlToPath(s.entryUrl) ?? ''
    for (const [k, v] of Object.entries(params)) {
      if (!v) continue
      const agg = ensure(`${k}=${v}`)
      agg.sessions++
      if (s.hasConversion) agg.cvSessions++
      agg.landings.set(landing, (agg.landings.get(landing) ?? 0) + 1)
    }
  }

  // ファーストタッチ: 期間内にCVした訪問者の「初回セッション」の entryParams で集計
  const cvVisitorIds = [...new Set(sessions.filter(s => s.hasConversion).map(s => s.visitorId))]
  if (cvVisitorIds.length > 0) {
    const firstSessions = await prisma.trackingSession.findMany({
      where: { visitorId: { in: cvVisitorIds.slice(0, 5000) } },
      select: { visitorId: true, entryParams: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
    })
    const seen = new Set<string>()
    for (const s of firstSessions) {
      if (seen.has(s.visitorId)) continue
      seen.add(s.visitorId)
      const params = parseJsonSafe<Record<string, string>>(s.entryParams, {})
      for (const [k, v] of Object.entries(params)) {
        if (!v) continue
        ensure(`${k}=${v}`).firstTouchCv++
      }
    }
  }

  const rows: ParamStatRow[] = [...byParam.entries()]
    .map(([kv, agg]) => {
      const eq = kv.indexOf('=')
      const topLanding = [...agg.landings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      return {
        key: kv.slice(0, eq),
        value: kv.slice(eq + 1),
        sessions: agg.sessions,
        cvSessions: agg.cvSessions,
        cvr: agg.sessions > 0 ? agg.cvSessions / agg.sessions : 0,
        firstTouchCv: agg.firstTouchCv,
        topLanding,
      }
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 100)

  return NextResponse.json({ params: rows })
}
