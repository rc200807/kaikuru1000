'use client'

type Tab = {
  key: string
  label: string
  icon?: React.ReactNode
}

type TabsProps = {
  tabs: Tab[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

export default function Tabs({ tabs, activeKey, onChange, className = '' }: TabsProps) {
  return (
    <div className={`border-b border-[var(--md-sys-color-outline-variant)] ${className}`}>
      <nav className="flex gap-0 overflow-x-auto thin-scrollbar" role="tablist">
        {tabs.map(tab => {
          const active = tab.key === activeKey
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={`
                relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                transition-colors outline-none
                ${active
                  ? 'text-[var(--portal-primary,#374151)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)]'
                }
              `}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--portal-primary,#374151)] rounded-full" />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
