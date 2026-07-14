import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminContext, unreadCountForRoom } from '@/lib/chat'

/** 未読のある店舗ルーム数（管理ナビのバッジ用） */
export async function GET() {
  const ctx = await getAdminContext()
  if (!ctx) return NextResponse.json({ count: 0 })

  const rooms = await prisma.chatRoom.findMany({ select: { id: true } })
  const counts = await Promise.all(rooms.map((r) => unreadCountForRoom(r.id, 'admin', ctx.readerId)))
  const roomsWithUnread = counts.filter((c) => c > 0).length
  return NextResponse.json({ count: roomsWithUnread })
}
