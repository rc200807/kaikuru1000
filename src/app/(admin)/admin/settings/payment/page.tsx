'use client'

import AdminCardManager from '@/components/admin/AdminCardManager'
import SettingsShell from '../SettingsShell'

export default function PaymentSettingsPage() {
  return (
    <SettingsShell title="決済カード">
      <AdminCardManager />
    </SettingsShell>
  )
}
