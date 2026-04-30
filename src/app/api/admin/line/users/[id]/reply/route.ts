import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDecryptedAccessToken, sendPushMessage } from '@/lib/line'
import { z } from 'zod'

const replySchema = z.object({
  text: z.string().min(1).max(2000),
})

// POST /api/admin/line/users/[id]/reply — ユーザーへ返信（push message）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = replySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const lineUser = await prisma.lineUser.findUnique({
    where: { id },
    include: { lineChannel: true },
  })
  if (!lineUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!lineUser.lineChannel.isActive) {
    return NextResponse.json({ error: 'チャネルが無効です' }, { status: 400 })
  }

  const accessToken = getDecryptedAccessToken(lineUser.lineChannel)

  // LINE へ Push 送信
  try {
    await sendPushMessage(accessToken, lineUser.lineUserId, parsed.data.text)
  } catch (err: any) {
    console.error('[LINE Reply] Push message failed:', err?.message)
    return NextResponse.json(
      { error: `LINE送信に失敗しました: ${err?.message ?? '不明なエラー'}` },
      { status: 502 }
    )
  }

  // DB に outbound メッセージを保存
  const message = await prisma.lineMessage.create({
    data: {
      lineUserId: id,
      lineChannelId: lineUser.lineChannelId,
      direction: 'outbound',
      messageType: 'text',
      content: parsed.data.text,
      sentAt: new Date(),
    },
  })

  return NextResponse.json(message)
}
