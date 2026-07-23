'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

export default function LinkPartnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user as any
  const isAdmin = user?.partnerRole === 'partner_admin'
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const navItems = [
    { href: '/linkpartner/dashboard', label: 'ダッシュボード' },
    { href: '/linkpartner/inquiries', label: '問い合わせ' },
    { href: '/linkpartner/customers', label: '顧客情報' },
    ...(isAdmin ? [{ href: '/linkpartner/members', label: 'メンバー管理' }] : []),
    ...(isAdmin ? [{ href: '/linkpartner/statuses', label: '対応ステータス設定' }] : []),
  ]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [userMenuOpen])

  // ログイン・招待受諾・初回パスワード変更画面はサイドバー無し
  const isPublic =
    pathname === '/linkpartner/login' ||
    pathname === '/linkpartner/onboarding/password' ||
    pathname.startsWith('/linkpartner/invite/')
  if (isPublic) {
    return <div data-portal="linkpartner">{children}</div>
  }

  return (
    <div data-portal="linkpartner" className="flex min-h-screen bg-[#0f1115] text-[#ededed]">
      <aside className="hidden lg:flex w-60 flex-col flex-shrink-0 h-screen sticky top-0 bg-[#0a0a0a] shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.06)]">
        <div className="px-5 pt-5 pb-4">
          <p className="text-sm font-semibold">連携パートナー</p>
          <p className="text-[10px] text-[#666]">{user?.name ? '買いクル' : '買いクル'}</p>
        </div>
        <hr className="border-[rgba(255,255,255,0.06)] mx-4" />

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? 'bg-[#1a1a1a] text-[#fff] font-semibold' : 'text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-[#ededed]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="relative shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]" ref={userMenuRef}>
          {userMenuOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg bg-[#141414] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.4)] overflow-hidden z-50">
              <div className="py-1">
                <button
                  onClick={() => { if (confirm('ログアウトしますか？')) signOut({ callbackUrl: '/linkpartner/login' }) }}
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
            <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0 text-sm font-semibold">
              {user?.name?.[0] ?? '?'}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium text-[#ededed] truncate">{user?.name ?? 'メンバー'}</p>
              <p className="text-[10px] text-[#666] truncate">{user?.email ?? ''}</p>
            </div>
            <svg className={`w-4 h-4 text-[#666] shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
