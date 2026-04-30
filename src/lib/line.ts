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

/* ─── Insights / 分析 API ────────────────────────── */

/** YYYYMMDD 形式に変換 */
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

async function lineGet(token: string, path: string): Promise<any> {
  const res = await fetch(`https://api.line.me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LINE API ${res.status}: ${body}`)
  }
  return res.json()
}

/**
 * 友だち統計（指定日）
 * status: ready | unready | out_of_service
 * - ready: データあり
 * - unready: 集計中（前日の場合）
 * - out_of_service: 友だち数が20人未満
 */
export async function getFollowersInsight(
  token: string,
  date: Date
): Promise<{
  status: string
  followers?: number       // 友だち追加数累計
  targetedReaches?: number // ターゲットリーチ
  blocks?: number          // ブロック数累計
}> {
  return lineGet(token, `/v2/bot/insight/followers?date=${formatDate(date)}`)
}

/**
 * 送信メッセージ通数（指定日）
 */
export async function getMessageDeliveryInsight(
  token: string,
  date: Date
): Promise<{ status: string; broadcast?: number; targeting?: number; autoResponse?: number; welcomeResponse?: number; chat?: number; apiBroadcast?: number; apiPush?: number; apiMulticast?: number; apiNarrowcast?: number; apiReply?: number }> {
  return lineGet(token, `/v2/bot/insight/message/delivery?date=${formatDate(date)}`)
}

/**
 * デモグラフィック（友だちの属性分布）
 */
export async function getDemographicInsight(
  token: string
): Promise<{
  available: boolean
  genders?: { gender: string; percentage: number }[]
  ages?: { age: string; percentage: number }[]
  areas?: { area: string; percentage: number }[]
  appTypes?: { appType: string; percentage: number }[]
  subscriptionPeriods?: { subscriptionPeriod: string; percentage: number }[]
}> {
  return lineGet(token, '/v2/bot/insight/demographic')
}

/**
 * 当月のメッセージ使用通数（無料枠の消費状況）
 */
export async function getQuotaConsumption(
  token: string
): Promise<{ totalUsage: number }> {
  return lineGet(token, '/v2/bot/message/quota/consumption')
}

/**
 * 月間メッセージ通数の上限
 */
export async function getMessageQuota(
  token: string
): Promise<{ type: string; value?: number }> {
  return lineGet(token, '/v2/bot/message/quota')
}
