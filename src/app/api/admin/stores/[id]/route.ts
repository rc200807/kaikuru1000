import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { sendStorePasswordResetNotification } from '@/lib/mailer'

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const store = await prisma.store.findUnique({ where: { id } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  if (body.resetPassword) {
    const plainPassword = generatePassword()
    const hashedPassword = await bcrypt.hash(plainPassword, 10)
    await prisma.store.update({
      where: { id },
      data: { password: hashedPassword },
    })

    // メールアドレスが設定されていれば通知メールを送信（失敗しても再発行自体は成功扱い）
    if (store.email) {
      const loginUrl = `${process.env.NEXTAUTH_URL ?? ''}/store/login`
      sendStorePasswordResetNotification({
        storeEmail: store.email,
        storeName: store.name,
        newPassword: plainPassword,
        loginUrl,
      }).catch(() => {}) // メール送信失敗はサイレントに無視
    }

    return NextResponse.json({ password: plainPassword, emailSent: !!store.email })
  }

  return NextResponse.json({ error: '無効なリクエスト' }, { status: 400 })
}
