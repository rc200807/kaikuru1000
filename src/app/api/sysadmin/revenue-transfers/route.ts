import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

// アキクル請求・分配台帳の一覧（sysadmin）
export async function GET(request: NextRequest) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '30', 10) || 30))

  const where: any = {}
  const status = sp.get('status')
  if (status) where.status = status
  const distributionStatus = sp.get('distributionStatus')
  if (distributionStatus) where.distributionStatus = distributionStatus

  const [invoices, total] = await Promise.all([
    prisma.akikuruInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        deal: { select: { id: true, user: { select: { id: true, name: true } } } },
        store: { select: { id: true, name: true, code: true, stripeConnectStatus: true } },
        transfers: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.akikuruInvoice.count({ where }),
  ])

  return NextResponse.json({ invoices, total, page, limit })
}
