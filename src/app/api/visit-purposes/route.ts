import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { masterJson } from '@/lib/api-cache'

/** 訪問目的マスタの選択肢（店舗・管理の訪問フォームで使う。有効なものだけ返す） */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const purposes = await prisma.visitPurpose.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, sortOrder: true },
  })
  return masterJson(purposes)
}
