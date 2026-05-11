import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { z } from 'zod'

/** パートナー一覧 + 関連招待 */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partners = await prisma.salesPartner.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      invitedBy: { select: { id: true, name: true } },
      _count: { select: { customerNotes: true } },
    },
  })
  // パスワードは絶対に返さない
  return NextResponse.json(partners.map(({ password, ...rest }) => rest))
}

const updateSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  email:    z.string().email().optional(),
  isActive: z.boolean().optional(),
})

/** 管理者直接編集（PATCH 経由でメンバー単位の更新は /[id] 側に） */
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, ...patch } = body as { id: string } & Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
  const parsed = updateSchema.safeParse(patch)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const updated = await prisma.salesPartner.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, isActive: true, updatedAt: true },
  })
  return NextResponse.json(updated)
}
