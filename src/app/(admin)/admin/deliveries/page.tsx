'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 宅配買取はエコ得BOXに統合された。旧 URL は新タブへリダイレクトする。
 */
export default function AdminDeliveriesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/eco-box?tab=deliveries')
  }, [router])
  return null
}
