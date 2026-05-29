import { prisma } from '@/lib/prisma'

type AccessLogInput = {
  userType: string // customer/store/admin/superadmin/hr/sysadmin/partner
  userId?: string | null
  userName?: string | null
  action: string // login / 備品登録 / 発注ステータス更新 など
  req?: any // NextRequest（headers は Headers）または NextAuth authorize の req（headers は plain object）
}

// Headers / plain object どちらからもヘッダー値を取得
function getHeader(headers: any, key: string): string | null {
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get(key)
  const v = headers[key] ?? headers[key.toLowerCase()]
  return Array.isArray(v) ? v[0] : (v ?? null)
}

/**
 * アクセス・操作ログを記録する。失敗しても本処理を止めないよう握り潰す。
 * ログイン履歴だけでなく、データ追加・更新・削除などの操作も記録する。
 */
export async function recordAccessLog(input: AccessLogInput): Promise<void> {
  try {
    const h = input.req?.headers
    const fwd = getHeader(h, 'x-forwarded-for')
    const ip = fwd ? fwd.split(',')[0]?.trim() || null : null
    const ua = getHeader(h, 'user-agent')

    await prisma.accessLog.create({
      data: {
        userType: input.userType,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: input.action,
        ip: ip || null,
        userAgent: ua || null,
      },
    })
  } catch (e) {
    console.error('[access-log] failed to record', e)
  }
}
