'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import DealDetailView from '@/components/DealDetailView'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function StoreDealDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  if (status !== 'authenticated') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  return (
    <DealDetailView dealId={id} isAdmin={false} backHref="/store/deals" visitHrefBase="/store/schedule" />
  )
}
