'use client'

import { usePathname, useRouter } from 'next/navigation'
import Tabs from '@/components/Tabs'

const TABS = [
  { key: 'stores', label: '店舗管理' },
  { key: 'visits', label: '訪問記録' },
  { key: 'purchase-items', label: '買取品目' },
  { key: 'operators', label: '運営者情報' },
  { key: 'store-members', label: '店舗メンバー' },
  { key: 'monitoring', label: 'モニタリング' },
]

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const activeKey = TABS.find(t => pathname.startsWith(`/admin/${t.key}`))?.key ?? 'stores'

  return (
    <>
      <div className="px-4 sm:px-6 pt-4">
        <Tabs
          tabs={TABS}
          activeKey={activeKey}
          onChange={(key) => router.push(`/admin/${key}`)}
          mobileVariant="menu"
        />
      </div>
      {children}
    </>
  )
}
