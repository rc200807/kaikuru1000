import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { masterJson } from '@/lib/api-cache'

/**
 * 案件詳細フォームで使うマスタをまとめて返す。
 *
 * 店舗ポータルはサーバー（`(store)/layout.tsx`）が解決した値を Context から読むので
 * このルートを叩かない。**管理ポータル用のフォールバック**として存在する
 * （`DealDetailView` は店舗・管理の共用で、管理側には Provider が無い）。
 * 管理ポータルはこれまで purchase-categories / visit-purposes を個別に叩いていたので
 * その2本が1本になる。
 *
 * 担当者候補（メンバー）は含めない。あれは店舗ロール専用かつ自店舗限定で、
 * 管理ポータルでは `DealDetailView` の editable=false により使われない。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [purchaseCategories, visitPurposes] = await Promise.all([
    prisma.purchaseCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sortOrder: true } }),
    prisma.visitPurpose.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, sortOrder: true },
    }),
  ])

  return masterJson({ purchaseCategories, visitPurposes })
}
