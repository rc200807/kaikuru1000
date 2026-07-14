'use client'

// セクション見出し（管理系ページ共通）
type Props = {
  title: string
  sub?: string
  aside?: React.ReactNode
}

export default function SectionHeading({ title, sub, aside }: Props) {
  return (
    <div className="flex items-end justify-between mt-8 mb-3">
      <div>
        <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">{title}</h2>
        {sub && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">{sub}</p>}
      </div>
      {aside}
    </div>
  )
}
