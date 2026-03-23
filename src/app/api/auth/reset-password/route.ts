import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: 'トークンとパスワードは必須です' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'パスワードは6文字以上で入力してください' },
        { status: 400 }
      )
    }

    // トークンを検証
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!resetToken) {
      return NextResponse.json(
        { error: '無効なリセットリンクです' },
        { status: 400 }
      )
    }

    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: 'このリセットリンクは既に使用されています' },
        { status: 400 }
      )
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'リセットリンクの有効期限が切れています。再度リクエストしてください' },
        { status: 400 }
      )
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10)

    // ユーザーのパスワードを更新
    if (resetToken.userType === 'store') {
      const store = await prisma.store.findFirst({
        where: { email: resetToken.email, isActive: true },
      })
      if (!store) {
        return NextResponse.json(
          { error: 'アカウントが見つかりません' },
          { status: 400 }
        )
      }
      await prisma.store.update({
        where: { id: store.id },
        data: { password: hashedPassword },
      })
    } else {
      const user = await prisma.user.findFirst({
        where: { email: resetToken.email, isActive: true },
      })
      if (!user) {
        return NextResponse.json(
          { error: 'アカウントが見つかりません' },
          { status: 400 }
        )
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      })
    }

    // トークンを使用済みにマーク
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('パスワードリセットエラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
