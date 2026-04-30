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
  })
}
