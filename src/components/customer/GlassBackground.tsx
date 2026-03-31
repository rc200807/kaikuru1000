'use client'

import { lazy, Suspense } from 'react'

const GlassOrbs3D = lazy(() => import('@/components/GlassOrbs3D'))

/**
 * 顧客ページ共通: 3D球体背景付きレイアウト（ログイン前ページ用）
 * - WebGL 3Dパステル球体が浮遊する背景
 * - すりガラスカードの中にコンテンツ配置
 */
export default function GlassBackground({ children, maxWidth = 'max-w-md' }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      {/* Fixed 3D background that covers the full viewport */}
      <div className="fixed inset-0 z-0">
        <Suspense fallback={null}>
          <GlassOrbs3D />
        </Suspense>
      </div>
      <div className={`relative w-full ${maxWidth} z-10 my-8`}>
        <div className="bg-white/40 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/5 border border-white/60 p-8 sm:p-10">
          {children}
        </div>
      </div>
    </div>
  )
}
