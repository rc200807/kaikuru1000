import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDecryptedAccessToken, getMessageContent } from '@/lib/line'
import { uploadFile } from '@/lib/storage'

/**
 * 画像 LINE メッセージのバイナリを取得して返す。
 * - 既に imageUrl が保存されていればリダイレクト
 * - 未保存なら LINE API から取得し、保存→リダイレクト
 *   （LINE 側は 24時間以内のメッセージのみ取得可）
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const message = await prisma.lineMessage.findUnique({
    where: { id },
    include: { lineChannel: true },
  })
  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (message.messageType !== 'image') {
    return NextResponse.json({ error: '画像メッセージではありません' }, { status: 400 })
  }

  // 既に保存済み
  if (message.imageUrl) {
    return NextResponse.redirect(message.imageUrl, 302)
  }

  if (!message.lineMessageId) {
    return NextResponse.json({ error: 'LINEメッセージIDが不明です' }, { status: 404 })
  }

  // LINE から取得して保存
  const accessToken = getDecryptedAccessToken(message.lineChannel)
  const content = await getMessageContent(accessToken, message.lineMessageId)
  if (!content) {
    return NextResponse.json({ error: '画像を取得できませんでした（24時間以内のみ取得可）' }, { status: 410 })
  }
  const ext = content.contentType.includes('png') ? 'png'
    : content.contentType.includes('gif') ? 'gif'
    : content.contentType.includes('webp') ? 'webp'
    : 'jpg'
  const filename = `line-images/${message.lineMessageId}.${ext}`
  const url = await uploadFile(content.buffer, filename, content.contentType)
  await prisma.lineMessage.update({ where: { id: message.id }, data: { imageUrl: url } })
  return NextResponse.redirect(url, 302)
}
