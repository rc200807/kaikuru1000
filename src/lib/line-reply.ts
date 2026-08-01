/**
 * LINE 返信の共通ロジック
 * - 管理ポータル（/api/admin/line/users/[id]/reply ほか）と店舗ポータル（/api/store/line/...）で共有する
 * - 先に DB へ status: 'sending' で保存 → Push 送信 → 成功で 'sent' / 失敗で 'failed' に更新（履歴は必ず残す）
 */

import { prisma } from '@/lib/prisma'
import { getDecryptedAccessToken, sendPushMessage } from '@/lib/line'
import type { LineMessage } from '@prisma/client'

export type SendLineReplyResult =
  | { ok: true; message: LineMessage }
  | { ok: false; status: number; error: string; message?: LineMessage }

/**
 * LineUser（DBの内部ID）にテキストを Push 送信し、送信履歴を保存する
 */
export async function sendLineReply(
  lineUserDbId: string,
  text: string
): Promise<SendLineReplyResult> {
  const lineUser = await prisma.lineUser.findUnique({
    where: { id: lineUserDbId },
    include: { lineChannel: true },
  })
  if (!lineUser) {
    return { ok: false, status: 404, error: 'User not found' }
  }
  if (!lineUser.lineChannel.isActive) {
    return { ok: false, status: 400, error: 'チャネルが無効です' }
  }

  // 先に DB へ保存（送信前に履歴を記録）
  const message = await prisma.lineMessage.create({
    data: {
      lineUserId: lineUserDbId,
      lineChannelId: lineUser.lineChannelId,
      direction: 'outbound',
      messageType: 'text',
      content: text,
      status: 'sending',
      sentAt: new Date(),
    },
  })

  const accessToken = getDecryptedAccessToken(lineUser.lineChannel)
  try {
    await sendPushMessage(accessToken, lineUser.lineUserId, text)
    const updated = await prisma.lineMessage.update({
      where: { id: message.id },
      data: { status: 'sent' },
    })
    return { ok: true, message: updated }
  } catch (err: any) {
    console.error('[LINE Reply] Push message failed:', err?.message)
    const updated = await prisma.lineMessage.update({
      where: { id: message.id },
      data: { status: 'failed' },
    })
    return {
      ok: false,
      status: 502,
      error: `LINE送信に失敗しました: ${err?.message ?? '不明なエラー'}`,
      message: updated,
    }
  }
}
