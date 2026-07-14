import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** お知らせへの絵文字リアクションをトグル（店舗単位） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string
  const { id } = await params

  const body = await request.json().catch(() => null)
  const emoji = typeof body?.emoji === 'string' ? body.emoji.slice(0, 16) : ''
  if (!emoji) return NextResponse.json({ error: '絵文字が指定されていません' }, { status: 400 })

  const announcement = await prisma.announcement.findFirst({ where: { id, isPublished: true }, select: { id: true } })
  if (!announcement) return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })

  const key = { announcementId_storeId_emoji: { announcementId: id, storeId, emoji } }
  const existing = await prisma.announcementReaction.findUnique({ where: key })
  if (existing) {
    await prisma.announcementReaction.delete({ where: key })
    return NextResponse.json({ action: 'removed' })
  }
  await prisma.announcementReaction.create({ data: { announcementId: id, storeId, emoji } })
  return NextResponse.json({ action: 'added' })
}
