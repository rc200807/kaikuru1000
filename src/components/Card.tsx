'use client'

type CardProps = {
  variant?: 'elevated' | 'filled' | 'outlined'
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
}

const variantClass = {
  elevated: 'bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-[var(--md-sys-elevation-1)]',
  filled: 'bg-[var(--md-sys-color-surface-container-high)]',
  outlined: 'bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)]',
}

const paddingClass = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export default function Card({
  variant = 'elevated',
  children,
  className = '',
  padding = 'md',
  onClick,
}: CardProps) {
  const interactive = !!onClick

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      className={`
        rounded-[var(--md-sys-shape-medium)]
        ${variantClass[variant]}
        ${paddingClass[padding]}
        ${interactive ? 'cursor-pointer hover:shadow-[var(--md-sys-elevation-2)] active:shadow-[var(--md-sys-elevation-1)] transition-shadow duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-primary,#374151)]' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
