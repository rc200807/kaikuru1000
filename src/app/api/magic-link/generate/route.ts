import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // 店舗または管理者セッションが必要
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as any
    if (!session || !['store', 'admin', 'superadmin'].includes(sessionUser?.role ?? '')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 401 })
    }

    const { userId, contractId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId は必須です' }, { status: 400 })
    }

    // ユーザー存在確認
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    // トークン生成（64文字の16進数）
    const token = crypto.randomBytes(32).toString('hex')

    // 72時間後に期限切れ
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

    // MagicLink作成
    await prisma.magicLink.create({
      data: {
        token,
        userId,
        contractId: contractId || null,
        expiresAt,
      },
    })

    const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
    const url = `${baseUrl}/magic/${token}`

    return NextResponse.json({
      token,
      url,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('MagicLink generate error:', error)
    return NextResponse.json({ error: 'マジックリンクの生成に失敗しました' }, { status: 500 })
  }
}
