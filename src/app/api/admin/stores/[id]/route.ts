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
    return NextResponse.json({ password: plainPassword, hasEmail: !!store.email })
  }

  if (body.sendPasswordEmail) {
    if (!store.email) {
      return NextResponse.json({ error: 'メールアドレスが設定されていません' }, { status: 400 })
    }
    if (!body.password || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'パスワードが指定されていません' }, { status: 400 })
    }
    try {
      const loginUrl = `${process.env.NEXTAUTH_URL ?? ''}/store/login`
      const sent = await sendStorePasswordResetNotification({
        storeEmail: store.email,
        storeName: store.name,
        newPassword: body.password,
        loginUrl,
      })
      if (!sent) {
        return NextResponse.json(
          { error: 'メール送信機能が無効です。設定画面でSMTP設定を確認してください。' },
          { status: 503 },
        )
      }
      return NextResponse.json({ sent: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'メール送信に失敗しました'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '無効なリクエスト' }, { status: 400 })
}
