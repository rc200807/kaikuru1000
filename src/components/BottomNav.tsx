'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStoreScope } from '@/components/store/StoreScopeContext'
import { storeNavItemsFromKeys, passesStoreNavGate, type StoreNavItemDef } from '@/lib/store-nav'
import { STORE_NAV_ICONS } from '@/components/store/storeNavIcons'

type LinkedStore = {
  id: string
  name: string
  code: string
  avatar: string | null
}

// アカウント関連（メニュー構成の設定対象外。常にハンバーガーメニューの末尾に表示する）
const accountNavItems: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: '/store/profile',
    label: 'プロフィール設定',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/store/billing',
    label: 'お支払い情報',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const { data: session, update } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const user = session?.user as any

  const [menuOpen, setMenuOpen] = useState(false)
  const [linkedStores, setLinkedStores] = useState<LinkedStore[]>([])
  const [switching, setSwitching] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const [releaseUnread, setReleaseUnread] = useState(0)
  const scope = useStoreScope()

  // Fetch unread announcement count
  useEffect(() => {
    if (user?.id) {
      const fetchUnread = () => {
        fetch('/api/store/announcements/unread-count')
          .then(r => r.ok ? r.json() : { count: 0 })
          .then(data => setUnreadCount(data.count || 0))
          .catch(() => {})
      }
      fetchUnread()
      const onFocus = () => fetchUnread()
      window.addEventListener('focus', onFocus)
      return () => window.removeEventListener('focus', onFocus)
    }
  }, [user?.id, pathname])

  // Fetch unread release-note count（ダッシュボード閲覧で既読化されるとイベントで更新）
  useEffect(() => {
    if (!user?.id) return
    const fetchReleaseUnread = () => {
      fetch('/api/store/release-notes/unread-count')
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(data => setReleaseUnread(data.count || 0))
        .catch(() => {})
    }
    fetchReleaseUnread()
    window.addEventListener('focus', fetchReleaseUnread)
    window.addEventListener('releasenotes:read', fetchReleaseUnread)
    return () => {
      window.removeEventListener('focus', fetchReleaseUnread)
      window.removeEventListener('releasenotes:read', fetchReleaseUnread)
    }
  }, [user?.id, pathname])

  // Fetch unread 本部チャット count
  useEffect(() => {
    if (!user?.id) return
    const fetchChatUnread = () => {
      fetch('/api/store/chat/unread-count')
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(data => setChatUnread(data.count || 0))
        .catch(() => {})
    }
    fetchChatUnread()
    const timer = setInterval(() => { if (!document.hidden) fetchChatUnread() }, 30000)
    window.addEventListener('focus', fetchChatUnread)
    window.addEventListener('chat:activity', fetchChatUnread)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', fetchChatUnread)
      window.removeEventListener('chat:activity', fetchChatUnread)
    }
  }, [user?.id, pathname])

  // Fetch linked accounts
  useEffect(() => {
    if (user?.id) {
      fetch('/api/store/linked-accounts')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.currentStore && data?.linkedStores?.length > 0) {
            const all = [data.currentStore, ...data.linkedStores]
            setLinkedStores(all)
          } else {
            setLinkedStores([])
          }
        })
        .catch(() => setLinkedStores([]))
    }
  }, [user?.id])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

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
        setMenuOpen(false)
        router.refresh()
      }
    } catch { /* ignore */ }
    finally { setSwitching(false) }
  }

  const hasLinkedStores = linkedStores.length > 1
  // 表示するメニュー（管理ポータルの設定順）＋店舗状態による追加条件
  const navItems: StoreNavItemDef[] = storeNavItemsFromKeys(scope.navKeys).filter(item => passesStoreNavGate(item, scope))
  // 下部バーは mobileBarLabel を持つ項目のうち、表示対象になっているものだけ（最大3件）
  const barItems = navItems.filter(item => item.mobileBarLabel).slice(0, 3)

  return (
    <>
      {/* Overlay */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Slide-up drawer menu */}
      <div className={`
        md:hidden fixed bottom-0 left-0 right-0 z-50
        transform transition-transform duration-300 ease-out
        ${menuOpen ? 'translate-y-0' : 'translate-y-full'}
      `}>
        <div className="bg-[var(--md-sys-color-surface)] rounded-t-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_-4px_16px_rgba(0,0,0,0.08)] max-h-[85vh] flex flex-col">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          </div>

          {/* 表示する店舗（運営者配下の複数店舗スコープ。表示のみで操作店舗は変わらない） */}
          {scope.availableStores.length >= 2 && (
            <div className="px-4 pt-2 pb-3 border-b border-[rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-faint)] uppercase tracking-wider">
                  表示する店舗{scope.isMulti && <span className="ml-1.5 normal-case text-[var(--store-primary)]">{scope.selectedIds.length}店舗</span>}
                </p>
                {scope.selectedIds.length < scope.availableStores.length ? (
                  <button onClick={scope.selectAll} className="text-[11px] font-medium text-[var(--store-primary)]">すべて選択</button>
                ) : (
                  <button onClick={scope.resetToSelf} className="text-[11px] font-medium text-[var(--store-primary)]">自店舗のみ</button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {scope.availableStores.map(store => {
                  const isSelf = store.id === user?.id
                  const checked = scope.selectedIds.includes(store.id)
                  return (
                    <button
                      key={store.id}
                      onClick={() => scope.toggleStore(store.id)}
                      disabled={isSelf}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg shrink-0 transition-colors border
                        ${checked
                          ? 'border-[var(--store-primary)] bg-[var(--store-primary-container)]'
                          : 'border-transparent bg-[var(--md-sys-color-surface-container)] active:bg-[var(--md-sys-color-surface-container-high)]'
                        }
                      `}
                    >
                      {store.avatar ? (
                        <img src={store.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px] font-semibold">{store.name[0]}</span>
                        </div>
                      )}
                      <div className="text-left min-w-0">
                        <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)] truncate max-w-[100px]">{store.name}</p>
                        <p className="text-[9px] text-[var(--md-sys-color-on-surface-faint)]">{isSelf ? 'ログイン中' : checked ? '表示中' : '非表示'}</p>
                      </div>
                      {checked && (
                        <svg className="w-4 h-4 text-[var(--store-primary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Store switcher section (only if linked stores exist) */}
          {hasLinkedStores && (
            <div className="px-4 pt-2 pb-3 border-b border-[rgba(0,0,0,0.08)]">
              <p className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-faint)] uppercase tracking-wider mb-2">
                操作する店舗を切り替え
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {linkedStores.map(store => {
                  const isCurrent = store.id === user?.id
                  return (
                    <button
                      key={store.id}
                      onClick={() => handleSwitch(store.id)}
                      disabled={isCurrent || switching}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg shrink-0 transition-colors
                        ${isCurrent
                          ? 'bg-[var(--md-sys-color-surface-container-high)] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]'
                          : 'bg-[var(--md-sys-color-surface-container)] active:bg-[var(--md-sys-color-surface-container-high)]'
                        }
                        disabled:opacity-70
                      `}
                    >
                      {store.avatar ? (
                        <img src={store.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-semibold">{store.name[0]}</span>
                        </div>
                      )}
                      <div className="text-left min-w-0">
                        <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)] truncate max-w-[100px]">{store.name}</p>
                        <p className="text-[10px] text-[var(--md-sys-color-on-surface-faint)] font-mono">{store.code}</p>
                      </div>
                      {isCurrent && (
                        <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface)] shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Current user info */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-3 border-b border-[rgba(0,0,0,0.08)]">
            {user?.avatar ? (
              <img src={user.avatar} className="w-10 h-10 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--store-primary)] flex items-center justify-center">
                <span className="text-white text-sm font-semibold">{user?.name?.[0] ?? '?'}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{user?.name ?? '店舗'}</p>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-faint)] truncate">{user?.email ?? ''}</p>
            </div>
          </div>

          {/* Navigation items */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            <div className="grid grid-cols-3 gap-1">
              {[...navItems, ...accountNavItems].map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                const badgeCount = item.href === '/store/announcements' ? unreadCount : item.href === '/store/chat' ? chatUnread : item.href === '/store/dashboard' ? releaseUnread : 0
                const showBadge = badgeCount > 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`
                      flex flex-col items-center gap-1 py-3 px-1 rounded-lg transition-colors relative
                      ${active
                        ? 'bg-[var(--store-primary-container)] text-[var(--store-primary)]'
                        : 'text-[var(--md-sys-color-on-surface-variant)] active:bg-[var(--md-sys-color-surface-container-high)]'
                      }
                    `}
                  >
                    <div className="relative">
                      {'key' in item ? STORE_NAV_ICONS[item.key] : item.icon}
                      {showBadge && (
                        <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 rounded-full bg-[var(--store-primary)] text-white text-[9px] font-bold leading-none">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] leading-tight text-center ${active ? 'font-semibold text-[var(--store-primary)]' : 'font-medium'}`}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Logout */}
          <div className="px-4 py-3 border-t border-[rgba(0,0,0,0.08)] safe-area-bottom">
            <button
              onClick={() => {
                if (confirm('ログアウトしますか？')) {
                  signOut({ callbackUrl: '/store/login' })
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] active:bg-[var(--md-sys-color-outline-variant)] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span className="text-sm font-medium">ログアウト</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--md-sys-color-surface)] shadow-[inset_0_1px_0_0_rgba(0,0,0,0.08)] safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {barItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex flex-col items-center justify-center gap-0.5 w-full h-full
                  text-[10px] transition-colors
                  ${active
                    ? 'text-[var(--store-primary)] font-semibold'
                    : 'text-[var(--md-sys-color-on-surface-variant)] font-medium'
                  }
                `}
              >
                <div className={`
                  relative px-4 py-1 rounded-full transition-colors
                  ${active ? 'bg-[var(--store-primary-container)]' : ''}
                `}>
                  {STORE_NAV_ICONS[item.key]}
                  {item.href === '/store/dashboard' && releaseUnread > 0 && (
                    <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-[var(--store-primary)]" />
                  )}
                </div>
                {item.mobileBarLabel}
              </Link>
            )
          })}

          {/* Hamburger menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`
              flex flex-col items-center justify-center gap-0.5 w-full h-full
              text-[10px] transition-colors
              ${menuOpen
                ? 'text-[var(--store-primary)] font-semibold'
                : 'text-[var(--md-sys-color-on-surface-variant)] font-medium'
              }
            `}
          >
            <div className={`
              relative px-4 py-1 rounded-full transition-colors
              ${menuOpen ? 'bg-[var(--store-primary-container)]' : ''}
            `}>
              {menuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
              {!menuOpen && chatUnread > 0 && (
                <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-[var(--store-primary)]" />
              )}
            </div>
            メニュー
          </button>
        </div>
      </nav>
    </>
  )
}
