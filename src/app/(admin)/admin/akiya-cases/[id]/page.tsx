'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import AkiyaCaseDetailView from '@/components/akiya/AkiyaCaseDetailView'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminAkiyaCaseDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  if (status !== 'authenticated') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  return (
    <AkiyaCaseDetailView
      caseId={id}
      isAdmin
      backHref="/admin/akiya-cases"
      recordNewHref={`/admin/akiya-cases/${id}/record/new`}
    />
  )
}
