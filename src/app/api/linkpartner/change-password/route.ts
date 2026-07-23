import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const schema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
  newPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(200),
})

// 連携パートナーメンバー自身のパスワード変更（初回強制変更フローでも利用）
export async function POST(req: NextRequest) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { currentPassword, newPassword } = parsed.data

  const member = await prisma.linkPartnerMember.findUnique({ where: { id: user.id } })
  if (!member || !member.password) {
    return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 })
  }
  const ok = await bcrypt.compare(currentPassword, member.password)
  if (!ok) {
    return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.linkPartnerMember.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false },
  })

  return NextResponse.json({ ok: true })
}
