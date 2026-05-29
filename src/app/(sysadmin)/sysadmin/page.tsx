'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SysAdminIndexPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/sysadmin/dashboard')
  }, [router])
  return null
}
