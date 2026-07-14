import { NextResponse } from 'next/server'
import { getStoreContext, getOrCreateRoom, unreadCountForRoom } from '@/lib/chat'

/** 未読件数（本部からの新着メッセージ数）。ナビバッジ用 */
export async function GET() {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ count: 0 })

  const room = await getOrCreateRoom(ctx.storeId)
  const count = await unreadCountForRoom(room.id, 'store', ctx.readerId)
  return NextResponse.json({ count })
}
