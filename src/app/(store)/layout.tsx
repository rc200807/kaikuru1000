'use client'

import { usePathname } from 'next/navigation'
import NavigationRail from '@/components/NavigationRail'
import BottomNav from '@/components/BottomNav'
import { ToastProvider } from '@/components/Toast'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/store/login'
  const isAgreementPage = /\/store\/schedule\/[^/]+\/agreement/.test(pathname)
  // チャットは自前で全高レイアウトを組むため、main の下部パディングを付けない
  const isChatPage = pathname === '/store/chat'

  if (isLoginPage) {
    return <div data-portal="store">{children}</div>
  }

  // 契約書ページではサイドバー・ボトムナビを非表示
  if (isAgreementPage) {
    return (
      <div data-portal="store" className="min-h-screen" style={{ background: 'var(--md-sys-color-surface)' }}>
        <main className="min-w-0">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div data-portal="store" className="flex min-h-screen" style={{ background: 'var(--md-sys-color-surface)' }}>
      <ToastProvider>
        <NavigationRail />
        <main className={`flex-1 min-w-0 ${isChatPage ? '' : 'pb-20 md:pb-4'}`}>
          {children}
        </main>
        <BottomNav />
      </ToastProvider>
    </div>
  )
}
