'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user as any

  // ログイン・招待受諾画面はサイドバー無し
  const isPublic = pathname === '/partner/login' || pathname.startsWith('/partner/invite/')
  if (isPublic) {
    return <div data-portal="partner">{children}</div>
  }

  const navItems = [
    { href: '/partner/dashboard', label: 'ダッシュボード' },
    { href: '/partner/customers', label: 'ライセンスキー顧客' },
  ]

  return (
    <div data-portal="partner" className="flex min-h-screen bg-[#0f1115] text-[#ededed]">
      <aside className="hidden lg:flex w-60 flex-col bg-[#0a0a0a] shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.06)]">
        <div className="px-5 pt-5 pb-4">
          <p className="text-sm font-semibold">セールスパートナー</p>
          <p className="text-[10px] text-[#666]">買いクル</p>
        </div>
        <hr className="border-[rgba(255,255,255,0.06)] mx-4" />
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {navItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-[#1a1a1a] text-[#fff] font-semibold'
                    : 'text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-[#ededed]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)]">
          <p className="text-sm font-medium truncate">{user?.name ?? 'パートナー'}</p>
          <p className="text-[11px] text-[#666] truncate">{user?.email ?? ''}</p>
          <button
            onClick={() => { if (confirm('ログアウトしますか？')) signOut({ callbackUrl: '/partner/login' }) }}
            className="mt-2 text-xs text-[#a3a3a3] hover:text-white"
          >
            ログアウト
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  )
}
