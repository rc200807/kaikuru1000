import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/mailer'

export async function POST(req: Request) {
  try {
    const { email, userType, storeCode } = await req.json()

    if (!email || !userType || !['store', 'customer', 'admin'].includes(userType)) {
      return NextResponse.json(
        { error: 'メールアドレスとユーザー種別は必須です' },
        { status: 400 }
      )
    }

    // ユーザーを検索（存在しなくても200を返してメールの有無を漏らさない）
    let userName: string | null = null
    // 店舗のリセットは対象店舗を1つに固定する。同じメールアドレスが複数店舗で
    // 使われうるため、店舗を絞らないと無関係な店舗のパスワードまで変わってしまう。
    let storeId: string | null = null

    if (userType === 'admin') {
      const admin = await prisma.admin.findFirst({
        where: { email, role: { not: 'sysadmin' } },
        select: { name: true },
      })
      userName = admin?.name ?? null
    } else if (userType === 'store') {
      // 店舗専用ログイン画面から来た場合は店舗コードで対象店舗を確定させる
      const scoped = typeof storeCode === 'string' && storeCode.trim()
        ? await prisma.store.findUnique({ where: { code: storeCode.trim() }, select: { id: true, isActive: true } })
        : null
      if (typeof storeCode === 'string' && storeCode.trim() && (!scoped || !scoped.isActive)) {
        // 存在しない店舗コードでもメールの有無を漏らさないよう成功レスポンスを返す
        return NextResponse.json({ success: true })
      }

      const store = await prisma.store.findFirst({
        where: scoped ? { id: scoped.id, email, isActive: true } : { email, isActive: true },
        select: { id: true, name: true },
      })
      if (store) {
        userName = store.name
        storeId = store.id
      } else if (scoped) {
        // オーナーのメールではない場合、その店舗のスタッフを探す
        // （スタッフのメールは店舗内でのみ一意なので、店舗が確定していれば1件に決まる）
        const member = await prisma.storeMember.findUnique({
          where: { storeId_email: { storeId: scoped.id, email } },
          select: { name: true },
        })
        if (member) {
          userName = member.name
          storeId = scoped.id
        }
      }
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

    // 既存の未使用トークンを無効化（同一メール・同一種別）。
    // 店舗は同じメールアドレスが複数店舗で使われうるので、無効化も店舗単位にする
    // （別店舗の人が発行したリンクを巻き添えで失効させないため）
    await prisma.passwordResetToken.updateMany({
      where: { email, userType, usedAt: null, ...(userType === 'store' ? { storeId } : {}) },
      data: { usedAt: new Date() },
    })

    // 新しいトークンを保存（店舗はどの店舗のアカウントかも記録する）
    await prisma.passwordResetToken.create({
      data: { token, email, userType, storeId, expiresAt },
    })

    // リセットURLを生成
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetPath = userType === 'admin' ? '/admin/reset-password' : userType === 'store' ? '/store/reset-password' : '/reset-password'
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
