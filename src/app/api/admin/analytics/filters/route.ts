import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// 分析画面の絞り込み選択肢（店舗・流入経路マスタ）
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [stores, leadSources] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.leadSource.findMany({ select: { name: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  return NextResponse.json({
    stores,
    leadSources: leadSources.map(l => l.name),
  })
}
