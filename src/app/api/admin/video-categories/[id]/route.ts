import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** カテゴリ更新 */
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
  const updateData: any = {}
  if (body.name !== undefined) updateData.name = body.name.trim()
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder

  const updated = await prisma.videoCategory.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(updated)
}

/** カテゴリ削除 */
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

  // 動画が紐づいている場合は削除不可
  const count = await prisma.trainingVideo.count({ where: { categoryId: id } })
  if (count > 0) {
    return NextResponse.json({ error: `このカテゴリには${count}件の動画があるため削除できません` }, { status: 400 })
  }

  await prisma.videoCategory.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
