'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import MarketPricesPage from '@/components/MarketPricesPage'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function StoreMarketPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage />

  return <MarketPricesPage portal="store" />
}
