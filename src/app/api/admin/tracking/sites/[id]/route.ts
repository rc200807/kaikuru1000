import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (Array.isArray(body.domains)) {
    data.domains = JSON.stringify(body.domains.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean).slice(0, 10))
  }
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive

  const site = await prisma.trackingSite.update({ where: { id }, data })
  return NextResponse.json({ id: site.id })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.trackingSite.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
