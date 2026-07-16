import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateSecurePassword } from '@/lib/password-utils'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'
import { revokeAllDeviceSessions } from '@/lib/device-session'

/**
 * 管理者メンバーのパスワードを再発行
 * - 新しいパスワードを生成 → bcrypt ハッシュで DB 更新
 * - メールアドレス宛にログイン情報を送信
 * - レスポンスに新パスワードを含めて返却（管理者画面で表示・コピー用）
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const member = await prisma.admin.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  const newPassword = generateSecurePassword()
  const hashed = await bcrypt.hash(newPassword, 10)

  await prisma.admin.update({
    where: { id },
    data: { password: hashed },
  })

  // パスワード再発行 → 該当メンバーの全デバイス長期セッションを失効
  await revokeAllDeviceSessions('admin', id)

  // メール送信（失敗しても password は返却）。メール未設定（ID+パスワード方式）は送信スキップ
  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  let emailSent = false
  if (member.email) {
    try {
      emailSent = await sendWelcomeWithPasswordEmail({
        to: member.email,
        name: member.name,
        email: member.email,
        password: newPassword,
        loginUrl: `${baseUrl}/admin/login`,
      })
    } catch (e) {
      console.error('[admin/members reset-password] email send failed:', e)
    }
  }

  return NextResponse.json({
    password: newPassword,
    emailSent,
    email: member.email,
  })
}
