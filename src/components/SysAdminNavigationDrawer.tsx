'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  /** href 以外にアクティブ判定したいパス接頭辞（例: supplies に /sysadmin/inventory） */
  extraMatch?: string[]
}

type NavGroup = {
  heading: string | null // null = 見出しなし（ダッシュボード用）
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    heading: null,
    items: [
      {
        href: '/sysadmin/dashboard',
        label: 'ダッシュボード',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: '監視',
    items: [
      {
        href: '/sysadmin/health',
        label: 'システムヘルス',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12h2.25l1.5-3 2.25 6 1.5-3h2.25" />
          </svg>
        ),
      },
      {
        href: '/sysadmin/security',
        label: 'セキュリティ',
        extraMatch: ['/sysadmin/access-logs'],
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: '業務',
    items: [
      {
        href: '/sysadmin/activity',
        label: '業務アクティビティ',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        ),
      },
      {
        href: '/sysadmin/support',
        label: 'サポート',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.712 4.33a9.027 9.027 0 011.652 1.306c.51.51.944 1.064 1.306 1.652M16.712 4.33l-3.448 4.138m3.448-4.138a9.014 9.014 0 00-9.424 0M19.67 7.288l-4.138 3.448m4.138-3.448a9.014 9.014 0 010 9.424m-4.138-5.976a3.736 3.736 0 00-.88-1.388 3.737 3.737 0 00-1.388-.88m2.268 2.268a3.765 3.765 0 010 2.528m-2.268-4.796a3.765 3.765 0 00-2.528 0m4.796 4.796c-.181.506-.475.982-.88 1.388a3.736 3.736 0 01-1.388.88m2.268-2.268l4.138 3.448m0 0a9.027 9.027 0 01-1.306 1.652c-.51.51-1.064.944-1.652 1.306m0 0l-3.448-4.138m3.448 4.138a9.014 9.014 0 01-9.424 0m5.976-4.138a3.765 3.765 0 01-2.528 0m0 0a3.736 3.736 0 01-1.388-.88 3.737 3.737 0 01-.88-1.388m2.268 2.268L7.288 19.67m0 0a9.024 9.024 0 01-1.652-1.306 9.027 9.027 0 01-1.306-1.652m0 0l4.138-3.448M4.33 16.712a9.014 9.014 0 010-9.424m4.138 5.976a3.765 3.765 0 010-2.528m0 0c.181-.506.475-.982.88-1.388a3.736 3.736 0 011.388-.88m-2.268 2.268L4.33 7.288m6.406 1.18L7.288 4.33m0 0a9.024 9.024 0 00-1.652 1.306A9.025 9.025 0 004.33 7.288" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: '経営',
    items: [
      {
        href: '/sysadmin/finance',
        label: '売上・コスト',
        extraMatch: ['/sysadmin/revenue', '/sysadmin/costs'],
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        ),
      },
      {
        href: '/sysadmin/supplies',
        label: '発注・備品',
        extraMatch: ['/sysadmin/orders', '/sysadmin/inventory'],
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: 'アカウント',
    items: [
      {
        href: '/sysadmin/users',
        label: 'ユーザー',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        ),
      },
      {
        href: '/sysadmin/members',
        label: 'メンバー',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: '配信',
    items: [
      {
        href: '/sysadmin/release-notes',
        label: 'リリースノート',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
          </svg>
        ),
      },
    ],
  },
]

export default function SysAdminNavigationDrawer() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const user = session?.user as any

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [userMenuOpen])

  const drawerContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4">
        <Link href="/sysadmin/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <img src="/icon.svg" alt="買いクル" className="w-8 h-8 rounded-lg shrink-0 brightness-0 invert" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#ededed] truncate">買いクル</p>
            <p className="text-[10px] text-[#666666]">システム管理者</p>
          </div>
        </Link>
      </div>

      <hr className="border-[rgba(255,255,255,0.06)] mx-4" />

      <nav className="flex-1 px-3 py-2 overflow-y-auto thin-scrollbar">
        {navGroups.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`}>
            {group.heading && (
              <p className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-widest text-[#666666] select-none">
                {group.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/') ||
                  (item.extraMatch ?? []).some(p => pathname === p || pathname.startsWith(p + '/'))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
                      ${active
                        ? 'bg-[#1a1a1a] text-[#ffffff] font-semibold'
                        : 'text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-[#ededed]'
                      }
                    `}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]" ref={userMenuRef}>
        {userMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg bg-[#141414] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.4)] overflow-hidden z-50">
            <div className="py-1">
              <Link
                href="/sysadmin/profile"
                onClick={() => { setUserMenuOpen(false); setMobileOpen(false) }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-[#ededed] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                プロフィール
              </Link>
            </div>
            <hr className="border-[rgba(255,255,255,0.06)]" />
            <div className="py-1">
              <button
                onClick={() => { if (confirm('ログアウトしますか？')) signOut({ callbackUrl: '/sysadmin/login' }) }}
                className="flex items-center gap-3 px-3 py-2.5 w-full text-sm text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-[#ededed] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                ログアウト
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-[#ffffff] flex items-center justify-center shrink-0">
            <span className="text-[#171717] text-sm font-semibold">{user?.name?.[0] ?? 'S'}</span>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium text-[#ededed] truncate">{user?.name ?? 'システム管理者'}</p>
            <p className="text-[10px] text-[#666666] truncate">{user?.email ?? ''}</p>
          </div>
          <svg className={`w-4 h-4 text-[#666666] shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4" />
          </svg>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:block w-64 flex-shrink-0 h-screen sticky top-0 bg-[#0a0a0a] shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.06)]">
        {drawerContent}
      </aside>

      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-[#0a0a0a] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.3)] text-[#ededed]"
        aria-label="メニューを開く"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0a] shadow-[1px_0_0_0_rgba(255,255,255,0.06),4px_0_16px_rgba(0,0,0,0.4)] animate-[slideInLeft_200ms_ease-out]">
            {drawerContent}
          </aside>
        </div>
      )}
    </>
  )
}
