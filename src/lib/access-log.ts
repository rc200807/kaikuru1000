import { prisma } from '@/lib/prisma'

type AccessLogInput = {
  userType: string // customer/store/admin/sysadmin/partner
  userId?: string | null
  userName?: string | null
  action: string // login など
  req?: any // NextAuth authorize の第2引数（headers を持つ）
}

/**
 * アクセスログを記録する。失敗してもログイン処理を止めないよう握り潰す。
 */
export async function recordAccessLog(input: AccessLogInput): Promise<void> {
  try {
    const headers = input.req?.headers ?? {}
    const fwd = headers['x-forwarded-for'] ?? headers['X-Forwarded-For']
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ?? null
    const ua = headers['user-agent'] ?? headers['User-Agent'] ?? null

    await prisma.accessLog.create({
      data: {
        userType: input.userType,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: input.action,
        ip: ip || null,
        userAgent: (Array.isArray(ua) ? ua[0] : ua) || null,
      },
    })
  } catch (e) {
    console.error('[access-log] failed to record', e)
  }
}
