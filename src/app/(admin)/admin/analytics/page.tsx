'use client'

// 管理ポータル: 分析（GA風の期間・条件切替つき統合ダッシュボード）
import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import AnalyticsFilterBar, { FilterState } from '@/components/admin/analytics/AnalyticsFilterBar'
import OverviewTab from '@/components/admin/analytics/OverviewTab'
import SalesTab from '@/components/admin/analytics/SalesTab'
import DealsTab from '@/components/admin/analytics/DealsTab'
import CustomersTab from '@/components/admin/analytics/CustomersTab'
import StoresTab from '@/components/admin/analytics/StoresTab'
import InventoryTab from '@/components/admin/analytics/InventoryTab'
import EngagementTab from '@/components/admin/analytics/EngagementTab'
import { PRESETS, PresetKey } from '@/lib/analytics/period'
import { ANALYTICS_TABS, ANALYTICS_TAB_LABEL, AnalyticsTab, AnalyticsFilterOptions } from '@/lib/analytics/types'

const TAB_COMPONENTS: Record<AnalyticsTab, React.ComponentType<{ query: string }>> = {
  overview: OverviewTab,
  sales: SalesTab,
  deals: DealsTab,
  customers: CustomersTab,
  stores: StoresTab,
  inventory: InventoryTab,
  engagement: EngagementTab,
}

function parseState(sp: URLSearchParams): { tab: AnalyticsTab; filter: FilterState } {
  const tabRaw = sp.get('tab')
  const tab: AnalyticsTab = (ANALYTICS_TABS as readonly string[]).includes(tabRaw ?? '') ? (tabRaw as AnalyticsTab) : 'overview'
  const presetRaw = sp.get('preset')
  const preset: PresetKey = (PRESETS as readonly string[]).includes(presetRaw ?? '') ? (presetRaw as PresetKey) : '30d'
  const granularityRaw = sp.get('granularity')
  return {
    tab,
    filter: {
      preset,
      from: sp.get('from'),
      to: sp.get('to'),
      compare: sp.get('compare') === 'year' ? 'year' : sp.get('compare') === 'none' ? 'none' : 'prev',
      granularity: granularityRaw === 'day' || granularityRaw === 'week' || granularityRaw === 'month' ? granularityRaw : 'auto',
      storeId: sp.get('storeId'),
      dealCategory: sp.get('dealCategory'),
      customerType: sp.get('customerType'),
      leadSource: sp.get('leadSource'),
    },
  }
}

function buildQueryString(tab: AnalyticsTab, filter: FilterState): string {
  const qs = new URLSearchParams()
  if (tab !== 'overview') qs.set('tab', tab)
  if (filter.preset !== '30d') qs.set('preset', filter.preset)
  if (filter.preset === 'custom') {
    if (filter.from) qs.set('from', filter.from)
    if (filter.to) qs.set('to', filter.to)
  }
  if (filter.compare !== 'prev') qs.set('compare', filter.compare)
  if (filter.granularity !== 'auto') qs.set('granularity', filter.granularity)
  if (filter.storeId) qs.set('storeId', filter.storeId)
  if (filter.dealCategory) qs.set('dealCategory', filter.dealCategory)
  if (filter.customerType) qs.set('customerType', filter.customerType)
  if (filter.leadSource) qs.set('leadSource', filter.leadSource)
  return qs.toString()
}

/** API へ渡すクエリ（tab を除く実質パラメータ） */
function buildApiQuery(filter: FilterState): string {
  const qs = new URLSearchParams()
  qs.set('preset', filter.preset)
  if (filter.preset === 'custom') {
    if (filter.from) qs.set('from', filter.from)
    if (filter.to) qs.set('to', filter.to)
  }
  qs.set('compare', filter.compare)
  if (filter.granularity !== 'auto') qs.set('granularity', filter.granularity)
  if (filter.storeId) qs.set('storeId', filter.storeId)
  if (filter.dealCategory) qs.set('dealCategory', filter.dealCategory)
  if (filter.customerType) qs.set('customerType', filter.customerType)
  if (filter.leadSource) qs.set('leadSource', filter.leadSource)
  return qs.toString()
}

function AnalyticsPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { tab, filter } = useMemo(() => parseState(new URLSearchParams(searchParams.toString())), [searchParams])
  const [options, setOptions] = useState<AnalyticsFilterOptions | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as { role?: string }
    if (!['admin', 'superadmin', 'hr'].includes(user.role ?? '')) { router.push('/'); return }
    fetch('/api/admin/analytics/filters')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOptions(d) })
      .catch(() => {})
  }, [status, session, router])

  const update = useCallback((nextTab: AnalyticsTab, patch: Partial<FilterState>) => {
    const nextFilter = { ...filter, ...patch }
    // カスタム以外のプリセットに切り替えたら from/to をクリア
    if (patch.preset && patch.preset !== 'custom') { nextFilter.from = null; nextFilter.to = null }
    const qs = buildQueryString(nextTab, nextFilter)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filter, pathname, router])

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  const apiQuery = buildApiQuery(filter)
  const ActiveTab = TAB_COMPONENTS[tab]

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)]">
      <AppBar title="分析" subtitle="店舗全体のデータを多角的に可視化" />

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <AnalyticsFilterBar state={filter} options={options} onChange={patch => update(tab, patch)} />

        {/* タブ */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--md-sys-color-outline-variant)] -mx-1 px-1">
          {ANALYTICS_TABS.map(t => (
            <button
              key={t}
              onClick={() => update(t, {})}
              className={`text-[13px] px-3.5 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-surface)] font-semibold'
                  : 'border-transparent text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              {ANALYTICS_TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <ActiveTab query={apiQuery} />
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" fullPage label="読み込み中..." />}>
      <AnalyticsPageInner />
    </Suspense>
  )
}
