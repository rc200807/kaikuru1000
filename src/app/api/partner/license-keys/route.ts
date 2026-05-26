import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'

/** ライセンスキー一覧（使用済み・未使用含む） */
export async function GET() {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keys = await prisma.licenseKey.findMany({
    orderBy: [{ isUsed: 'asc' }, { createdAt: 'desc' }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      },
    },
  })

  const total = keys.length
  const used = keys.filter(k => k.isUsed).length

  return NextResponse.json({
    total,
    used,
    unused: total - used,
    keys: keys.map(k => ({
      id: k.id,
      key: k.key,
      isUsed: k.isUsed,
      startDate: k.startDate,
      endDate:   k.endDate,
      createdAt: k.createdAt,
      user: k.user ? {
        id: k.user.id,
        name: k.user.name,
        email: k.user.email,
        phone: k.user.phone,
        registeredAt: k.user.createdAt,
      } : null,
    })),
  })
}
