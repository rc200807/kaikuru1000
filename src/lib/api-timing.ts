import { NextResponse } from 'next/server'

/**
 * API の処理時間を Server-Timing ヘッダーで可視化するための小さなタイマー。
 *
 * 「画面が遅い」の原因を、
 *   - 関数の中の処理（DBクエリ・外部API）が遅いのか
 *   - ブラウザ↔関数の往復（距離・コールドスタート）が遅いのか
 * に切り分けるために使う。ブラウザの Network > Timing タブに内訳が出る。
 *
 * 使い方:
 *   const t = createTimer()
 *   const data = await t.measure('db', () => prisma.xxx.findMany(...))
 *   return t.json(data)
 */
export function createTimer() {
  const marks: { name: string; dur: number }[] = []
  const startedAt = Date.now()

  /** 非同期処理を計測しつつ、結果はそのまま返す（失敗しても計測は残す） */
  async function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const s = Date.now()
    try {
      return await fn()
    } finally {
      marks.push({ name, dur: Date.now() - s })
    }
  }

  /** 同名の計測を合算する（ループ内の複数クエリなど） */
  function header(): string {
    const merged = new Map<string, number>()
    for (const m of marks) merged.set(m.name, (merged.get(m.name) ?? 0) + m.dur)
    const parts = [...merged].map(([name, dur]) => `${name};dur=${dur}`)
    parts.push(`total;dur=${Date.now() - startedAt}`)
    const region = process.env.VERCEL_REGION
    if (region) parts.push(`region;desc="${region}"`)
    return parts.join(', ')
  }

  function json(body: unknown, init?: ResponseInit) {
    const res = NextResponse.json(body as Record<string, unknown>, init)
    res.headers.set('Server-Timing', header())
    return res
  }

  return { measure, header, json }
}
