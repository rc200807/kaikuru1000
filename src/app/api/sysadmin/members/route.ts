import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { generateSecurePassword } from '@/lib/password-utils'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'

const createSchema = z.object({
  name: z.string().min(1, '氏名は必須です').max(100),
  email: z.string().email('有効なメールアドレスを入力してください'),
})

function baseUrl() {
  return process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
}

// システム管理者アカウント一覧
export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await prisma.admin.findMany({
    where: { role: 'sysadmin' },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(members)
}

// システム管理者を招待（アカウント作成 + 初期パスワードをメール送付）
export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, email } = parsed.data

  // メール重複チェック（Admin全体で一意）
  const existing = await prisma.admin.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
  }

  const rawPassword = generateSecurePassword()
  const hashed = await bcrypt.hash(rawPassword, 10)

  const member = await prisma.admin.create({
    data: { name, email, password: hashed, role: 'sysadmin' },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  let emailSent = false
  try {
    emailSent = await sendWelcomeWithPasswordEmail({
      to: email,
      name,
      email,
      password: rawPassword,
      loginUrl: `${baseUrl()}/sysadmin/login`,
    })
  } catch (e) {
    console.error('[sysadmin/members] invite email failed:', e)
  }

  // 初期パスワードは一度だけ返す（メール未設定でも招待者が伝えられるように）
  return NextResponse.json({ ...member, temporaryPassword: rawPassword, emailSent }, { status: 201 })
}
