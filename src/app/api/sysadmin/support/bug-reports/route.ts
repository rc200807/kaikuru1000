// システム管理者向けの不具合報告閲覧API（読み取り専用）。対応は管理ポータル側で行う。
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const pageSize = 30
  const status = searchParams.get('status') || undefined
  const category = searchParams.get('category') || undefined

  const where = {
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  }

  const [byStatus, items, total] = await Promise.all([
    prisma.bugReport.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.bugReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, title: true, category: true, status: true, reporterName: true,
        createdAt: true, updatedAt: true,
        store: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.bugReport.count({ where }),
  ])

  return NextResponse.json({
    summary: { byStatus: byStatus.map(s => ({ status: s.status, count: s._count._all })) },
    items: items.map(b => ({
      id: b.id,
      title: b.title,
      category: b.category,
      status: b.status,
      reporterName: b.reporterName,
      storeName: b.store?.name ?? '—',
      commentCount: b._count.comments,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
