import { prisma } from '@/lib/prisma'

// 連携パートナーの記録対象アクション（利用状況ダッシュボードで集計する）
export type LinkPartnerAction =
  | 'login'
  | 'invite_member'
  | 'accept_invite'
  | 'view_customer'
  | 'view_inquiry'
  | 'export_customers'
  | 'export_inquiries'

type LinkPartnerActivityInput = {
  linkPartnerId: string
  memberId?: string | null
  memberName?: string | null // 表示用スナップショット（メンバー削除後も可読）
  action: LinkPartnerAction | string
  targetType?: string | null // customer | inquiry | member | form
  targetId?: string | null
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
 * 連携パートナーの行動ログを記録する。失敗しても本処理を止めないよう握り潰す（fire-and-forget）。
 * login も含め連携パートナーの全イベントをこの専用テーブルへ一元化する（グローバル AccessLog は汚さない）。
 */
export async function recordLinkPartnerActivity(input: LinkPartnerActivityInput): Promise<void> {
  try {
    const h = input.req?.headers
    const fwd = getHeader(h, 'x-forwarded-for')
    const ip = fwd ? fwd.split(',')[0]?.trim() || null : null
    const ua = getHeader(h, 'user-agent')

    await prisma.linkPartnerActivityLog.create({
      data: {
        linkPartnerId: input.linkPartnerId,
        memberId: input.memberId ?? null,
        memberName: input.memberName ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: ip || null,
        userAgent: ua || null,
      },
    })
  } catch (e) {
    console.error('[link-partner-activity] failed to record', e)
  }
}
