import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type LinkPartnerUser = {
  id: string // LinkPartnerMember.id
  email: string
  name: string | null
  linkPartnerId: string
  partnerRole: string // 'partner_admin' | 'member'
}

/**
 * 連携パートナーのメンバー（partner_admin / member 問わず）を要求する。
 * API ルートの防御線（middleware に続く2層目）。未認証・別ロールは null。
 */
export async function requireLinkPartner(): Promise<LinkPartnerUser | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || user.role !== 'linkpartner' || !user.linkPartnerId) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    linkPartnerId: user.linkPartnerId,
    partnerRole: user.partnerRole ?? 'member',
  }
}

/**
 * 連携パートナー管理者（partner_admin）のみを要求する。メンバー招待・管理系で使う。
 */
export async function requireLinkPartnerAdmin(): Promise<LinkPartnerUser | null> {
  const user = await requireLinkPartner()
  if (!user || user.partnerRole !== 'partner_admin') return null
  return user
}
