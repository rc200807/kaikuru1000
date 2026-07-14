import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole, ADMIN_ROLES } from '@/lib/admin-auth'
import { accessLogWhereForMember } from '@/lib/member-attribution'

// 店舗メンバーの操作・ログイン履歴タイムライン（AccessLogベース・ページネーション）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole(ADMIN_ROLES)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const member = await prisma.storeMember.findUnique({
    where: { id },
    select: { id: true, storeId: true, name: true },
  })
  if (!member) return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '30', 10) || 30))
  const action = (searchParams.get('action') || '').trim()

  const where: any = { AND: [accessLogWhereForMember(member)] }
  if (action === 'login') where.AND.push({ action: 'login' })
  else if (action === 'operation') where.AND.push({ action: { not: 'login' } })

  const [items, total] = await Promise.all([
    prisma.accessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, action: true, ip: true, userAgent: true, createdAt: true, memberId: true },
    }),
    prisma.accessLog.count({ where }),
  ])

  return NextResponse.json({ items, total, page, limit })
}
