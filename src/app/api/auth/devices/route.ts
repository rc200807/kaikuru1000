/**
 * デバイスセッション一覧 API（ログイン中ユーザー自身のもののみ）
 * パスキー長期セッションの利用状況を確認し、失効の対象を選べるようにする。
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
    return NextResponse.json({ error: 'このアカウントでは利用できません' }, { status: 403 })
  }

  const devices = await prisma.deviceSession.findMany({
    where: {
      userType: target.userType,
      userId: target.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      loginMethod: true,
      ip: true,
      userAgent: true,
      lastSeenAt: true,
      expiresAt: true,
      createdAt: true,
      credentialId: true,
    },
    orderBy: { lastSeenAt: 'desc' },
  })

  // 紐づくパスキーの表示名を付与
  const credentialIds = devices.map((d) => d.credentialId).filter(Boolean) as string[]
  const credentials = credentialIds.length
    ? await prisma.passkeyCredential.findMany({
        where: { credentialId: { in: credentialIds } },
        select: { credentialId: true, deviceName: true },
      })
    : []
  const nameMap = new Map(credentials.map((c) => [c.credentialId, c.deviceName]))

  return NextResponse.json({
    devices: devices.map((d) => ({
      ...d,
      deviceName: d.credentialId ? nameMap.get(d.credentialId) ?? null : null,
    })),
  })
}
