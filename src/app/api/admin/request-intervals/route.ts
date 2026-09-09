import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { fetchIntervalDefaults } from '@/lib/request-interval'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']
const MAX_MONTHS = 60

/** 訪問リクエスト・定期宅配の利用間隔（既定値）の取得 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await fetchIntervalDefaults())
}

/** 利用間隔（既定値）の更新。0 は無制限 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const data: { visitRequestIntervalMonths?: number; deliveryShipmentIntervalMonths?: number } = {}

  for (const key of ['visitRequestIntervalMonths', 'deliveryShipmentIntervalMonths'] as const) {
    const raw = body?.[key]
    if (raw === undefined) continue
    const n = Math.trunc(Number(raw))
    if (!Number.isFinite(n) || n < 0 || n > MAX_MONTHS) {
      return NextResponse.json({ error: `利用間隔は0〜${MAX_MONTHS}ヶ月で指定してください（0は無制限）` }, { status: 400 })
    }
    data[key] = n
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
  }

  const existing = await prisma.siteConfig.findFirst({ select: { id: true } })
  if (existing) await prisma.siteConfig.update({ where: { id: existing.id }, data })
  else await prisma.siteConfig.create({ data })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: '利用間隔の既定値を更新', req: request })
  return NextResponse.json(await fetchIntervalDefaults())
}
