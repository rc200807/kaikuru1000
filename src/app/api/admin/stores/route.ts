import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { z } from 'zod'

function generatePassword(): string {
  // 読みやすい文字のみ（0/O/l/I 等を除く）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

const createSchema = z.object({
  code:       z.string().min(1).max(50),
  name:       z.string().min(1).max(100),
  email:      z.string().email().optional().or(z.literal('')),
  phone:      z.string().max(20).optional(),
  prefecture: z.string().max(10).optional(),
  address:    z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  }

  const { code, name, email, phone, prefecture, address } = parsed.data

  // 重複チェック
  const orConditions: any[] = [{ code }]
  if (email) orConditions.push({ email })
  const existing = await prisma.store.findFirst({ where: { OR: orConditions } })
  if (existing) {
    if (existing.code === code) {
      return NextResponse.json({ error: '店舗コードが既に使用されています' }, { status: 400 })
    }
    return NextResponse.json({ error: 'メールアドレスが既に使用されています' }, { status: 400 })
  }

  const plainPassword = generatePassword()
  const hashedPassword = await bcrypt.hash(plainPassword, 10)

  const store = await prisma.store.create({
    data: {
      code,
      name,
      email:      email      || null,
      phone:      phone      || null,
      prefecture: prefecture || null,
      address:    address    || null,
      password:   hashedPassword,
    },
    select: {
      id: true, code: true, name: true,
      email: true, phone: true, prefecture: true,
      _count: { select: { customers: true } },
    },
  })

  return NextResponse.json({ store, password: plainPassword }, { status: 201 })
}
