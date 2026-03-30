import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'

const createMemberSchema = z.object({
  name:  z.string().min(1, '氏名は必須です').max(100),
  email: z.string().email('有効なメールアドレスを入力してください'),
})

/** 安全なランダムパスワードを生成（12文字: 英大小+数字+記号） */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*'
  const all = upper + lower + digits + symbols

  // 各種1文字ずつ保証
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ]
  const rest = Array.from({ length: 8 }, () => all[crypto.randomInt(all.length)])
  // シャッフル
  const chars = [...required, ...rest]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// 管理者メンバー一覧取得
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const members = await prisma.admin.findMany({
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(members)
}

// 管理者メンバー追加
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createMemberSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { name, email } = parsed.data

  const existing = await prisma.admin.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
  }

  const rawPassword = generatePassword()
  const hashed = await bcrypt.hash(rawPassword, 10)
  const member = await prisma.admin.create({
    data: { name, email, password: hashed },
    select: { id: true, name: true, email: true, createdAt: true },
  })

  // 招待メール送信（ログイン情報を通知）
  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const loginUrl = `${baseUrl}/admin/login`
  let emailSent = false
  try {
    emailSent = await sendWelcomeWithPasswordEmail({
      to: email,
      name,
      email,
      password: rawPassword,
      loginUrl,
    })
  } catch (e) {
    console.error('Failed to send invitation email:', e)
  }

  return NextResponse.json({ ...member, emailSent }, { status: 201 })
}
