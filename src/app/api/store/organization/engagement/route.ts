import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOperatorStores, isOrgAdmin } from '@/lib/store-scope'

/**
 * お知らせ既読 / 研修動画視聴の店舗横断マトリクス（組織管理者のみ）。
 * ?type=announcements|videos&limit=20
 * 対象は運営者配下の全店舗（表示スコープの選択とは独立）。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionStoreId = user.id as string

  const [{ operator, stores }, orgAdmin] = await Promise.all([
    getOperatorStores(sessionStoreId),
    isOrgAdmin({ id: sessionStoreId, memberId: user.memberId ?? null }),
  ])
  if (!operator) return NextResponse.json({ error: '運営者が登録されていません' }, { status: 404 })
  if (!orgAdmin) return NextResponse.json({ error: '組織管理者の権限が必要です' }, { status: 403 })

  const type = request.nextUrl.searchParams.get('type') === 'videos' ? 'videos' : 'announcements'
  const limit = Math.max(1, Math.min(50, parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)))
  const storeIds = stores.map(s => s.id)
  const storesOut = stores.map(s => ({ id: s.id, name: s.name }))

  if (type === 'videos') {
    const videos = await prisma.trainingVideo.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: limit,
      select: { id: true, title: true, publishedAt: true },
    })
    const views = await prisma.trainingVideoView.findMany({
      where: { storeId: { in: storeIds }, trainingVideoId: { in: videos.map(v => v.id) } },
      select: { trainingVideoId: true, storeId: true, playCount: true, lastViewedAt: true },
    })
    const viewMap = new Map(views.map(v => [`${v.trainingVideoId}:${v.storeId}`, v]))
    return NextResponse.json({
      type,
      stores: storesOut,
      rows: videos.map(v => ({
        id: v.id,
        title: v.title,
        publishedAt: v.publishedAt,
        cells: Object.fromEntries(
          storeIds.map(sid => {
            const view = viewMap.get(`${v.id}:${sid}`)
            return [sid, view ? { playCount: view.playCount, lastViewedAt: view.lastViewedAt } : null]
          }),
        ),
      })),
    })
  }

  const announcements = await prisma.announcement.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: { id: true, title: true, priority: true, publishedAt: true },
  })
  const reads = await prisma.announcementRead.findMany({
    where: { storeId: { in: storeIds }, announcementId: { in: announcements.map(a => a.id) } },
    select: { announcementId: true, storeId: true, readAt: true },
  })
  const readMap = new Map(reads.map(r => [`${r.announcementId}:${r.storeId}`, r]))
  return NextResponse.json({
    type,
    stores: storesOut,
    rows: announcements.map(a => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      publishedAt: a.publishedAt,
      cells: Object.fromEntries(
        storeIds.map(sid => {
          const read = readMap.get(`${a.id}:${sid}`)
          return [sid, read ? { readAt: read.readAt } : null]
        }),
      ),
    })),
  })
}
