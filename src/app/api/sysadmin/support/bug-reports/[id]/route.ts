// 不具合報告の詳細（コメントスレッド付き・読み取り専用）
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const report = await prisma.bugReport.findUnique({
    where: { id },
    select: {
      id: true, title: true, category: true, status: true, details: true, imageUrls: true,
      reporterName: true, createdAt: true, updatedAt: true,
      store: { select: { name: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, authorType: true, authorName: true, body: true, imageUrls: true, createdAt: true },
      },
    },
  })
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    report: { ...report, storeName: report.store?.name ?? '—', store: undefined, comments: undefined },
    comments: report.comments,
  })
}
