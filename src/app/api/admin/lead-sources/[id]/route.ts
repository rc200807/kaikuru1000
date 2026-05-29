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

  const updated = await prisma.leadSource.update({
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

  // 流入経路は User.leadSource に名称文字列で保持しているため FK 制約はない。
  // マスタを削除しても既存顧客の流入経路（履歴）はそのまま残る。
  await prisma.leadSource.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
