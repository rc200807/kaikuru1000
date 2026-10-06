import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { dealCategoryForCustomer } from '@/lib/deal-categories'

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
  // 案件番号は付けずに作成する。ここはトランザクション内から呼ばれるため、
  // 番号の一意制約で衝突するとトランザクション全体が壊れる。番号は案件を開いた時に
  // ensureDealNumber（deal-number.ts）が採番する。
  // 流入経路は顧客の流入経路を写す（案件詳細で後から変更できる）。カテゴリーは顧客の種別から決める
  const owner = await client.user.findUnique({
    where: { id: userId },
    select: { leadSource: true, customerType: true, customerTypes: true },
  })
  const deal = await client.deal.create({
    data: {
      userId,
      storeId,
      leadSource: owner?.leadSource || null,
      category: dealCategoryForCustomer(owner),
      status: 'inquiry',
      detail: null,
      createdByType: createdBy?.type ?? null,
      createdById: createdBy?.id ?? null,
      createdByName: createdBy?.name ?? null,
    },
  })
  return deal.id
}
