import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type StoreUser = {
  id: string
  email: string | null
  name: string | null
  /** サブアカウントかどうか（StoreMember）。決済機能などは false の店舗本人のみに許可する */
  isSubAccount?: boolean
}

/** 店舗ロールでログインしているか確認 */
export async function requireStore(): Promise<StoreUser | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') return null
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    isSubAccount: !!user.isSubAccount,
  }
}

/** 店舗本人のみ許可（サブアカウント禁止）。決済まわりはこちらを使う。 */
export async function requireStoreOwner(): Promise<StoreUser | null> {
  const user = await requireStore()
  if (!user) return null
  if (user.isSubAccount) return null
  return user
}
