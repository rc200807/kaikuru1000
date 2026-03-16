import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** スレッド詳細 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const storeId = user.storeId || user.id

  const thread = await prisma.communityThread.findUnique({
    where: { id },
    include: {
      store: { select: { id: true, name: true, avatar: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: {
          store: { select: { id: true, name: true, avatar: true } },
        },
      },
      reactions: {
        select: { emoji: true, storeId: true },
      },
    },
  })

  if (!thread) {
    return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 })
  }

  // Group reactions
  const reactionMap = new Map<string, { count: number; reacted: boolean }>()
  for (const r of thread.reactions) {
    const existing = reactionMap.get(r.emoji) || { count: 0, reacted: false }
    existing.count++
    if (r.storeId === storeId) existing.reacted = true
    reactionMap.set(r.emoji, existing)
  }

  return NextResponse.json({
    ...thread,
    reactions: Array.from(reactionMap.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      reacted: data.reacted,
    })),
  })
}

/** スレッド削除（自分のスレッドのみ） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const storeId = user.storeId || user.id

  const thread = await prisma.communityThread.findUnique({ where: { id } })
  if (!thread) {
    return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 })
  }
  if (thread.storeId !== storeId) {
    return NextResponse.json({ error: '自分のスレッドのみ削除できます' }, { status: 403 })
  }

  await prisma.communityThread.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
