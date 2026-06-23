import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type Client = Prisma.TransactionClient | typeof prisma

/**
 * 訪問スケジュールには必ず案件（Deal）が紐づく、という不変条件をアプリ層で保証するためのヘルパー。
 * 既存の dealId があればそのまま返し、無ければ案件を新規作成して案件IDを返す。
 * トランザクション内（visit-requests など）でも使えるよう client を受け取る。
 */
export async function ensureDealForVisit(
  client: Client,
  { userId, storeId, dealId }: { userId: string; storeId: string; dealId?: string | null },
): Promise<string> {
  if (dealId) return dealId
  const deal = await client.deal.create({
    data: { userId, storeId, status: 'inquiry', detail: null },
  })
  return deal.id
}
