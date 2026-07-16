/**
 * パスキー登録オプション発行 API
 * ログイン済みユーザー（admin/store/storeMember）のみ。
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  RP_NAME,
  getRpId,
  resolvePasskeyUser,
  saveChallenge,
} from '@/lib/webauthn'

export async function POST() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as
    | { role?: string; id?: string; memberId?: string | null; name?: string | null; email?: string | null }
    | undefined
  if (!sessionUser) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const target = resolvePasskeyUser(sessionUser)
  if (!target) {
    return NextResponse.json({ error: 'このアカウントではパスキーを利用できません' }, { status: 403 })
  }

  // 登録済みパスキーは除外（同一認証器の二重登録防止）
  const existing = await prisma.passkeyCredential.findMany({
    where: { userType: target.userType, userId: target.userId },
    select: { credentialId: true, transports: true },
  })

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpId(),
    userName: sessionUser.email || sessionUser.name || target.userId,
    userDisplayName: sessionUser.name || sessionUser.email || 'ユーザー',
    // userHandle: "{userType}:{userId}" で discoverable credential に対応
    userID: Buffer.from(`${target.userType}:${target.userId}`, 'utf8'),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  await saveChallenge({
    challenge: options.challenge,
    type: 'registration',
    userType: target.userType,
    userId: target.userId,
  })

  return NextResponse.json(options)
}
