import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email('有効なメールアドレスを入力してください').optional(),
})

// メンバーのメール・氏名を編集
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (id === user.id) {
    return NextResponse.json({ error: '自分自身の情報は「プロフィール」から変更してください' }, { status: 400 })
  }

  const target = await prisma.admin.findUnique({ where: { id } })
  if (!target || target.role !== 'sysadmin') {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, email } = parsed.data

  if (email && email !== target.email) {
    // 他のシステム管理者と重複する場合のみ拒否（他ポータルのメールは許容）
    const existing = await prisma.admin.findFirst({ where: { email, role: 'sysadmin', NOT: { id } } })
    if (existing) {
      return NextResponse.json({ error: 'このメールアドレスは既に別のシステム管理者が使用しています' }, { status: 409 })
    }
  }

  const data: any = {}
  if (name) data.name = name
  if (email) data.email = email
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
  }

  const updated = await prisma.admin.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, createdAt: true },
  })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `メンバー編集「${updated.name}」`, req })
  return NextResponse.json(updated)
}

// メンバーを削除（最後の1人 / 自分自身は不可）
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (id === user.id) {
    return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 })
  }

  const target = await prisma.admin.findUnique({ where: { id } })
  if (!target || target.role !== 'sysadmin') {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  const count = await prisma.admin.count({ where: { role: 'sysadmin' } })
  if (count <= 1) {
    return NextResponse.json({ error: '最後のシステム管理者は削除できません' }, { status: 400 })
  }

  await prisma.admin.delete({ where: { id } })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `メンバー削除「${target.name}」`, req: _req })
  return NextResponse.json({ ok: true })
}
