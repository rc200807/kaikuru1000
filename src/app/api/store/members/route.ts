import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const MIN_PASSWORD_LENGTH = 8

const createMemberSchema = z.object({
  name:     z.string().min(1, '氏名は必須です').max(100),
  email:    z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`),
})

// 店舗メンバー一覧取得
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const members = await prisma.storeMember.findMany({
    where: { storeId: sessionUser.id },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(members)
}

// 店舗メンバー追加
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createMemberSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { name, email, password } = parsed.data

  // メール重複チェック（Store + StoreMember 両方）
  const [existingStore, existingMember] = await Promise.all([
    prisma.store.findFirst({ where: { email } }),
    prisma.storeMember.findUnique({ where: { email } }),
  ])
  if (existingStore || existingMember) {
    return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const member = await prisma.storeMember.create({
    data: { storeId: sessionUser.id, name, email, password: hashed },
    select: { id: true, name: true, email: true, createdAt: true },
  })

  return NextResponse.json(member, { status: 201 })
}
