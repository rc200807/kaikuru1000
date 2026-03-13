'use client'

type AppBarProps = {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export default function AppBar({ title, subtitle, actions, className = '' }: AppBarProps) {
  return (
    <header className={`bg-[var(--md-sys-color-surface)] sticky top-0 z-30 ${className}`}>
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="min-w-0">
          {subtitle && (
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-wide uppercase mb-0.5">
              {subtitle}
            </p>
          )}
          <h1 className="text-xl font-semibold text-[var(--md-sys-color-on-surface)] truncate">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}
