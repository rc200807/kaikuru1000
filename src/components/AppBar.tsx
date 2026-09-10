'use client'

import StoreScopeBar from '@/components/store/StoreScopeBar'

type AppBarProps = {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export default function AppBar({ title, subtitle, actions, className = '' }: AppBarProps) {
  return (
    <header
      className={`bg-[var(--md-sys-color-surface)] sticky top-0 z-30 ${className}`}
      style={{ boxShadow: 'rgba(0,0,0,0.08) 0px 1px 0px 0px' }}
    >
      <div className="px-4 sm:px-6 py-3 min-h-[var(--appbar-h)] flex items-center justify-between">
        <div className="min-w-0">
          {subtitle && (
            <p className="text-[13px] font-normal text-[var(--md-sys-color-on-surface-variant)] mb-0.5">
              {subtitle}
            </p>
          )}
          <h1 className="text-[14px] font-semibold text-[var(--md-sys-color-on-surface)] truncate tracking-[-0.01em]">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {actions}
          </div>
        )}
      </div>
      {/*
        店舗ポータルで複数店舗を表示しているときだけ出るスコープ帯。
        単一店舗のとき、および店舗ポータル以外（StoreScopeProvider の外）では何も描画しない。
        店舗ポータルのページはほぼ全て AppBar を直接使っているので、ここに置くと全画面に行き渡る。
      */}
      <StoreScopeBar />
    </header>
  )
}
