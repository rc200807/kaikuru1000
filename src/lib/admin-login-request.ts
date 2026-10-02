import crypto from 'crypto'
import { prisma } from './prisma'

/**
 * ID+パスワード方式（メールなし）管理者のログインリクエスト。
 *
 * ID/パスワードが正しくてもそれだけではセッションを発行しない。
 *   1. 本人がログイン画面で ID/パスワードを入力 → リクエスト作成（申請端末に token を返す）
 *   2. 管理者以上（admin/superadmin）の誰かが管理画面で承認
 *   3. 申請端末がポーリングで承認を検知 → token で signIn('admin-login-request') してログイン確定
 * token は申請端末しか持たないため、承認されても他の端末からはログインできない。
 */

/** 承認待ちの有効期限（この間に誰も承認しなければ無効） */
export const LOGIN_REQUEST_PENDING_MS = 10 * 60 * 1000
/** 承認後、申請端末がログインを確定できる期限（通常はポーリングで数秒以内に確定する） */
export const LOGIN_REQUEST_APPROVED_MS = 5 * 60 * 1000

/** ログインリクエストを承認できるロール（管理者以上。HR は対象外） */
export const LOGIN_REQUEST_APPROVER_ROLES = ['admin', 'superadmin'] as const

export function canApproveLoginRequests(role: unknown): boolean {
  return (LOGIN_REQUEST_APPROVER_ROLES as readonly string[]).includes(role as string)
}

export function hashLoginRequestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** 申請端末から見た状態。expired は保存値ではなく期限から導出する */
export type LoginRequestState = 'pending' | 'approved' | 'rejected' | 'used' | 'cancelled' | 'expired'

export function loginRequestState(r: { status: string; expiresAt: Date }): LoginRequestState {
  if ((r.status === 'pending' || r.status === 'approved') && r.expiresAt.getTime() <= Date.now()) {
    return 'expired'
  }
  return r.status as LoginRequestState
}

export function clientInfoFromHeaders(headers: Headers): { ip: string | null; userAgent: string | null } {
  const fwd = headers.get('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() || headers.get('x-real-ip') || null
  return { ip, userAgent: headers.get('user-agent') }
}

/**
 * ログインリクエストを作成する。同じアカウントの未処理リクエストは取り消し、
 * 承認者の一覧には常に最新の1件だけが並ぶようにする（連打・別端末からの再申請対策）。
 */
export async function createAdminLoginRequest(input: {
  adminId: string
  ip: string | null
  userAgent: string | null
}): Promise<{ requestId: string; token: string; code: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url')
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0')
  const expiresAt = new Date(Date.now() + LOGIN_REQUEST_PENDING_MS)

  const [, created] = await prisma.$transaction([
    prisma.adminLoginRequest.updateMany({
      where: { adminId: input.adminId, status: 'pending' },
      data: { status: 'cancelled' },
    }),
    prisma.adminLoginRequest.create({
      data: {
        adminId: input.adminId,
        tokenHash: hashLoginRequestToken(token),
        code,
        ip: input.ip,
        userAgent: input.userAgent,
        expiresAt,
      },
      select: { id: true },
    }),
  ])

  return { requestId: created.id, token, code, expiresAt }
}

/** 申請端末の token と照合してリクエストを取得（token 不一致は存在しない扱い） */
export async function findLoginRequestByToken(requestId: string, token: string) {
  const r = await prisma.adminLoginRequest.findUnique({ where: { id: requestId } })
  if (!r) return null
  const a = Buffer.from(r.tokenHash)
  const b = Buffer.from(hashLoginRequestToken(token))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return r
}

/** ログイン承認不要期間の上限（長期の承認省略を防ぐ） */
export const LOGIN_APPROVAL_EXEMPT_MAX_DAYS = 366

/**
 * ログイン承認不要期間の内側か。期間内は ID/パスワードだけでログインできる。
 * from 未設定は「すぐに開始」、until 未設定は期間なし扱い（無期限の省略は作らない）。
 */
export function isLoginApprovalExempt(
  a: { loginApprovalExemptFrom: Date | null; loginApprovalExemptUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (!a.loginApprovalExemptUntil) return false
  if (a.loginApprovalExemptFrom && a.loginApprovalExemptFrom.getTime() > now.getTime()) return false
  return a.loginApprovalExemptUntil.getTime() > now.getTime()
}
