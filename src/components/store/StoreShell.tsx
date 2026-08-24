'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import NavigationRail from '@/components/NavigationRail'
import BottomNav from '@/components/BottomNav'
import { ToastProvider } from '@/components/Toast'
import { StoreScopeProvider } from '@/components/store/StoreScopeContext'
import { StoreBadgesProvider } from '@/components/store/StoreBadgesContext'

/**
 * 店舗ポータルの外枠。
 * セッションはサーバー側（layout.tsx）で解決済みのものを受け取り、SessionProvider に渡す。
 * こうすると初回の /api/auth/session が発生せず、ページは自分のデータ取得を
 * すぐ開始できる（従来は「JS読込 → セッション確認1往復 → データ取得」の直列だった）。
 */
export default function StoreShell({
  session,
  children,
}: {
  session: Session | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/store/login'
  const isAgreementPage = /\/store\/schedule\/[^/]+\/agreement/.test(pathname)
  // チャットは自前で全高レイアウトを組むため、main の下部パディングを付けない
  const isChatPage = pathname === '/store/chat'
  // 案件詳細は下部に追従バー（sticky）を持つため、main の下パディングがあるとバーが浮く
  const isDealDetail = /^\/store\/deals\/[^/]+$/.test(pathname)

  if (isLoginPage) {
    return <div data-portal="store">{children}</div>
  }

  // 契約書ページではサイドバー・ボトムナビを非表示
  if (isAgreementPage) {
    return (
      <div data-portal="store" className="min-h-screen" style={{ background: 'var(--md-sys-color-surface)' }}>
        <main className="min-w-0">{children}</main>
      </div>
    )
  }

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <div data-portal="store" className="flex min-h-screen" style={{ background: 'var(--md-sys-color-surface)' }}>
        <ToastProvider>
          <StoreScopeProvider>
            {/* ナビのバッジは Rail と BottomNav で共有する（別々に取ると同じAPIを二重に叩く） */}
            <StoreBadgesProvider>
              <NavigationRail />
              <main className={`flex-1 min-w-0 ${isChatPage || isDealDetail ? '' : 'pb-20 md:pb-4'}`}>
                {children}
              </main>
              <BottomNav />
            </StoreBadgesProvider>
          </StoreScopeProvider>
        </ToastProvider>
      </div>
    </SessionProvider>
  )
}
