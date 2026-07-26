'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import RevenueTab from '@/components/sysadmin/tabs/RevenueTab'
import CostsTab from '@/components/sysadmin/tabs/CostsTab'
import RevenueShareTab from '@/components/sysadmin/tabs/RevenueShareTab'
import RevenueTransfersTab from '@/components/sysadmin/tabs/RevenueTransfersTab'

const TABS = [
  { key: 'revenue', label: '売上' },
  { key: 'costs', label: '運用コスト' },
  { key: 'share', label: '分配設定' },
  { key: 'transfers', label: '分配台帳' },
]

export default function SysAdminFinancePage() {
  return (
    <SysAdminTabPage
      title="売上・コスト"
      description="備品売上と運用コストの管理"
      tabs={TABS}
      defaultKey="revenue"
      components={{ revenue: RevenueTab, costs: CostsTab, share: RevenueShareTab, transfers: RevenueTransfersTab }}
      maxWidth={1080}
    />
  )
}
