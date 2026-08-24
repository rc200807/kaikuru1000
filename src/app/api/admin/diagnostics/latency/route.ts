import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'superadmin', 'hr', 'sysadmin']

/**
 * 遅さの内訳を数値で確認するための診断エンドポイント（管理者・システム管理者のみ）。
 *
 * 返すもの:
 *  - region: 関数が動いているVercelリージョン（ユーザーとの距離＝往復時間の下限を決める）
 *  - dbPing: 関数からDBへの往復時間。SELECT 1 を10回投げた最小/中央/最大
 *  - queries: 代表的なクエリの所要時間（インデックスの効き具合を見る）
 *
 * ブラウザ側の総時間（devtoolsのTTFB）から dbPing と queries を引いた残りが
 * 「ブラウザ↔関数の往復＋コールドスタート」。この切り分けができないと、
 * リージョン移設とDBチューニングのどちらに手を入れるべきか判断できない。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { role?: string } | undefined
  if (!session || !user?.role || !ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()

  // DB往復（1回目は接続確立を含むので捨てる）
  await prisma.$queryRaw`SELECT 1`.catch(() => null)
  const pings: number[] = []
  for (let i = 0; i < 10; i++) {
    const s = Date.now()
    await prisma.$queryRaw`SELECT 1`.catch(() => null)
    pings.push(Date.now() - s)
  }
  const sorted = [...pings].sort((a, b) => a - b)

  // 代表クエリ（実データ量での効き具合を見る）
  async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T | null }> {
    const s = Date.now()
    try {
      const value = await fn()
      return { ms: Date.now() - s, value }
    } catch {
      return { ms: Date.now() - s, value: null }
    }
  }

  const [userCount, visitCount, dealCount, customerPage, visitRange] = await Promise.all([
    timed(() => prisma.user.count()),
    timed(() => prisma.visitSchedule.count()),
    timed(() => prisma.deal.count()),
    // 顧客一覧1ページ相当（storeId で絞って名前順）
    timed(async () => {
      const store = await prisma.store.findFirst({ select: { id: true } })
      if (!store) return 0
      const rows = await prisma.user.findMany({
        where: { storeId: store.id, mergedIntoUserId: null },
        select: { id: true },
        orderBy: { name: 'asc' },
        take: 50,
      })
      return rows.length
    }),
    // 直近30日の訪問予定（日付範囲スキャン）
    timed(async () => {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      return prisma.visitSchedule.count({ where: { visitDate: { gte: from } } })
    }),
  ])

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? 'local',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    nodeVersion: process.version,
    dbPingMs: { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], samples: pings },
    queries: {
      userCount: { ms: userCount.ms, rows: userCount.value },
      visitScheduleCount: { ms: visitCount.ms, rows: visitCount.value },
      dealCount: { ms: dealCount.ms, rows: dealCount.value },
      customerListPage: { ms: customerPage.ms, rows: customerPage.value },
      visitsLast30Days: { ms: visitRange.ms, rows: visitRange.value },
    },
    handlerTotalMs: Date.now() - started,
  })
}
