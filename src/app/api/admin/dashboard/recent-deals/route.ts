import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { PREFECTURES } from '@/lib/prefectures'

export const dynamic = 'force-dynamic'

export type RecentDeal = {
  id: string
  customerName: string
  area: string | null
  storeName: string | null
  leadSource: string | null
  detail: string
  category: string
  createdAt: string
}

// 住所文字列の先頭から都道府県を抽出
function extractPrefecture(address: string | null | undefined): string | null {
  if (!address) return null
  const hit = PREFECTURES.find(p => address.startsWith(p))
  return hit ?? null
}

// ダッシュボード右サイドバー用: 直近の案件（新しい順・最大20件）。
// since（ISO日時）を渡すとそれ以降に作成された案件だけを返す（ポーリング差分取得用）。
export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sinceRaw = searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : null
  const validSince = since && !isNaN(since.getTime()) ? since : null

  const deals = await prisma.deal.findMany({
    where: validSince ? { createdAt: { gt: validSince } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      detail: true,
      category: true,
      createdAt: true,
      user: { select: { name: true, address: true, leadSource: true } },
      store: { select: { name: true } },
      inquiry: { select: { details: true, address: true } },
    },
  })

  const items: RecentDeal[] = deals.map(d => {
    const rawDetail = (d.detail ?? d.inquiry?.details ?? '').trim()
    const detail = rawDetail.length > 50 ? rawDetail.slice(0, 50) + '…' : rawDetail
    return {
      id: d.id,
      customerName: d.user?.name ?? '（顧客不明）',
      area: extractPrefecture(d.user?.address ?? d.inquiry?.address),
      storeName: d.store?.name ?? null,
      leadSource: d.user?.leadSource ?? null,
      detail,
      category: d.category,
      createdAt: d.createdAt.toISOString(),
    }
  })

  return NextResponse.json({ deals: items })
}
