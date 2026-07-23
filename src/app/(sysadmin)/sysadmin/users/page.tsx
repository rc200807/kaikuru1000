'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import CustomersTab from '@/components/sysadmin/tabs/CustomersTab'
import StoresOperatorsTab from '@/components/sysadmin/tabs/StoresOperatorsTab'
import AdminsPartnersTab from '@/components/sysadmin/tabs/AdminsPartnersTab'

const TABS = [
  { key: 'customers', label: '顧客' },
  { key: 'stores', label: '店舗・運営者' },
  { key: 'admins', label: '管理者・パートナー' },
]

export default function SysAdminUsersPage() {
  return (
    <SysAdminTabPage
      title="ユーザー"
      description="顧客・店舗・運営者・管理者・パートナーの全体像"
      tabs={TABS}
      defaultKey="customers"
      components={{ customers: CustomersTab, stores: StoresOperatorsTab, admins: AdminsPartnersTab }}
    />
  )
}
