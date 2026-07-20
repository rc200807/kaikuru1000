import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { generateTrackingKey } from '@/lib/tracking'

export const dynamic = 'force-dynamic'

// コンバージョンボタン（発行ID）の一覧・発行
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [buttons, clickAgg] = await Promise.all([
    prisma.trackingButton.findMany({
      include: { site: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.trackingEvent.groupBy({ by: ['buttonId'], where: { type: 'button_click' }, _count: { _all: true } }),
  ])
  const clickMap = new Map(clickAgg.map(g => [g.buttonId, g._count._all]))
  return NextResponse.json({
    buttons: buttons.map(b => ({
      id: b.id,
      siteId: b.siteId,
      siteName: b.site.name,
      buttonKey: b.buttonKey,
      name: b.name,
      kind: b.kind,
      isConversion: b.isConversion,
      clickCount: clickMap.get(b.id) ?? 0,
      createdAt: b.createdAt.toISOString(),
    })),
  })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()
  const siteId = String(body.siteId ?? '')
  if (!name || !siteId) return NextResponse.json({ error: 'サイトとボタン名を指定してください' }, { status: 400 })
  const site = await prisma.trackingSite.findUnique({ where: { id: siteId } })
  if (!site) return NextResponse.json({ error: 'サイトが見つかりません' }, { status: 400 })
  const kind = ['tel', 'line', 'mail', 'other'].includes(body.kind) ? body.kind : 'other'

  let buttonKey = `btn_${generateTrackingKey(8)}`
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.trackingButton.findUnique({ where: { buttonKey } })
    if (!exists) break
    buttonKey = `btn_${generateTrackingKey(8)}`
  }

  const button = await prisma.trackingButton.create({
    data: { siteId, name, kind, buttonKey, isConversion: body.isConversion !== false },
  })
  return NextResponse.json({ id: button.id, buttonKey: button.buttonKey })
}
