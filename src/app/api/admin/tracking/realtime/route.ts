import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { CHANNEL_LABEL } from '@/lib/tracking'
import { referrerDomain } from '../_lib/common'

export const dynamic = 'force-dynamic'

// リアルタイム: 直近30分のアクティブ訪問者・閲覧中ページ・直近CV
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date(Date.now() - 30 * 60 * 1000)
  const [activeSessions, recentEvents] = await Promise.all([
    prisma.trackingSession.findMany({
      where: { lastActivityAt: { gte: since } },
      select: {
        id: true, visitorId: true, channel: true, referrer: true,
        pageViews: { orderBy: { occurredAt: 'desc' }, take: 1, select: { path: true, title: true } },
      },
      take: 500,
    }),
    prisma.trackingEvent.findMany({
      where: { isConversion: true },
      orderBy: { occurredAt: 'desc' },
      take: 8,
      select: { visitorId: true, type: true, occurredAt: true, storeId: true, buttonId: true, sessionId: true },
    }),
  ])

  const activeVisitors = new Set(activeSessions.map(s => s.visitorId)).size
  const pageMap = new Map<string, { path: string; title: string | null; count: number }>()
  for (const s of activeSessions) {
    const pv = s.pageViews[0]
    if (!pv) continue
    const key = pv.path
    const cur = pageMap.get(key) ?? { path: pv.path, title: pv.title, count: 0 }
    cur.count++
    pageMap.set(key, cur)
  }

  const storeIds = [...new Set(recentEvents.map(e => e.storeId).filter((v): v is string => !!v))]
  const buttonIds = [...new Set(recentEvents.map(e => e.buttonId).filter((v): v is string => !!v))]
  const sessionIds = [...new Set(recentEvents.map(e => e.sessionId).filter((v): v is string => !!v))]
  const [stores, buttons, sessions] = await Promise.all([
    storeIds.length ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    buttonIds.length ? prisma.trackingButton.findMany({ where: { id: { in: buttonIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sessionIds.length ? prisma.trackingSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, channel: true, referrer: true } }) : Promise.resolve([]),
  ])
  const storeMap = new Map(stores.map(s => [s.id, s.name]))
  const buttonMap = new Map(buttons.map(b => [b.id, b.name]))
  const sessMap = new Map(sessions.map(s => [s.id, s]))

  return NextResponse.json({
    activeVisitors,
    activePages: [...pageMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    recentConversions: recentEvents.map(e => {
      const sess = e.sessionId ? sessMap.get(e.sessionId) : null
      return {
        visitorId: e.visitorId,
        type: e.type === 'inquiry_submit' ? '問い合わせ' : e.type === 'form_submit' ? 'フォーム' : 'ボタン',
        occurredAt: e.occurredAt.toISOString(),
        storeName: e.storeId ? (storeMap.get(e.storeId) ?? null) : null,
        buttonName: e.buttonId ? (buttonMap.get(e.buttonId) ?? null) : null,
        channel: sess?.channel ? (CHANNEL_LABEL[sess.channel] ?? sess.channel) : null,
        referrer: sess ? referrerDomain(sess.referrer) : null,
      }
    }),
  })
}
