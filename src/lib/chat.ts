/**
 * 本部⇄店舗チャットの共通ロジック
 *
 * - ルーム解決（1店舗1ルーム、なければ作成）
 * - メッセージのシリアライズ（添付/リアクションの展開、閲覧者視点の mine 判定、既読フラグ付与）
 * - 未読件数の算出
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/** 添付ファイル1件 */
export type ChatAttachment = {
  url: string
  name: string
  mimeType: string
  size: number
  kind: 'image' | 'file'
}

/** 閲覧者（メッセージの mine / reaction の mine 判定に使用） */
export type ChatViewer = {
  type: 'admin' | 'store'
  /** admin: Admin.id / store: StoreMember.id（なければ Store.id） */
  id: string
}

/** クイックリアクション絵文字 */
export const QUICK_EMOJIS = ['👍', '✅', '🙏', '🎉', '❤️', '😄', '👀'] as const

export type SerializedReaction = {
  emoji: string
  count: number
  actors: { type: string; name: string }[]
  mine: boolean
}

export type SerializedMessage = {
  id: string
  parentId: string | null
  authorType: 'admin' | 'store'
  authorName: string
  authorAvatar: string | null
  body: string
  attachments: ChatAttachment[]
  isDeleted: boolean
  isEdited: boolean
  createdAt: string
  mine: boolean
  reactions: SerializedReaction[]
  replyCount: number
  /** parentId が null のメッセージにのみ入る（スレッド返信） */
  replies?: SerializedMessage[]
}

/** リアクション・送信者アバター込みでメッセージを取得する include */
export const messageInclude = {
  reactions: true,
  authorAdmin: { select: { avatar: true } },
  authorMember: { select: { avatar: true } },
} satisfies Prisma.ChatMessageInclude

type MessageWithReactions = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>

/** 店舗セッションのコンテキスト（未ログイン/権限外は null） */
export async function getStoreContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || user.role !== 'store') return null
  const storeId = user.id as string
  const memberId = (user.memberId as string | null) ?? null
  const readerId = memberId ?? storeId
  const authorName = (user.memberName as string) || (user.name as string) || '店舗'
  return {
    storeId,
    memberId,
    readerId,
    authorName,
    viewer: { type: 'store' as const, id: readerId },
  }
}

/** 管理者セッションのコンテキスト（未ログイン/権限外は null） */
export async function getAdminContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !['admin', 'superadmin', 'hr'].includes(user.role)) return null
  const adminId = user.id as string
  const authorName = (user.name as string) || '運営'
  return {
    adminId,
    readerId: adminId,
    authorName,
    viewer: { type: 'admin' as const, id: adminId },
  }
}

/** 店舗のチャットルームを取得。なければ作成する。 */
export async function getOrCreateRoom(storeId: string) {
  return prisma.chatRoom.upsert({
    where: { storeId },
    create: { storeId },
    update: {},
  })
}

/** JSON 文字列の添付配列を安全にパース */
export function parseAttachments(raw: string | null | undefined): ChatAttachment[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((a) => a && typeof a.url === 'string')
      .map((a) => ({
        url: String(a.url),
        name: typeof a.name === 'string' ? a.name : 'file',
        mimeType: typeof a.mimeType === 'string' ? a.mimeType : '',
        size: typeof a.size === 'number' ? a.size : 0,
        kind: a.kind === 'image' ? 'image' : 'file',
      }))
  } catch {
    return []
  }
}

/** メッセージ本人の actorId（mine 判定用）を求める */
function actorIdOfMessage(m: MessageWithReactions, roomStoreId: string): string | null {
  if (m.authorType === 'admin') return m.authorAdminId
  return m.authorMemberId ?? roomStoreId
}

/** 1メッセージをシリアライズ（閲覧者視点） */
export function serializeMessage(
  m: MessageWithReactions,
  viewer: ChatViewer,
  roomStoreId: string,
  replyCount = 0,
  roomStoreAvatar: string | null = null,
): SerializedMessage {
  const isDeleted = !!m.deletedAt
  const authorActorId = actorIdOfMessage(m, roomStoreId)
  const mine = m.authorType === viewer.type && authorActorId === viewer.id
  // 送信者アバター: 本部=管理者アバター / 店舗=メンバーアバター（店舗直ログインは店舗アバター）
  const authorAvatar =
    m.authorType === 'admin' ? m.authorAdmin?.avatar ?? null : m.authorMember?.avatar ?? roomStoreAvatar

  // リアクションを絵文字ごとに集約
  const grouped = new Map<string, SerializedReaction>()
  for (const r of m.reactions) {
    const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, actors: [], mine: false }
    g.count += 1
    g.actors.push({ type: r.actorType, name: r.actorName })
    if (r.actorType === viewer.type && r.actorId === viewer.id) g.mine = true
    grouped.set(r.emoji, g)
  }

  return {
    id: m.id,
    parentId: m.parentId,
    authorType: m.authorType as 'admin' | 'store',
    authorName: m.authorName,
    authorAvatar: isDeleted ? null : authorAvatar,
    body: isDeleted ? '' : m.body,
    attachments: isDeleted ? [] : parseAttachments(m.attachments),
    isDeleted,
    isEdited: !!m.editedAt,
    createdAt: m.createdAt.toISOString(),
    mine,
    reactions: isDeleted ? [] : Array.from(grouped.values()),
    replyCount,
  }
}

/**
 * ルームの全メッセージをツリー（トップレベル＋各スレッド返信）でシリアライズして返す。
 * 削除済みでも返信がある親は残す（スレッド構造維持のため）。返信のない削除済みメッセージは除外。
 */
export async function getSerializedThread(roomId: string, roomStoreId: string, viewer: ChatViewer) {
  const [messages, store] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { roomId },
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.store.findUnique({ where: { id: roomStoreId }, select: { avatar: true } }),
  ])
  const storeAvatar = store?.avatar ?? null

  const replyCountByParent = new Map<string, number>()
  for (const m of messages) {
    if (m.parentId) replyCountByParent.set(m.parentId, (replyCountByParent.get(m.parentId) ?? 0) + 1)
  }

  const topLevel = messages.filter((m) => !m.parentId)
  const repliesByParent = new Map<string, MessageWithReactions[]>()
  for (const m of messages) {
    if (m.parentId) {
      const arr = repliesByParent.get(m.parentId) ?? []
      arr.push(m)
      repliesByParent.set(m.parentId, arr)
    }
  }

  const result: SerializedMessage[] = []
  for (const m of topLevel) {
    const replies = repliesByParent.get(m.id) ?? []
    // 返信も削除もない削除済みトップメッセージはスキップ
    if (m.deletedAt && replies.length === 0) continue
    const serialized = serializeMessage(m, viewer, roomStoreId, replies.length, storeAvatar)
    serialized.replies = replies.map((r) => serializeMessage(r, viewer, roomStoreId, 0, storeAvatar))
    result.push(serialized)
  }
  return result
}

/** ルームで相手側が最後に既読した日時（既読表示用）。相手が未読なら null。 */
export async function getOtherPartyReadAt(roomId: string, viewerType: 'admin' | 'store'): Promise<string | null> {
  const otherType = viewerType === 'admin' ? 'store' : 'admin'
  const latest = await prisma.chatReadState.findFirst({
    where: { roomId, readerType: otherType },
    orderBy: { lastReadAt: 'desc' },
    select: { lastReadAt: true },
  })
  return latest ? latest.lastReadAt.toISOString() : null
}

/** 既読状態を upsert（ルームを既読化） */
export async function markRoomRead(roomId: string, readerType: 'admin' | 'store', readerId: string) {
  return prisma.chatReadState.upsert({
    where: { roomId_readerType_readerId: { roomId, readerType, readerId } },
    create: { roomId, readerType, readerId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  })
}

/**
 * 指定閲覧者にとっての、あるルームの未読件数。
 * 相手（otherType）が送信した削除されていないメッセージのうち、自分の最終既読日時より新しいもの。
 */
export async function unreadCountForRoom(
  roomId: string,
  viewerType: 'admin' | 'store',
  readerId: string,
): Promise<number> {
  const otherType = viewerType === 'admin' ? 'store' : 'admin'
  const readState = await prisma.chatReadState.findUnique({
    where: { roomId_readerType_readerId: { roomId, readerType: viewerType, readerId } },
    select: { lastReadAt: true },
  })
  const lastReadAt = readState?.lastReadAt
  return prisma.chatMessage.count({
    where: {
      roomId,
      authorType: otherType,
      deletedAt: null,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  })
}
