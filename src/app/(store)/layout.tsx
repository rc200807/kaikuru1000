'use client'

import { usePathname } from 'next/navigation'
import NavigationRail from '@/components/NavigationRail'
import BottomNav from '@/components/BottomNav'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/store/login'

  if (isLoginPage) {
    return <div data-portal="store">{children}</div>
  }

  return (
    <div data-portal="store" className="flex min-h-screen bg-[var(--md-sys-color-surface)]">
      <NavigationRail />
      <main className="flex-1 min-w-0 pb-20 md:pb-4">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
