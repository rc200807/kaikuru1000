import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const baseWhere: any = {}
  if (!includeInactive) baseWhere.isActive = true

  const [total, unassigned, idMissing] = await Promise.all([
    prisma.user.count({ where: baseWhere }),
    prisma.user.count({ where: { ...baseWhere, storeId: null } }),
    prisma.user.count({ where: { ...baseWhere, idDocumentPath: null } }),
  ])

  return NextResponse.json({ total, unassigned, idMissing })
}
