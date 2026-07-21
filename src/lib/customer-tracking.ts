// 顧客一覧向け「計測流入元」ヘルパー。
//
// 顧客詳細の問い合わせ経路（/api/admin/users/[id]/journey）はCV到達セッションの
// pageViews/eventsまで深掘りする重い処理のため、一覧50〜200件にそのまま使うと
// N+1になる。ここでは一覧用に軽量化し、対象ユーザーIDをまとめて1クエリで取得、
// ユーザーごとに「最初に観測されたセッションのchannel」を代表値として返す。

import { prisma } from '@/lib/prisma'

/** userId -> 初回セッションのchannel（raw値: search|social|ad|referral|direct）。紐付けが無ければキー自体が存在しない。 */
export type TrackedChannelMap = Record<string, string | null>

const MAX_SESSIONS = 5000 // 安全弁（一覧の対象件数は通常200以下だが、念のため上限を設ける）

/** 対象ユーザーIDの一覧について、各ユーザー最初の計測セッションのchannelを一括取得する。 */
export async function getTrackedChannels(userIds: string[]): Promise<TrackedChannelMap> {
  if (userIds.length === 0) return {}

  const sessions = await prisma.trackingSession.findMany({
    where: { visitor: { userId: { in: userIds } } },
    select: { channel: true, visitor: { select: { userId: true } } },
    orderBy: { startedAt: 'asc' },
    take: MAX_SESSIONS,
  })

  const map: TrackedChannelMap = {}
  for (const s of sessions) {
    const uid = s.visitor.userId
    if (!uid || uid in map) continue // 既にそのユーザーの最古セッションを採用済みならスキップ（asc順なので先勝ち）
    map[uid] = s.channel ?? null
  }
  return map
}
