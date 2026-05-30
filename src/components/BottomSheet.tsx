'use client'

import { useEffect, useCallback } from 'react'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** デスクトップでの最大幅（既定 max-w-lg） */
  desktopMaxWidth?: string
}

/**
 * ハーフモーダル。
 * モバイル: 画面下からスライドイン（ドラッグハンドル付き）。
 * デスクトップ(sm+): 中央寄せのモーダルにフォールバック。
 * 背景クリック / Escape で閉じる。`prefers-reduced-motion` はCSS側で考慮。
 */
export default function BottomSheet({
  open, onClose, title, children, footer, desktopMaxWidth = 'sm:max-w-lg',
}: BottomSheetProps) {
  // Escape で閉じる
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onKey])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 背景スクリム */}
      <div className="absolute inset-0 bg-[var(--md-sys-color-scrim)]/50 animate-fade-in" />

      {/* パネル */}
      <div
        onClick={e => e.stopPropagation()}
        className={`
          relative w-full ${desktopMaxWidth} sm:w-[calc(100%-2rem)]
          bg-[var(--md-sys-color-surface-container-lowest,#fff)]
          rounded-t-2xl sm:rounded-2xl
          max-h-[88vh] sm:max-h-[85vh] flex flex-col
          shadow-[var(--md-sys-elevation-3)]
          animate-sheet-up sm:animate-[modalIn_200ms_ease-out]
          pb-[env(safe-area-inset-bottom,0px)] sm:pb-0
        `}
      >
        {/* ドラッグハンドル（モバイルのみ） */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
        </div>

        {/* ヘッダー */}
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-2">
            <h2 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 -mr-1 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              aria-label="閉じる"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}

        {/* 本体 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 thin-scrollbar">
          {children}
        </div>

        {/* フッター */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
