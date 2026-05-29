import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { encrypt } from '@/lib/encrypt'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  loginId: z.string().min(1).max(200).optional(),
  password: z.string().max(200).optional(), // 空文字なら変更なし
  url: z.string().max(1000).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, loginId, password, url, phone, note } = parsed.data

  const data: any = {}
  if (name !== undefined) data.name = name
  if (loginId !== undefined) data.loginId = loginId
  if (url !== undefined) data.url = url?.trim() || null
  if (phone !== undefined) data.phone = phone?.trim() || null
  if (note !== undefined) data.note = note?.trim() || null
  if (password) data.passwordEnc = encrypt(password) // 空文字/未指定はパスワード変更なし

  const updated = await prisma.supplierAccount.update({ where: { id }, data, select: { id: true, name: true } })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `発注先アカウント編集「${updated.name}」`, req })
  return NextResponse.json({ id: updated.id })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const target = await prisma.supplierAccount.findUnique({ where: { id }, select: { name: true } })
  await prisma.supplierAccount.delete({ where: { id } })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `発注先アカウント削除「${target?.name ?? id}」`, req: _req })
  return NextResponse.json({ ok: true })
}
