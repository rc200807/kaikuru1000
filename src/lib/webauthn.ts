/**
 * パスキー（WebAuthn）共通ヘルパー
 *
 * - RP（Relying Party）設定の解決
 * - チャレンジの発行・ワンタイム消費（DBベース・サーバーレス対応）
 * - セッション → パスキー対象ユーザー（userType/userId）の解決
 *
 * 環境変数:
 *   - WEBAUTHN_RP_ID: RP ID（本番: system.rcinc.jp）。未設定時は NEXTAUTH_URL のホスト名
 */

import crypto from 'crypto'
import { prisma } from './prisma'

export type PasskeyUserType = 'admin' | 'store' | 'storeMember'
export type PasskeyPortal = 'admin' | 'sysadmin' | 'store'

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // チャレンジ有効期限: 5分
const LOGIN_TOKEN_TTL_MS = 60 * 1000 // ログイントークン有効期限: 60秒

export const RP_NAME = '買いクル'

export function getRpId(): string {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID
  if (process.env.NEXTAUTH_URL) return new URL(process.env.NEXTAUTH_URL).hostname
  return 'localhost'
}

export function getExpectedOrigin(): string {
  if (process.env.NEXTAUTH_URL) return new URL(process.env.NEXTAUTH_URL).origin
  return 'http://localhost:3000'
}

/**
 * セッションユーザーからパスキーの対象（userType/userId）を解決する
 * - admin系ロール（admin/superadmin/hr/sysadmin）→ Admin 行
 * - store + memberId → StoreMember 行（人に紐づける。店舗切替でも不変）
 * - store 単体 → Store 行
 */
export function resolvePasskeyUser(sessionUser: {
  role?: string | null
  id?: string | null
  memberId?: string | null
}): { userType: PasskeyUserType; userId: string } | null {
  const { role, id, memberId } = sessionUser
  if (!role || !id) return null
  if (['admin', 'superadmin', 'hr', 'sysadmin'].includes(role)) {
    return { userType: 'admin', userId: id }
  }
  if (role === 'store') {
    if (memberId) return { userType: 'storeMember', userId: memberId }
    return { userType: 'store', userId: id }
  }
  return null
}

/**
 * チャレンジをDBに保存する（generateXxxOptions が生成した challenge を渡す）
 */
export async function saveChallenge(params: {
  challenge: string
  type: 'registration' | 'authentication'
  userType?: PasskeyUserType
  userId?: string
}): Promise<void> {
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: params.challenge,
      type: params.type,
      userType: params.userType ?? null,
      userId: params.userId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  })
}

/**
 * クライアントの WebAuthn レスポンスの clientDataJSON からチャレンジを取り出す
 */
export function extractChallenge(clientDataJSONBase64url: string): string | null {
  try {
    const json = JSON.parse(
      Buffer.from(clientDataJSONBase64url, 'base64url').toString('utf8'),
    )
    return typeof json.challenge === 'string' ? json.challenge : null
  } catch {
    return null
  }
}

/**
 * チャレンジをワンタイム消費する（アトミック）。
 * 成功時は消費したレコードを返し、期限切れ・使用済み・不明なら null。
 */
export async function consumeChallenge(
  challenge: string,
  type: 'registration' | 'authentication',
): Promise<{ userType: string | null; userId: string | null } | null> {
  const consumed = await prisma.webAuthnChallenge.updateMany({
    where: { challenge, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (consumed.count === 0) return null
  const record = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  if (!record) return null
  return { userType: record.userType, userId: record.userId }
}

/**
 * パスキー検証成功後のワンタイムログイントークンを発行する。
 * 平文トークンを返し、DBには sha256 ハッシュのみ保存する。
 */
export async function issuePasskeyLoginToken(params: {
  userType: PasskeyUserType
  userId: string
  credentialId: string
}): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.passkeyLoginToken.create({
    data: {
      tokenHash: hashLoginToken(token),
      userType: params.userType,
      userId: params.userId,
      credentialId: params.credentialId,
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
    },
  })
  return token
}

export function hashLoginToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * ポータルとパスキー対象ユーザーの整合チェック。
 * 既存の CredentialsProvider（admin/sysadmin/store）のロールフィルタと同一ロジック。
 * 許可される場合はログイン後の role を返し、不許可なら null。
 */
export async function checkPortalAccess(
  portal: PasskeyPortal,
  userType: PasskeyUserType,
  userId: string,
): Promise<string | null> {
  if (portal === 'admin' || portal === 'sysadmin') {
    if (userType !== 'admin') return null
    const admin = await prisma.admin.findUnique({ where: { id: userId } })
    if (!admin) return null
    if (portal === 'sysadmin') {
      return admin.role === 'sysadmin' ? 'sysadmin' : null
    }
    if (admin.role === 'sysadmin') return null
    return admin.role === 'superadmin' || admin.role === 'hr' ? admin.role : 'admin'
  }
  if (portal === 'store') {
    if (userType === 'store') {
      const store = await prisma.store.findUnique({ where: { id: userId } })
      return store ? 'store' : null
    }
    if (userType === 'storeMember') {
      const member = await prisma.storeMember.findUnique({ where: { id: userId } })
      return member ? 'store' : null
    }
  }
  return null
}
