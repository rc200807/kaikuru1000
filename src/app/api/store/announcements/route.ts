import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 公開済みお知らせ一覧（店舗用） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const announcements = await prisma.announcement.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      publishedAt: true,
      admin: { select: { name: true } },
    },
  })

  return NextResponse.json(announcements)
}
