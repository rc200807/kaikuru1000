import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { generateTrackingKey } from '@/lib/tracking'
import { parseJsonSafe } from '../_lib/common'

export const dynamic = 'force-dynamic'

// 計測サイトの一覧・作成（スクリプトタグ発行単位）
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sites = await prisma.trackingSite.findMany({
    include: { _count: { select: { buttons: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({
    sites: sites.map(s => ({
      id: s.id,
      siteKey: s.siteKey,
      name: s.name,
      domains: parseJsonSafe<string[]>(s.domains, []),
      isActive: s.isActive,
      buttonCount: s._count.buttons,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'サイト名を入力してください' }, { status: 400 })
  const domains = Array.isArray(body.domains)
    ? body.domains.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean).slice(0, 10)
    : []

  // siteKey衝突回避
  let siteKey = generateTrackingKey(12)
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.trackingSite.findUnique({ where: { siteKey } })
    if (!exists) break
    siteKey = generateTrackingKey(12)
  }

  const site = await prisma.trackingSite.create({
    data: { siteKey, name, domains: JSON.stringify(domains) },
  })
  return NextResponse.json({ id: site.id, siteKey: site.siteKey })
}
