import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scoreStoresByAddress } from '@/lib/address-utils'

/**
 * 住所ベースで近隣店舗を検索する（認証不要 — 公開API）
 * GET /api/stores/search?address=東京都渋谷区...&limit=5
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const limit = Math.min(Number(searchParams.get('limit') || '5'), 20)

  if (!address || address.trim().length < 3) {
    return NextResponse.json({ error: '住所を入力してください' }, { status: 400 })
  }

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      prefecture: true,
      address: true,
      phone: true,
      email: true,
    },
    orderBy: { code: 'asc' },
  })

  const scored = scoreStoresByAddress(address.trim(), stores)

  // スコア付き上位N件を返す（phone/email も付与）
  const results = scored.slice(0, limit).map(s => {
    const full = stores.find(st => st.id === s.id)
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      prefecture: s.prefecture,
      address: s.address,
      phone: full?.phone || null,
      email: full?.email || null,
      score: s.score,
      matchReason: s.matchReason,
    }
  })

  return NextResponse.json({
    query: address.trim(),
    results,
    totalStores: stores.length,
  })
}
