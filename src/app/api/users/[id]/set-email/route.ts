import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'

const setEmailSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
})

/** メールアドレス未登録の顧客にメールとパスワードを設定する */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = setEmailSchema.safeParse(body)

    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
      return NextResponse.json({ error }, { status: 400 })
    }

    const { email } = parsed.data

    // メールアドレスの重複チェック
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: 'このメールアドレスは既に使用されています' }, { status: 409 })
    }

    // ユーザー存在確認
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    // ランダムパスワード生成（12文字）
    const rawPassword = generatePassword(12)
    const hashedPassword = await bcrypt.hash(rawPassword, 10)

    // メールアドレスとパスワードを更新
    await prisma.user.update({
      where: { id },
      data: {
        email,
        password: hashedPassword,
      },
    })

    // ウェルカムメール送信
    try {
      const loginUrl = `${process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'}/login`
      await sendWelcomeWithPasswordEmail({
        to: email,
        name: user.name,
        email,
        password: rawPassword,
        loginUrl,
      })
    } catch (e) {
      console.error('ウェルカムメール送信失敗:', e)
      // メール送信失敗してもアカウント更新は成功
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('set-email error:', error)
    return NextResponse.json({ error: 'メールアドレスの設定に失敗しました' }, { status: 500 })
  }
}

/** 紛らわしい文字を除外したランダムパスワード生成 */
function generatePassword(length: number): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}
