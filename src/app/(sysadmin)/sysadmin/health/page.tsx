'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import JobsTab from '@/components/sysadmin/tabs/JobsTab'
import ErrorLogsTab from '@/components/sysadmin/tabs/ErrorLogsTab'
import IntegrationsTab from '@/components/sysadmin/tabs/IntegrationsTab'

const TABS = [
  { key: 'jobs', label: 'ジョブ・キュー' },
  { key: 'errors', label: 'エラーログ' },
  { key: 'integrations', label: '外部連携' },
]

export default function SysAdminHealthPage() {
  return (
    <SysAdminTabPage
      title="システムヘルス"
      description="ジョブ・未捕捉エラー・外部サービス連携の監視"
      tabs={TABS}
      defaultKey="jobs"
      components={{ jobs: JobsTab, errors: ErrorLogsTab, integrations: IntegrationsTab }}
    />
  )
}
