'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * ライセンスキー管理はセールスパートナーページに統合された。
 * 旧 URL を踏んだユーザーは新タブへリダイレクトする。
 */
export default function AdminLicensesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/partners?tab=licenses')
  }, [router])
  return null
}
