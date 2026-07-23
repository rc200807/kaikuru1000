'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import BusinessActivityTab from '@/components/sysadmin/tabs/BusinessActivityTab'
import CommunicationTab from '@/components/sysadmin/tabs/CommunicationTab'
import TrackingActivityTab from '@/components/sysadmin/tabs/TrackingActivityTab'
import ContentActivityTab from '@/components/sysadmin/tabs/ContentActivityTab'

const TABS = [
  { key: 'business', label: '案件・買取' },
  { key: 'communication', label: 'コミュニケーション' },
  { key: 'tracking', label: 'アクセス計測' },
  { key: 'content', label: 'コンテンツ' },
]

export default function SysAdminActivityPage() {
  return (
    <SysAdminTabPage
      title="業務アクティビティ"
      description="システム全体で起きている業務活動の俯瞰"
      tabs={TABS}
      defaultKey="business"
      components={{
        business: BusinessActivityTab,
        communication: CommunicationTab,
        tracking: TrackingActivityTab,
        content: ContentActivityTab,
      }}
    />
  )
}
