'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * セールスパートナー管理はエコ得BOXに統合された。
 * 既存の ?tab=licenses 等のクエリは ?tab=partners&sub=licenses に変換してから遷移。
 */
export default function AdminPartnersRedirectPage() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  )
}

function Redirector() {
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    const sub = searchParams.get('tab') // 旧URLでは ?tab=licenses で来る
    const url = sub
      ? `/admin/eco-box?tab=partners&sub=${encodeURIComponent(sub)}`
      : '/admin/eco-box?tab=partners'
    router.replace(url)
  }, [router, searchParams])
  return null
}
