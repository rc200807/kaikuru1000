import { NextResponse } from 'next/server'

let cachedBanks: any[] | null = null
let cachedAt = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

export async function GET() {
  try {
    if (cachedBanks && Date.now() - cachedAt < CACHE_TTL) {
      return NextResponse.json(cachedBanks)
    }

    const res = await fetch('https://bank.teraren.com/banks.json', {
      next: { revalidate: 86400 },
    })
    if (!res.ok) throw new Error('Failed to fetch banks')
    const data = await res.json()
    cachedBanks = data
    cachedAt = Date.now()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
