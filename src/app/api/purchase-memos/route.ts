import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DB の imageUrls（JSON文字列の Blob URL 配列）を
 * 認証プロキシ URL に変換してクライアントに返す
 * → Blob URL がブラウザに露出しない
 */
function toClientMemo(memo: any) {
  let blobUrls: string[] = []
  try { blobUrls = JSON.parse(memo.imageUrls || '[]') } catch { /* ignore */ }

  // aiAppraisal はJSON文字列→パース済みオブジェクトで返す
  let aiAppraisal = null
  if (memo.aiAppraisal) {
    try { aiAppraisal = JSON.parse(memo.aiAppraisal) } catch { /* ignore */ }
  }

  return {
    ...memo,
    imageUrls: blobUrls.map((_: string, i: number) => `/api/purchase-memos/${memo.id}/images/${i}`),
    aiAppraisal,
  }
}

/** 買取相談メモ一覧取得 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get('userId')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))
  const skip = (page - 1) * limit

  if (sessionUser.role === 'customer') {
    // 顧客は自分のメモのみ
    const where = { userId: sessionUser.id }
    const [memos, total] = await Promise.all([
      prisma.purchaseMemo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseMemo.count({ where }),
    ])
    return NextResponse.json({ memos: memos.map(toClientMemo), total, page, limit })
  }

  if (sessionUser.role === 'store') {
    // 店舗は担当顧客のメモのみ
    const storeId = sessionUser.id
    const where: any = {
      user: { storeId },
    }
    if (targetUserId) where.userId = targetUserId
    const [memos, total] = await Promise.all([
      prisma.purchaseMemo.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseMemo.count({ where }),
    ])
    return NextResponse.json({ memos: memos.map(toClientMemo), total, page, limit })
  }

  if (['admin','superadmin','hr'].includes(sessionUser.role)) {
    const where: any = {}
    if (targetUserId) where.userId = targetUserId
    const [memos, total] = await Promise.all([
      prisma.purchaseMemo.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseMemo.count({ where }),
    ])
    return NextResponse.json({ memos: memos.map(toClientMemo), total, page, limit })
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

  // 作成後のレスポンスも Blob URL → プロキシ URL に変換
  return NextResponse.json(toClientMemo(memo), { status: 201 })
}
