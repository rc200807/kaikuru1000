/**
 * LINE 自動配信シナリオのコアロジック
 * - enroll 時に全ステップの送信予定を LineMessageQueue へ事前投入する（EmailQueue と同じ消化モデル）
 * - cron /api/cron/process-line-queue が2分毎にキューを消化する
 * - keyword シナリオはキューを通さず webhook 内で即時応答する
 */

import { prisma } from '@/lib/prisma'
import { getDecryptedAccessToken, sendPushMessage } from '@/lib/line'
import { TOKYO_TZ } from '@/lib/datetime'
import type { LineScenario, LineScenarioStep, LineUser } from '@prisma/client'

const MAX_ATTEMPTS = 3

/* ─── プレースホルダ ─────────────────────────────── */

type PlaceholderContext = {
  name: string | null      // 顧客名（未紐付けなら LINE 表示名）
  storeName: string | null
}

/** {name} {storeName} を展開する */
export function expandPlaceholders(content: string, ctx: PlaceholderContext): string {
  return content
    .replaceAll('{name}', ctx.name || 'お客')
    .replaceAll('{storeName}', ctx.storeName || '担当店舗')
}

async function buildPlaceholderContext(lineUserId: string): Promise<PlaceholderContext> {
  const lineUser = await prisma.lineUser.findUnique({
    where: { id: lineUserId },
    include: {
      user: { select: { name: true } },
      store: { select: { name: true } },
    },
  })
  return {
    name: lineUser?.user?.name ?? lineUser?.displayName ?? null,
    storeName: lineUser?.store?.name ?? null,
  }
}

/* ─── 配信予定時刻の計算 ─────────────────────────── */

/** 指定日時の JST 時刻（時）を取得する */
function jstHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TOKYO_TZ, hour: 'numeric', hour12: false }).format(date)
  ) % 24
}

/**
 * トリガー時刻 + delayMinutes を基準に、sendHour 指定があれば JST のその時刻へ丸める。
 * 丸め先が基準時刻より過去になる場合は翌日の同時刻にする（深夜配信防止）。
 * JST は DST がないため固定オフセット(+9h)で日付境界を計算できる。
 */
export function computeScheduledAt(base: Date, delayMinutes: number, sendHour: number | null | undefined): Date {
  const target = new Date(base.getTime() + delayMinutes * 60 * 1000)
  if (sendHour == null) return target

  const hour = Math.min(23, Math.max(0, sendHour))
  // JST に変換して「その日の sendHour:00 JST」を求める
  const jstMs = target.getTime() + 9 * 60 * 60 * 1000
  const jstDayStartMs = Math.floor(jstMs / 86_400_000) * 86_400_000
  let scheduled = new Date(jstDayStartMs + hour * 60 * 60 * 1000 - 9 * 60 * 60 * 1000)
  if (scheduled.getTime() < target.getTime()) {
    scheduled = new Date(scheduled.getTime() + 86_400_000)
  }
  return scheduled
}

/* ─── enroll / cancel ────────────────────────────── */

/**
 * LineUser をシナリオに登録し、全ステップを送信キューへ事前投入する。
 * 既に登録済み（@@unique）の場合は何もしない（二重配信防止）。
 */
export async function enrollLineUser(
  scenario: LineScenario & { steps: LineScenarioStep[] },
  lineUserId: string,
  baseTime: Date = new Date(),
): Promise<boolean> {
  // 二重登録チェック（cancelled 済みも再登録しない = 一度配信された相手には再配信しない）
  const existing = await prisma.lineScenarioEnrollment.findUnique({
    where: { scenarioId_lineUserId: { scenarioId: scenario.id, lineUserId } },
  })
  if (existing) return false

  const ctx = await buildPlaceholderContext(lineUserId)

  const enrollment = await prisma.lineScenarioEnrollment.create({
    data: { scenarioId: scenario.id, lineUserId },
  })

  const steps = [...scenario.steps].sort((a, b) => a.order - b.order)
  if (steps.length > 0) {
    await prisma.lineMessageQueue.createMany({
      data: steps.map((step) => ({
        lineUserId,
        lineChannelId: scenario.lineChannelId,
        scenarioStepId: step.id,
        enrollmentId: enrollment.id,
        content: expandPlaceholders(step.content, ctx),
        scheduledAt: computeScheduledAt(baseTime, step.delayMinutes, step.sendHour),
      })),
    })
  }
  return true
}

/**
 * トリガー発火時に該当シナリオへ一括 enroll する。
 * 対象 = 同一チャネル・isActive・トリガー一致・（storeId 指定シナリオは LineUser の店舗割当が一致）
 */
export async function enrollByTrigger(
  triggerType: 'registration' | 'follow',
  lineUser: Pick<LineUser, 'id' | 'lineChannelId' | 'storeId'>,
): Promise<number> {
  const scenarios = await prisma.lineScenario.findMany({
    where: {
      lineChannelId: lineUser.lineChannelId,
      triggerType,
      isActive: true,
      OR: [{ storeId: null }, ...(lineUser.storeId ? [{ storeId: lineUser.storeId }] : [])],
    },
    include: { steps: true },
  })

  let enrolled = 0
  for (const scenario of scenarios) {
    try {
      if (await enrollLineUser(scenario, lineUser.id)) enrolled++
    } catch (e) {
      console.error(`[line-scenario] enroll failed (scenario=${scenario.id}, lineUser=${lineUser.id})`, e)
    }
  }
  return enrolled
}

/**
 * LineUser の未送信キューと enrollment をキャンセルする（unfollow 時）
 */
export async function cancelScenariosForLineUser(lineUserId: string): Promise<void> {
  await prisma.lineMessageQueue.updateMany({
    where: { lineUserId, status: { in: ['pending', 'failed'] } },
    data: { status: 'cancelled' },
  })
  await prisma.lineScenarioEnrollment.updateMany({
    where: { lineUserId, status: 'active' },
    data: { status: 'cancelled' },
  })
}

/* ─── keyword 応答（webhook から即時実行） ───────── */

/**
 * 受信テキストにマッチする keyword シナリオを探し、最初のステップ本文を即時返信する。
 * 複数マッチ時は最初の1件のみ（連投防止）。
 */
export async function handleKeywordReply(
  lineUser: Pick<LineUser, 'id' | 'lineChannelId' | 'storeId'>,
  text: string,
): Promise<boolean> {
  const scenarios = await prisma.lineScenario.findMany({
    where: {
      lineChannelId: lineUser.lineChannelId,
      triggerType: 'keyword',
      isActive: true,
      keyword: { not: null },
      OR: [{ storeId: null }, ...(lineUser.storeId ? [{ storeId: lineUser.storeId }] : [])],
    },
    include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
  })

  const matched = scenarios.find((s) => s.keyword && text.includes(s.keyword) && s.steps.length > 0)
  if (!matched) return false

  const ctx = await buildPlaceholderContext(lineUser.id)
  const content = expandPlaceholders(matched.steps[0].content, ctx)

  // 即時 push + トーク履歴へ保存（送信失敗は握り潰し — webhook 応答を止めない）
  try {
    const channel = await prisma.lineChannel.findUnique({ where: { id: lineUser.lineChannelId } })
    const fullLineUser = await prisma.lineUser.findUnique({ where: { id: lineUser.id } })
    if (!channel || !channel.isActive || !fullLineUser) return false

    await sendPushMessage(getDecryptedAccessToken(channel), fullLineUser.lineUserId, content)
    await prisma.lineMessage.create({
      data: {
        lineUserId: lineUser.id,
        lineChannelId: lineUser.lineChannelId,
        direction: 'outbound',
        messageType: 'text',
        content,
        status: 'sent',
        sentAt: new Date(),
      },
    })
    return true
  } catch (e) {
    console.error('[line-scenario] keyword reply failed', e)
    return false
  }
}

/* ─── キュー消化（cron から実行） ────────────────── */

export async function processLineQueue(batchSize = 20): Promise<{
  processed: number
  sent: number
  failed: number
  retried: number
  skipped: number
}> {
  const now = new Date()

  const targets = await prisma.lineMessageQueue.findMany({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'failed', attempts: { lt: MAX_ATTEMPTS } },
      ],
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: batchSize,
    include: {
      lineUser: { include: { lineChannel: true } },
    },
  })

  let sent = 0
  let failed = 0
  let retried = 0
  let skipped = 0

  for (const job of targets) {
    // ブロック済み・チャネル無効はキャンセル（送っても届かない/エラーになる）
    if (!job.lineUser.isFollowing || !job.lineUser.lineChannel.isActive) {
      await prisma.lineMessageQueue.update({
        where: { id: job.id },
        data: { status: 'cancelled' },
      })
      skipped++
      continue
    }

    await prisma.lineMessageQueue.update({
      where: { id: job.id },
      data: { status: 'processing', attempts: job.attempts + 1 },
    })

    try {
      const accessToken = getDecryptedAccessToken(job.lineUser.lineChannel)
      await sendPushMessage(accessToken, job.lineUser.lineUserId, job.content)

      // トーク履歴へ保存（トーク画面に自動配信も表示される）
      await prisma.lineMessage.create({
        data: {
          lineUserId: job.lineUserId,
          lineChannelId: job.lineChannelId,
          direction: 'outbound',
          messageType: 'text',
          content: job.content,
          status: 'sent',
          sentAt: new Date(),
        },
      })

      await prisma.lineMessageQueue.update({
        where: { id: job.id },
        data: { status: 'sent', sentAt: new Date(), lastError: null },
      })
      sent++
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err)
      const newAttempts = job.attempts + 1
      const willRetry = newAttempts < MAX_ATTEMPTS

      await prisma.lineMessageQueue.update({
        where: { id: job.id },
        data: {
          status: willRetry ? 'pending' : 'failed',
          lastError: errorMsg,
          // 失敗時は5分後に再試行
          scheduledAt: willRetry ? new Date(now.getTime() + 5 * 60 * 1000) : job.scheduledAt,
        },
      })

      if (willRetry) retried++
      else failed++

      console.error(`[line-queue] Job ${job.id} failed (attempt ${newAttempts}/${MAX_ATTEMPTS}):`, errorMsg)
    }
  }

  // 全ステップ送信済みの enrollment を completed にする
  const activeEnrollments = await prisma.lineScenarioEnrollment.findMany({
    where: { status: 'active' },
    select: { id: true },
  })
  if (activeEnrollments.length > 0) {
    const stillPending = await prisma.lineMessageQueue.groupBy({
      by: ['enrollmentId'],
      where: {
        enrollmentId: { in: activeEnrollments.map((e) => e.id) },
        status: { in: ['pending', 'processing', 'failed'] },
      },
    })
    const pendingSet = new Set(stillPending.map((p) => p.enrollmentId))
    const completedIds = activeEnrollments.filter((e) => !pendingSet.has(e.id)).map((e) => e.id)
    if (completedIds.length > 0) {
      await prisma.lineScenarioEnrollment.updateMany({
        where: { id: { in: completedIds } },
        data: { status: 'completed' },
      })
    }
  }

  return { processed: targets.length, sent, failed, retried, skipped }
}
