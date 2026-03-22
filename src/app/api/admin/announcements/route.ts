import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** お知らせ一覧（管理者用 - 下書き含む全件 + 既読状況） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [announcements, totalStores] = await Promise.all([
    prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        admin: { select: { name: true } },
        announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
        _count: { select: { reads: true } },
      },
    }),
    prisma.store.count({ where: { isActive: true } }),
  ])

  const result = announcements.map(a => ({
    ...a,
    readCount: a._count.reads,
    totalStores,
    _count: undefined,
  }))

  return NextResponse.json(result)
}

/** お知らせ作成 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, content, categoryId, priority, isPublished } = body

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 })
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: title.trim(),
      content: content.trim(),
      category: 'general', // レガシー互換
      categoryId: categoryId || null,
      priority: priority || 'normal',
      isPublished: !!isPublished,
      publishedAt: isPublished ? new Date() : null,
      adminId: user.id,
    },
    include: {
      admin: { select: { name: true } },
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
    },
  })

  return NextResponse.json(announcement, { status: 201 })
}
