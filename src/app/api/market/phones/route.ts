import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const series = searchParams.get('series')

  const where = series ? { series } : {}

  const prices = await prisma.phoneMarketPrice.findMany({
    where,
    orderBy: [{ series: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
  })

  // 最終更新日時
  const latest = await prisma.phoneMarketPrice.findFirst({
    orderBy: { fetchedAt: 'desc' },
    select: { fetchedAt: true },
  })

  return NextResponse.json({
    prices,
    lastUpdated: latest?.fetchedAt ?? null,
    total: prices.length,
  })
}
