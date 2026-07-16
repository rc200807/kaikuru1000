/**
 * パスキー登録検証 API
 * navigator.credentials.create() の結果を検証し、PasskeyCredential として保存する。
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import {
  getRpId,
  getExpectedOrigin,
  resolvePasskeyUser,
  extractChallenge,
  consumeChallenge,
} from '@/lib/webauthn'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as
    | { role?: string; id?: string; memberId?: string | null; name?: string | null }
    | undefined
  if (!sessionUser) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const target = resolvePasskeyUser(sessionUser)
  if (!target) {
    return NextResponse.json({ error: 'このアカウントではパスキーを利用できません' }, { status: 403 })
  }

  let body: { response?: RegistrationResponseJSON; deviceName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }
  const response = body.response
  if (!response?.response?.clientDataJSON) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  // チャレンジをワンタイム消費し、発行時のユーザーと一致するか確認
  const challenge = extractChallenge(response.response.clientDataJSON)
  if (!challenge) {
    return NextResponse.json({ error: 'チャレンジが不正です' }, { status: 400 })
  }
  const consumed = await consumeChallenge(challenge, 'registration')
  if (!consumed || consumed.userType !== target.userType || consumed.userId !== target.userId) {
    return NextResponse.json(
      { error: 'チャレンジが無効です。もう一度お試しください' },
      { status: 400 },
    )
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: false,
    })
  } catch (err: any) {
    console.error('[webauthn] registration verify error:', err?.message ?? err)
    return NextResponse.json({ error: 'パスキーの検証に失敗しました' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'パスキーの検証に失敗しました' }, { status: 400 })
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  const deviceName = (body.deviceName || '').trim().slice(0, 100) || null

  const saved = await prisma.passkeyCredential.create({
    data: {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      deviceName,
      userType: target.userType,
      userId: target.userId,
    },
  })

  await recordAccessLog({
    userType: sessionUser.role || target.userType,
    userId: sessionUser.id || target.userId,
    userName: sessionUser.name || undefined,
    memberId: sessionUser.memberId || undefined,
    action: 'passkey-register',
    req,
  })

  return NextResponse.json({ ok: true, id: saved.id })
}
