import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import { z } from 'zod'

const createSchema = z.object({
  name:               z.string().min(1).max(100),
  channelId:          z.string().min(1).max(100),
  channelSecret:      z.string().min(1),
  channelAccessToken: z.string().min(1),
  storeId:            z.string().nullable().optional(),
})

async function requireAdmin(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || user.role !== 'admin') return null
  return user
}

// GET /api/admin/line/channels — チャネル一覧（未読数付き）
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const channels = await prisma.lineChannel.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { lineUsers: true } },
      store: { select: { id: true, name: true } },
    },
  })

  // 各チャネルの未読メッセージ数（inbound & readAt IS NULL）
  const unreadCounts = await Promise.all(
    channels.map(async (ch) => {
      const count = await prisma.lineMessage.count({
        where: {
          lineChannelId: ch.id,
          direction: 'inbound',
          readAt: null,
        },
      })
      return { id: ch.id, unread: count }
    })
  )
  const unreadMap = Object.fromEntries(unreadCounts.map((u) => [u.id, u.unread]))

  // channelSecret / channelAccessToken は返さない
  const result = channels.map(({ channelSecret: _s, channelAccessToken: _t, ...ch }) => ({
    ...ch,
    userCount: ch._count.lineUsers,
    unreadCount: unreadMap[ch.id] ?? 0,
  }))

  return NextResponse.json(result)
}

// POST /api/admin/line/channels — チャネル追加
export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { name, channelId, channelSecret, channelAccessToken, storeId } = parsed.data

  // channelId 重複確認
  const existing = await prisma.lineChannel.findUnique({ where: { channelId } })
  if (existing) {
    return NextResponse.json({ error: 'このチャネルIDは既に登録されています' }, { status: 400 })
  }

  const channel = await prisma.lineChannel.create({
    data: {
      name,
      channelId,
      channelSecret: encrypt(channelSecret),
      channelAccessToken: encrypt(channelAccessToken),
      storeId: storeId ?? null,
    },
  })

  const { channelSecret: _s, channelAccessToken: _t, ...safe } = channel
  return NextResponse.json(safe, { status: 201 })
}
