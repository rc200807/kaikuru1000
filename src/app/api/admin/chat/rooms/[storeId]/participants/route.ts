import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminContext } from '@/lib/chat'

/** メンション候補: 本部管理者（非sysadmin）＋ 当該店舗のメンバー */
export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId } = await context.params

  const [admins, members] = await Promise.all([
    prisma.admin.findMany({
      where: { role: { not: 'sysadmin' } },
      select: { id: true, name: true, avatar: true },
      orderBy: { name: 'asc' },
    }),
    prisma.storeMember.findMany({
      where: { storeId },
      select: { id: true, name: true, avatar: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return NextResponse.json({ admins, members })
}
