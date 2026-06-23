'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import DealDetailView from '@/components/DealDetailView'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminDealDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  if (status !== 'authenticated') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  return (
    <DealDetailView dealId={id} isAdmin backHref="/admin/deals" visitHrefBase="/admin/visits" />
  )
}
