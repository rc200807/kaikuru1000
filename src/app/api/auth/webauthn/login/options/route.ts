/**
 * パスキーログイン オプション発行 API（未認証で呼ばれる）
 * discoverable credential 前提で allowCredentials は指定しない。
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { getRpId, saveChallenge } from '@/lib/webauthn'
import { isLoginBlocked } from '@/lib/rate-limit'

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  // IP単位のブロック確認（verify 失敗の積み上げでブロックされる）
  const ip = getClientIp(req)
  const { blocked, remainingMs } = await isLoginBlocked(`webauthn:${ip}`)
  if (blocked) {
    const mins = Math.ceil((remainingMs ?? 0) / 60000)
    return NextResponse.json(
      { error: `試行回数が多すぎます。${mins}分後に再試行してください` },
      { status: 429 },
    )
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    userVerification: 'preferred',
  })

  await saveChallenge({ challenge: options.challenge, type: 'authentication' })

  return NextResponse.json(options)
}
