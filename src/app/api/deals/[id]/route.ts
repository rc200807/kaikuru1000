import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { isDealStatus } from '@/lib/deal-status'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

function resolveAccess(session: any) {
  const sessionUser = session?.user as any
  const isStore = sessionUser?.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser?.role)
  return { sessionUser, isStore, isAdmin }
}

// 案件詳細
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isStore, isAdmin } = resolveAccess(session)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, furigana: true, email: true, phone: true, address: true, customerType: true } },
      store: { select: { id: true, name: true, code: true } },
      inquiry: { select: { id: true, inquiryType: true, details: true, createdAt: true } },
      visitSchedules: {
        select: { id: true, visitDate: true, startTime: true, endTime: true, status: true, note: true, staffName: true },
        orderBy: { visitDate: 'desc' },
      },
    },
  })

  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(deal)
}

// 案件更新（detail / status / storeId）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isStore, isAdmin } = resolveAccess(session)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { detail, status, storeId } = body

  if (status !== undefined && !isDealStatus(status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }

  const deal = await prisma.deal.findUnique({ where: { id } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (isStore && deal.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updateData: any = {}
  if (detail !== undefined) updateData.detail = detail || null
  if (status !== undefined) updateData.status = status
  // 担当店舗の変更は管理者のみ
  if (storeId !== undefined && isAdmin) updateData.storeId = storeId || null

  const updated = await prisma.deal.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, customerType: true } },
      store: { select: { id: true, name: true, code: true } },
      inquiry: { select: { id: true, inquiryType: true } },
      _count: { select: { visitSchedules: true } },
    },
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `案件を更新`, req: request })
  return NextResponse.json(updated)
}

// 案件の物理削除（管理者のみ。紐づく訪問予定は削除せずリンク解除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { sessionUser, isAdmin } = resolveAccess(session)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id } })
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })

  // 訪問予定は削除せずリンクのみ解除（FKの SET NULL と二重防御）
  await prisma.visitSchedule.updateMany({ where: { dealId: id }, data: { dealId: null } })
  await prisma.deal.delete({ where: { id } })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, action: `案件を削除`, req: request })
  return NextResponse.json({ success: true })
}
