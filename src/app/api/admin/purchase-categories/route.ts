import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const categories = await prisma.purchaseCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { purchaseItems: true } } },
  })

  return NextResponse.json(categories)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, sortOrder } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'カテゴリ名は必須です' }, { status: 400 })
  }

  // 重複チェック
  const existing = await prisma.purchaseCategory.findUnique({
    where: { name: name.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: 'このカテゴリ名は既に存在します' }, { status: 400 })
  }

  const category = await prisma.purchaseCategory.create({
    data: {
      name: name.trim(),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })

  return NextResponse.json(category, { status: 201 })
}
