import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** お知らせ一覧（管理者用 - 下書き含む全件） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    include: { admin: { select: { name: true } } },
  })

  return NextResponse.json(announcements)
}

/** お知らせ作成 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, content, category, isPublished } = body

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 })
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: title.trim(),
      content: content.trim(),
      category: category || 'general',
      isPublished: !!isPublished,
      publishedAt: isPublished ? new Date() : null,
      adminId: user.id,
    },
    include: { admin: { select: { name: true } } },
  })

  return NextResponse.json(announcement, { status: 201 })
}
