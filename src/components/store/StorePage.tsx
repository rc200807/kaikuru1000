'use client'

import AppBar from '@/components/AppBar'

type Width = 'form' | 'standard' | 'data' | 'full'

// コンテナ幅の階層（プラン B）: フォーム/詳細・標準一覧・データ密・分割ペイン
const WIDTH_CLASS: Record<Width, string> = {
  form: 'max-w-3xl',
  standard: 'max-w-4xl',
  data: 'max-w-5xl',
  full: 'max-w-none',
}

type StorePageProps = {
  title: string
  subtitle?: string
  /** AppBar 右側のアクション（ボタン等） */
  actions?: React.ReactNode
  /** コンテナ幅の階層（既定: standard） */
  width?: Width
  /** 余白なし（分割ペイン等の全幅レイアウト用） */
  noPadding?: boolean
  /** ルートを min-height ではなく height: calc(100vh - appbar) にする（内部スクロールの分割ペイン用） */
  fill?: boolean
  /** コンテンツコンテナへの追加クラス */
  className?: string
  children: React.ReactNode
}

/**
 * 店舗ポータルの共通ページシェル。
 * AppBar + 規定の余白・コンテナ幅・最小高さを一元化し、全ページのレイアウトを統一する。
 */
export default function StorePage({
  title, subtitle, actions, width = 'standard',
  noPadding = false, fill = false, className = '', children,
}: StorePageProps) {
  const h = 'calc(100vh - var(--appbar-h))'
  return (
    <div className="flex flex-col" style={fill ? { height: h } : { minHeight: h }}>
      <AppBar title={title} subtitle={subtitle} actions={actions} />
      {noPadding ? (
        <div className={`flex-1 min-h-0 ${className}`}>{children}</div>
      ) : (
        <div className={`w-full ${WIDTH_CLASS[width]} mx-auto px-4 sm:px-6 py-4 sm:py-6 ${className}`}>
          {children}
        </div>
      )}
    </div>
  )
}
