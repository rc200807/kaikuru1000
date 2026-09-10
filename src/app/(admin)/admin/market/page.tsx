'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import dynamic from 'next/dynamic'

// 相場画面は recharts に依存していて重い。ページ本体ごと遅延読み込みして
// 初期JSから外す（グラフだけを切り出すには computed 値の受け渡しが多すぎるため境界をここに置く）
const MarketPricesPage = dynamic(() => import('@/components/MarketPricesPage'), {
  ssr: false,
  loading: () => <LoadingSpinner size="lg" fullPage />,
})
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminMarketPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated') {
      const user = session?.user as any
      if (!['admin','superadmin','hr'].includes(user?.role)) router.push('/')
    }
  }, [status, session, router])

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage />

  return <MarketPricesPage portal="admin" />
}
