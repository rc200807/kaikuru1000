'use client'

/**
 * 顧客ページ共通: グラデーションボタン
 */
type GlassButtonProps = {
  children: React.ReactNode
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
  fullWidth?: boolean
  className?: string
}

export default function GlassButton({
  children,
  type = 'button',
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  fullWidth = true,
  className = '',
}: GlassButtonProps) {
  const base = `${fullWidth ? 'w-full' : ''} py-3.5 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60 ${className}`

  if (variant === 'primary') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled || loading}
        className={`${base} bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:from-red-700 hover:to-rose-600`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
            {children}
          </span>
        ) : children}
      </button>
    )
  }

  if (variant === 'secondary') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled || loading}
        className={`${base} bg-white/50 backdrop-blur-sm border border-white/80 text-red-600 hover:bg-white/70`}
      >
        {children}
      </button>
    )
  }

  // ghost
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} text-red-500/80 hover:text-red-600`}
    >
      {children}
    </button>
  )
}
