import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { generateSecurePassword } from '@/lib/password-utils'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'

function baseUrl() {
  return process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
}

// メンバーのパスワードを再発行（新パスワードを発行し、メール送付 + 一度だけ返却）
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const target = await prisma.admin.findUnique({ where: { id } })
  if (!target || target.role !== 'sysadmin') {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  const rawPassword = generateSecurePassword()
  const hashed = await bcrypt.hash(rawPassword, 10)
  await prisma.admin.update({ where: { id }, data: { password: hashed } })

  let emailSent = false
  try {
    emailSent = await sendWelcomeWithPasswordEmail({
      to: target.email,
      name: target.name,
      email: target.email,
      password: rawPassword,
      loginUrl: `${baseUrl()}/sysadmin/login`,
    })
  } catch (e) {
    console.error('[sysadmin/members] reset-password email failed:', e)
  }

  return NextResponse.json({ temporaryPassword: rawPassword, emailSent })
}
