'use client'

/** チャット用アバター（画像がなければ頭文字の丸） */
export default function ChatAvatar({
  name,
  authorType,
  accent,
  size = 36,
}: {
  name: string
  authorType: 'admin' | 'store'
  accent: string
  size?: number
}) {
  const initial = (name || '?').trim().charAt(0) || '?'
  // 本部＝アクセント色、店舗＝ニュートラル色で送信者の区別をつける
  const bg = authorType === 'admin' ? accent : 'var(--md-sys-color-surface-container-highest)'
  const color = authorType === 'admin' ? '#fff' : 'var(--md-sys-color-on-surface)'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-hidden
    >
      {initial}
    </div>
  )
}
