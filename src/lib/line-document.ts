/**
 * 売買契約書・見積書のLINE送付
 * - LINE Messaging API はPDFファイルを直接送れないため、マジックリンク（72時間・使い捨て）を
 *   テキストメッセージでトークへ送る（メール送付と同じ閲覧基盤 /magic/[token] を使用）
 * - 店舗画面の「LINEへ送付」ボタンと、QR連携完了時の自動送付（/api/line/link/callback）の両方から使う
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendLineReply } from '@/lib/line-reply'

export type LineDocType = 'contract' | 'estimate'

export const LINE_DOC_LABELS: Record<LineDocType, string> = {
  contract: '売買契約書',
  estimate: 'お見積書',
}

/**
 * 顧客が既定チャネルに連携済みの LineUser を返す（未連携なら null）
 */
export async function findLinkedLineUser(userId: string) {
  const channel = await prisma.lineChannel.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  })
  if (!channel) return null
  return prisma.lineUser.findFirst({
    where: { userId, lineChannelId: channel.id },
    orderBy: { updatedAt: 'desc' },
  })
}

export type SendDocumentResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

/**
 * 指定訪問の契約書/見積書の閲覧リンクを LINE トークへ送付し、lineSentAt を記録する
 * @param lineUserDbId LineUser の内部ID（送付先）
 */
export async function sendDocumentViaLine(
  visitScheduleId: string,
  docType: LineDocType,
  lineUserDbId: string,
): Promise<SendDocumentResult> {
  const schedule = await prisma.visitSchedule.findUnique({
    where: { id: visitScheduleId },
    select: {
      id: true,
      dealId: true,
      user: { select: { id: true, name: true } },
      store: { select: { name: true } },
    },
  })
  if (!schedule) {
    return { ok: false, status: 404, error: 'スケジュールが見つかりません' }
  }

  // 書類は「案件」を正とする（再ペアレント後）— 契約提出APIと同じ解決
  const docWhere = schedule.dealId
    ? { dealId: schedule.dealId }
    : { visitScheduleId: schedule.id }

  const doc = docType === 'contract'
    ? await prisma.salesContract.findFirst({ where: docWhere, select: { id: true } })
    : await prisma.estimate.findFirst({ where: docWhere, select: { id: true } })
  if (!doc) {
    return { ok: false, status: 404, error: `${LINE_DOC_LABELS[docType]}がまだ作成されていません` }
  }

  // マジックリンク生成（メール送付と同条件: 72時間・使い捨て）
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.magicLink.create({
    data: {
      token,
      userId: schedule.user.id,
      contractId: schedule.id, // 慣習: VisitSchedule.id を格納（既存の generate と同じ）
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  })
  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const url = docType === 'contract'
    ? `${baseUrl}/magic/${token}?setup=1`
    : `${baseUrl}/magic/${token}?doc=estimate`

  const label = LINE_DOC_LABELS[docType]
  const text = [
    `${schedule.user.name}様`,
    `${schedule.store.name}です。`,
    `${label}をお送りします。以下のリンクからご確認いただけます。`,
    '',
    url,
    '',
    '※リンクの有効期限は72時間・1回のみ開くことができます。',
    '開けなくなった場合は、このトークにご連絡ください。',
  ].join('\n')

  const result = await sendLineReply(lineUserDbId, text)
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error }
  }

  // 送付日時を記録（emailSentAt と対称）
  const sentAt = new Date()
  if (docType === 'contract') {
    await prisma.salesContract.updateMany({ where: docWhere, data: { lineSentAt: sentAt } })
  } else {
    await prisma.estimate.updateMany({ where: docWhere, data: { lineSentAt: sentAt } })
  }

  return { ok: true }
}
