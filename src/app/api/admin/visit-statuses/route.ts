import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const statuses = await prisma.visitStatus.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(statuses)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { key, label, color, sortOrder } = body

  if (!key?.trim()) {
    return NextResponse.json({ error: 'キーは必須です' }, { status: 400 })
  }
  if (!label?.trim()) {
    return NextResponse.json({ error: 'ラベルは必須です' }, { status: 400 })
  }

  // キー重複チェック
  const existing = await prisma.visitStatus.findUnique({
    where: { key: key.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: 'このキーは既に存在します' }, { status: 400 })
  }

  const status = await prisma.visitStatus.create({
    data: {
      key: key.trim(),
      label: label.trim(),
      color: color || '#6B7280',
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })

  return NextResponse.json(status, { status: 201 })
}
