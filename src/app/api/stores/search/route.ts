import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scoreStoresByAddress, extractAddressParts, haversineDistanceKm } from '@/lib/address-utils'

/**
 * HeartRails GeoAPIで住所の緯度経度を取得
 */
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const parts = extractAddressParts(address)
    if (!parts.prefecture || !parts.city) return null

    const url = `https://geoapi.heartrails.com/api/json?method=getTowns&prefecture=${encodeURIComponent(parts.prefecture)}&city=${encodeURIComponent(parts.city)}`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    const data = await res.json()

    if (data.response?.location) {
      const locations = Array.isArray(data.response.location) ? data.response.location : [data.response.location]
      if (locations.length > 0) {
        return { lat: parseFloat(locations[0].y), lng: parseFloat(locations[0].x) }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 住所ベースで近隣店舗を検索する（認証不要 — 公開API）
 * GET /api/stores/search?address=東京都渋谷区...&limit=5
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const limit = Math.min(Number(searchParams.get('limit') || '10'), 20)

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

  // 顧客の座標を取得
  const customerCoords = await geocode(address.trim())

  // 全店舗の座標を並列取得
  const storeCoords = new Map<string, { lat: number; lng: number }>()
  if (customerCoords) {
    const geocodePromises = stores.map(async (store) => {
      const addr = store.address || (store.prefecture || '')
      if (!addr) return
      const coords = await geocode(addr)
      if (coords) storeCoords.set(store.id, coords)
    })
    await Promise.all(geocodePromises)
  }

  const scored = scoreStoresByAddress(address.trim(), stores, customerCoords, storeCoords)

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
      distanceKm: s.distanceKm,
    }
  })

  return NextResponse.json({
    query: address.trim(),
    results,
    totalStores: stores.length,
  })
}
