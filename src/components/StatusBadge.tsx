'use client'

type Status = 'scheduled' | 'pending' | 'completed' | 'rescheduled' | 'absent' | 'cancelled'

type StatusBadgeProps = {
  status: Status
  className?: string
}

const statusConfig: Record<Status, { label: string }> = {
  scheduled:   { label: '予定' },
  pending:     { label: '保留' },
  completed:   { label: '完了' },
  rescheduled: { label: '変更済' },
  absent:      { label: '不在' },
  cancelled:   { label: 'キャンセル' },
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5
        rounded-full text-[12px] font-medium leading-tight
        bg-[var(--status-${status}-bg)] text-[var(--status-${status}-text)]
        ${className}
      `}
    >
      {config.label}
    </span>
  )
}

export type { Status }
