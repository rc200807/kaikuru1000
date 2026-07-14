'use client'

// チャートを載せるカード枠（タイトル + 高さ固定コンテナ）
type Props = {
  title: string
  /** タイトル右側の補足要素 */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function ChartCard({ title, aside, children, className = '' }: Props) {
  return (
    <div className={`rounded-2xl p-5 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}
