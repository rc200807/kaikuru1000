import { NextResponse } from 'next/server'
import { getStoreContext, getOrCreateRoom, markRoomRead } from '@/lib/chat'

/** 自店舗ルームを既読化 */
export async function POST() {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const room = await getOrCreateRoom(ctx.storeId)
  await markRoomRead(room.id, 'store', ctx.readerId)
  return NextResponse.json({ ok: true })
}
