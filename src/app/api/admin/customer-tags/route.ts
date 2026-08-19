import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 使われている顧客タグの一覧（絞り込みの選択肢用）。
 * 件数はDB側の groupBy で数える（生行をJSに載せない）。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const groups = await prisma.customerTag.groupBy({
    by: ['label'],
    _count: { _all: true },
    orderBy: { label: 'asc' },
    take: 500,
  })

  return NextResponse.json({
    tags: groups.map(g => ({ label: g.label, count: g._count._all })),
  })
}
