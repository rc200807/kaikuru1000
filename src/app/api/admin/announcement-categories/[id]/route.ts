import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const updateData: any = {}
  if (body.name !== undefined) updateData.name = body.name.trim()
  if (body.color !== undefined) updateData.color = body.color
  if (body.icon !== undefined) updateData.icon = body.icon
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder

  const updated = await prisma.announcementCategory.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // カテゴリに紐づくお知らせがあるか確認
  const count = await prisma.announcement.count({ where: { categoryId: id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `このカテゴリには${count}件のお知らせが紐づいています。先にお知らせのカテゴリを変更してください。` },
      { status: 400 },
    )
  }

  await prisma.announcementCategory.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
