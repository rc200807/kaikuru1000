'use client'

import { useState, useEffect, useRef } from 'react'

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
  /**
   * mobileVariant="menu" のとき、スマートフォン幅では
   * 横スクロールの代わりにドロップダウンメニューを表示する。
   * デフォルトは "scroll"（従来の挙動）。
   */
  mobileVariant?: 'scroll' | 'menu'
}

export default function Tabs({
  tabs,
  activeKey,
  onChange,
  className = '',
  mobileVariant = 'scroll',
}: TabsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeTab = tabs.find(t => t.key === activeKey)

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  // タブが切り替わったときにメニューを閉じる
  useEffect(() => {
    setMenuOpen(false)
  }, [activeKey])

  /* ── 共通: デスクトップ用 horizontal tabs ── */
  const desktopNav = (extraClass = '') => (
    <div className={`border-b border-[var(--md-sys-color-outline-variant)] ${extraClass}`}>
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

  /* ── scroll モード（従来の挙動） ── */
  if (mobileVariant !== 'menu') {
    return desktopNav(className)
  }

  /* ── menu モード ── */
  return (
    <div className={className}>
      {/* スマートフォン: ドロップダウンメニュー */}
      <div className="sm:hidden relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-surface)] text-sm font-medium text-[var(--md-sys-color-on-surface)] transition-colors hover:bg-[var(--md-sys-color-surface-container-low)]"
        >
          {/* 現在のタブ名 */}
          <span className="flex items-center gap-2">
            {activeTab?.icon && <span className="flex-shrink-0">{activeTab.icon}</span>}
            <span>{activeTab?.label}</span>
          </span>

          {/* ハンバーガー or 閉じる */}
          {menuOpen ? (
            <svg
              className="w-5 h-5 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* ドロップダウンリスト */}
        {menuOpen && (
          <div
            role="listbox"
            className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-medium)] shadow-[var(--md-sys-elevation-2,0_3px_6px_rgba(0,0,0,0.15))] overflow-hidden"
          >
            {tabs.map((tab, i) => {
              const active = tab.key === activeKey
              return (
                <button
                  key={tab.key}
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(tab.key); setMenuOpen(false) }}
                  className={`
                    w-full flex items-center justify-between gap-3 px-4 py-3.5 text-sm text-left
                    transition-colors
                    ${i > 0 ? 'border-t border-[var(--md-sys-color-outline-variant)]' : ''}
                    ${active
                      ? 'font-semibold text-[var(--portal-primary,#374151)] bg-[var(--md-sys-color-surface-container-low)]'
                      : 'font-normal text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)]'
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                    {tab.label}
                  </span>
                  {active && (
                    <svg
                      className="w-4 h-4 flex-shrink-0 text-[var(--portal-primary,#374151)]"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* デスクトップ: 通常の横並びタブ */}
      {desktopNav('hidden sm:block')}
    </div>
  )
}
