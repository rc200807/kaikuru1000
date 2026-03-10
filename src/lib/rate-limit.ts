/**
 * ログイン試行回数制限（DB実装）
 * - サーバーレス・マルチインスタンス環境に対応（PostgreSQL で状態を共有）
 * - 15分以内に5回失敗すると 15分間ブロック
 */

import { prisma } from './prisma'

const MAX_FAILURES = 5              // 最大失敗回数
const WINDOW_MS    = 15 * 60 * 1000 // 失敗カウント集計ウィンドウ: 15分
const BLOCK_MS     = 15 * 60 * 1000 // ブロック時間: 15分

/**
 * ブロック中かどうかを確認
 */
export async function isLoginBlocked(key: string): Promise<{
  blocked: boolean
  remainingMs?: number
}> {
  const now = new Date()
  const record = await prisma.loginAttempt.findUnique({ where: { key } })
  if (!record?.blockedUntil) return { blocked: false }

  if (now < record.blockedUntil) {
    return { blocked: true, remainingMs: record.blockedUntil.getTime() - now.getTime() }
  }

  // ブロック期間が過ぎたのでリセット
  await prisma.loginAttempt.delete({ where: { key } }).catch(() => {})
  return { blocked: false }
}

/**
 * ログイン失敗を記録する（MAX_FAILURES 到達でブロック）
 */
export async function recordLoginFailure(key: string): Promise<void> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - WINDOW_MS)

  const existing = await prisma.loginAttempt.findUnique({ where: { key } })

  if (!existing || existing.firstFailAt < windowStart) {
    // 新規 or ウィンドウ期間外 → リセットして1回目として記録
    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, failCount: 1, firstFailAt: now },
      update: { failCount: 1, firstFailAt: now, blockedUntil: null },
    })
    return
  }

  const newCount = existing.failCount + 1
  const blockedUntil = newCount >= MAX_FAILURES
    ? new Date(now.getTime() + BLOCK_MS)
    : null

  await prisma.loginAttempt.update({
    where: { key },
    data: { failCount: newCount, blockedUntil },
  })
}

/**
 * ログイン成功時にカウンターをリセット
 */
export async function resetLoginFailures(key: string): Promise<void> {
  await prisma.loginAttempt.delete({ where: { key } }).catch(() => {})
}

/**
 * 残り失敗可能回数を返す（UX 用）
 */
export async function getRemainingAttempts(key: string): Promise<number> {
  const record = await prisma.loginAttempt.findUnique({ where: { key } })
  if (!record) return MAX_FAILURES
  return Math.max(0, MAX_FAILURES - record.failCount)
}
