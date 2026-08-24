import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { announcementVisibilityWhere } from '@/lib/announcement-target'
import { getOrCreateRoom, unreadCountForRoom } from '@/lib/chat'
import { createTimer } from '@/lib/api-timing'

/**
 * 店舗ナビのバッジ類をまとめて返す。
 *
 * 以前は NavigationRail と BottomNav が別々に
 *   /api/store/announcements/unread-count
 *   /api/store/release-notes/unread-count
 *   /api/store/chat/unread-count
 *   /api/store/linked-accounts
 * を叩いており、両方マウントされるため 1 ページ表示ごとに 8 リクエスト発生していた。
 * 日本→米国リージョンの往復が 1 本あたり 0.3 秒前後かかるため、
 * ここを 1 本にまとめるだけで体感が大きく変わる。
 *
 * 個別エンドポイントは他画面（お知らせ既読処理など）から使われているので残してある。
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; memberId?: string | null } | undefined
  if (!session || user?.role !== 'store' || !user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = user.id
  const readerId = user.memberId ?? storeId
  const t = createTimer()

  const [announcements, releaseNotes, chat, accounts] = await t.measure('badges', () =>
    Promise.all([
      // 未読お知らせ数（配信対象＝店舗の対応サービスで絞った母集団の中で数える）
      (async () => {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { supportedServices: true },
        })
        const where = { isPublished: true, ...announcementVisibilityWhere(store?.supportedServices) }
        const [total, read] = await Promise.all([
          prisma.announcement.count({ where }),
          prisma.announcement.count({ where: { ...where, reads: { some: { storeId } } } }),
        ])
        return Math.max(0, total - read)
      })(),

      // 未読リリースノート数
      (async () => {
        const [total, read] = await Promise.all([
          prisma.releaseNote.count({ where: { isPublished: true, targetStore: true } }),
          prisma.releaseNoteRead.count({
            where: {
              readerType: 'store',
              readerId: storeId,
              releaseNote: { isPublished: true, targetStore: true },
            },
          }),
        ])
        return Math.max(0, total - read)
      })(),

      // 本部チャットの未読数
      (async () => {
        const room = await getOrCreateRoom(storeId)
        return unreadCountForRoom(room.id, 'store', readerId)
      })(),

      // リンク済み店舗アカウント（アカウント切替メニュー用）
      (async () => {
        const [links, currentStore] = await Promise.all([
          prisma.storeLink.findMany({
            where: { OR: [{ storeId }, { linkedStoreId: storeId }] },
            select: {
              storeId: true,
              store: { select: { id: true, name: true, code: true, avatar: true } },
              linkedStore: { select: { id: true, name: true, code: true, avatar: true } },
            },
          }),
          prisma.store.findUnique({
            where: { id: storeId },
            select: { id: true, name: true, code: true, avatar: true },
          }),
        ])
        const map = new Map<string, { id: string; name: string; code: string; avatar: string | null }>()
        for (const link of links) {
          const other = link.storeId === storeId ? link.linkedStore : link.store
          if (other && !map.has(other.id)) map.set(other.id, other)
        }
        return { currentStore, linkedStores: Array.from(map.values()) }
      })(),
    ]),
  )

  return t.json({
    announcements,
    releaseNotes,
    chat,
    currentStore: accounts.currentStore,
    linkedStores: accounts.linkedStores,
  })
}
