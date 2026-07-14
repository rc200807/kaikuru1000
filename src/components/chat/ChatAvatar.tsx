'use client'

/** チャット用アバター（画像があれば写真、なければ頭文字の丸） */
export default function ChatAvatar({
  name,
  authorType,
  accent,
  avatarUrl,
  size = 36,
}: {
  name: string
  authorType: 'admin' | 'store'
  accent: string
  avatarUrl?: string | null
  size?: number
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
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
