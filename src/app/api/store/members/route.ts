import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { recordAccessLog } from '@/lib/access-log'

const MIN_PASSWORD_LENGTH = 8

/** 読みやすい文字のみで初期パスワードを自動生成（0/O/l/I 等を除外） */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

const createMemberSchema = z.object({
  name:     z.string().min(1, '氏名は必須です').max(100),
  email:    z.string().email('有効なメールアドレスを入力してください'),
  // パスワードは任意。未指定なら自動生成する。
  password: z.string().min(MIN_PASSWORD_LENGTH, `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`).optional(),
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
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
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
  // メンバーの追加は、オーナー（店舗アカウント）でもメンバーでも行える。
  // 現場でスタッフが増えたときにオーナーの手を借りずにアカウントを発行できるようにするため。
  // 追加先は必ずログイン中の店舗（sessionUser.id）に固定するので、他店舗には追加できない。
  // 削除だけは引き続きオーナー限定（[id]/route.ts の DELETE）。

  const body = await request.json()
  const parsed = createMemberSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { name, email } = parsed.data

  // 同一店舗内でのメール重複チェック
  const existingMember = await prisma.storeMember.findFirst({
    where: { storeId: sessionUser.id, email },
  })
  if (existingMember) {
    return NextResponse.json({ error: 'この店舗内で同じメールアドレスが既に使用されています' }, { status: 409 })
  }

  // パスワード未指定なら自動生成し、平文を一度だけ返す
  const plainPassword = parsed.data.password || generatePassword()
  const generated = !parsed.data.password
  const hashed = await bcrypt.hash(plainPassword, 10)
  const member = await prisma.storeMember.create({
    data: { storeId: sessionUser.id, name, email, password: hashed },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `店舗メンバー追加「${member.name}」`, req: request })
  return NextResponse.json({ ...member, password: plainPassword, generated }, { status: 201 })
}
