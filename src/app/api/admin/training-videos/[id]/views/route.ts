import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

/** 指定動画の店舗別視聴状況。全店舗（未視聴含む）を返す。 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const video = await prisma.trainingVideo.findUnique({
    where: { id },
    select: { id: true, title: true },
  })
  if (!video) return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })

  const [stores, views] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.trainingVideoView.findMany({
      where: { trainingVideoId: id },
      select: { storeId: true, playCount: true, firstViewedAt: true, lastViewedAt: true },
    }),
  ])

  const viewMap = new Map(views.map(v => [v.storeId, v]))

  const stats = stores.map(s => {
    const v = viewMap.get(s.id)
    return {
      storeId: s.id,
      storeName: s.name,
      storeCode: s.code,
      viewed: !!v,
      playCount: v?.playCount ?? 0,
      firstViewedAt: v?.firstViewedAt ?? null,
      lastViewedAt: v?.lastViewedAt ?? null,
    }
  })

  const viewedCount = stats.filter(s => s.viewed).length
  const totalPlays = stats.reduce((sum, s) => sum + s.playCount, 0)

  return NextResponse.json({
    video,
    viewedCount,
    totalStores: stores.length,
    totalPlays,
    stats,
  })
}
