/**
 * 分析APIの集計結果スナップショット（キャッシュ）。
 *
 * アクセス解析の概要はセッション・PVを期間横断で集計するため、開くたびに再計算すると
 * 数秒待たされる。同じ条件なら一定時間はスナップショットを返し、期限切れのときは
 * 「古い結果を即返してから裏で作り直す」（stale-while-revalidate）ことで、
 * 2回目以降は常に即表示になるようにする。
 *
 * 注意: 'use client' を付けないこと（サーバー専用）
 */
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

/** この時間内のスナップショットはそのまま返す */
export const SNAPSHOT_FRESH_MS = 5 * 60 * 1000
/** ここまでは「古い結果を返しつつ裏で再計算」する。これを超えたら同期的に作り直す */
export const SNAPSHOT_STALE_MS = 60 * 60 * 1000

export function snapshotKey(kind: string, params: Record<string, unknown>): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort())
  return createHash('sha256').update(`${kind}:${normalized}`).digest('hex')
}

export type SnapshotHit<T> = {
  payload: T
  computedAt: Date
  /** 期限切れ（呼び出し側で裏側の再計算を仕掛ける） */
  stale: boolean
}

/** スナップショットを読む。使えるものが無ければ null */
export async function readSnapshot<T>(cacheKey: string): Promise<SnapshotHit<T> | null> {
  try {
    const row = await prisma.analyticsSnapshot.findUnique({ where: { cacheKey } })
    if (!row) return null
    const age = Date.now() - row.computedAt.getTime()
    if (age > SNAPSHOT_STALE_MS) return null
    return { payload: JSON.parse(row.payload) as T, computedAt: row.computedAt, stale: age > SNAPSHOT_FRESH_MS }
  } catch {
    // キャッシュの不調で画面を壊さない
    return null
  }
}

/**
 * スナップショットを保存（同じ条件は上書き）。
 * カスタム期間ぶんの行が溜まり続けないよう、ついでに期限切れを掃除する。
 * 呼び出しは after() 経由（レスポンスを返したあと）を想定。
 */
export async function writeSnapshot(cacheKey: string, kind: string, payload: unknown): Promise<void> {
  try {
    const body = JSON.stringify(payload)
    await prisma.analyticsSnapshot.upsert({
      where: { cacheKey },
      create: { cacheKey, kind, payload: body, computedAt: new Date() },
      update: { payload: body, computedAt: new Date() },
    })
    // 使われなくなった行の掃除（読み出し側が捨てる期限を過ぎたもの）
    await prisma.analyticsSnapshot.deleteMany({
      where: { kind, computedAt: { lt: new Date(Date.now() - SNAPSHOT_STALE_MS) } },
    })
  } catch {
    /* 保存に失敗しても応答は返す */
  }
}
