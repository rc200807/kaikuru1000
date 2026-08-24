/**
 * 案件番号の採番（DBアクセス側）。表記ルールは deal-number.ts。
 * Deal.dealNumber は @unique。衝突時は採番し直してリトライする。
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { buildDealNumber, dealNumberPrefix } from '@/lib/deal-number'

type Client = Prisma.TransactionClient | typeof prisma

/** その日の次の連番を組み立てる。同日の既存番号から最大値を取って +1 する */
export async function generateDealNumber(client: Client, baseDate: Date): Promise<string> {
  const prefix = dealNumberPrefix(baseDate)
  const sameDay = await client.deal.findMany({
    where: { dealNumber: { startsWith: prefix } },
    select: { dealNumber: true },
  })
  // 連番が4桁に伸びると文字列順では比較できないため、数値化して最大値を取る
  let max = 0
  for (const row of sameDay) {
    const seq = Number(row.dealNumber?.slice(prefix.length))
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return buildDealNumber(prefix, max + 1)
}

/** dealNumber の一意制約違反か */
function isDealNumberConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    JSON.stringify((e.meta as any)?.target ?? '').includes('dealNumber')
  )
}

/**
 * 案件番号を採番して案件を作成する。
 * 番号は「案件発生日（data.occurredAt があればその日、無ければ現在）」を基準にする。
 * 注意: トランザクション内では使わないこと（衝突時のリトライでトランザクションが壊れる）。
 *       トランザクション内の作成は番号なしで作り、あとから ensureDealNumber で採番する。
 */
export async function createDealWithNumber<A extends Prisma.DealCreateArgs>(
  args: A,
): Promise<Prisma.DealGetPayload<A>> {
  const occurredAt = (args.data as { occurredAt?: Date | string | null }).occurredAt
  const baseDate = occurredAt ? new Date(occurredAt) : new Date()
  const base = isNaN(baseDate.getTime()) ? new Date() : baseDate

  for (let attempt = 0; attempt < 5; attempt++) {
    const dealNumber = await generateDealNumber(prisma, base)
    try {
      return (await prisma.deal.create({
        ...args,
        data: { ...args.data, dealNumber },
      })) as Prisma.DealGetPayload<A>
    } catch (e) {
      if (isDealNumberConflict(e)) continue // 同時作成で衝突 → 採番し直す
      throw e
    }
  }
  // 稀な連続衝突時は番号なしで作成し、後続の ensureDealNumber に任せる（作成自体は失敗させない）
  console.error('[dealNumber] 採番が連続で衝突したため番号なしで作成しました')
  return (await prisma.deal.create(args)) as Prisma.DealGetPayload<A>
}

/**
 * 未採番の案件に番号を付ける（冪等）。既に番号があれば何もしない。
 * トランザクション外から呼ぶこと。失敗しても呼び出し元の処理は止めない。
 */
export async function ensureDealNumber(dealId: string): Promise<string | null> {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { dealNumber: true, occurredAt: true, createdAt: true },
    })
    if (!deal) return null
    if (deal.dealNumber) return deal.dealNumber

    const base = deal.occurredAt ?? deal.createdAt
    for (let attempt = 0; attempt < 5; attempt++) {
      const dealNumber = await generateDealNumber(prisma, base)
      try {
        // 同時実行で既に採番されていたら 0件更新になる（その場合は既存値を返す）
        const res = await prisma.deal.updateMany({
          where: { id: dealId, dealNumber: null },
          data: { dealNumber },
        })
        if (res.count === 0) {
          const again = await prisma.deal.findUnique({ where: { id: dealId }, select: { dealNumber: true } })
          return again?.dealNumber ?? null
        }
        return dealNumber
      } catch (e) {
        if (isDealNumberConflict(e)) continue
        throw e
      }
    }
    return null
  } catch (e) {
    console.error('[dealNumber] 採番に失敗しました', e)
    return null
  }
}
