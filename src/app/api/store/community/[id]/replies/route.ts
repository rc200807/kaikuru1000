import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 返信を追加 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { content } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: '返信内容は必須です' }, { status: 400 })
  }

  // Verify thread exists
  const thread = await prisma.communityThread.findUnique({ where: { id } })
  if (!thread) {
    return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 })
  }

  const storeId = user.storeId || user.id

  const reply = await prisma.communityReply.create({
    data: {
      threadId: id,
      content: content.trim(),
      storeId,
    },
    include: {
      store: { select: { id: true, name: true, avatar: true } },
    },
  })

  return NextResponse.json(reply, { status: 201 })
}
