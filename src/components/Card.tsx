'use client'

type CardProps = {
  variant?: 'elevated' | 'filled' | 'outlined'
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
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

  // Vercel shadow-as-border system (inline styles for multi-value shadows)
  const variantStyle: Record<string, React.CSSProperties> = {
    elevated: {
      backgroundColor: 'var(--md-sys-color-surface-container-lowest, #fff)',
      boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px',
    },
    outlined: {
      backgroundColor: 'var(--md-sys-color-surface-container-lowest, #fff)',
      boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px',
    },
    filled: {
      backgroundColor: 'var(--md-sys-color-surface-container-high, #fafafa)',
      boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px',
    },
  }

  const hoverStyle: Record<string, React.CSSProperties> = {
    elevated: {
      boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.06) 0px 4px 6px',
    },
    outlined: {
      boxShadow: 'rgba(0,0,0,0.12) 0px 0px 0px 1px',
    },
    filled: {
      boxShadow: 'rgba(0,0,0,0.12) 0px 0px 0px 1px',
    },
  }

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      style={variantStyle[variant]}
      onMouseEnter={interactive ? (e) => {
        const hs = hoverStyle[variant]
        if (hs?.boxShadow) (e.currentTarget as HTMLElement).style.boxShadow = hs.boxShadow as string
      } : undefined}
      onMouseLeave={interactive ? (e) => {
        const vs = variantStyle[variant]
        if (vs?.boxShadow) (e.currentTarget as HTMLElement).style.boxShadow = vs.boxShadow as string
      } : undefined}
      className={`
        rounded-[8px]
        ${paddingClass[padding]}
        ${interactive ? 'cursor-pointer transition-shadow duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsla(212,100%,48%,1)]' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
