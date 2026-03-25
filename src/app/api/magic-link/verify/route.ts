import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { token, peek } = await request.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token は必須です' }, { status: 400 })
    }

    // トークン検索: 未使用かつ有効期限内
    const magicLink = await prisma.magicLink.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    })

    if (!magicLink) {
      return NextResponse.json({ error: '無効なリンクです' }, { status: 400 })
    }

    if (magicLink.usedAt) {
      return NextResponse.json({ error: 'このリンクは既に使用済みです' }, { status: 400 })
    }

    if (new Date() > magicLink.expiresAt) {
      return NextResponse.json({ error: 'リンクの有効期限が切れています' }, { status: 400 })
    }

    // peek=true の場合はトークンを消費せず情報だけ返す
    if (!peek) {
      await prisma.magicLink.update({
        where: { id: magicLink.id },
        data: { usedAt: new Date() },
      })
    }

    return NextResponse.json({
      userId: magicLink.userId,
      contractId: magicLink.contractId,
      user: magicLink.user,
    })
  } catch (error) {
    console.error('MagicLink verify error:', error)
    return NextResponse.json({ error: 'マジックリンクの検証に失敗しました' }, { status: 500 })
  }
}
