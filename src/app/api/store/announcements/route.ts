import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { announcementVisibilityWhere } from '@/lib/announcement-target'

/** 公開済みお知らせ一覧（既読フラグ付き） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = user.id

  // 配信対象の絞り込み（お知らせの targetServices と店舗の対応サービスを突合）
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { supportedServices: true },
  })

  const announcements = await prisma.announcement.findMany({
    where: { isPublished: true, ...announcementVisibilityWhere(store?.supportedServices) },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      categoryId: true,
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
      priority: true,
      targetServices: true,
      publishedAt: true,
      admin: { select: { name: true } },
      reads: {
        where: { storeId },
        select: { id: true },
      },
    },
  })

  const result = announcements.map(a => ({
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category,
    announcementCategory: a.announcementCategory,
    priority: a.priority,
    targetServices: a.targetServices,
    publishedAt: a.publishedAt,
    admin: a.admin,
    isRead: a.reads.length > 0,
  }))

  return NextResponse.json(result)
}
