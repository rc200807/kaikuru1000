import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const categories = await prisma.announcementCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { announcements: true } } },
  })

  return NextResponse.json(categories)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, color, icon } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'カテゴリ名は必須です' }, { status: 400 })
  }

  const category = await prisma.announcementCategory.create({
    data: {
      name: name.trim(),
      color: color || '#6B7280',
      icon: icon || '📢',
    },
  })

  return NextResponse.json(category, { status: 201 })
}
