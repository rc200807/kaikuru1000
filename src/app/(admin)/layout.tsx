'use client'

import { usePathname } from 'next/navigation'
import NavigationDrawer from '@/components/NavigationDrawer'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // ログイン・オンボーディング（パスキー登録/承認待ち）はナビ無しの単独レイアウト
  const barePaths = ['/admin/login', '/admin/onboarding/passkey', '/admin/pending-approval']
  const isBare = barePaths.includes(pathname)

  if (isBare) {
    return <div data-portal="admin" style={{ color: 'var(--md-sys-color-on-surface)' }}>{children}</div>
  }

  return (
    <div data-portal="admin" className="flex min-h-screen" style={{ background: '#0a0a0a', color: 'var(--md-sys-color-on-surface)' }}>
      <NavigationDrawer />
      <main className="flex-1 min-w-0 lg:pl-0 pb-4">
        {children}
      </main>
    </div>
  )
}
