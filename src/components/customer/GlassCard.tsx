'use client'

/**
 * 顧客ページ共通: すりガラスカード（ログイン後ページ用）
 */
type GlassCardProps = {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

export default function GlassCard({ children, className = '', padding = 'md' }: GlassCardProps) {
  const padClass = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6 sm:p-8',
  }[padding]

  return (
    <div className={`bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm ${padClass} ${className}`}>
      {children}
    </div>
  )
}
