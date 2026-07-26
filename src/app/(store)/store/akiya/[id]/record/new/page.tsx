'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import AkiyaRecordForm from '@/components/akiya/AkiyaRecordForm'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function StoreAkiyaRecordNewPage() {
  const params = useParams()
  const id = params.id as string
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  if (status !== 'authenticated') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  return <AkiyaRecordForm caseId={id} backHref={`/store/akiya/${id}`} />
}
