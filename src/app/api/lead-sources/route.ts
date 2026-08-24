import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { masterJson } from '@/lib/api-cache'

// 店舗・管理ポータル共通の流入経路選択肢取得
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sources = await prisma.leadSource.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  return masterJson(sources)
}
