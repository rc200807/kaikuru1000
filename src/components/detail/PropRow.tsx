'use client'

/** 詳細画面の項目行（案件詳細・顧客詳細で共用） */

/** 狭いカラム用: ラベル上・値下の縦積み。alert で不足を示すドットを出す */
export function PropRow({ label, value, alert, hint }: {
  label: string
  value: React.ReactNode
  alert?: boolean
  hint?: React.ReactNode
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
        {alert && <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-pending-text,#b45309)]" title="未入力です" />}
        {label}
      </div>
      <div className="text-sm text-[var(--md-sys-color-on-surface)] break-words">{value || '—'}</div>
      {hint && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{hint}</div>}
    </div>
  )
}

/** 広いカラム用: ラベル左（固定幅）・値右 */
export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      <span className="flex-1 text-[var(--md-sys-color-on-surface)] break-words">{value || '-'}</span>
    </div>
  )
}
