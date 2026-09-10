'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import NavigationRail from '@/components/NavigationRail'
import BottomNav from '@/components/BottomNav'
import { ToastProvider } from '@/components/Toast'
import { StoreScopeProvider } from '@/components/store/StoreScopeContext'
import { StoreBadgesProvider } from '@/components/store/StoreBadgesContext'
import { StoreMastersProvider } from '@/components/store/StoreMastersContext'
import type { StoreScopeBootstrap, StoreMasters } from '@/lib/store-bootstrap'

/**
 * 店舗ポータルの外枠。
 * セッションはサーバー側（layout.tsx）で解決済みのものを受け取り、SessionProvider に渡す。
 * こうすると初回の /api/auth/session が発生せず、ページは自分のデータ取得を
 * すぐ開始できる（従来は「JS読込 → セッション確認1往復 → データ取得」の直列だった）。
 */
export default function StoreShell({
  session,
  scope,
  masters,
  children,
}: {
  session: Session | null
  /** サーバー（layout.tsx）で解決した表示スコープ。null なら Provider がクライアントで取得する */
  scope?: StoreScopeBootstrap | null
  /** サーバーで解決した共通マスタ。null なら各画面が従来どおり自分で取得する */
  masters?: StoreMasters | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // 店舗専用ログイン（/store/login/[storeCode]）も同じくシェル無しで表示する
  const isLoginPage = pathname === '/store/login' || pathname.startsWith('/store/login/')
  const isAgreementPage = /\/store\/schedule\/[^/]+\/agreement/.test(pathname)
  // チャットは自前で全高レイアウトを組むため、main の下部パディングを付けない
  const isChatPage = pathname === '/store/chat'
  // 案件詳細は下部に追従バー（sticky）を持つため、main の下パディングがあるとバーが浮く
  const isDealDetail = /^\/store\/deals\/[^/]+$/.test(pathname)

  // SessionProvider は「どの見た目のときも必ず」外側に置く。
  // ここで分岐の内側だけに置くと、クライアント遷移で SessionProvider が外れた枝
  // （契約書ページなど）に入った瞬間 useSession() が loading のまま固まる。
  // next-auth はモジュール内の単一セッション状態を共有するため、
  // 初期セッション付きの Provider が一度でもマウントされると、
  // 素の Provider は再取得をスキップして undefined を返し続けてしまう
  // （＝「売買契約書を作成」を押すと読み込み画面から進まない不具合の原因）。
  const shell = isLoginPage ? (
    <div data-portal="store">{children}</div>
  ) : isAgreementPage ? (
    // 契約書ページではサイドバー・ボトムナビを非表示
    <div data-portal="store" className="min-h-screen" style={{ background: 'var(--md-sys-color-surface)' }}>
      <main className="min-w-0">{children}</main>
    </div>
  ) : (
    <div data-portal="store" className="flex min-h-screen" style={{ background: 'var(--md-sys-color-surface)' }}>
      <ToastProvider>
        {/* key に店舗IDを入れて、店舗切替（router.refresh() で新しい scope が来る）のときに
            Provider ごと作り直す。localStorage のキーも切り替わり、古い選択が残らない */}
        <StoreScopeProvider key={scope?.sessionStoreId ?? 'anon'} initial={scope}>
          <StoreMastersProvider value={masters ?? null}>
          {/* ナビのバッジは Rail と BottomNav で共有する（別々に取ると同じAPIを二重に叩く） */}
          <StoreBadgesProvider>
            <NavigationRail />
            <main className={`flex-1 min-w-0 ${isChatPage || isDealDetail ? '' : 'pb-20 md:pb-4'}`}>
              {children}
            </main>
            <BottomNav />
          </StoreBadgesProvider>
          </StoreMastersProvider>
        </StoreScopeProvider>
      </ToastProvider>
    </div>
  )

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      {shell}
    </SessionProvider>
  )
}
