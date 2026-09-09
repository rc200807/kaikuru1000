/**
 * メール送信キュー
 * - APIリクエスト中にSMTP送信を待機しない（fire-and-forget回避）
 * - cronで定期的にバッチ送信し、SMTPレート制限・タイムアウト対策
 * - 失敗時は最大3回までリトライ
 */

import { prisma } from './prisma'
import {
  sendInquiryAutoReply,
  sendStoreInquiryNotification,
  sendBugReportNotification,
  sendContractEmail,
  sendContractCreatedNotification,
  sendVisitRequestReceivedToCustomer,
  sendVisitRequestReceivedToStore,
  sendVisitConfirmedToCustomer,
  sendVisitConfirmedToStore,
} from './mailer'

const MAX_ATTEMPTS = 3

/**
 * 売買契約書メールの payload。
 * PDFは数MBになるためキューには載せず、送信時に SalesContract から読み直す
 * （キュー行が肥大化するのを避ける）。
 */
type ContractEmailParams =
  Omit<Parameters<typeof sendContractEmail>[0], 'pdfBase64' | 'invoicePdfBase64'> & { contractId: string }

/**
 * 店舗への契約作成通知の payload。
 * こちらも PDF はキューに載せず、送信時に SalesContract から読み直して添付する。
 */
type ContractCreatedNotificationParams =
  Omit<Parameters<typeof sendContractCreatedNotification>[0], 'pdfBase64' | 'invoicePdfBase64'> & { contractId?: string }

type QueueablePayload =
  | { type: 'inquiryAutoReply'; params: Parameters<typeof sendInquiryAutoReply>[0] }
  | { type: 'storeInquiryNotification'; params: Parameters<typeof sendStoreInquiryNotification>[0] }
  | { type: 'bugReportNotification'; params: Parameters<typeof sendBugReportNotification>[0] }
  | { type: 'contractEmail'; params: ContractEmailParams }
  | { type: 'contractCreatedNotification'; params: ContractCreatedNotificationParams }
  | { type: 'visitRequestReceivedCustomer'; params: Parameters<typeof sendVisitRequestReceivedToCustomer>[0] }
  | { type: 'visitRequestReceivedStore'; params: Parameters<typeof sendVisitRequestReceivedToStore>[0] }
  | { type: 'visitConfirmedCustomer'; params: Parameters<typeof sendVisitConfirmedToCustomer>[0] }
  | { type: 'visitConfirmedStore'; params: Parameters<typeof sendVisitConfirmedToStore>[0] }

/** メールをキューに登録（非同期） */
export async function enqueueEmail(payload: QueueablePayload): Promise<void> {
  await prisma.emailQueue.create({
    data: {
      type: payload.type,
      payload: JSON.stringify(payload.params),
      status: 'pending',
    },
  })
}

/** JSON 化で string になった候補日を Date に戻す */
function reviveCandidates(params: any) {
  if (Array.isArray(params?.candidates)) {
    for (const c of params.candidates) {
      if (typeof c.date === 'string') c.date = new Date(c.date)
    }
  }
}

/** JSON 化で string になった訪問日を Date に戻す */
function reviveVisitDate(params: any) {
  if (typeof params?.visitDate === 'string') params.visitDate = new Date(params.visitDate)
}

/** メールを直接送信（キューを通さず即時実行） */
async function sendImmediately(type: string, params: any): Promise<boolean> {
  switch (type) {
    case 'inquiryAutoReply':
      await sendInquiryAutoReply(params)
      return true
    case 'storeInquiryNotification':
      // ⚠️ JSON.stringify で Date が string になるため、復元する必要がある
      if (params.receivedAt && typeof params.receivedAt === 'string') {
        params.receivedAt = new Date(params.receivedAt)
      }
      return await sendStoreInquiryNotification(params)
    case 'bugReportNotification':
      if (params.createdAt && typeof params.createdAt === 'string') {
        params.createdAt = new Date(params.createdAt)
      }
      return await sendBugReportNotification(params)
    case 'contractEmail': {
      const { contractId, ...rest } = params
      // PDFはキューに載せていないので保存済みの契約書から読み直す
      const saved = await prisma.salesContract.findUnique({
        where: { id: contractId },
        select: { pdfBase64: true, invoicePdfBase64: true },
      })
      const ok = await sendContractEmail({
        ...rest,
        visitDate: new Date(rest.visitDate),
        pdfBase64: saved?.pdfBase64 ?? '',
        invoicePdfBase64: saved?.invoicePdfBase64 ?? '',
      })
      // 送信できたときだけ契約書に送信日時を記録する
      if (ok) {
        await prisma.salesContract.update({
          where: { id: contractId },
          data: { emailSentAt: new Date() },
        }).catch(e => console.error('[email-queue] emailSentAt の記録に失敗:', e))
      }
      return ok
    }
    case 'contractCreatedNotification': {
      if (params.visitDate && typeof params.visitDate === 'string') {
        params.visitDate = new Date(params.visitDate)
      }
      // PDFはキューに載せていないので保存済みの契約書から読み直して添付する
      const { contractId, ...rest } = params
      const saved = contractId
        ? await prisma.salesContract.findUnique({
            where: { id: contractId },
            select: { pdfBase64: true, invoicePdfBase64: true },
          })
        : null
      return await sendContractCreatedNotification({
        ...rest,
        pdfBase64: saved?.pdfBase64 ?? null,
        invoicePdfBase64: saved?.invoicePdfBase64 ?? null,
      })
    }
    // 訪問リクエスト系。JSON.stringify で Date が string になるので必ず復元する
    case 'visitRequestReceivedCustomer':
      reviveCandidates(params)
      return await sendVisitRequestReceivedToCustomer(params)
    case 'visitRequestReceivedStore':
      reviveCandidates(params)
      return await sendVisitRequestReceivedToStore(params)
    case 'visitConfirmedCustomer':
      reviveVisitDate(params)
      return await sendVisitConfirmedToCustomer(params)
    case 'visitConfirmedStore':
      reviveVisitDate(params)
      return await sendVisitConfirmedToStore(params)
    default:
      throw new Error(`Unknown email type: ${type}`)
  }
}

/**
 * キューに溜まっているメールを処理する（cron用）
 * 1回の実行で最大 batchSize 件処理
 */
export async function processEmailQueue(batchSize = 20): Promise<{
  processed: number
  sent: number
  failed: number
  retried: number
}> {
  const now = new Date()

  // 送信対象を取得（pending or 失敗だがリトライ可能なもの）
  const targets = await prisma.emailQueue.findMany({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'failed', attempts: { lt: MAX_ATTEMPTS } },
      ],
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: batchSize,
  })

  let sent = 0
  let failed = 0
  let retried = 0

  for (const job of targets) {
    // 処理中マーク
    await prisma.emailQueue.update({
      where: { id: job.id },
      data: { status: 'processing', attempts: job.attempts + 1 },
    })

    try {
      const params = JSON.parse(job.payload)
      await sendImmediately(job.type, params)

      await prisma.emailQueue.update({
        where: { id: job.id },
        data: { status: 'sent', sentAt: new Date(), lastError: null },
      })
      sent++
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err)
      const newAttempts = job.attempts + 1
      const willRetry = newAttempts < MAX_ATTEMPTS

      await prisma.emailQueue.update({
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

      console.error(`[email-queue] Job ${job.id} (${job.type}) failed (attempt ${newAttempts}/${MAX_ATTEMPTS}):`, errorMsg)
    }
  }

  return { processed: targets.length, sent, failed, retried }
}
