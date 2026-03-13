'use client'

type SummaryCardProps = {
  label: string
  value: string | number
  unit?: string
  accentColor?: string
  icon?: React.ReactNode
  className?: string
}

export default function SummaryCard({
  label,
  value,
  unit,
  accentColor = 'bg-[var(--portal-primary,#374151)]',
  icon,
  className = '',
}: SummaryCardProps) {
  return (
    <div className={`
      bg-[var(--md-sys-color-surface-container-lowest,#fff)]
      rounded-[var(--md-sys-shape-medium)]
      shadow-[var(--md-sys-elevation-1)]
      p-4 sm:p-5
      flex items-center gap-3
      ${className}
    `}>
      {icon ? (
        <span className="flex-shrink-0 text-[var(--portal-primary,#374151)]">{icon}</span>
      ) : (
        <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${accentColor}`} />
      )}
      <div className="min-w-0">
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium truncate">
          {label}
        </p>
        <p className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] mt-0.5 leading-tight">
          {value}
          {unit && <span className="text-sm font-normal text-[var(--md-sys-color-on-surface-variant)] ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  )
}
