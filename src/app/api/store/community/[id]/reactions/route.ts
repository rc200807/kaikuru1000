import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** リアクションのトグル（追加/削除） */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: threadId } = await params
  const body = await req.json()
  const { emoji } = body

  if (!emoji) {
    return NextResponse.json({ error: '絵文字は必須です' }, { status: 400 })
  }

  const storeId = user.storeId || user.id

  // Verify thread exists
  const thread = await prisma.communityThread.findUnique({ where: { id: threadId } })
  if (!thread) {
    return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 })
  }

  // Toggle: if exists, delete; otherwise create
  const existing = await prisma.communityReaction.findUnique({
    where: {
      threadId_storeId_emoji: { threadId, storeId, emoji },
    },
  })

  if (existing) {
    await prisma.communityReaction.delete({ where: { id: existing.id } })
    return NextResponse.json({ action: 'removed' })
  } else {
    await prisma.communityReaction.create({
      data: { threadId, storeId, emoji },
    })
    return NextResponse.json({ action: 'added' })
  }
}
