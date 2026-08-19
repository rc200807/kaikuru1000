import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
})

// 連携パートナー詳細（メンバー・割当フォーム・件数を含む）
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const partner = await prisma.linkPartner.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isActive: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      invitedByAdmin: { select: { id: true, name: true } },
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          acceptedAt: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
      forms: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          formId: true,
          createdAt: true,
          form: {
            select: {
              id: true,
              title: true,
              internalName: true,
              slug: true,
              status: true,
              _count: { select: { submissions: true } },
            },
          },
        },
      },
      _count: { select: { members: true, forms: true, activityLogs: true } },
    },
  })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(partner)
}

// 連携パートナーの基本情報を更新（名称・有効/無効・内部メモ）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const updated = await prisma.linkPartner.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, isActive: true, note: true, updatedAt: true },
  })
  return NextResponse.json(updated)
}

// 連携パートナー削除（superadmin/admin のみ）。members/forms/invitations/logs は Cascade。Form/User は不変。
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return NextResponse.json({ error: '連携パートナーの削除権限がありません' }, { status: 403 })
  }
  const { id } = await ctx.params
  await prisma.linkPartner.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
