import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** お知らせ詳細取得 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { admin: { select: { name: true } } },
  })

  if (!announcement) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  return NextResponse.json(announcement)
}

/** お知らせ更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  const updateData: any = {}
  if (body.title !== undefined) updateData.title = body.title.trim()
  if (body.content !== undefined) updateData.content = body.content.trim()
  if (body.category !== undefined) updateData.category = body.category

  if (body.isPublished !== undefined) {
    updateData.isPublished = body.isPublished
    // 初めて公開する場合のみ publishedAt を設定
    if (body.isPublished && !existing.publishedAt) {
      updateData.publishedAt = new Date()
    }
  }

  const updated = await prisma.announcement.update({
    where: { id },
    data: updateData,
    include: { admin: { select: { name: true } } },
  })

  return NextResponse.json(updated)
}

/** お知らせ削除 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await prisma.announcement.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
