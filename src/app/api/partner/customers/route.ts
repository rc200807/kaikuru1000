import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'

/** ライセンスキー所有顧客一覧（パートナー専用） */
export async function GET() {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customers = await prisma.user.findMany({
    where: { licenseKeyId: { not: null }, isActive: true },
    select: {
      id: true,
      name: true,
      furigana: true,
      email: true,
      phone: true,
      address: true,
      customerType: true,
      visitFrequencyMonths: true,
      createdAt: true,
      licenseKey: { select: { key: true } },
      store: { select: { id: true, name: true } },
      partnerNotes: {
        where: { salesPartnerId: user.id },
        select: { note: true, tag: true, updatedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(customers.map(c => {
    const { partnerNotes, ...rest } = c
    return { ...rest, partnerNote: partnerNotes[0] ?? null }
  }))
}
