import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

/** 招待取り消し */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const inv = await prisma.salesPartnerInvitation.findUnique({ where: { id } })
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (inv.usedAt) {
    return NextResponse.json({ error: '使用済みの招待は取り消せません' }, { status: 400 })
  }
  await prisma.salesPartnerInvitation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
