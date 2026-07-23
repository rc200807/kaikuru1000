'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import AccessLogsTab from '@/components/sysadmin/tabs/AccessLogsTab'
import LoginAttemptsTab from '@/components/sysadmin/tabs/LoginAttemptsTab'
import SessionsTab from '@/components/sysadmin/tabs/SessionsTab'

const TABS = [
  { key: 'access-logs', label: 'アクセスログ' },
  { key: 'login-attempts', label: 'ログイン試行・ブロック' },
  { key: 'sessions', label: 'セッション' },
]

export default function SysAdminSecurityPage() {
  return (
    <SysAdminTabPage
      title="セキュリティ"
      description="アクセスログ・ログイン試行・デバイスセッションの監視"
      tabs={TABS}
      defaultKey="access-logs"
      components={{ 'access-logs': AccessLogsTab, 'login-attempts': LoginAttemptsTab, sessions: SessionsTab }}
    />
  )
}
