import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { distributeAkikuruInvoice } from '@/lib/akikuru-distribution'

// 分配のリトライ（[id] は AkikuruInvoice の id）。failed の台帳行のみ再実行される
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.akikuruInvoice.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!invoice) return NextResponse.json({ error: '請求が見つかりません' }, { status: 404 })
  if (invoice.status !== 'paid') {
    return NextResponse.json({ error: '支払済みの請求のみ分配できます' }, { status: 400 })
  }

  await distributeAkikuruInvoice(id)

  const updated = await prisma.akikuruInvoice.findUnique({
    where: { id },
    include: { transfers: { orderBy: { createdAt: 'asc' } } },
  })
  await recordAccessLog({ userType: 'sysadmin', userId: admin.id, userName: admin.name, action: '分配をリトライ', req: request })
  return NextResponse.json(updated)
}
