import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const assignSchema = z.object({
  storeId: z.string().nullable(),
})

// PATCH /api/admin/line-talk/users/[id]/assign — LINE ユーザーの店舗割当を変更
// （顧客紐付け PATCH /api/admin/line/users/[id]/link とは別物。トーク閲覧スコープのみ変更する）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = assignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const lineUser = await prisma.lineUser.findUnique({ where: { id } })
  if (!lineUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (parsed.data.storeId) {
    const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId } })
    if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 400 })
  }

  const updated = await prisma.lineUser.update({
    where: { id },
    data: { storeId: parsed.data.storeId },
    include: { store: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ id: updated.id, store: updated.store })
}
