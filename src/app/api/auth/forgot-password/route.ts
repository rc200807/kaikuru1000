import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/mailer'

export async function POST(req: Request) {
  try {
    const { email, userType } = await req.json()

    if (!email || !userType || !['store', 'customer'].includes(userType)) {
      return NextResponse.json(
        { error: 'メールアドレスとユーザー種別は必須です' },
        { status: 400 }
      )
    }

    // ユーザーを検索（存在しなくても200を返してメールの有無を漏らさない）
    let userName: string | null = null

    if (userType === 'store') {
      const store = await prisma.store.findFirst({
        where: { email, isActive: true },
        select: { name: true },
      })
      userName = store?.name ?? null
    } else {
      const user = await prisma.user.findFirst({
        where: { email, isActive: true },
        select: { name: true },
      })
      userName = user?.name ?? null
    }

    if (!userName) {
      // ユーザーが見つからなくても成功レスポンスを返す（セキュリティ対策）
      return NextResponse.json({ success: true })
    }

    // トークン生成
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1時間

    // 既存の未使用トークンを無効化（同一メール・同一種別）
    await prisma.passwordResetToken.updateMany({
      where: { email, userType, usedAt: null },
      data: { usedAt: new Date() },
    })

    // 新しいトークンを保存
    await prisma.passwordResetToken.create({
      data: { token, email, userType, expiresAt },
    })

    // リセットURLを生成
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetPath = userType === 'store' ? '/store/reset-password' : '/reset-password'
    const resetUrl = `${baseUrl}${resetPath}?token=${token}`

    // メール送信
    await sendPasswordResetEmail({
      to: email,
      name: userName,
      resetUrl,
      userType,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('パスワードリセットリクエストエラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
