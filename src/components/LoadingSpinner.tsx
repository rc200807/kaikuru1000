'use client'

type LoadingSpinnerProps = {
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
  label?: string
  className?: string
}

const sizeMap = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
}

export default function LoadingSpinner({
  size = 'md',
  fullPage = false,
  label,
  className = '',
}: LoadingSpinnerProps) {
  const spinner = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div
        className={`
          ${sizeMap[size]}
          border-[var(--portal-primary,#374151)]
          border-t-transparent
          rounded-full animate-spin
        `}
      />
      {label && (
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] animate-pulse">
          {label}
        </p>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        {spinner}
      </div>
    )
  }

  return spinner
}
