import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scoreStoresByAddress, extractAddressParts, haversineDistanceKm, parseServiceAreas, matchServiceArea } from '@/lib/address-utils'

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
      lat: true,
      lng: true,
      serviceAreas: true,
    },
    orderBy: { code: 'asc' },
  })

  // 顧客の座標を取得
  const customerCoords = await geocode(address.trim())

  // 店舗座標: DBキャッシュ(lat/lng)を優先。未取得のものだけジオコーディングして永続化（write-through）。
  const storeCoords = new Map<string, { lat: number; lng: number }>()
  const needGeocode: typeof stores = []
  for (const store of stores) {
    if (store.lat != null && store.lng != null) storeCoords.set(store.id, { lat: store.lat, lng: store.lng })
    else needGeocode.push(store)
  }
  if (customerCoords && needGeocode.length > 0) {
    await Promise.all(needGeocode.map(async (store) => {
      const addr = store.address || (store.prefecture || '')
      if (!addr) return
      const coords = await geocode(addr)
      if (coords) {
        storeCoords.set(store.id, coords)
        // 次回以降の再ジオコーディングを避けるためDBに保存（失敗は無視）
        try { await prisma.store.update({ where: { id: store.id }, data: { lat: coords.lat, lng: coords.lng } }) } catch { /* ignore */ }
      }
    }))
  }

  const scored = scoreStoresByAddress(address.trim(), stores, customerCoords, storeCoords)
  const scoredById = new Map(scored.map(s => [s.id, s]))

  // 対応エリア判定 + 近隣スコアを統合した結果を作る。
  // 対応エリアに登録された店舗は、地理スコアが付かなくても必ず表示し、最上位に並べる。
  const enriched = stores
    .map(store => {
      const areaLabel = matchServiceArea(address.trim(), parseServiceAreas(store.serviceAreas))
      const inServiceArea = !!areaLabel
      const sc = scoredById.get(store.id)
      if (!inServiceArea && !sc) return null

      const coords = storeCoords.get(store.id)
      let distanceKm = sc?.distanceKm ?? null
      if (distanceKm == null && customerCoords && coords) {
        distanceKm = Math.round(haversineDistanceKm(customerCoords.lat, customerCoords.lng, coords.lat, coords.lng) * 10) / 10
      }
      const baseScore = sc?.score ?? 0
      // 対応エリア内は最優先（+1000）。並び替え用の総合スコア。
      const rankScore = (inServiceArea ? 1000 : 0) + baseScore
      const matchReason = inServiceArea ? '対応エリアに登録' : (sc?.matchReason || '')

      return {
        id: store.id,
        name: store.name,
        code: store.code,
        prefecture: store.prefecture,
        address: store.address,
        phone: store.phone || null,
        email: store.email || null,
        score: baseScore,
        matchReason,
        distanceKm,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        inServiceArea,
        serviceAreaLabel: areaLabel,
        rankScore,
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm
      if (a.distanceKm !== null) return -1
      if (b.distanceKm !== null) return 1
      return 0
    })

  const results = enriched.slice(0, limit).map(({ rankScore: _rankScore, ...r }) => r)

  return NextResponse.json({
    query: address.trim(),
    center: customerCoords, // 入力住所の座標（町域センター。地図の中心・マーカー用）
    results,
    serviceAreaMatchCount: enriched.filter(s => s.inServiceArea).length,
    totalStores: stores.length,
  })
}
