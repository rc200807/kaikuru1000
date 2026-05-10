import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SYSTEM_KEYS = ['scheduled', 'completed']

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

  if (body.label !== undefined) updateData.label = body.label.trim()
  if (body.color !== undefined) updateData.color = body.color
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder

  // システムステータスの場合、keyの変更は不可
  const existing = await prisma.visitStatus.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'ステータスが見つかりません' }, { status: 404 })
  }

  const updated = await prisma.visitStatus.update({
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

  const existing = await prisma.visitStatus.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'ステータスが見つかりません' }, { status: 404 })
  }

  if (SYSTEM_KEYS.includes(existing.key)) {
    return NextResponse.json(
      { error: 'システムステータス（予定・対応完了）は削除できません' },
      { status: 400 },
    )
  }

  await prisma.visitStatus.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
