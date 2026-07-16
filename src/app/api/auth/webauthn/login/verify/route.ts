/**
 * パスキーログイン検証 API
 * navigator.credentials.get() の結果を検証し、成功時にワンタイムログイントークンを返す。
 * クライアントはそのトークンで signIn('webauthn', { token }) を呼び NextAuth セッションを得る。
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { prisma } from '@/lib/prisma'
import { isLoginBlocked, recordLoginFailure, resetLoginFailures } from '@/lib/rate-limit'
import {
  getRpId,
  getExpectedOrigin,
  extractChallenge,
  consumeChallenge,
  issuePasskeyLoginToken,
  checkPortalAccess,
  type PasskeyPortal,
  type PasskeyUserType,
} from '@/lib/webauthn'

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || 'unknown'
}

const PORTALS: PasskeyPortal[] = ['admin', 'sysadmin', 'store']

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rateKey = `webauthn:${ip}`
  const { blocked, remainingMs } = await isLoginBlocked(rateKey)
  if (blocked) {
    const mins = Math.ceil((remainingMs ?? 0) / 60000)
    return NextResponse.json(
      { error: `試行回数が多すぎます。${mins}分後に再試行してください` },
      { status: 429 },
    )
  }

  let body: { portal?: string; response?: AuthenticationResponseJSON }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const portal = body.portal as PasskeyPortal
  const response = body.response
  if (!PORTALS.includes(portal) || !response?.id || !response?.response?.clientDataJSON) {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  // チャレンジのワンタイム消費（リプレイ防止）
  const challenge = extractChallenge(response.response.clientDataJSON)
  if (!challenge) {
    return NextResponse.json({ error: 'チャレンジが不正です' }, { status: 400 })
  }
  const consumed = await consumeChallenge(challenge, 'authentication')
  if (!consumed) {
    return NextResponse.json(
      { error: 'チャレンジが無効です。もう一度お試しください' },
      { status: 400 },
    )
  }

  // クレデンシャル特定
  const credential = await prisma.passkeyCredential.findUnique({
    where: { credentialId: response.id },
  })
  if (!credential) {
    await recordLoginFailure(rateKey)
    return NextResponse.json({ error: 'このパスキーは登録されていません' }, { status: 401 })
  }

  // ポータルとユーザー種別の整合チェック（既存ログインのロールフィルタと同一）
  const role = await checkPortalAccess(
    portal,
    credential.userType as PasskeyUserType,
    credential.userId,
  )
  if (!role) {
    await recordLoginFailure(rateKey)
    return NextResponse.json({ error: 'このポータルでは利用できないパスキーです' }, { status: 403 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: false,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports ? JSON.parse(credential.transports) : undefined,
      },
    })
  } catch (err: any) {
    console.error('[webauthn] authentication verify error:', err?.message ?? err)
    await recordLoginFailure(rateKey)
    return NextResponse.json({ error: 'パスキーの検証に失敗しました' }, { status: 401 })
  }

  if (!verification.verified) {
    await recordLoginFailure(rateKey)
    return NextResponse.json({ error: 'パスキーの検証に失敗しました' }, { status: 401 })
  }

  // 署名カウンタ更新（クローン検知）と最終利用日時
  await prisma.passkeyCredential.update({
    where: { id: credential.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  })

  await resetLoginFailures(rateKey)

  const loginToken = await issuePasskeyLoginToken({
    userType: credential.userType as PasskeyUserType,
    userId: credential.userId,
    credentialId: credential.credentialId,
  })

  return NextResponse.json({ loginToken })
}
