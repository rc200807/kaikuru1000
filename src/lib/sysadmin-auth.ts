import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type SysAdminUser = {
  id: string
  email: string
  name?: string | null
  avatar?: string | null
}

/**
 * システム管理者（role==='sysadmin'）のみを通す。
 * 管理ポータルの admin/superadmin/hr とは完全に分離。
 */
export async function getSysAdminUser(): Promise<SysAdminUser | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || user.role !== 'sysadmin') return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    avatar: user.avatar ?? null,
  }
}

export async function requireSysAdmin(): Promise<SysAdminUser | null> {
  return getSysAdminUser()
}
