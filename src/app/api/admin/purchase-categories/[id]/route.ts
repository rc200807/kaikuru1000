import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const updateData: any = {}
  if (body.name !== undefined) updateData.name = body.name.trim()
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder

  const updated = await prisma.purchaseCategory.update({
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
  if (!session || !['admin','superadmin','hr'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // カテゴリに紐づく買取品目があるか確認
  const count = await prisma.purchaseItem.count({ where: { categoryId: id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `このカテゴリには${count}件の買取品目が紐づいています。先に買取品目のカテゴリを変更してください。` },
      { status: 400 },
    )
  }

  await prisma.purchaseCategory.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
