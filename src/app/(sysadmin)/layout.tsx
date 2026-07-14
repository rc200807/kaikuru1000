'use client'

import { usePathname } from 'next/navigation'
import SysAdminNavigationDrawer from '@/components/SysAdminNavigationDrawer'

export default function SysAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/sysadmin/login'

  if (isLoginPage) {
    return <div data-portal="admin" style={{ color: 'var(--md-sys-color-on-surface)' }}>{children}</div>
  }

  return (
    <div data-portal="admin" className="flex min-h-screen" style={{ background: '#0a0a0a', color: 'var(--md-sys-color-on-surface)' }}>
      <SysAdminNavigationDrawer />
      <main className="flex-1 min-w-0 lg:pl-0 pb-4">{children}</main>
    </div>
  )
}
