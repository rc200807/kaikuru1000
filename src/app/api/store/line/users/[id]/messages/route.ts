import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveStoreScope } from '@/lib/store-scope'

// GET /api/store/line/users/[id]/messages — 会話履歴 + 既読更新（自店舗スコープのみ）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const scope = await resolveStoreScope(user.id as string, request.nextUrl.searchParams.get('storeIds'))

  const lineUser = await prisma.lineUser.findUnique({ where: { id } })
  if (!lineUser || !lineUser.storeId || !scope.storeIds.includes(lineUser.storeId)) {
    // スコープ外はレコードの存在も明かさない
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const messages = await prisma.lineMessage.findMany({
    where: { lineUserId: id },
    orderBy: { sentAt: 'asc' },
  })

  // 未読の inbound メッセージをすべて既読にする
  await prisma.lineMessage.updateMany({
    where: { lineUserId: id, direction: 'inbound', readAt: null },
    data: { readAt: new Date() },
  })

  return NextResponse.json(messages)
}
