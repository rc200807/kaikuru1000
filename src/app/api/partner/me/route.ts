import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'
import { z } from 'zod'

/** ログイン中パートナーの情報取得 */
export async function GET() {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partner = await prisma.salesPartner.findUnique({
    where: { id: user.id },
    select: {
      id: true, name: true, email: true, isActive: true,
      acceptedAt: true, createdAt: true, updatedAt: true,
    },
  })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(partner)
}

const profileSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  email:       z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
})

/** プロフィール更新（氏名・メール・パスワード） */
export async function PATCH(req: NextRequest) {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, email, currentPassword, newPassword } = parsed.data

  const partner = await prisma.salesPartner.findUnique({ where: { id: user.id } })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (name !== undefined) data.name = name
  if (email !== undefined && email !== partner.email) {
    const existing = await prisma.salesPartner.findUnique({ where: { email } })
    if (existing && existing.id !== partner.id) {
      return NextResponse.json({ error: 'このメールアドレスは既に使用されています' }, { status: 409 })
    }
    data.email = email
  }

  if (newPassword) {
    if (!currentPassword || !partner.password) {
      return NextResponse.json({ error: '現在のパスワードを入力してください' }, { status: 400 })
    }
    const valid = await bcrypt.compare(currentPassword, partner.password)
    if (!valid) return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 400 })
    data.password = await bcrypt.hash(newPassword, 10)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }

  const updated = await prisma.salesPartner.update({
    where: { id: partner.id },
    data,
    select: {
      id: true, name: true, email: true, isActive: true,
      acceptedAt: true, createdAt: true, updatedAt: true,
    },
  })
  return NextResponse.json(updated)
}
