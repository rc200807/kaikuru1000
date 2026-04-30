import { NextResponse } from 'next/server'

let cachedBanks: any[] | null = null
let cachedAt = 0
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

// teraren API は 50件/ページの paginated API（全24ページ・約1,200件）
// 1ページずつ並列取得して全件キャッシュする
const TOTAL_PAGES = 24
const BASE_URL = 'https://bank.teraren.com/banks.json'

async function fetchAllBanks(): Promise<any[]> {
  // 5ページずつ並列フェッチ
  const BATCH = 5
  const all: any[] = []

  for (let start = 1; start <= TOTAL_PAGES; start += BATCH) {
    const pages = Array.from(
      { length: Math.min(BATCH, TOTAL_PAGES - start + 1) },
      (_, i) => start + i
    )
    const results = await Promise.all(
      pages.map(page =>
        fetch(`${BASE_URL}?page=${page}`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    )
    for (const batch of results) all.push(...batch)
  }

  return all
}

export async function GET() {
  try {
    if (cachedBanks && Date.now() - cachedAt < CACHE_TTL) {
      return NextResponse.json(cachedBanks)
    }

    const data = await fetchAllBanks()
    if (data.length === 0) throw new Error('No data fetched')

    cachedBanks = data
    cachedAt = Date.now()
    return NextResponse.json(data)
  } catch {
    // キャッシュが古くても返す（フェッチ失敗時のフォールバック）
    if (cachedBanks) return NextResponse.json(cachedBanks)
    return NextResponse.json([], { status: 500 })
  }
}
