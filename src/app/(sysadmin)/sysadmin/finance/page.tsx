'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import RevenueTab from '@/components/sysadmin/tabs/RevenueTab'
import CostsTab from '@/components/sysadmin/tabs/CostsTab'

const TABS = [
  { key: 'revenue', label: '売上' },
  { key: 'costs', label: '運用コスト' },
]

export default function SysAdminFinancePage() {
  return (
    <SysAdminTabPage
      title="売上・コスト"
      description="備品売上と運用コストの管理"
      tabs={TABS}
      defaultKey="revenue"
      components={{ revenue: RevenueTab, costs: CostsTab }}
      maxWidth={1080}
    />
  )
}
