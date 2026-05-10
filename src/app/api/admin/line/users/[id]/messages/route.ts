import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/line/users/[id]/messages — 会話履歴 + 既読更新
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lineUser = await prisma.lineUser.findUnique({ where: { id } })
  if (!lineUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
