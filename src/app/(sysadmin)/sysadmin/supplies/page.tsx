'use client'

import SysAdminTabPage from '@/components/sysadmin/TabPage'
import SupplyOrdersTab from '@/components/sysadmin/tabs/SupplyOrdersTab'
import InventoryListTab from '@/components/sysadmin/tabs/InventoryListTab'

const TABS = [
  { key: 'orders', label: '発注管理' },
  { key: 'inventory', label: '備品登録' },
]

export default function SysAdminSuppliesPage() {
  return (
    <SysAdminTabPage
      title="発注・備品"
      description="備品発注の対応と商品マスタの管理"
      tabs={TABS}
      defaultKey="orders"
      components={{ orders: SupplyOrdersTab, inventory: InventoryListTab }}
    />
  )
}
