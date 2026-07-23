import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { generateSecurePassword } from '@/lib/password-utils'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// メンバー一覧（パスワードは返さない）
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const members = await prisma.linkPartnerMember.findMany({
    where: { linkPartnerId: id },
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
  })
  return NextResponse.json(members)
}

const patchSchema = z.object({
  memberId: z.string(),
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
})

// メンバーの有効/無効切替・パスワード再発行（管理者による管理操作）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { memberId, isActive, resetPassword } = parsed.data

  // 対象メンバーが当該パートナーに属することを確認（別組織のメンバー操作を防止）
  const member = await prisma.linkPartnerMember.findFirst({
    where: { id: memberId, linkPartnerId: id },
    select: { id: true },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: { isActive?: boolean; password?: string; mustChangePassword?: boolean } = {}
  if (typeof isActive === 'boolean') data.isActive = isActive

  let initialPassword: string | undefined
  if (resetPassword) {
    const raw = generateSecurePassword()
    data.password = await bcrypt.hash(raw, 10)
    data.mustChangePassword = true
    initialPassword = raw
  }

  const updated = await prisma.linkPartnerMember.update({
    where: { id: memberId },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true },
  })

  // パスワード再発行時のみ、新パスワードを一度だけ返す
  return NextResponse.json(initialPassword ? { ...updated, initialPassword } : updated)
}
