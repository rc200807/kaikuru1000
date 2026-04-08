'use client'

import { useState, useEffect } from 'react'

type Severity = 'success' | 'error' | 'warning' | 'info'

type MessageBannerProps = {
  severity: Severity
  children: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
  icon?: React.ReactNode
  /** 自動で消える秒数。0で無効。デフォルト: success=4, info=5, warning=6, error=0(手動) */
  autoHideSeconds?: number
  /** フローティング表示（fixed positioned） */
  floating?: boolean
}

const severityConfig: Record<Severity, {
  bg: string
  borderColor: string
  iconColor: string
  textColor: string
  defaultAutoHide: number
}> = {
  success: {
    bg: '#f0fdf4',
    borderColor: '#22c55e',
    iconColor: 'text-[#15803d]',
    textColor: 'text-[#15803d]',
    defaultAutoHide: 4,
  },
  error: {
    bg: '#fef2f2',
    borderColor: '#ef4444',
    iconColor: 'text-[#991b1b]',
    textColor: 'text-[#991b1b]',
    defaultAutoHide: 0,
  },
  warning: {
    bg: '#fffbeb',
    borderColor: '#f59e0b',
    iconColor: 'text-[#92400e]',
    textColor: 'text-[#92400e]',
    defaultAutoHide: 6,
  },
  info: {
    bg: '#eff6ff',
    borderColor: '#3b82f6',
    iconColor: 'text-[#1e40af]',
    textColor: 'text-[#1e40af]',
    defaultAutoHide: 5,
  },
}

const defaultIcons: Record<Severity, React.ReactNode> = {
  success: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  ),
}

export default function MessageBanner({
  severity,
  children,
  dismissible = true,
  onDismiss,
  className = '',
  icon,
  autoHideSeconds,
  floating = false,
}: MessageBannerProps) {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)

  const config = severityConfig[severity]
  const hideDelay = autoHideSeconds ?? config.defaultAutoHide

  useEffect(() => {
    if (hideDelay > 0) {
      const timer = setTimeout(() => {
        setExiting(true)
        setTimeout(() => {
          setVisible(false)
          onDismiss?.()
        }, 300)
      }, hideDelay * 1000)
      return () => clearTimeout(timer)
    }
  }, [hideDelay, onDismiss])

  if (!visible) return null

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 300)
  }

  const card = (
    <div
      role="alert"
      className={`
        flex items-center gap-3 px-4 py-3
        rounded-[8px]
        transition-all duration-300
        ${exiting ? 'opacity-0 translate-y-[-8px] scale-95' : 'opacity-100 translate-y-0 scale-100'}
        ${className}
      `}
      style={{
        backgroundColor: config.bg,
        borderLeft: `3px solid ${config.borderColor}`,
        maxWidth: '420px',
      }}
    >
      {/* Icon */}
      <span className={`flex-shrink-0 ${config.iconColor}`}>
        {icon || defaultIcons[severity]}
      </span>

      {/* Text */}
      <div className={`flex-1 text-sm font-medium leading-snug ${config.textColor}`}>
        {children}
      </div>

      {/* Dismiss button */}
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors text-gray-400 hover:text-gray-600"
          aria-label="閉じる"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  )

  if (floating) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto animate-[slideDown_0.3s_ease-out]">
        {card}
      </div>
    )
  }

  return card
}
