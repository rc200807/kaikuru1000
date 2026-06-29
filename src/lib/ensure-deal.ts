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
  {
    userId,
    storeId,
    dealId,
    createdBy,
  }: {
    userId: string
    storeId: string
    dealId?: string | null
    createdBy?: { type?: string | null; id?: string | null; name?: string | null }
  },
): Promise<string> {
  if (dealId) return dealId
  const deal = await client.deal.create({
    data: {
      userId,
      storeId,
      status: 'inquiry',
      detail: null,
      createdByType: createdBy?.type ?? null,
      createdById: createdBy?.id ?? null,
      createdByName: createdBy?.name ?? null,
    },
  })
  return deal.id
}
