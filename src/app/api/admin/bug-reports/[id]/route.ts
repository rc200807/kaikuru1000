import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { status } = body
  const validStatuses = ['open', 'in_progress', 'resolved']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: '不正なステータスです' }, { status: 400 })
  }

  const updated = await prisma.bugReport.update({
    where: { id },
    data: { status },
  })

  return NextResponse.json(updated)
}
