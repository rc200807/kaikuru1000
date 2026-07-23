'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import InquiriesTab from '@/components/sysadmin/tabs/InquiriesTab'
import BugReportsTab from '@/components/sysadmin/tabs/BugReportsTab'

const TABS = [
  { key: 'inquiries', label: '問い合わせ' },
  { key: 'bugs', label: '不具合報告' },
]

export default function SysAdminSupportPage() {
  return (
    <SysAdminTabPage
      title="サポート"
      description="問い合わせ・不具合報告の状況（閲覧専用）"
      tabs={TABS}
      defaultKey="inquiries"
      components={{ inquiries: InquiriesTab, bugs: BugReportsTab }}
    />
  )
}
