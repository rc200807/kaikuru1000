import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { jstDateKey } from '@/lib/datetime'

/**
 * 店舗ダッシュボードのハイライト（新着研修動画・新着お知らせ・直近の訪問）。
 * メインの集計（/api/store/dashboard）は admin と共用のため、こちらは店舗専用で分離。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string

  // JST の本日0時（直近の訪問の起点）
  const startOfToday = new Date(`${jstDateKey(new Date())}T00:00:00+09:00`)

  const [videosRaw, announcementsRaw, upcomingRaw, statuses] = await Promise.all([
    // 新着研修動画（公開・新しい順）
    prisma.trainingVideo.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        videoUrl: true,
        publishedAt: true,
        category: { select: { name: true } },
        views: { where: { storeId }, select: { id: true } },
      },
    }),
    // 新着お知らせ（公開・新しい順）
    prisma.announcement.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        category: true,
        priority: true,
        publishedAt: true,
        announcementCategory: { select: { name: true, color: true, icon: true } },
        reads: { where: { storeId }, select: { id: true } },
      },
    }),
    // 直近の訪問（本日以降の予定を近い順）
    prisma.visitSchedule.findMany({
      where: { storeId, status: { not: 'cancelled' }, visitDate: { gte: startOfToday } },
      orderBy: { visitDate: 'asc' },
      take: 5,
      select: {
        id: true, dealId: true, visitDate: true, startTime: true, status: true,
        user: { select: { name: true, address: true } },
      },
    }),
    prisma.visitStatus.findMany({ select: { key: true, label: true, color: true } }),
  ])

  // 予定が5件未満なら直近の過去訪問で補完
  let visitsRaw = upcomingRaw
  if (upcomingRaw.length < 5) {
    const past = await prisma.visitSchedule.findMany({
      where: { storeId, status: { not: 'cancelled' }, visitDate: { lt: startOfToday } },
      orderBy: { visitDate: 'desc' },
      take: 5 - upcomingRaw.length,
      select: {
        id: true, dealId: true, visitDate: true, startTime: true, status: true,
        user: { select: { name: true, address: true } },
      },
    })
    visitsRaw = [...upcomingRaw, ...past]
  }

  const statusMap = new Map(statuses.map(s => [s.key, s]))

  return NextResponse.json({
    videos: videosRaw.map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      videoUrl: v.videoUrl,
      categoryName: v.category.name,
      publishedAt: v.publishedAt,
      viewed: v.views.length > 0,
    })),
    announcements: announcementsRaw.map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      announcementCategory: a.announcementCategory,
      priority: a.priority,
      publishedAt: a.publishedAt,
      isRead: a.reads.length > 0,
    })),
    visits: visitsRaw.map(v => {
      const st = statusMap.get(v.status)
      return {
        id: v.id,
        dealId: v.dealId,
        customerName: v.user?.name ?? '—',
        address: v.user?.address ?? '',
        visitDate: v.visitDate,
        startTime: v.startTime,
        status: v.status,
        statusLabel: st?.label ?? v.status,
        statusColor: st?.color ?? '#6B7280',
      }
    }),
  })
}
