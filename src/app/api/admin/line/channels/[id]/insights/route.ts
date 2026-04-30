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
  if (!sessionUser || sessionUser.role !== 'admin') {
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

  // 過去最大730日（約2年）分の友だち推移＆送信通数推移
  // LINE Insights API はチャネル作成日まで遡れるが、計算量を考え2年を上限とする
  const MAX_DAYS = 730
  const dateList: Date[] = []
  for (let i = MAX_DAYS - 1; i >= 0; i--) {
    const d = new Date(yesterday)
    d.setDate(d.getDate() - i)
    dateList.push(d)
  }

  // 30件ずつバッチ並列実行（LINE API レート制限を考慮）
  const BATCH = 30
  type DayPoint = { date: string; followers?: number; targetedReaches?: number; blocks?: number; delivery?: number }
  const histResults: DayPoint[] = []
  for (let i = 0; i < dateList.length; i += BATCH) {
    const slice = dateList.slice(i, i + BATCH)
    const batch = await Promise.all(
      slice.map(async (d) => {
        const [f, m] = await Promise.all([
          safeCall(() => getFollowersInsight(token, d)),
          safeCall(() => getMessageDeliveryInsight(token, d)),
        ])
        const fe = f as any
        const me = m as any
        const deliveryTotal = me?.status === 'ready'
          ? (me.broadcast ?? 0) + (me.targeting ?? 0) + (me.apiPush ?? 0) + (me.apiBroadcast ?? 0) + (me.apiMulticast ?? 0) + (me.apiNarrowcast ?? 0)
          : undefined
        return {
          date: d.toISOString().slice(0, 10),
          followers: fe?.status === 'ready' ? fe.followers : undefined,
          targetedReaches: fe?.status === 'ready' ? fe.targetedReaches : undefined,
          blocks: fe?.status === 'ready' ? fe.blocks : undefined,
          delivery: deliveryTotal,
        }
      })
    )
    histResults.push(...batch)
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
    history: days, // 過去30日推移
  })
}
