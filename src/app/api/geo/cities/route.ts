import { NextRequest, NextResponse } from 'next/server'

/**
 * 都道府県から市区町村一覧を取得するプロキシAPI
 * GET /api/geo/cities?prefecture=東京都
 *
 * HeartRails GeoAPI を使用（無料・認証不要）
 */
export async function GET(request: NextRequest) {
  const prefecture = request.nextUrl.searchParams.get('prefecture')
  if (!prefecture) {
    return NextResponse.json({ cities: [] })
  }

  try {
    const res = await fetch(
      `https://geoapi.heartrails.com/api/json?method=getCities&prefecture=${encodeURIComponent(prefecture)}`,
      { next: { revalidate: 86400 } } // 24時間キャッシュ
    )
    const data = await res.json()

    if (!data.response?.location) {
      return NextResponse.json({ cities: [] })
    }

    // location が配列でない場合（1件のみ）への対応
    const locations = Array.isArray(data.response.location)
      ? data.response.location
      : [data.response.location]

    // 重複排除
    const seen = new Set<string>()
    const cities: { city: string; city_kana: string }[] = []
    for (const loc of locations) {
      if (loc.city && !seen.has(loc.city)) {
        seen.add(loc.city)
        cities.push({
          city: loc.city,
          city_kana: loc.city_kana || '',
        })
      }
    }

    return NextResponse.json({ cities })
  } catch {
    return NextResponse.json({ cities: [] })
  }
}
