'use client'

/**
 * 店舗ポータルのページ遷移アニメーション。
 * template.tsx はナビゲーション毎に再マウントされるため、`.page-enter`（opacityフェード）を毎回適用する。
 * （opacity のみ＝ sticky AppBar を transform で壊さない。reduced-motion は globals.css で無効化）
 */
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
