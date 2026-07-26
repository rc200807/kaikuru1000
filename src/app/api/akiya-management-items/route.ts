import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DEFAULT_AKIYA_MANAGEMENT_ITEMS } from '@/lib/akiya-items'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 空き家管理項目マスタの一覧（店舗・管理者共用。記録フォームの項目リストに使う）。
 * マスタが空なら既定11項目を遅延シードする（本番へのシードスクリプト実行を不要にする）。
 * ?activeOnly=1 で有効な項目のみ。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || (sessionUser.role !== 'store' && !ADMIN_ROLES.includes(sessionUser.role))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const count = await prisma.akiyaManagementItem.count()
  if (count === 0) {
    await prisma.akiyaManagementItem.createMany({
      data: DEFAULT_AKIYA_MANAGEMENT_ITEMS.map((name, i) => ({ name, sortOrder: i })),
    })
  }

  const activeOnly = new URL(request.url).searchParams.get('activeOnly') === '1'
  const items = await prisma.akiyaManagementItem.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true, isActive: true },
  })
  return NextResponse.json(items)
}
