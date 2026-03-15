'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import MarketPricesPage from '@/components/MarketPricesPage'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminMarketPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated') {
      const user = session?.user as any
      if (user?.role !== 'admin') router.push('/')
    }
  }, [status, session, router])

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage />

  return <MarketPricesPage portal="admin" />
}
