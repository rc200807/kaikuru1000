import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { PASSWORD_REGEX, PASSWORD_ERROR } from '@/lib/passwordValidation'
import { revokeAllDeviceSessions } from '@/lib/device-session'

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: 'トークンとパスワードは必須です' },
        { status: 400 }
      )
    }

    if (!PASSWORD_REGEX.test(password)) {
      return NextResponse.json({ error: PASSWORD_ERROR }, { status: 400 })
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
    if (resetToken.userType === 'admin') {
      const admin = await prisma.admin.findFirst({
        where: { email: resetToken.email, role: { not: 'sysadmin' } },
      })
      if (!admin) {
        return NextResponse.json(
          { error: 'アカウントが見つかりません' },
          { status: 400 }
        )
      }
      await prisma.admin.update({
        where: { id: admin.id },
        data: { password: hashedPassword },
      })
      // パスワード変更 → 全デバイスの長期セッションを失効
      await revokeAllDeviceSessions('admin', admin.id)
    } else if (resetToken.userType === 'store') {
      // 対象店舗が記録されていればその店舗だけを更新する。
      // 同じメールアドレスが複数店舗で使われうるため、店舗を絞らずに更新すると
      // 無関係な店舗のパスワードまで変わってしまう。
      // storeId が無いのは店舗専用ログイン画面より前に発行された古いトークンで、
      // その頃は同一メールの全店舗を更新する挙動だったため従来どおりに扱う。
      const storeWhere = resetToken.storeId
        ? { id: resetToken.storeId, email: resetToken.email, isActive: true }
        : { email: resetToken.email, isActive: true }
      const stores = await prisma.store.findMany({ where: storeWhere, select: { id: true } })

      if (stores.length > 0) {
        await prisma.store.updateMany({ where: storeWhere, data: { password: hashedPassword } })
        // パスワード変更 → 全デバイスの長期セッションを失効
        for (const store of stores) {
          await revokeAllDeviceSessions('store', store.id)
        }
      } else if (resetToken.storeId) {
        // オーナーではなくスタッフアカウントのリセット
        // （スタッフのメールは店舗内でのみ一意なので、店舗が決まっていれば1件に決まる）
        const member = await prisma.storeMember.findUnique({
          where: { storeId_email: { storeId: resetToken.storeId, email: resetToken.email } },
          select: { id: true },
        })
        if (!member) {
          return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 400 })
        }
        await prisma.storeMember.update({ where: { id: member.id }, data: { password: hashedPassword } })
        await revokeAllDeviceSessions('storeMember', member.id)
      } else {
        return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 400 })
      }
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
