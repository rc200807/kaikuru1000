type BadgeProps = {
  children: React.ReactNode
  /** インライン色（{bg,fg} 方式の deal-status / inventory-status / inquiry-status と統一） */
  bg?: string
  fg?: string
  className?: string
}

/** 汎用ステータス/カテゴリ バッジ（pill）。色は {bg,fg} で指定。 */
export default function Badge({ children, bg, fg, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${className}`}
      style={bg || fg ? { background: bg, color: fg } : undefined}
    >
      {children}
    </span>
  )
}
