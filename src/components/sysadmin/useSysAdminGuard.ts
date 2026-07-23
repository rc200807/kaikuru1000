'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

/** sysadmin ロール以外を /sysadmin/login へ誘導する共通ガード。 */
export function useSysAdminGuard(): 'loading' | 'ok' {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/sysadmin/login')
    if (status === 'authenticated' && role !== 'sysadmin') router.push('/sysadmin/login')
  }, [status, role, router])

  return status === 'authenticated' && role === 'sysadmin' ? 'ok' : 'loading'
}
