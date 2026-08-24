/**
 * デバイスセッション管理（パスキー長期セッションの失効制御）
 *
 * パスキーログインで発行された30日セッションは JWT のままでは失効できないため、
 * DeviceSession テーブルと照合して revoke 可能にする。
 * パスワードログイン（8時間）は従来どおり照合なし＝性能影響なし。
 */

import { prisma } from './prisma'

export const PASSKEY_SESSION_MS = 30 * 24 * 60 * 60 * 1000 // 30日
export const PASSWORD_SESSION_MS = 8 * 60 * 60 * 1000 // 8時間（従来どおり）

const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000 // lastSeenAt 更新は15分に1回

/**
 * 有効判定の短期キャッシュ。
 * セッション確認（/api/auth/session）はページ表示のたびに走るため、そのつどDBへ往復すると
 * 体感速度に直接響く。失効の反映は最大 VALID_CACHE_MS 遅れるが、
 * 失効操作（revokeDeviceSession / revokeAllDeviceSessions）は同じプロセスのキャッシュを
 * 即時破棄するので、実運用で問題になるのは他インスタンスの最大30秒だけ。
 */
const VALID_CACHE_MS = 30 * 1000
const validCache = new Map<string, number>() // id → キャッシュした時刻

/** 個別失効など、DBを直接更新した箇所から有効判定キャッシュを捨てるために使う */
export function invalidateDeviceSessionCache(id?: string) {
  if (id) validCache.delete(id)
  else validCache.clear()
}

/**
 * パスキーログイン成功時にデバイスセッションを作成し、IDを返す
 */
export async function createDeviceSession(params: {
  userType: string
  userId: string
  memberId?: string | null
  credentialId?: string | null
  loginMethod: 'password' | 'passkey'
  ip?: string | null
  userAgent?: string | null
}): Promise<string> {
  const ttl = params.loginMethod === 'passkey' ? PASSKEY_SESSION_MS : PASSWORD_SESSION_MS
  const session = await prisma.deviceSession.create({
    data: {
      userType: params.userType,
      userId: params.userId,
      memberId: params.memberId ?? null,
      credentialId: params.credentialId ?? null,
      loginMethod: params.loginMethod,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      expiresAt: new Date(Date.now() + ttl),
    },
  })
  return session.id
}

/**
 * デバイスセッションが有効か照合する（失効・期限切れなら false）。
 * 有効な場合は lastSeenAt を15分スロットリングで更新する。
 */
export async function validateDeviceSession(id: string): Promise<boolean> {
  const cachedAt = validCache.get(id)
  if (cachedAt && Date.now() - cachedAt < VALID_CACHE_MS) return true

  try {
    const session = await prisma.deviceSession.findUnique({
      where: { id },
      select: { revokedAt: true, expiresAt: true, lastSeenAt: true },
    })
    if (!session) return false
    if (session.revokedAt) return false
    if (session.expiresAt < new Date()) return false

    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      await prisma.deviceSession.update({
        where: { id },
        data: { lastSeenAt: new Date() },
      })
    }
    validCache.set(id, Date.now())
    // 際限なく増えないよう、古いエントリを間引く
    if (validCache.size > 500) {
      const cutoff = Date.now() - VALID_CACHE_MS
      for (const [key, at] of validCache) if (at < cutoff) validCache.delete(key)
    }
    return true
  } catch (e) {
    // DB障害でログイン済みユーザーを閉め出さない（fail-open）
    console.error('[device-session] validate failed', e)
    return true
  }
}

/**
 * 対象ユーザーの全デバイスセッションを失効する（パスワードリセット時など）
 */
export async function revokeAllDeviceSessions(
  userType: string,
  userId: string,
): Promise<number> {
  const result = await prisma.deviceSession.updateMany({
    where: { userType, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  // 失効を即時反映させるため、このプロセスの有効判定キャッシュは全部捨てる
  validCache.clear()
  return result.count
}
