import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'
import { generateSecurePassword } from '@/lib/password-utils'
import { ADMIN_ROLES } from '@/lib/admin-auth'

const createMemberSchema = z.object({
  name:  z.string().min(1, '氏名は必須です').max(100),
  email: z.string().email('有効なメールアドレスを入力してください'),
  role:  z.enum(['admin', 'superadmin', 'hr']).optional(),
})

async function requireAnyAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) return null
  return user as { id: string; role: 'admin' | 'superadmin' | 'hr' }
}

// 管理者メンバー一覧取得（admin/superadmin/hr 共通で閲覧可）
export async function GET() {
  const user = await requireAnyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await prisma.admin.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(members)
}

// 管理者メンバー追加（admin / superadmin）
export async function POST(request: NextRequest) {
  const user = await requireAnyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return NextResponse.json({ error: '管理者の追加権限がありません' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createMemberSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { name, email, role } = parsed.data

  // 管理ポータルの管理者間でのみ重複を禁止（システム管理者の同一メールは別アカウントとして許容）
  const existing = await prisma.admin.findFirst({ where: { email, role: { not: 'sysadmin' } } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
  }

  const rawPassword = generateSecurePassword()
  const hashed = await bcrypt.hash(rawPassword, 10)
  const member = await prisma.admin.create({
    data: { name, email, password: hashed, role: role ?? 'admin' },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
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
