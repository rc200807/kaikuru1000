import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sources = await prisma.leadSource.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(sources)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, sortOrder } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: '流入経路名は必須です' }, { status: 400 })
  }

  // 重複チェック
  const existing = await prisma.leadSource.findUnique({
    where: { name: name.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: 'この流入経路名は既に存在します' }, { status: 400 })
  }

  const source = await prisma.leadSource.create({
    data: {
      name: name.trim(),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })

  return NextResponse.json(source, { status: 201 })
}
