'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStoreScope } from '@/components/store/StoreScopeContext'

type LinkedStore = {
  id: string
  name: string
  code: string
  avatar: string | null
}

/** 組織管理ナビ項目（運営者あり かつ 組織管理者のみ表示） */
export const ORG_NAV_ITEM = {
  href: '/store/organization',
  label: '組織管理',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
}

/** 空き家管理ナビ項目（アキクル対応店舗のみ表示） */
export const AKIYA_NAV_ITEM = {
  href: '/store/akiya',
  label: '空き家管理',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
    </svg>
  ),
}

const navItems = [
  {
    href: '/store/dashboard',
    label: 'ダッシュボード',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/store/schedule',
    label: 'スケジュール',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    href: '/store/customers',
    label: '顧客',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    href: '/store/members',
    label: 'メンバー',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    href: '/store/market',
    label: '相場検索',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    href: '/store/announcements',
    label: 'お知らせ',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  },
  {
    href: '/store/chiebukuro',
    label: '知恵袋',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    href: '/store/chat',
    label: '本部チャット',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
  },
  {
    href: '/store/inquiries',
    label: '問い合わせ',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    href: '/store/deals',
    label: '案件',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
  },
  {
    href: '/store/purchase-items',
    label: '買取品目',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    href: '/store/inventory',
    label: '在庫',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    href: '/store/training-videos',
    label: '研修動画',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    href: '/store/bug-report',
    label: '不具合報告',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    href: '/store/mystore',
    label: '店舗情報',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
      </svg>
    ),
  },
]

export default function NavigationRail() {
  const { data: session, update } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const user = session?.user as any

  const [linkedStores, setLinkedStores] = useState<LinkedStore[]>([])
  const [switching, setSwitching] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const [releaseUnread, setReleaseUnread] = useState(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
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

  // Fetch unread 本部チャット count（フォーカス・定期・チャット操作時に更新）
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

  // Fetch linked accounts on mount
  useEffect(() => {
    if (user?.id) {
      fetch('/api/store/linked-accounts')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.currentStore && data?.linkedStores?.length > 0) {
            setLinkedStores([data.currentStore, ...data.linkedStores])
          } else {
            setLinkedStores([])
          }
        })
        .catch(() => setLinkedStores([]))
    }
  }, [user?.id])

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

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 flex-shrink-0 h-screen sticky top-0 bg-[var(--md-sys-color-surface)] shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.08)]">
      {/* Header branding */}
      <div className="px-4 pt-5 pb-4">
        <Link href="/store/dashboard" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="買いクル" className="w-8 h-8 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">買いクル</p>
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">店舗ポータル</p>
          </div>
        </Link>
      </div>

      <hr className="border-[rgba(0,0,0,0.08)] mx-4" />

      {/* Nav items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto thin-scrollbar">
        {[...navItems, ...(scope.services.includes('akikuru') ? [AKIYA_NAV_ITEM] : []), ...(scope.availableStores.length > 0 && scope.isOrgAdmin ? [ORG_NAV_ITEM] : [])].map(item => {
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
                {item.icon}
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
                          <img src={store.avatar} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
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
                          <img src={store.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
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
            <img src={user.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
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
