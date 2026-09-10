import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveStoreScope } from '@/lib/store-scope'
import { createTimer } from '@/lib/api-timing'

/**
 * 店舗の買取品目一覧。
 *
 * 対象は「案件（Deal.storeId）または旧来の訪問（VisitSchedule.storeId）が
 * スコープ内の店舗に属する品目」。案件直下に登録された品目は visitScheduleId が null なので、
 * 訪問側だけを見ると一覧から丸ごと漏れる（purchase-item-access.ts の注意書きと同じ罠）。
 *
 * 運営者配下の複数店舗を表示中は、その全店舗ぶんを返す（表示のみ。書き込みは自店舗だけ）。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sessionStoreId = user.id as string
  const { searchParams } = new URL(request.url)
  const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '300', 10)))
  const t = createTimer()
  const scope = await t.measure('scope', () => resolveStoreScope(sessionStoreId, searchParams.get('storeIds')))
  const storeFilter = scope.isMulti ? { in: scope.storeIds } : sessionStoreId

  const storeSelect = { select: { id: true, name: true, code: true } } as const

  const items = await t.measure('list', () => prisma.purchaseItem.findMany({
    where: {
      OR: [
        { deal: { storeId: storeFilter } },
        { visitSchedule: { storeId: storeFilter } },
      ],
    },
    // include ではなく select。include だと rakutenData（楽天商品検索APIの生JSON）・
    // aiResearch・notes（いずれも @db.Text）まで最大1000件ぶん返してしまう。
    // 下のマッパーが使うのはこれだけ。
    select: {
      id: true, itemName: true, category: true, quantity: true, purchasePrice: true,
      janCode: true, imageUrls: true, createdAt: true,
      deal: {
        select: {
          id: true,
          storeId: true,
          store: storeSelect,
          user: { select: { id: true, name: true } },
        },
      },
      visitSchedule: {
        select: {
          id: true,
          visitDate: true,
          status: true,
          storeId: true,
          store: storeSelect,
          user: { select: { id: true, name: true } },
        },
      },
      inventoryItem: { select: { id: true } }, // 在庫化済みか判定用
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  }))

  const mapped = items.map((it) => {
    let imageCount = 0
    try {
      const arr = JSON.parse(it.imageUrls || '[]')
      if (Array.isArray(arr)) imageCount = arr.length
    } catch {
      /* ignore */
    }
    // 帰属店舗は案件側が正。旧データ（案件未紐付け）は訪問側で補う
    const store = it.deal?.store ?? it.visitSchedule?.store ?? null
    return {
      id: it.id,
      itemName: it.itemName,
      category: it.category,
      quantity: it.quantity,
      purchasePrice: it.purchasePrice,
      janCode: it.janCode,
      createdAt: it.createdAt,
      // 画像は認証付きプロキシ経由で配信（外部Blob URLは直接返さない）
      images: Array.from({ length: imageCount }, (_, idx) => `/api/purchase-items/${it.id}/images/${idx}`),
      visitSchedule: it.visitSchedule,
      // 案件直下の品目は visitSchedule が無いので、顧客名・案件導線はこちらから取る
      deal: it.deal ? { id: it.deal.id, user: it.deal.user } : null,
      storeId: store?.id ?? null,
      store,
      convertedInventoryId: it.inventoryItem?.id ?? null, // 在庫化済みなら在庫ID
    }
  })

  return t.json({ items: mapped })
}
