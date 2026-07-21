import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'

/** メンション候補: 本部管理者（非sysadmin）＋ 自店舗のメンバー */
export async function GET() {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [admins, members] = await Promise.all([
    prisma.admin.findMany({
      where: { role: { not: 'sysadmin' } },
      select: { id: true, name: true, avatar: true },
      orderBy: { name: 'asc' },
    }),
    prisma.storeMember.findMany({
      where: { storeId: ctx.storeId },
      select: { id: true, name: true, avatar: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return NextResponse.json({ admins, members })
}
