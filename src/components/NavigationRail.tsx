'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStoreScope } from '@/components/store/StoreScopeContext'
import { useStoreBadges } from '@/components/store/StoreBadgesContext'
import { storeNavItemsFromKeys, passesStoreNavGate } from '@/lib/store-nav'
import { STORE_NAV_ICONS } from '@/components/store/storeNavIcons'

export default function NavigationRail() {
  const { data: session, update } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const user = session?.user as any

  const [switching, setSwitching] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const scope = useStoreScope()
  // 未読件数・リンク店舗はレイアウトの Provider が1回だけ取得し、BottomNav と共有する
  const { announcements: unreadCount, releaseNotes: releaseUnread, chat: chatUnread, storeAccounts: linkedStores } = useStoreBadges()

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [userMenuOpen])

  async function handleSwitch(targetId: string) {
    if (targetId === user?.id || switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/store/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStoreId: targetId }),
      })
      if (res.ok) {
        await update({ switchStoreId: targetId })
        setUserMenuOpen(false)
        router.refresh()
      }
    } catch { /* ignore */ }
    finally { setSwitching(false) }
  }

  const hasLinkedStores = linkedStores.length > 1
  // 表示するメニュー（管理ポータルの設定順）＋店舗状態による追加条件
  const navItems = storeNavItemsFromKeys(scope.navKeys).filter(item => passesStoreNavGate(item, scope))

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 flex-shrink-0 h-screen sticky top-0 bg-[var(--md-sys-color-surface)] shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.08)]">
      {/* Header branding */}
      <div className="px-4 pt-5 pb-4">
        <Link href="/store/dashboard" className="flex items-center gap-2.5">
          <img loading="lazy" decoding="async" src="/icon.svg" alt="買いクル" className="w-8 h-8 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">買いクル</p>
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">店舗ポータル</p>
          </div>
        </Link>
      </div>

      <hr className="border-[rgba(0,0,0,0.08)] mx-4" />

      {/* Nav items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto thin-scrollbar">
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const badgeCount = item.href === '/store/announcements' ? unreadCount : item.href === '/store/chat' ? chatUnread : item.href === '/store/dashboard' ? releaseUnread : 0
          const showBadge = badgeCount > 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors relative
                ${active
                  ? 'bg-[var(--store-primary-container)] text-[var(--store-primary)] font-semibold'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]'
                }
              `}
            >
              <span className="flex-shrink-0 relative">
                {STORE_NAV_ICONS[item.key]}
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center px-0.5 rounded-full bg-[var(--store-primary)] text-white text-[9px] font-bold leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User menu at bottom */}
      <div className="relative shadow-[inset_0_1px_0_0_rgba(0,0,0,0.08)]" ref={userMenuRef}>
        {/* Popup menu (opens upward) */}
        {userMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg bg-[var(--md-sys-color-surface)] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden z-50">
            {/* 表示する店舗（運営者配下の複数店舗スコープ。表示のみで操作店舗は変わらない） */}
            {scope.availableStores.length >= 2 && (
              <>
                <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-[var(--md-sys-color-on-surface-faint)] uppercase tracking-wider">表示する店舗</p>
                  {scope.selectedIds.length < scope.availableStores.length ? (
                    <button onClick={scope.selectAll} className="text-[10px] font-medium text-[var(--store-primary)] hover:underline">すべて選択</button>
                  ) : (
                    <button onClick={scope.resetToSelf} className="text-[10px] font-medium text-[var(--store-primary)] hover:underline">自店舗のみ</button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {scope.availableStores.map(store => {
                    const isSelf = store.id === user?.id
                    const checked = scope.selectedIds.includes(store.id)
                    return (
                      <button
                        key={store.id}
                        onClick={() => scope.toggleStore(store.id)}
                        disabled={isSelf}
                        className="w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-100"
                        title={isSelf ? 'ログイン中の店舗は常に表示されます' : undefined}
                      >
                        <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          checked ? 'bg-[var(--store-primary)] border-[var(--store-primary)]' : 'border-[var(--md-sys-color-outline)]'
                        } ${isSelf ? 'opacity-60' : ''}`}>
                          {checked && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </span>
                        {store.avatar ? (
                          <img loading="lazy" decoding="async" src={store.avatar} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
                            <span className="text-white text-[9px] font-semibold">{store.name[0]}</span>
                          </div>
                        )}
                        <p className="text-xs text-[var(--md-sys-color-on-surface)] truncate flex-1">
                          {store.name}
                          {isSelf && <span className="ml-1 text-[9px] text-[var(--md-sys-color-on-surface-faint)]">（ログイン中）</span>}
                        </p>
                      </button>
                    )
                  })}
                </div>
                <hr className="border-[rgba(0,0,0,0.08)]" />
              </>
            )}

            {/* Store switcher */}
            {hasLinkedStores && (
              <>
                <div className="px-3 pt-2.5 pb-1.5">
                  <p className="text-[10px] font-semibold text-[var(--md-sys-color-on-surface-faint)] uppercase tracking-wider">操作する店舗を切り替え</p>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {linkedStores.map(store => {
                    const isCurrent = store.id === user?.id
                    return (
                      <button
                        key={store.id}
                        onClick={() => handleSwitch(store.id)}
                        disabled={isCurrent || switching}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                          isCurrent ? 'bg-[var(--md-sys-color-surface-container-high)]' : 'hover:bg-[var(--md-sys-color-surface-container-high)]'
                        } disabled:opacity-70`}
                      >
                        {store.avatar ? (
                          <img loading="lazy" decoding="async" src={store.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-semibold">{store.name[0]}</span>
                          </div>
                        )}
                        <p className="text-xs text-[var(--md-sys-color-on-surface)] truncate flex-1">{store.name}</p>
                        {isCurrent && (
                          <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
                <hr className="border-[rgba(0,0,0,0.08)]" />
              </>
            )}

            {/* Menu items */}
            <div className="py-1">
              <Link
                href="/store/profile"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                プロフィール設定
              </Link>
              <Link
                href="/store/mystore"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                店舗設定
              </Link>
              <Link
                href="/store/billing"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                お支払い情報
              </Link>
            </div>

            <hr className="border-[rgba(0,0,0,0.08)]" />

            {/* Logout */}
            <div className="py-1">
              <button
                onClick={() => { if (confirm('ログアウトしますか？')) signOut({ callbackUrl: '/store/login' }) }}
                className="flex items-center gap-3 px-3 py-2.5 w-full text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                ログアウト
              </button>
            </div>
          </div>
        )}

        {/* User button */}
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        >
          {user?.avatar ? (
            <img loading="lazy" decoding="async" src={user.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-semibold">{user?.name?.[0] ?? '?'}</span>
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">{user?.name ?? '店舗'}</p>
            {scope.isMulti ? (
              <p className="text-[10px] font-semibold text-[var(--store-primary)] truncate">{scope.selectedIds.length}店舗を表示中</p>
            ) : (
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-faint)] truncate">{user?.email ?? ''}</p>
            )}
          </div>
          <svg className={`w-4 h-4 text-[var(--md-sys-color-on-surface-faint)] shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
