import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 買取相談メモ一覧取得 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get('userId')

  if (sessionUser.role === 'customer') {
    // 顧客は自分のメモのみ
    const memos = await prisma.purchaseMemo.findMany({
      where: { userId: sessionUser.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(memos)
  }

  if (sessionUser.role === 'store') {
    // 店舗は担当顧客のメモのみ
    const storeId = sessionUser.id
    const where: any = {
      user: { storeId },
    }
    if (targetUserId) where.userId = targetUserId
    const memos = await prisma.purchaseMemo.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(memos)
  }

  if (sessionUser.role === 'admin') {
    const where: any = {}
    if (targetUserId) where.userId = targetUserId
    const memos = await prisma.purchaseMemo.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(memos)
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** 買取相談メモ新規作成（顧客のみ） */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, imageUrls } = body

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: '品名を入力してください' }, { status: 400 })
  }

  const memo = await prisma.purchaseMemo.create({
    data: {
      userId: sessionUser.id,
      title: title.trim(),
      description: description?.trim() || null,
      imageUrls: JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
      status: 'pending',
    },
  })

  return NextResponse.json(memo, { status: 201 })
}
