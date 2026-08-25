'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import NavigationDrawer from '@/components/NavigationDrawer'

/**
 * 管理ポータルの外枠。
 * セッションはサーバー側（layout.tsx）で解決済みのものを受け取って SessionProvider に渡す。
 * これで初回の /api/auth/session が発生せず、ページはすぐ自分のデータ取得を始められる。
 */
export default function AdminShell({
  session,
  children,
}: {
  session: Session | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // ログイン・オンボーディング（パスキー登録/承認待ち）はナビ無しの単独レイアウト
  const barePaths = ['/admin/login', '/admin/onboarding/passkey', '/admin/pending-approval']
  const isBare = barePaths.includes(pathname)

  if (isBare) {
    return <div data-portal="admin" style={{ color: 'var(--md-sys-color-on-surface)' }}>{children}</div>
  }

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <div data-portal="admin" className="flex min-h-screen" style={{ background: '#0a0a0a', color: 'var(--md-sys-color-on-surface)' }}>
        <NavigationDrawer />
        <main className="flex-1 min-w-0 lg:pl-0 pb-4">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
