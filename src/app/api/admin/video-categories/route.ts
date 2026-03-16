import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** カテゴリ一覧 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const categories = await prisma.videoCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { videos: true } } },
  })

  return NextResponse.json(categories)
}

/** カテゴリ作成 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'カテゴリ名は必須です' }, { status: 400 })
  }

  // 最大sortOrderを取得
  const maxSort = await prisma.videoCategory.aggregate({ _max: { sortOrder: true } })
  const category = await prisma.videoCategory.create({
    data: {
      name: name.trim(),
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  })

  return NextResponse.json(category, { status: 201 })
}
