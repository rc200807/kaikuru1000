'use client'

import GlassOrbsBackground from '@/components/customer/GlassOrbsBackground'

/**
 * 顧客ページ共通: 球体背景付きレイアウト（ログイン前ページ用）
 * - 背景は端末に応じて WebGL / CSS グラデーションを出し分ける（GlassOrbsBackground）
 * - すりガラスカードの中にコンテンツ配置
 */
export default function GlassBackground({ children, maxWidth = 'max-w-md' }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      {/* Fixed 3D background that covers the full viewport */}
      <div className="fixed inset-0 z-0">
        <GlassOrbsBackground />
      </div>
      <div className={`relative w-full ${maxWidth} z-10 my-8`}>
        <div className="bg-white/40 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/5 border border-white/60 p-8 sm:p-10">
          {children}
        </div>
      </div>
    </div>
  )
}
