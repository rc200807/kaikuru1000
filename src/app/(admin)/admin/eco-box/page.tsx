'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import DeliveryShipmentsSection from '@/components/admin/DeliveryShipmentsSection'
import VisitsSection from '@/components/admin/VisitsSection'
import PartnersSection from '@/components/admin/PartnersSection'
import EcoBoxCustomersTab from '@/components/admin/EcoBoxCustomersTab'

type TabKey = 'deliveries' | 'visit' | 'delivery' | 'visits' | 'partners'
const ALL_TABS: TabKey[] = ['deliveries', 'visit', 'delivery', 'visits', 'partners']

export default function AdminEcoBoxPage() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get('tab') as TabKey | null
  const initialTab: TabKey = tabParam && ALL_TABS.includes(tabParam) ? tabParam : 'deliveries'
  const [tab, setTab] = useState<TabKey>(initialTab)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  function changeTab(next: TabKey) {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'deliveries') url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    url.searchParams.delete('sub')
    window.history.replaceState(null, '', url.toString())
  }

  if (status === 'loading') {
    return <LoadingSpinner size="lg" fullPage />
  }

  return (
    <>
      <AppBar title="エコ得BOX" subtitle="宅配買取・定期顧客・パートナー・ライセンスキーを集約管理" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--md-sys-color-outline-variant)', overflowX: 'auto' }}>
          {([
            { key: 'deliveries', label: '宅配買取' },
            { key: 'visit',      label: '定期訪問顧客' },
            { key: 'delivery',   label: '定期宅配顧客' },
            { key: 'visits',     label: '訪問記録' },
            { key: 'partners',   label: 'パートナー / ライセンス' },
          ] as { key: TabKey; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--md-sys-color-primary)' : '2px solid transparent',
                color: tab === t.key ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'deliveries' && <DeliveryShipmentsSection />}
        {tab === 'visit'      && <EcoBoxCustomersTab customerType="visit" />}
        {tab === 'delivery'   && <EcoBoxCustomersTab customerType="delivery" />}
        {tab === 'visits'     && <VisitsSection customerTypes={['visit', 'delivery']} />}
        {tab === 'partners'   && <PartnersSection />}
      </div>
    </>
  )
}
