'use client'

import { useEffect, useRef, useCallback } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  className = '',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Sync open state with <dialog>
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handler = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', handler)
    return () => dialog.removeEventListener('cancel', handler)
  }, [onClose])

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose]
  )

  // Trap focus & prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="
        fixed inset-0 z-50 m-0 p-0 w-full h-full max-w-none max-h-none
        bg-transparent backdrop:bg-[var(--md-sys-color-scrim)]/50
        open:flex items-center justify-center
      "
      onClick={handleBackdropClick}
    >
      <div
        ref={contentRef}
        className={`
          w-[calc(100%-2rem)] ${sizeClass[size]}
          bg-[var(--md-sys-color-surface-container-lowest,#fff)]
          rounded-[var(--md-sys-shape-extra-large)]
          shadow-[var(--md-sys-elevation-3)]
          flex flex-col max-h-[85vh]
          animate-[modalIn_200ms_ease-out]
          ${className}
        `}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              aria-label="閉じる"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 thin-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-2">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}
