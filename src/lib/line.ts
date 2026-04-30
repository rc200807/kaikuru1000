/**
 * LINE Messaging API ユーティリティ
 * - Webhook 署名検証
 * - Push メッセージ送信
 */

import crypto from 'crypto'
import { decrypt } from '@/lib/encrypt'
import type { LineChannel } from '@prisma/client'

/**
 * LINE Webhook の X-Line-Signature ヘッダーを検証する
 * @param rawBody リクエストボディ（バイト列そのまま）
 * @param signature X-Line-Signature ヘッダー値（Base64）
 * @param channelSecret 平文の Channel Secret
 */
export function verifySignature(
  rawBody: string | Buffer,
  signature: string,
  channelSecret: string
): boolean {
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const hmac = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64')
  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(signature)
  )
}

/**
 * DB の LineChannel レコードから復号した channelSecret を返す
 */
export function getDecryptedSecret(channel: LineChannel): string {
  return decrypt(channel.channelSecret)
}

/**
 * DB の LineChannel レコードから復号した channelAccessToken を返す
 */
export function getDecryptedAccessToken(channel: LineChannel): string {
  return decrypt(channel.channelAccessToken)
}

/**
 * LINE Push Message API でテキストメッセージを送信する
 * @param channelAccessToken 平文のアクセストークン
 * @param lineUserId 送信先 LINE ユーザーID (U...)
 * @param text 送信するテキスト
 */
export async function sendPushMessage(
  channelAccessToken: string,
  lineUserId: string,
  text: string
): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LINE Push API error ${res.status}: ${body}`)
  }
}

/**
 * LINE Bot ユーザープロフィール取得
 */
export async function getUserProfile(
  channelAccessToken: string,
  lineUserId: string
): Promise<{ displayName: string; pictureUrl?: string } | null> {
  const res = await fetch(
    `https://api.line.me/v2/bot/profile/${lineUserId}`,
    {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    }
  )
  if (!res.ok) return null
  return res.json()
}
