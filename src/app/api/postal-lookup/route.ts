import { NextRequest, NextResponse } from 'next/server'
import { lookupPostalAddress, normalizePostalCode } from '@/lib/postal'

/** 郵便番号から住所を検索するプロキシAPI */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const zipcode = normalizePostalCode(searchParams.get('zipcode'))

  if (!zipcode) {
    return NextResponse.json({ error: '7桁の郵便番号を指定してください' }, { status: 400 })
  }

  const result = await lookupPostalAddress(zipcode)
  if (!result) {
    return NextResponse.json({ address: null })
  }
  return NextResponse.json(result)
}
