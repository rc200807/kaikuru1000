'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

type LinkedStore = {
  id: string
  name: string
  code: string
  avatar: string | null
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
    label: '相場',
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a1.125 1.125 0 01-1.538-.41l-.456-.79a21.986 21.986 0 01-2.065-5.424m6.144-5.16c-.253-.962-.584-1.892-.985-2.783a1.125 1.125 0 01.463-1.511l.657-.38a1.125 1.125 0 011.538.41l.456.79a21.986 21.986 0 012.065 5.424M12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm5.28-2.03a3 3 0 010 4.06" />
      </svg>
    ),
  },
  // コミュニティは一旦非表示
  // {
  //   href: '/store/community',
  //   label: 'コミュニティ',
  // },
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

  const [showSwitcher, setShowSwitcher] = useState(false)
  const [linkedStores, setLinkedStores] = useState<LinkedStore[]>([])
  const [switching, setSwitching] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  // Fetch linked accounts on mount
  useEffect(() => {
    if (user?.id) {
      fetch('/api/store/linked-accounts')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.currentStore && data?.linkedStores?.length > 0) {
            // 自分 + リンク先をまとめる
            const all = [data.currentStore, ...data.linkedStores]
            setLinkedStores(all)
          } else {
            setLinkedStores([])
          }
        })
        .catch(() => setLinkedStores([]))
    }
  }, [user?.id])

  // Close switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false)
      }
    }
    if (showSwitcher) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSwitcher])

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
        setShowSwitcher(false)
        router.refresh()
      }
    } catch { /* ignore */ }
    finally { setSwitching(false) }
  }

  const hasLinkedStores = linkedStores.length > 1

  return (
    <aside className="hidden md:flex flex-col items-center w-20 flex-shrink-0 h-screen sticky top-0 bg-[var(--md-sys-color-surface-container)] py-4 gap-2">
      {/* Profile avatar + store switcher */}
      <div className="relative mb-4" ref={switcherRef}>
        <button
          onClick={() => hasLinkedStores ? setShowSwitcher(!showSwitcher) : router.push('/store/profile')}
          className="relative group"
        >
          {user?.avatar ? (
            <img src={user.avatar} className="w-10 h-10 rounded-full object-cover group-hover:ring-2 ring-[var(--store-primary)] transition-all" alt="" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--store-primary)] flex items-center justify-center group-hover:ring-2 ring-[var(--store-primary-container)] transition-all">
              <span className="text-[var(--store-on-primary)] text-sm font-semibold">{user?.name?.[0] ?? '?'}</span>
            </div>
          )}
          {/* 切り替えバッジ */}
          {hasLinkedStores && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--store-primary)] flex items-center justify-center border-2 border-[var(--md-sys-color-surface-container)]">
              <svg className="w-2.5 h-2.5 text-[var(--store-on-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
              </svg>
            </div>
          )}
        </button>

        {/* Store switcher popup */}
        {showSwitcher && hasLinkedStores && (
          <div className="absolute left-full top-0 ml-2 z-50 w-56 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-lg overflow-hidden">
            <div className="p-2.5 border-b border-[var(--md-sys-color-outline-variant)]">
              <p className="text-[10px] font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">店舗を切り替え</p>
            </div>
            <div className="py-1 max-h-64 overflow-y-auto">
              {linkedStores.map(store => {
                const isCurrent = store.id === user?.id
                return (
                  <button
                    key={store.id}
                    onClick={() => handleSwitch(store.id)}
                    disabled={isCurrent || switching}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                      isCurrent
                        ? 'bg-[var(--store-primary-container)]/30'
                        : 'hover:bg-[var(--md-sys-color-surface-container-high)]'
                    } disabled:opacity-70`}
                  >
                    {store.avatar ? (
                      <img src={store.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
                        <span className="text-[var(--store-on-primary)] text-xs font-semibold">{store.name[0]}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)] truncate">{store.name}</p>
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] font-mono">{store.code}</p>
                    </div>
                    {isCurrent && (
                      <svg className="w-4 h-4 text-[var(--store-primary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="p-2 border-t border-[var(--md-sys-color-outline-variant)]">
              <Link
                href="/store/profile"
                onClick={() => setShowSwitcher(false)}
                className="block text-center text-[10px] text-[var(--md-sys-color-on-surface-variant)] hover:underline py-1"
              >
                プロフィール設定
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-1">
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-1 group"
            >
              <div className={`
                px-4 py-1.5 rounded-full transition-colors
                ${active
                  ? 'bg-[var(--store-primary-container)] text-[var(--store-on-primary-container)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)] group-hover:bg-[var(--md-sys-color-surface-container-high)]'
                }
              `}>
                {item.icon}
              </div>
              <span className={`text-[10px] font-medium ${active ? 'text-[var(--store-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={() => { if (confirm('ログアウトしますか？')) signOut({ callbackUrl: '/store/login' }) }}
        className="p-2 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        aria-label="ログアウト"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
      </button>
    </aside>
  )
}
