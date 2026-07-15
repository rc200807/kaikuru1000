import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function storeDisplayName(user: any): string {
  return (user.memberName as string) || (user.name as string) || '店舗'
}

/** 研修動画へコメントを追加 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string
  const { id } = await params

  const body = await request.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'コメントを入力してください' }, { status: 400 })

  const video = await prisma.trainingVideo.findFirst({ where: { id, isPublished: true }, select: { id: true } })
  if (!video) return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })

  const comment = await prisma.trainingVideoComment.create({
    data: {
      trainingVideoId: id,
      authorType: 'store',
      storeId,
      memberId: (user.memberId as string) ?? null,
      authorName: storeDisplayName(user),
      body: text.slice(0, 2000),
    },
    select: { id: true, authorType: true, authorName: true, body: true, createdAt: true },
  })
  return NextResponse.json({ ...comment, mine: true })
}
