import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getDecryptedAccessToken,
  getFollowersInsight,
  getMessageDeliveryInsight,
  getDemographicInsight,
  getQuotaConsumption,
  getMessageQuota,
} from '@/lib/line'

// Vercel タイムアウト延長（最大60秒、730日 × 2API = 1460回のリクエストを30並列でバッチ処理）
export const maxDuration = 60

// GET /api/admin/line/channels/[id]/insights — チャネル分析データ
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channel = await prisma.lineChannel.findUnique({ where: { id } })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const token = getDecryptedAccessToken(channel)

  // 集計対象日：2日前（前日のデータは集計中の場合があるため）
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 2)
  const weekAgo = new Date(yesterday)
  weekAgo.setDate(weekAgo.getDate() - 7)

  // 並列で各 Insight を取得（個別エラーは無視して null を返す）
  const safeCall = async <T>(fn: () => Promise<T>): Promise<T | { error: string } | null> => {
    try { return await fn() } catch (e: any) {
      return { error: e?.message ?? 'unknown' }
    }
  }

  const [
    followersToday,
    followersWeekAgo,
    messageDelivery,
    demographic,
    quotaConsumption,
    quota,
  ] = await Promise.all([
    safeCall(() => getFollowersInsight(token, yesterday)),
    safeCall(() => getFollowersInsight(token, weekAgo)),
    safeCall(() => getMessageDeliveryInsight(token, yesterday)),
    safeCall(() => getDemographicInsight(token)),
    safeCall(() => getQuotaConsumption(token)),
    safeCall(() => getMessageQuota(token)),
  ])

  // 過去30日間のメッセージ送信通数（種別ごとに合計）
  const messageStats = {
    broadcast: 0,
    targeting: 0,
    autoResponse: 0,
    welcomeResponse: 0,
    chat: 0,
    apiBroadcast: 0,
    apiPush: 0,
    apiMulticast: 0,
    apiNarrowcast: 0,
    apiReply: 0,
  }
  const last30Dates: Date[] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(yesterday)
    d.setDate(d.getDate() - i)
    last30Dates.push(d)
  }
  const deliveryResults = await Promise.all(
    last30Dates.map(d => safeCall(() => getMessageDeliveryInsight(token, d)))
  )
  for (const r of deliveryResults) {
    const m = r as any
    if (m?.status !== 'ready') continue
    for (const k of Object.keys(messageStats) as (keyof typeof messageStats)[]) {
      messageStats[k] += m[k] ?? 0
    }
  }
  const messageStatsTotal = Object.values(messageStats).reduce((a, b) => a + b, 0)

  // 過去最大730日（約2年）分の友だち推移
  // LINE Insights API のレート制限を考慮し、followers のみ取得（delivery は重いので省略）
  const MAX_DAYS = 730
  const dateList: Date[] = []
  for (let i = MAX_DAYS - 1; i >= 0; i--) {
    const d = new Date(yesterday)
    d.setDate(d.getDate() - i)
    dateList.push(d)
  }

  // 8件ずつバッチ並列＋200ms遅延でレート制限を回避
  const BATCH = 8
  const DELAY_MS = 200
  type DayPoint = { date: string; followers?: number; targetedReaches?: number; blocks?: number }
  const histResults: DayPoint[] = []
  for (let i = 0; i < dateList.length; i += BATCH) {
    const slice = dateList.slice(i, i + BATCH)
    const batch = await Promise.all(
      slice.map(async (d) => {
        const f = await safeCall(() => getFollowersInsight(token, d))
        const fe = f as any
        return {
          date: d.toISOString().slice(0, 10),
          followers: fe?.status === 'ready' ? fe.followers : undefined,
          targetedReaches: fe?.status === 'ready' ? fe.targetedReaches : undefined,
          blocks: fe?.status === 'ready' ? fe.blocks : undefined,
        }
      })
    )
    histResults.push(...batch)
    if (i + BATCH < dateList.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  // データがある最初の日以降のみ返す（チャネル作成前の空データを除外）
  const firstReadyIdx = histResults.findIndex(d => d.followers !== undefined)
  const days = firstReadyIdx >= 0 ? histResults.slice(firstReadyIdx) : []

  // DB 内の受信メッセージ通数（過去7日間）も集計
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const inboundCount = await prisma.lineMessage.count({
    where: { lineChannelId: id, direction: 'inbound', sentAt: { gte: sevenDaysAgo } },
  })
  const outboundCount = await prisma.lineMessage.count({
    where: { lineChannelId: id, direction: 'outbound', sentAt: { gte: sevenDaysAgo } },
  })

  return NextResponse.json({
    aggregateDate: yesterday.toISOString().slice(0, 10),
    followersToday,
    followersWeekAgo,
    messageDelivery,
    demographic,
    quotaConsumption,
    quota,
    portal: {
      // 当ポータル経由の集計
      inboundLast7Days: inboundCount,
      outboundLast7Days: outboundCount,
    },
    messageStats: {                  // 過去30日のLINE側送信通数（種別ごと合計）
      ...messageStats,
      total: messageStatsTotal,
    },
    history: days, // 友だち推移（最大2年分）
  })
}
