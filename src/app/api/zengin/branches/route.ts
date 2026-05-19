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

    // teraren API はページネーション式（デフォルト50件/ページ）。
    // 全支店を取得するため、最終ページに達するまで順次取得する。
    const PER_PAGE = 200
    const MAX_PAGES = 50 // 念のため上限（200*50=10000支店）
    const all: any[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://bank.teraren.com/banks/${bankCode}/branches.json?page=${page}&per=${PER_PAGE}`,
        { next: { revalidate: 86400 } },
      )
      if (!res.ok) throw new Error('Failed to fetch branches')
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) break
      all.push(...data)
      if (data.length < PER_PAGE) break
    }
    branchCache.set(bankCode, { data: all, at: Date.now() })
    return NextResponse.json(all)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
