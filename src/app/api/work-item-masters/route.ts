import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 請求項目マスタの一覧（店舗・管理で共用）。
 * 既定は有効な項目のみ。管理ポータルの設定画面は ?all=1 で無効も含めて取得する。
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const all = new URL(request.url).searchParams.get('all') === '1'
  const items = await prisma.workItemMaster.findMany({
    where: all ? undefined : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(items)
}
