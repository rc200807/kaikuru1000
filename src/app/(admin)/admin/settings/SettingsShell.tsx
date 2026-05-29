'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'

/** 設定サブページ共通シェル: ロールガード + AppBar + 「設定一覧へ戻る」リンク */
export default function SettingsShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    } else if (status === 'authenticated' && !['admin', 'superadmin', 'hr'].includes((session!.user as any).role)) {
      router.push('/')
    }
  }, [status, session, router])

  if (status !== 'authenticated') {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar title={title} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-[var(--portal-primary,#374151)] hover:underline"
        >
          ← 設定一覧へ戻る
        </Link>
        {children}
      </div>
    </>
  )
}
