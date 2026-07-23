// システム管理者向けの問い合わせ閲覧API（読み取り専用）。
// 対応（ステータス変更・返信）は管理ポータル側で行う方針のため、書き込み系メソッドは実装しない。
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
  const inquiryType = searchParams.get('inquiryType') || undefined

  const where = {
    ...(status ? { status } : {}),
    ...(inquiryType ? { inquiryType } : {}),
  }

  const [byStatus, items, total] = await Promise.all([
    prisma.inquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, phone: true, email: true, inquiryType: true, status: true,
        details: true, createdAt: true,
        store: { select: { name: true } },
      },
    }),
    prisma.inquiry.count({ where }),
  ])

  return NextResponse.json({
    summary: { byStatus: byStatus.map(s => ({ status: s.status, count: s._count._all })) },
    items: items.map(i => ({ ...i, storeName: i.store?.name ?? '—', store: undefined })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
