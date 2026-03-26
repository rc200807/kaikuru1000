import { NextRequest, NextResponse } from 'next/server'

const branchCache = new Map<string, { data: any[]; at: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const bankCode = new URL(request.url).searchParams.get('bankCode')
  if (!bankCode) {
    return NextResponse.json({ error: 'bankCode is required' }, { status: 400 })
  }

  try {
    const cached = branchCache.get(bankCode)
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    const res = await fetch(`https://bank.teraren.com/banks/${bankCode}/branches.json`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) throw new Error('Failed to fetch branches')
    const data = await res.json()
    branchCache.set(bankCode, { data, at: Date.now() })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
