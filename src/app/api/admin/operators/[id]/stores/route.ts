import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncStoresForOperator } from '@/lib/operator-store-sync'
import { autoSyncOperatorRows, autoSyncStoreRows } from '@/lib/sheet-sync'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

/**
 * 運営者に紐付ける店舗を一括更新
 * body: { storeIds: string[] }
 * - 旧紐付け店舗のうち新リストに無いものは operatorId=null
 * - 新リストの店舗を operatorId=this 設定（既に他運営者に紐付いていても上書き）
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const operator = await prisma.operator.findUnique({ where: { id }, select: { id: true } })
  if (!operator) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.storeIds)) {
    return NextResponse.json({ error: 'storeIds 配列が必要です' }, { status: 400 })
  }
  const storeIds: string[] = body.storeIds.filter((v: unknown): v is string => typeof v === 'string')

  // 入力された店舗IDが実在することを検証
  if (storeIds.length > 0) {
    const existing = await prisma.store.count({ where: { id: { in: storeIds } } })
    if (existing !== storeIds.length) {
      return NextResponse.json({ error: '存在しない店舗IDが含まれています' }, { status: 400 })
    }
  }

  // 紐付けを外される店舗も「運営者名」列が変わるため、更新前に控える
  const previousStores = await prisma.store.findMany({
    where: { operatorId: id },
    select: { code: true },
  })

  await prisma.$transaction([
    // 旧紐付けのうち、新リストに含まれない店舗を null に
    prisma.store.updateMany({
      where: { operatorId: id, id: { notIn: storeIds } },
      data: { operatorId: null },
    }),
    // 新リストの店舗を this operator に紐付け
    ...(storeIds.length > 0
      ? [prisma.store.updateMany({
          where: { id: { in: storeIds } },
          data: { operatorId: id },
        })]
      : []),
  ])

  // 新たに紐づいた店舗へ運営者の継承項目（銀行口座/古物許可番号/インボイス番号）を反映
  await syncStoresForOperator(prisma, id)

  const stores = await prisma.store.findMany({
    where: { operatorId: id },
    select: { id: true, name: true, code: true },
    orderBy: { code: 'asc' },
  })

  after(async () => {
    // 外された店舗と新たに紐づいた店舗の両方を反映。運営者側も店舗数が変わる
    await autoSyncStoreRows([...previousStores.map(s => s.code), ...stores.map(s => s.code)])
    await autoSyncOperatorRows([id])
  })

  return NextResponse.json({ stores })
}
