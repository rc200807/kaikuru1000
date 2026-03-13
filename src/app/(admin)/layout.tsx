'use client'

import { usePathname } from 'next/navigation'
import NavigationDrawer from '@/components/NavigationDrawer'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  if (isLoginPage) {
    return <div data-portal="admin">{children}</div>
  }

  return (
    <div data-portal="admin" className="flex min-h-screen bg-[var(--md-sys-color-surface)]">
      <NavigationDrawer />
      <main className="flex-1 min-w-0 lg:pl-0 pb-4">
        {children}
      </main>
    </div>
  )
}
