'use client'

type Status = 'scheduled' | 'pending' | 'completed' | 'rescheduled' | 'absent' | 'cancelled'

type StatusBadgeProps = {
  status: Status
  className?: string
}

const statusConfig: Record<Status, { label: string; dotClass: string }> = {
  scheduled:   { label: '予定',     dotClass: 'bg-[var(--status-scheduled-text)]' },
  pending:     { label: '保留',     dotClass: 'bg-[var(--status-pending-text)]' },
  completed:   { label: '完了',     dotClass: 'bg-[var(--status-completed-text)]' },
  rescheduled: { label: '変更済',   dotClass: 'bg-[var(--status-rescheduled-text)]' },
  absent:      { label: '不在',     dotClass: 'bg-[var(--status-absent-text)]' },
  cancelled:   { label: 'キャンセル', dotClass: 'bg-[var(--status-cancelled-text)]' },
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
        bg-[var(--status-${status}-bg)] text-[var(--status-${status}-text)]
        ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  )
}

export type { Status }
