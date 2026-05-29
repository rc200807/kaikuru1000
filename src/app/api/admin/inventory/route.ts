import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, canViewInventory } from '@/lib/admin-auth'

// 管理ポータルからは備品カタログの閲覧（発注用）のみ可能。
// 備品の登録・編集はシステム管理者画面（/api/sysadmin/inventory）へ移行済み。
export async function GET() {
  const user = await requireAdmin()
  if (!user || !canViewInventory(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const products = await prisma.product.findMany({
    include: { variants: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(products)
}
