import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext, getOrCreateRoom, markRoomRead } from '@/lib/chat'

/** 指定店舗ルームを既読化 */
export async function POST(_request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { storeId } = await context.params

  const room = await getOrCreateRoom(storeId)
  await markRoomRead(room.id, 'admin', ctx.readerId)
  return NextResponse.json({ ok: true })
}
