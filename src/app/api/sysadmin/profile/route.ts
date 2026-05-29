import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

const MIN_PASSWORD_LENGTH = 8

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email('有効なメールアドレスを入力してください').optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`).max(128).optional(),
})

// ログイン中のシステム管理者が自分自身の情報を更新
export async function PATCH(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, email, password } = parsed.data

  // メール重複チェック（自分以外）
  if (email) {
    const existing = await prisma.admin.findUnique({ where: { email } })
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
    }
  }

  const data: any = {}
  if (name) data.name = name
  if (email) data.email = email
  if (password) data.password = await bcrypt.hash(password, 10)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
  }

  const updated = await prisma.admin.update({
    where: { id: user.id },
    data,
    select: { id: true, name: true, email: true },
  })
  return NextResponse.json(updated)
}
