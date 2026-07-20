import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { CHANNEL_LABEL } from '@/lib/tracking-labels'
import type {
  CustomerJourneyResult,
  CustomerJourneyVisitor,
  ConversionJourney,
  JourneyStep,
} from '@/lib/tracking-types'

export const dynamic = 'force-dynamic'

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function referrerDomain(referrer: string | null): string | null {
  if (!referrer) return null
  try { return new URL(referrer).hostname } catch { return null }
}

function urlToPath(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch { return url }
}

const CONVERSION_LABEL: Record<string, string> = {
  inquiry_submit: '問い合わせ送信',
  form_submit: 'フォーム送信',
  button_click: 'ボタンクリック',
}

// 顧客詳細の「問い合わせ経路」: この顧客がどこから来て、どのページを辿り、
// どのようにCV（問い合わせ/フォーム/CVボタン）に至ったかをセッション単位で返す。
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, phone: true } })
  if (!user) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  // この顧客に紐づく問い合わせ（userId 直結 + メール/電話一致）→ inquiryId 集合。
  // 計測時に visitor.userId が未設定でも inquiryId 経由で経路をたどれるようにする。
  const inquiries = await prisma.inquiry.findMany({
    where: {
      OR: [
        { userId: id },
        ...(user.email ? [{ email: user.email }] : []),
        ...(user.phone ? [{ phone: user.phone }] : []),
      ],
    },
    select: { id: true },
  })
  const inquiryIds = inquiries.map(i => i.id)

  // 顧客に紐づくCVイベントから訪問者を特定する
  const linkEvents = await prisma.trackingEvent.findMany({
    where: {
      OR: [
        { visitor: { userId: id } },
        ...(inquiryIds.length ? [{ inquiryId: { in: inquiryIds } }] : []),
      ],
    },
    select: { visitorId: true },
  })
  const visitorIds = [...new Set(linkEvents.map(e => e.visitorId))]
  if (visitorIds.length === 0) {
    return NextResponse.json({ visitors: [] } satisfies CustomerJourneyResult)
  }

  // 各訪問者のCV到達セッション（経路つき）を読み込む
  const visitors = await prisma.trackingVisitor.findMany({
    where: { id: { in: visitorIds } },
    include: {
      _count: { select: { sessions: true } },
      sessions: {
        where: { hasConversion: true },
        orderBy: { startedAt: 'desc' },
        take: 30,
        include: {
          pageViews: { orderBy: { occurredAt: 'asc' }, take: 100 },
          events: { where: { isConversion: true }, orderBy: { occurredAt: 'asc' }, take: 20 },
        },
      },
    },
  })

  // イベントの表示名解決（ボタン名・店舗名）
  const allEvents = visitors.flatMap(v => v.sessions.flatMap(s => s.events))
  const buttonIds = [...new Set(allEvents.map(e => e.buttonId).filter((v): v is string => !!v))]
  const storeIds = [...new Set(allEvents.map(e => e.storeId).filter((v): v is string => !!v))]
  const [buttons, stores] = await Promise.all([
    buttonIds.length
      ? prisma.trackingButton.findMany({ where: { id: { in: buttonIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    storeIds.length
      ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const buttonMap = new Map(buttons.map(b => [b.id, b.name]))
  const storeMap = new Map(stores.map(s => [s.id, s.name]))

  const result: CustomerJourneyVisitor[] = visitors.map(v => {
    const journeys: ConversionJourney[] = v.sessions.map(s => {
      // ページビュー + CVイベントを時系列にマージ
      type Node =
        | { t: 'pv'; occurredAt: Date; title: string | null; path: string; durationSec: number | null }
        | { t: 'ev'; occurredAt: Date; type: string; buttonId: string | null; storeId: string | null }
      const nodes: Node[] = [
        ...s.pageViews.map(pv => ({
          t: 'pv' as const, occurredAt: pv.occurredAt, title: pv.title, path: pv.path, durationSec: pv.durationSec,
        })),
        ...s.events.map(e => ({
          t: 'ev' as const, occurredAt: e.occurredAt, type: e.type, buttonId: e.buttonId, storeId: e.storeId,
        })),
      ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

      const steps: JourneyStep[] = []
      let seenLanding = false
      for (const n of nodes) {
        if (n.t === 'pv') {
          if (!seenLanding) {
            seenLanding = true
            steps.push({
              kind: 'landing',
              label: n.title || n.path,
              sub: [CHANNEL_LABEL[s.channel ?? ''] ?? s.channel, referrerDomain(s.referrer)].filter(Boolean).join(' / ') || null,
              occurredAt: n.occurredAt.toISOString(),
            })
          } else {
            steps.push({
              kind: 'page',
              label: n.title || n.path,
              sub: n.durationSec != null ? `滞在 ${n.durationSec}秒` : n.path,
              occurredAt: n.occurredAt.toISOString(),
            })
          }
        } else if (n.type === 'button_click') {
          steps.push({
            kind: 'button',
            label: n.buttonId ? (buttonMap.get(n.buttonId) ?? 'CVボタン') : 'CVボタン',
            sub: null,
            occurredAt: n.occurredAt.toISOString(),
          })
        } else {
          steps.push({
            kind: 'conversion',
            label: CONVERSION_LABEL[n.type] ?? '問い合わせ',
            sub: n.storeId ? (storeMap.get(n.storeId) ?? null) : null,
            occurredAt: n.occurredAt.toISOString(),
          })
        }
      }

      // このセッションの主CV（最後のCVイベント）から種別・店舗を決定
      const cvEvent = [...s.events].reverse()[0] ?? null
      const conversionType = cvEvent ? (CONVERSION_LABEL[cvEvent.type] ?? '問い合わせ') : '問い合わせ'
      const storeName = cvEvent?.storeId ? (storeMap.get(cvEvent.storeId) ?? null) : null

      return {
        sessionId: s.id,
        startedAt: s.startedAt.toISOString(),
        channel: s.channel,
        referrer: s.referrer,
        entryParams: parseJsonSafe<Record<string, string>>(s.entryParams, {}),
        conversionType,
        storeName,
        steps,
      }
    })

    const firstChannel = v.sessions.length ? v.sessions[v.sessions.length - 1].channel : null

    return {
      id: v.id,
      channel: firstChannel,
      firstReferrer: v.firstReferrer,
      sessionCount: v._count.sessions,
      conversionCount: journeys.length,
      journeys,
    }
  })

  // 経路のある訪問者を先頭に
  result.sort((a, b) => b.conversionCount - a.conversionCount)

  return NextResponse.json({ visitors: result } satisfies CustomerJourneyResult)
}
