import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 公開済みお知らせ詳細（店舗用） */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const announcement = await prisma.announcement.findFirst({
    where: { id, isPublished: true },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      publishedAt: true,
      admin: { select: { name: true } },
    },
  })

  if (!announcement) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  return NextResponse.json(announcement)
}
