import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import type { VisitorDetail, VisitorTimelineItem } from '@/lib/tracking-types'
import { parseJsonSafe } from '../../_lib/common'

export const dynamic = 'force-dynamic'

// 訪問者詳細: 環境情報 + セッション別タイムライン + アトリビューション要約
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const visitor = await prisma.trackingVisitor.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      sessions: {
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: {
          pageViews: { orderBy: { occurredAt: 'asc' }, take: 200 },
          events: { orderBy: { occurredAt: 'asc' }, take: 50 },
        },
      },
    },
  })
  if (!visitor) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // イベントの表示名解決
  const allEvents = visitor.sessions.flatMap(s => s.events)
  const buttonIds = [...new Set(allEvents.map(e => e.buttonId).filter((v): v is string => !!v))]
  const storeIds = [...new Set(allEvents.map(e => e.storeId).filter((v): v is string => !!v))]
  const [buttons, stores] = await Promise.all([
    buttonIds.length ? prisma.trackingButton.findMany({ where: { id: { in: buttonIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    storeIds.length ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ])
  const buttonMap = new Map(buttons.map(b => [b.id, b.name]))
  const storeMap = new Map(stores.map(s => [s.id, s.name]))

  // アトリビューション（時系列で最初のセッション / 最初のCV）
  const chronological = [...visitor.sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const firstSession = chronological[0] ?? null
  let sessionsToConversion: number | null = null
  let daysToConversion: number | null = null
  const firstCvEvent = allEvents
    .filter(e => e.isConversion)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
  if (firstCvEvent) {
    const idx = chronological.findIndex(s => s.id === firstCvEvent.sessionId)
    sessionsToConversion = idx >= 0 ? idx + 1 : chronological.length
    daysToConversion = Math.round(((firstCvEvent.occurredAt.getTime() - visitor.firstSeenAt.getTime()) / 86_400_000) * 10) / 10
  }

  const detail: VisitorDetail = {
    id: visitor.id,
    visitorKey: visitor.visitorKey,
    firstSeenAt: visitor.firstSeenAt.toISOString(),
    lastSeenAt: visitor.lastSeenAt.toISOString(),
    firstUrl: visitor.firstUrl,
    firstReferrer: visitor.firstReferrer,
    customer: visitor.user ? { id: visitor.user.id, name: visitor.user.name } : null,
    attribution: {
      firstChannel: firstSession?.channel ?? null,
      firstReferrer: firstSession?.referrer ?? visitor.firstReferrer,
      firstParams: parseJsonSafe<Record<string, string>>(firstSession?.entryParams, {}),
      sessionsToConversion,
      daysToConversion,
    },
    sessions: visitor.sessions.map(s => {
      const timeline: VisitorTimelineItem[] = [
        ...s.pageViews.map(pv => ({
          kind: 'pageview' as const,
          occurredAt: pv.occurredAt.toISOString(),
          title: pv.title,
          url: pv.url,
          durationSec: pv.durationSec,
          scrollDepth: pv.scrollDepth,
        })),
        ...s.events.map(e => ({
          kind: (e.type === 'button_click' ? 'button_click' : e.type === 'inquiry_submit' ? 'inquiry_submit' : 'form_submit') as VisitorTimelineItem['kind'],
          occurredAt: e.occurredAt.toISOString(),
          title: null,
          url: e.url,
          durationSec: null,
          scrollDepth: null,
          buttonName: e.buttonId ? (buttonMap.get(e.buttonId) ?? null) : null,
          storeName: e.storeId ? (storeMap.get(e.storeId) ?? null) : null,
        })),
      ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      return {
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        entryUrl: s.entryUrl,
        entryTitle: s.entryTitle,
        referrer: s.referrer,
        entryParams: parseJsonSafe<Record<string, string>>(s.entryParams, {}),
        channel: s.channel,
        deviceType: s.deviceType,
        browser: s.browser,
        os: s.os,
        screenSize: s.screenSize,
        language: s.language,
        ipAddress: s.ipAddress,
        country: s.country,
        region: s.region,
        city: s.city,
        userAgent: s.userAgent,
        hasConversion: s.hasConversion,
        timeline,
      }
    }),
  }
  return NextResponse.json(detail)
}
