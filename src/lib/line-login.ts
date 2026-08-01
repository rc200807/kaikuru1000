/**
 * LINE Login (OAuth 2.0) ユーティリティ
 * - 公開LINE登録フォーム → LINE Login 認可 → callback で顧客とLINEアカウントを自動紐付けする
 * - bot_prompt=aggressive により同意画面内で公式アカウントの友だち追加を同時に促す
 * - Messaging API 用の src/lib/line.ts と同じく fetch 自前実装で統一
 */

import { decrypt } from '@/lib/encrypt'
import type { LineChannel } from '@prisma/client'

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
const PROFILE_URL = 'https://api.line.me/v2/profile'
const FRIENDSHIP_URL = 'https://api.line.me/friendship/v1/status'

/** DB の LineChannel から復号した LINE Login チャネルシークレットを返す */
export function getDecryptedLoginSecret(channel: LineChannel): string | null {
  if (!channel.loginChannelSecret) return null
  return decrypt(channel.loginChannelSecret)
}

/** LINE Login の callback URL（LINE Developers に登録する値と一致させる） */
export function getLineLoginCallbackUrl(): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/line/link/callback`
}

/**
 * LINE Login 認可URLを組み立てる
 * @param loginChannelId LINE Login チャネルID（公開値）
 * @param state ワンタイム state トークン（LineLinkToken.token）
 */
export function buildAuthorizeUrl(loginChannelId: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: loginChannelId,
    redirect_uri: getLineLoginCallbackUrl(),
    state,
    scope: 'profile openid',
    // 同意画面内に公式アカウントの友だち追加オプションを表示（リンク済みボットが必要）
    bot_prompt: 'aggressive',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

/**
 * 認可コードをアクセストークンに交換する
 */
export async function exchangeCode(
  code: string,
  loginChannelId: string,
  loginChannelSecret: string,
): Promise<{ accessToken: string } | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getLineLoginCallbackUrl(),
      client_id: loginChannelId,
      client_secret: loginChannelSecret,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[LINE Login] token exchange failed ${res.status}: ${body}`)
    return null
  }
  const json = await res.json()
  if (!json?.access_token) return null
  return { accessToken: json.access_token }
}

/**
 * LINE Login アクセストークンでユーザープロフィールを取得する
 */
export async function getLoginProfile(
  accessToken: string,
): Promise<{ userId: string; displayName: string; pictureUrl?: string } | null> {
  const res = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const json = await res.json()
  if (!json?.userId) return null
  return json
}

/**
 * リンク済み公式アカウントとの友だち状態を取得する
 * （bot_prompt でも友だち追加チェックを外せるため、callback 後の分岐に使う）
 */
export async function getFriendshipStatus(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(FRIENDSHIP_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return false
    const json = await res.json()
    return json?.friendFlag === true
  } catch {
    return false
  }
}
