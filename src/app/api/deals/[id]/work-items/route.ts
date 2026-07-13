import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { recomputeDealAmounts } from '@/lib/deal-amounts'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

async function resolveDeal(id: string, sessionUser: any) {
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true } })
  if (!deal) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { deal }
}

/** 案件配下の請求項目一覧 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const items = await prisma.workItem.findMany({ where: { dealId: id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(items)
}

/** 案件に請求項目を追加（案件合計を自動再計算） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json()
  const { workName, unitPrice, quantity, notes } = body
  if (!workName) return NextResponse.json({ error: '作業名は必須です' }, { status: 400 })

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.workItem.create({
      data: { dealId: id, workName, unitPrice: Number(unitPrice) || 0, quantity: quantity ?? 1, notes: notes || null },
    })
    await recomputeDealAmounts(tx, id)
    return created
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `請求項目を登録「${item.workName}」`, req: request })
  return NextResponse.json(item, { status: 201 })
}
