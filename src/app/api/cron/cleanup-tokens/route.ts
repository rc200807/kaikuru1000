import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/cron/cleanup-tokens
 *
 * 期限切れの一時トークン類を削除
 * - PasswordResetToken: 期限切れ
 * - MagicLink: 期限切れ
 * - RateLimit: 24時間以上前の古いエントリ
 *
 * Vercel Cron Job で毎日実行を想定
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // 期限切れ PasswordResetToken
  const tokensDeleted = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: now } },
  })

  // 期限切れ MagicLink
  const magicLinksDeleted = await prisma.magicLink.deleteMany({
    where: { expiresAt: { lt: now } },
  })

  // 古い RateLimit エントリ（ブロックも切れたもの）
  const rateLimitsDeleted = await prisma.rateLimit.deleteMany({
    where: {
      windowStart: { lt: oneDayAgo },
      OR: [
        { blockedUntil: null },
        { blockedUntil: { lt: now } },
      ],
    },
  })

  // 古い LoginAttempt エントリ
  const loginAttemptsDeleted = await prisma.loginAttempt.deleteMany({
    where: {
      firstFailAt: { lt: oneDayAgo },
      OR: [
        { blockedUntil: null },
        { blockedUntil: { lt: now } },
      ],
    },
  })

  // 古い送信済みメールキュー（成功して30日以上経過）
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const emailQueueDeleted = await prisma.emailQueue.deleteMany({
    where: {
      status: 'sent',
      sentAt: { lt: thirtyDaysAgo },
    },
  })

  // 期限切れ WebAuthn チャレンジ・パスキーログイントークン
  const challengesDeleted = await prisma.webAuthnChallenge.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  const passkeyTokensDeleted = await prisma.passkeyLoginToken.deleteMany({
    where: { expiresAt: { lt: now } },
  })

  // 期限切れ LINE Login 連携トークン
  const lineLinkTokensDeleted = await prisma.lineLinkToken.deleteMany({
    where: { expiresAt: { lt: now } },
  })

  // 期限切れ・失効済みデバイスセッション（監査のため失効後30日は保持）
  const deviceSessionsDeleted = await prisma.deviceSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: thirtyDaysAgo } },
        { revokedAt: { lt: thirtyDaysAgo } },
      ],
    },
  })

  const result = {
    passwordResetTokens: tokensDeleted.count,
    magicLinks: magicLinksDeleted.count,
    rateLimits: rateLimitsDeleted.count,
    loginAttempts: loginAttemptsDeleted.count,
    sentEmails: emailQueueDeleted.count,
    webAuthnChallenges: challengesDeleted.count,
    passkeyLoginTokens: passkeyTokensDeleted.count,
    lineLinkTokens: lineLinkTokensDeleted.count,
    deviceSessions: deviceSessionsDeleted.count,
  }

  console.log('[cleanup-tokens] Deleted:', result)

  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  return POST(request)
}
