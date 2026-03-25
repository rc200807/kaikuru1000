import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const statuses = await prisma.visitStatus.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, key: true, label: true, color: true, sortOrder: true, isDefault: true },
  })

  return NextResponse.json(statuses)
}
