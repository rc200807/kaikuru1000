import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTimer } from '@/lib/api-timing'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 管理ナビのバッジをまとめて返す。
 *
 * 以前は NavigationDrawer が
 *   /api/admin/chat/unread-count       … 全店舗ルームを取得し、1ルームずつ未読を数えていた
 *                                        （店舗50件なら1リクエストで100クエリ超のN+1）
 *   /api/admin/release-notes/unread-count
 * を別々に、しかも pathname が変わるたびに叩いていた。
 * ここでは1リクエスト・数クエリで返す。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; memberId?: string | null } | undefined
  if (!session || !user?.role || !ADMIN_ROLES.includes(user.role) || !user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const readerId = user.id
  const t = createTimer()

  const [chat, releaseNotes] = await t.measure('badges', () =>
    Promise.all([
      // 未読のある店舗ルーム数。ルームごとにクエリを投げず、
      // 「各ルームの最新の店舗発言」と「自分の既読時刻」を1回ずつ取って突き合わせる
      (async () => {
        const [latestPerRoom, readStates] = await Promise.all([
          prisma.chatMessage.groupBy({
            by: ['roomId'],
            where: { authorType: 'store', deletedAt: null },
            _max: { createdAt: true },
          }),
          prisma.chatReadState.findMany({
            where: { readerType: 'admin', readerId },
            select: { roomId: true, lastReadAt: true },
          }),
        ])
        const lastReadByRoom = new Map(readStates.map(r => [r.roomId, r.lastReadAt]))
        return latestPerRoom.filter(row => {
          const latest = row._max.createdAt
          if (!latest) return false
          const lastRead = lastReadByRoom.get(row.roomId)
          return !lastRead || latest > lastRead
        }).length
      })(),

      // 未読リリースノート数
      (async () => {
        const [total, read] = await Promise.all([
          prisma.releaseNote.count({ where: { isPublished: true, targetAdmin: true } }),
          prisma.releaseNoteRead.count({
            where: {
              readerType: 'admin',
              readerId,
              releaseNote: { isPublished: true, targetAdmin: true },
            },
          }),
        ])
        return Math.max(0, total - read)
      })(),
    ]),
  )

  return t.json({ chat, releaseNotes })
}
