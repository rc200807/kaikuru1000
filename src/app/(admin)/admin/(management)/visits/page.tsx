'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import VisitsSection from '@/components/admin/VisitsSection'

export default function AdminVisitsPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  if (status === 'loading') {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <>
      <AppBar
        title="訪問記録"
        subtitle="全店舗の訪問履歴を検索・閲覧できます"
      />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <VisitsSection />
      </div>
    </>
  )
}
