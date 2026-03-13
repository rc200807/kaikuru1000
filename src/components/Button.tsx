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
    md: 'h-10 px-5 text-sm gap-2',
    lg: 'h-12 px-6 text-sm gap-2',
  }[size]

  const base = `
    inline-flex items-center justify-center font-medium
    rounded-[var(--md-sys-shape-full)] select-none
    transition-all duration-200 ease-out
    focus-visible:outline-2 focus-visible:outline-offset-2
    disabled:opacity-40 disabled:pointer-events-none
    ${fullWidth ? 'w-full' : ''}
    ${sizeClass}
  `

  const variantClass = danger
    ? {
        filled:   'bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)] hover:shadow-md active:scale-[0.98]',
        outlined: 'border border-[var(--md-sys-color-error)] text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] active:scale-[0.98]',
        text:     'text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]',
        tonal:    'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] hover:shadow-sm active:scale-[0.98]',
      }[variant]
    : {
        filled:   'bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:shadow-md active:scale-[0.98]',
        outlined: 'border border-[var(--md-sys-color-outline)] text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-low)] active:scale-[0.98]',
        text:     'text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-low)]',
        tonal:    'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:shadow-sm active:scale-[0.98]',
      }[variant]

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
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
