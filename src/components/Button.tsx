'use client'

import { forwardRef } from 'react'

type ButtonProps = {
  variant?: 'filled' | 'outlined' | 'text' | 'tonal'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  fullWidth?: boolean
  className?: string
  danger?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'filled',
    size = 'md',
    children,
    onClick,
    type = 'button',
    disabled = false,
    loading = false,
    icon,
    fullWidth = false,
    className = '',
    danger = false,
  },
  ref
) {
  const isDisabled = disabled || loading

  const sizeClass = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-sm gap-2',
  }[size]

  const base = `
    inline-flex items-center justify-center font-medium
    rounded-[6px] select-none
    transition-all duration-200 ease-out
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsla(212,100%,48%,1)]
    disabled:opacity-40 disabled:pointer-events-none
    ${fullWidth ? 'w-full' : ''}
    ${sizeClass}
  `

  // Danger variants
  if (danger) {
    const dangerVariantClass = {
      filled:   'bg-[#dc2626] text-white hover:opacity-90 active:scale-[0.98]',
      outlined: 'text-[#dc2626] hover:bg-[#fef2f2] active:scale-[0.98]',
      text:     'text-[#dc2626] hover:bg-[#fef2f2]',
      tonal:    'bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] active:scale-[0.98]',
    }[variant]

    // For outlined danger, use inline shadow-border
    const dangerStyle: React.CSSProperties | undefined =
      variant === 'outlined'
        ? { boxShadow: 'rgb(220,38,38) 0px 0px 0px 1px' }
        : variant === 'filled'
          ? { boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px' }
          : undefined

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        onClick={onClick}
        style={dangerStyle}
        className={`${base} ${dangerVariantClass} ${className}`}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon ? (
          <span className="flex-shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    )
  }

  // Normal variants — use inline style for shadow-borders
  const variantClass = {
    filled:   'bg-[var(--portal-primary,#171717)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 active:scale-[0.98]',
    outlined: 'bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface,#171717)] hover:bg-[var(--md-sys-color-surface-container-low,#fafafa)] active:scale-[0.98]',
    text:     'text-[var(--md-sys-color-on-surface,#171717)] hover:bg-[var(--md-sys-color-surface-container-high,#f5f5f5)]',
    tonal:    'bg-[var(--md-sys-color-surface-container-high,#f5f5f5)] text-[var(--md-sys-color-on-surface,#171717)] hover:bg-[var(--md-sys-color-surface-container-highest,#eee)] active:scale-[0.98]',
  }[variant]

  // Shadow-as-border for filled and outlined
  const shadowStyle: React.CSSProperties | undefined =
    variant === 'outlined'
      ? { boxShadow: 'rgb(235,235,235) 0px 0px 0px 1px' }
      : variant === 'filled'
        ? { boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px' }
        : undefined

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      style={shadowStyle}
      className={`${base} ${variantClass} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  )
})

export default Button
