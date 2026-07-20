import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseUserAgent, isBotUserAgent, classifyChannel, resolveGeo } from '@/lib/tracking'

export const dynamic = 'force-dynamic'

/**
 * 外部サイトの計測タグ(t.js)からのビーコン受信API（未認証・CORS許可）。
 * 匿名の visitorKey / siteKey のみを扱い、Cookieクレデンシャルは使わないため
 * Access-Control-Allow-Origin: * で受ける。不正なキーは 204 で黙って捨てる。
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const MAX_PV_PER_SESSION = 200

// 簡易メモリレート制限（forms/public/submit と同方式）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count++
  return entry.count > 120 // 1分120リクエスト/IP
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

type CollectPayload = {
  siteKey?: string
  visitorKey?: string
  type?: 'pageview' | 'click' | 'pageleave'
  pvKey?: string
  url?: string
  path?: string
  title?: string
  referrer?: string
  params?: Record<string, string>
  screen?: string
  lang?: string
  buttonKey?: string
  durationSec?: number
  scrollDepth?: number
}

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || !v) return null
  return v.slice(0, max)
}

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
    if (ip && isRateLimited(ip)) return noContent()

    const userAgent = request.headers.get('user-agent')
    if (isBotUserAgent(userAgent)) return noContent()

    const raw = await request.text()
    if (raw.length > 8192) return noContent()
    const body = JSON.parse(raw) as CollectPayload

    const siteKey = clip(body.siteKey, 32)
    const visitorKey = clip(body.visitorKey, 64)
    if (!siteKey || !visitorKey || !body.type) return noContent()

    // サイト検証（Origin照合）
    const site = await prisma.trackingSite.findUnique({ where: { siteKey } })
    if (!site || !site.isActive) return noContent()
    const allowedDomains: string[] = JSON.parse(site.domains || '[]')
    if (allowedDomains.length > 0) {
      const origin = request.headers.get('origin') ?? ''
      let originHost = ''
      try { originHost = new URL(origin).hostname } catch { /* sendBeaconでもoriginは付くが念のため */ }
      const ok = allowedDomains.some(d => originHost === d || originHost.endsWith(`.${d}`))
      if (!ok) return noContent()
    }

    // ─── 離脱ビーコン（滞在時間・スクロール深度の後追い更新） ───
    if (body.type === 'pageleave') {
      const pvKey = clip(body.pvKey, 64)
      if (!pvKey) return noContent()
      const durationSec = Number.isFinite(Number(body.durationSec)) ? Math.max(0, Math.min(3600, Math.round(Number(body.durationSec)))) : null
      const scrollDepth = Number.isFinite(Number(body.scrollDepth)) ? Math.max(0, Math.min(100, Math.round(Number(body.scrollDepth)))) : null
      await prisma.trackingPageView.updateMany({
        where: { pvKey },
        data: {
          ...(durationSec !== null ? { durationSec } : {}),
          ...(scrollDepth !== null ? { scrollDepth } : {}),
        },
      })
      return noContent()
    }

    // ─── 訪問者の解決 ───
    const now = new Date()
    let visitor = await prisma.trackingVisitor.findUnique({ where: { visitorKey } })
    const isNewVisitor = !visitor
    if (!visitor) {
      visitor = await prisma.trackingVisitor.create({
        data: {
          visitorKey,
          firstUrl: clip(body.url, 1000),
          firstReferrer: clip(body.referrer, 1000),
        },
      })
    }

    // ─── セッションの解決（30分無操作で新規） ───
    let session = await prisma.trackingSession.findFirst({
      where: { visitorId: visitor.id, lastActivityAt: { gte: new Date(now.getTime() - SESSION_TIMEOUT_MS) } },
      orderBy: { lastActivityAt: 'desc' },
    })
    if (!session) {
      const entryParams = typeof body.params === 'object' && body.params ? body.params : {}
      const geo = resolveGeo(request.headers)
      const uaInfo = parseUserAgent(userAgent)
      session = await prisma.trackingSession.create({
        data: {
          visitorId: visitor.id,
          siteId: site.id,
          entryUrl: clip(body.url, 1000) ?? '',
          entryTitle: clip(body.title, 200),
          referrer: clip(body.referrer, 1000),
          entryParams: JSON.stringify(entryParams).slice(0, 4000),
          userAgent: clip(userAgent, 500),
          ipAddress: ip,
          channel: classifyChannel(clip(body.referrer, 1000), entryParams),
          deviceType: uaInfo.deviceType,
          browser: uaInfo.browser,
          os: uaInfo.os,
          screenSize: clip(body.screen, 20),
          language: clip(body.lang, 20),
          country: geo.country,
          region: geo.region,
          city: geo.city,
          isFirstSession: isNewVisitor,
        },
      })
    } else {
      await prisma.trackingSession.update({ where: { id: session.id }, data: { lastActivityAt: now } })
    }
    await prisma.trackingVisitor.update({ where: { id: visitor.id }, data: { lastSeenAt: now } })

    // ─── ページビュー ───
    if (body.type === 'pageview') {
      const pvCount = await prisma.trackingPageView.count({ where: { sessionId: session.id } })
      if (pvCount >= MAX_PV_PER_SESSION) return noContent()
      await prisma.trackingPageView.create({
        data: {
          pvKey: clip(body.pvKey, 64),
          sessionId: session.id,
          url: clip(body.url, 1000) ?? '',
          path: clip(body.path, 300) ?? '',
          title: clip(body.title, 200),
          queryParams: JSON.stringify(typeof body.params === 'object' && body.params ? body.params : {}).slice(0, 4000),
        },
      })
      return noContent()
    }

    // ─── ボタンクリック ───
    if (body.type === 'click') {
      const buttonKey = clip(body.buttonKey, 64)
      if (!buttonKey) return noContent()
      const button = await prisma.trackingButton.findUnique({ where: { buttonKey } })
      if (!button) return noContent()
      await prisma.trackingEvent.create({
        data: {
          visitorId: visitor.id,
          sessionId: session.id,
          type: 'button_click',
          buttonId: button.id,
          url: clip(body.url, 1000),
          isConversion: button.isConversion,
        },
      })
      if (button.isConversion && !session.hasConversion) {
        await prisma.trackingSession.update({ where: { id: session.id }, data: { hasConversion: true } })
      }
      return noContent()
    }

    return noContent()
  } catch (err) {
    console.error('[track/collect] error (ignored):', err)
    return noContent()
  }
}
