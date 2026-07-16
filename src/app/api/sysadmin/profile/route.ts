import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { revokeAllDeviceSessions } from '@/lib/device-session'

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

  // メール重複チェック（他のシステム管理者と重複する場合のみ）
  if (email) {
    const existing = await prisma.admin.findFirst({ where: { email, role: 'sysadmin', NOT: { id: user.id } } })
    if (existing) {
      return NextResponse.json({ error: 'このメールアドレスは既に別のシステム管理者が使用しています' }, { status: 409 })
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
  // パスワード変更時は全デバイスの長期セッションを失効
  if (data.password) await revokeAllDeviceSessions('admin', user.id)
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: updated.name, action: 'プロフィール更新', req })
  return NextResponse.json(updated)
}
