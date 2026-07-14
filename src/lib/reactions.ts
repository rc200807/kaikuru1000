/** 絵文字リアクションを絵文字ごとに集約し、自店舗が押したかを付与する共通ヘルパー */
export type GroupedReaction = { emoji: string; count: number; reacted: boolean }

export function groupReactions(
  reactions: { emoji: string; storeId: string }[],
  myStoreId: string,
): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>()
  for (const r of reactions) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, reacted: false }
    g.count += 1
    if (r.storeId === myStoreId) g.reacted = true
    map.set(r.emoji, g)
  }
  return Array.from(map.values())
}
