import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type Client = Prisma.TransactionClient | typeof prisma

/**
 * 案件配下の買取品目・請求項目の合計を集計し、Deal.purchaseAmount / billingAmount を更新する。
 * 品目は案件(dealId)に紐づく（再ペアレント後の単一の真実）。
 */
export async function recomputeDealAmounts(client: Client, dealId: string) {
  const [purchaseItems, workItems] = await Promise.all([
    client.purchaseItem.findMany({ where: { dealId }, select: { purchasePrice: true, quantity: true } }),
    client.workItem.findMany({ where: { dealId }, select: { unitPrice: true, quantity: true } }),
  ])
  const purchaseAmount = purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const billingAmount = workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  await client.deal.update({ where: { id: dealId }, data: { purchaseAmount, billingAmount } })
  return { purchaseAmount, billingAmount }
}
