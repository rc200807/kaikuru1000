'use client'

// sysadmin の「タブ切替ページ」共通コンテナ。
// useSearchParams を使うため必ず <Suspense> でラップする（next build の prerender 対策）。

import { Suspense } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import Tabs from '@/components/Tabs'
import { useSysAdminGuard } from '@/components/sysadmin/useSysAdminGuard'
import { useTabParam } from '@/components/sysadmin/useTabParam'

export type TabDef = { key: string; label: string }

type Props = {
  title: string
  description?: string
  tabs: TabDef[]
  defaultKey: string
  components: Record<string, React.ComponentType>
  maxWidth?: number
}

function CenteredSpinner() {
  return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
}

export default function SysAdminTabPage(props: Props) {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <TabPageContent {...props} />
    </Suspense>
  )
}

function TabPageContent({ title, description, tabs, defaultKey, components, maxWidth = 1280 }: Props) {
  const guard = useSysAdminGuard()
  const keys = tabs.map(t => t.key)
  const [tab, setTab] = useTabParam(keys, defaultKey)

  if (guard === 'loading') return <CenteredSpinner />

  const Active = components[tab] ?? components[defaultKey]

  return (
    <div style={{ padding: '24px 20px', maxWidth, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>{title}</h1>
      {description && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>{description}</p>
      )}
      <Tabs tabs={tabs} activeKey={tab} onChange={k => setTab(k)} mobileVariant="menu" className="mb-5" />
      <Active />
    </div>
  )
}
