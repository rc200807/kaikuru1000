import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncStoresFromGoogleSheets } from '@/lib/google-sheets'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncStoresFromGoogleSheets()
  return NextResponse.json(result)
}

// 最新の同期ログ取得
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await prisma.syncLog.findMany({
    where: { type: 'stores' },
    orderBy: { syncedAt: 'desc' },
    take: 10,
  })
  return NextResponse.json(logs)
}
