import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 自店舗のコメントを削除 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeId = user.id as string
  const { commentId } = await params

  const comment = await prisma.announcementComment.findUnique({ where: { id: commentId } })
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (comment.authorType !== 'store' || comment.storeId !== storeId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.announcementComment.delete({ where: { id: commentId } })
  return NextResponse.json({ ok: true })
}
