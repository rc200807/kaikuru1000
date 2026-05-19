import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifySignature,
  getDecryptedSecret,
  getDecryptedAccessToken,
  getUserProfile,
  getMessageContent,
} from '@/lib/line'
import { uploadFile } from '@/lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params

  // リクエストボディを文字列として取得（署名検証に使用）
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature') ?? ''

  // チャネルをDBから取得
  const channel = await prisma.lineChannel.findUnique({
    where: { channelId, isActive: true },
  })

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // 署名検証
  const secret = getDecryptedSecret(channel)
  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // events が空の場合は LINE の疎通確認リクエスト
  if (!body.events || body.events.length === 0) {
    return NextResponse.json({ status: 'ok' })
  }

  const accessToken = getDecryptedAccessToken(channel)

  // イベントを並列処理
  await Promise.allSettled(
    body.events.map((event: any) => handleEvent(event, channel.id, accessToken))
  )

  return NextResponse.json({ status: 'ok' })
}

async function handleEvent(
  event: any,
  lineChannelId: string,
  accessToken: string
) {
  if (!event.source?.userId) return

  const lineUserId: string = event.source.userId

  // LineUser の upsert（初回メッセージ時にプロフィール取得）
  let lineUser = await prisma.lineUser.findUnique({
    where: {
      lineUserId_lineChannelId: { lineUserId, lineChannelId },
    },
  })

  if (!lineUser) {
    const profile = await getUserProfile(accessToken, lineUserId)
    lineUser = await prisma.lineUser.create({
      data: {
        lineUserId,
        lineChannelId,
        displayName: profile?.displayName ?? lineUserId,
        pictureUrl: profile?.pictureUrl ?? null,
      },
    })
  }

  // メッセージイベントのみ保存
  if (event.type !== 'message') return

  const msg = event.message
  if (!msg) return

  // 重複防止: lineMessageId がすでに存在する場合はスキップ
  if (msg.id) {
    const existing = await prisma.lineMessage.findUnique({
      where: { lineMessageId: msg.id },
    })
    if (existing) return
  }

  let messageType: string
  let content: string | null = null
  let imageUrl: string | null = null

  switch (msg.type) {
    case 'text':
      messageType = 'text'
      content = msg.text ?? null
      break
    case 'image':
      messageType = 'image'
      // LINE は受信後24時間しか画像本体を保持しないため、Webhook受信時に取得して保存する
      if (msg.id) {
        try {
          const content = await getMessageContent(accessToken, msg.id)
          if (content) {
            const ext = content.contentType.includes('png') ? 'png'
              : content.contentType.includes('gif') ? 'gif'
              : content.contentType.includes('webp') ? 'webp'
              : 'jpg'
            const filename = `line-images/${msg.id}.${ext}`
            imageUrl = await uploadFile(content.buffer, filename, content.contentType)
          }
        } catch (err) {
          console.error('[line-webhook] image fetch failed', err)
        }
      }
      break
    case 'sticker':
      messageType = 'sticker'
      content = `[スタンプ: ${msg.stickerId}]`
      break
    default:
      messageType = 'other'
      content = `[${msg.type}]`
  }

  await prisma.lineMessage.create({
    data: {
      lineUserId: lineUser.id,
      lineChannelId,
      direction: 'inbound',
      messageType,
      content,
      imageUrl,
      lineMessageId: msg.id ?? null,
      sentAt: new Date(event.timestamp),
    },
  })
}
