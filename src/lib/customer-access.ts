import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ADMIN_ROLES } from '@/lib/admin-auth'

/**
 * 顧客1人分の個人情報（顧客情報・身分証・セルフィー・住所証明書類）を扱う API の共通認可。
 *
 * 許可リスト方式で、通すのは次の3者だけ:
 *   - 顧客本人
 *   - 担当店舗（User.storeId === セッション店舗）
 *   - 管理ポータル（admin / superadmin / hr）
 * partner / linkpartner / sysadmin など、それ以外のロールは一律 403。
 * 以前は「顧客」と「店舗」だけを個別に弾く拒否リスト方式で、
 * 想定外のロール（連携パートナー等）が他人の身分証を閲覧・削除・差し替えできた。
 *
 * allowOperatorStores=true のときだけ、同じ運営者に属する店舗の閲覧も許す
 * （店舗ポータルの複数店舗横断表示。書き込みや身分証には使わない）。
 */
export type CustomerAccessActor = { id: string; role: string }

export async function authorizeCustomerAccess(
  customerId: string,
  opts: { allowOperatorStores?: boolean } = {},
): Promise<{ actor: CustomerAccessActor } | { error: NextResponse }> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.id || !user?.role) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const actor: CustomerAccessActor = { id: user.id, role: user.role }
  const forbidden = { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  if ((ADMIN_ROLES as string[]).includes(actor.role)) return { actor }

  if (actor.role === 'customer') {
    return actor.id === customerId ? { actor } : forbidden
  }

  if (actor.role === 'store') {
    const target = await prisma.user.findUnique({ where: { id: customerId }, select: { storeId: true } })
    if (!target?.storeId) return forbidden
    if (target.storeId === actor.id) return { actor }
    if (opts.allowOperatorStores) {
      const stores = await prisma.store.findMany({
        where: { id: { in: [actor.id, target.storeId] } },
        select: { id: true, operatorId: true },
      })
      const own = stores.find((s) => s.id === actor.id)
      const theirs = stores.find((s) => s.id === target.storeId)
      if (own?.operatorId && own.operatorId === theirs?.operatorId) return { actor }
    }
    return forbidden
  }

  return forbidden
}

/** 保存先（Vercel Blob）の URL を返さず、認可付きの中継 URL に置き換える */
export function customerFileProxyUrls(
  customerId: string,
  u: {
    idDocumentPath?: string | null
    idDocumentBackPath?: string | null
    selfieImagePath?: string | null
    proofDocumentPath?: string | null
    idFacePhotoPath?: string | null
  },
) {
  return {
    ...('idDocumentPath' in u ? { idDocumentPath: u.idDocumentPath ? `/api/users/${customerId}/id-document` : null } : {}),
    ...('idDocumentBackPath' in u ? { idDocumentBackPath: u.idDocumentBackPath ? `/api/users/${customerId}/id-document/back` : null } : {}),
    ...('selfieImagePath' in u ? { selfieImagePath: u.selfieImagePath ? `/api/users/${customerId}/selfie-verify` : null } : {}),
    ...('proofDocumentPath' in u ? { proofDocumentPath: u.proofDocumentPath ? `/api/users/${customerId}/proof-document` : null } : {}),
    // 顔写真の切り出し画像は配信APIが無いので、有無だけ返す
    ...('idFacePhotoPath' in u ? { idFacePhotoPath: u.idFacePhotoPath ? 'stored' : null } : {}),
  }
}
