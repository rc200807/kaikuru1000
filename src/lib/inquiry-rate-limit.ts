/**
 * 問い合わせフォーム用レート制限（DB実装）
 * - サーバーレス環境に対応（PostgreSQL で状態を共有）
 * - IPアドレス：5分間に3件まで
 * - メールアドレス：1時間に5件まで
 */

import { prisma } from './prisma'

type RateLimitConfig = {
  max: number       // 最大回数
  windowMs: number  // ウィンドウ期間（ミリ秒）
  blockMs: number   // ブロック期間（超過時、ミリ秒）
}

const INQUIRY_IP_LIMIT: RateLimitConfig = {
  max: 3,
  windowMs: 5 * 60 * 1000,    // 5分
  blockMs: 30 * 60 * 1000,    // 30分ブロック
}

const INQUIRY_EMAIL_LIMIT: RateLimitConfig = {
  max: 5,
  windowMs: 60 * 60 * 1000,   // 1時間
  blockMs: 60 * 60 * 1000,    // 1時間ブロック
}

/**
 * レート制限チェック＋カウントアップ（成功すれば1カウント、ブロック中は false）
 */
async function checkAndRecord(key: string, config: RateLimitConfig): Promise<{
  allowed: boolean
  remainingMs?: number
}> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMs)

  const existing = await prisma.rateLimit.findUnique({ where: { key } })

  // ブロック中？
  if (existing?.blockedUntil && now < existing.blockedUntil) {
    return { allowed: false, remainingMs: existing.blockedUntil.getTime() - now.getTime() }
  }

  // ブロック期間切れ or 初回
  if (!existing || existing.windowStart < windowStart) {
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now, blockedUntil: null },
    })
    return { allowed: true }
  }

  const newCount = existing.count + 1

  if (newCount > config.max) {
    // 上限超過 → ブロック
    const blockedUntil = new Date(now.getTime() + config.blockMs)
    await prisma.rateLimit.update({
      where: { key },
      data: { count: newCount, blockedUntil },
    })
    return { allowed: false, remainingMs: config.blockMs }
  }

  await prisma.rateLimit.update({
    where: { key },
    data: { count: newCount },
  })
  return { allowed: true }
}

/**
 * 問い合わせフォームのレート制限チェック
 * IP・メール両方をチェックし、いずれかが上限を超えていたら拒否
 */
export async function checkInquiryRateLimit(params: {
  ip: string
  email?: string | null
}): Promise<{ allowed: boolean; reason?: string; remainingMs?: number }> {
  // IP制限
  const ipResult = await checkAndRecord(`inquiry:ip:${params.ip}`, INQUIRY_IP_LIMIT)
  if (!ipResult.allowed) {
    return {
      allowed: false,
      reason: '短時間に多くのリクエストが送信されました。しばらくしてからもう一度お試しください。',
      remainingMs: ipResult.remainingMs,
    }
  }

  // メール制限（あれば）
  if (params.email) {
    const emailResult = await checkAndRecord(
      `inquiry:email:${params.email.toLowerCase()}`,
      INQUIRY_EMAIL_LIMIT
    )
    if (!emailResult.allowed) {
      return {
        allowed: false,
        reason: 'このメールアドレスからの送信が多すぎます。しばらくしてからもう一度お試しください。',
        remainingMs: emailResult.remainingMs,
      }
    }
  }

  return { allowed: true }
}

/**
 * クライアントIPアドレス取得（Vercel/Next.js対応）
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  )
}
