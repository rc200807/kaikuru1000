import { NextRequest, NextResponse } from 'next/server'

/**
 * 住所から緯度経度を取得するプロキシAPI
 * GET /api/geo/coordinates?address=東京都渋谷区道玄坂
 *
 * HeartRails GeoAPI の getAddr を使用（無料・認証不要）
 * 町域レベルまでの精度
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')
  if (!address) {
    return NextResponse.json({ lat: null, lng: null })
  }

  try {
    // 都道府県・市区町村を抽出
    const prefMatch = address.match(/^(北海道|東京都|大阪府|京都府|.{2,3}県)/)
    const prefecture = prefMatch?.[1] || ''
    const rest = prefecture ? address.slice(prefecture.length) : address
    const cityMatch = rest.match(/^(.+?[市区町村郡])/)
    const city = cityMatch?.[1] || ''

    if (!prefecture || !city) {
      return NextResponse.json({ lat: null, lng: null })
    }

    // HeartRails GeoAPI で町域の座標を取得
    const apiUrl = `https://geoapi.heartrails.com/api/json?method=suggest&keyword=${encodeURIComponent(prefecture + city)}`
    const res = await fetch(apiUrl, { next: { revalidate: 86400 } })
    const data = await res.json()

    if (data.response?.location) {
      const locations = Array.isArray(data.response.location)
        ? data.response.location
        : [data.response.location]

      if (locations.length > 0) {
        const loc = locations[0]
        return NextResponse.json({
          lat: parseFloat(loc.y),
          lng: parseFloat(loc.x),
        })
      }
    }

    // fallback: getTowns で座標取得
    const townsUrl = `https://geoapi.heartrails.com/api/json?method=getTowns&prefecture=${encodeURIComponent(prefecture)}&city=${encodeURIComponent(city)}`
    const townsRes = await fetch(townsUrl, { next: { revalidate: 86400 } })
    const townsData = await townsRes.json()

    if (townsData.response?.location) {
      const locations = Array.isArray(townsData.response.location)
        ? townsData.response.location
        : [townsData.response.location]

      if (locations.length > 0) {
        const loc = locations[0]
        return NextResponse.json({
          lat: parseFloat(loc.y),
          lng: parseFloat(loc.x),
        })
      }
    }

    return NextResponse.json({ lat: null, lng: null })
  } catch {
    return NextResponse.json({ lat: null, lng: null })
  }
}
