import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 公開済みお知らせ一覧（既読フラグ付き） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = user.id

  const announcements = await prisma.announcement.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      categoryId: true,
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
      priority: true,
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
    publishedAt: a.publishedAt,
    admin: a.admin,
    isRead: a.reads.length > 0,
  }))

  return NextResponse.json(result)
}
