'use client'

import { useEffect, useState, type ComponentType } from 'react'

/**
 * 顧客向けページの背景。
 *
 * WebGL（three.js）の球体アニメーションは見た目が良い一方で、ライブラリだけで
 * 数百KB あり、描画ループも回り続ける。問い合わせフォームや LINE 登録など
 * 「最初に開く・軽くあるべきページ」で使われているため、割に合う端末でだけ読み込む。
 *
 * 3D を使わない条件（いずれか）:
 *  - 画面が狭い（スマホ）… 利用者の大半がここ。CSSグラデーションでも見た目は十分
 *  - 通信量の節約設定 / 2G 相当の回線
 *  - OS の「視差効果を減らす」設定
 *  - 端末メモリが 2GB 以下
 *
 * 判定してから import() するのが要点。React.lazy を使うと、描画しなくても
 * チャンクの取得だけは走ってしまうため、条件を満たしたときにだけ読み込む。
 * 判定は必ずマウント後（SSRとクライアントで結果が変わるとハイドレーションが壊れる）。
 */
export default function GlassOrbsBackground() {
  const [Orbs, setOrbs] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const slowNetwork = !!conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')
    const smallScreen = window.innerWidth < 768
    const lowMemory = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 2
    if (reduceMotion || slowNetwork || smallScreen || lowMemory) return

    let cancelled = false
    import('@/components/GlassOrbs3D')
      .then(m => { if (!cancelled) setOrbs(() => m.default) })
      .catch(() => { /* 背景が出ないだけなので黙って諦める */ })
    return () => { cancelled = true }
  }, [])

  if (Orbs) return <Orbs />

  // CSS だけのフォールバック。ぼかした円を3つ置くだけなので転送量も描画負荷もほぼゼロ
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#fdf5ef] via-[#f6f7fb] to-[#eef4fb]">
      <div className="absolute -top-24 -left-16 w-[60vw] h-[60vw] max-w-[420px] max-h-[420px] rounded-full bg-[#f8c9b4]/50 blur-3xl" />
      <div className="absolute top-1/3 -right-20 w-[55vw] h-[55vw] max-w-[380px] max-h-[380px] rounded-full bg-[#bcd7f2]/50 blur-3xl" />
      <div className="absolute -bottom-24 left-1/4 w-[50vw] h-[50vw] max-w-[340px] max-h-[340px] rounded-full bg-[#d9e7c8]/50 blur-3xl" />
    </div>
  )
}
