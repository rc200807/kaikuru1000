import { NextRequest, NextResponse } from 'next/server'

/** 郵便番号から住所を検索するプロキシAPI */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const zipcode = searchParams.get('zipcode')?.replace(/[-ー\s]/g, '')

  if (!zipcode || zipcode.length !== 7) {
    return NextResponse.json({ error: '7桁の郵便番号を指定してください' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`)
    const data = await res.json()

    if (data.results && data.results.length > 0) {
      const r = data.results[0]
      return NextResponse.json({
        address: `${r.address1}${r.address2}${r.address3}`,
        prefecture: r.address1,
        city: r.address2,
        town: r.address3,
      })
    }

    return NextResponse.json({ address: null })
  } catch {
    return NextResponse.json({ error: '住所の検索に失敗しました' }, { status: 500 })
  }
}
