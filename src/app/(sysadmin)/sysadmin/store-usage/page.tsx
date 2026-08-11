'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import StoreUsageTab from '@/components/sysadmin/tabs/StoreUsageTab'
import StoreFeeSummaryTab from '@/components/sysadmin/tabs/StoreFeeSummaryTab'
import StoreFeePlanTab from '@/components/sysadmin/tabs/StoreFeePlanTab'

const TABS = [
  { key: 'usage', label: '利用状況' },
  { key: 'fees', label: '利用料集計' },
  { key: 'plans', label: '料金設定' },
]

export default function SysAdminStoreUsagePage() {
  return (
    <SysAdminTabPage
      title="店舗利用状況"
      description="店舗のサービス対応状況とシステム利用料（月額）の集計"
      tabs={TABS}
      defaultKey="usage"
      components={{ usage: StoreUsageTab, fees: StoreFeeSummaryTab, plans: StoreFeePlanTab }}
    />
  )
}
