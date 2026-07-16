/**
 * 登録済みパスキー一覧 API（ログイン中ユーザー自身のもののみ）
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolvePasskeyUser } from '@/lib/webauthn'

export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as
    | { role?: string; id?: string; memberId?: string | null }
    | undefined
  if (!sessionUser) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const target = resolvePasskeyUser(sessionUser)
  if (!target) {
    return NextResponse.json({ error: 'このアカウントではパスキーを利用できません' }, { status: 403 })
  }

  const credentials = await prisma.passkeyCredential.findMany({
    where: { userType: target.userType, userId: target.userId },
    select: {
      id: true,
      deviceName: true,
      deviceType: true,
      backedUp: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ credentials })
}
