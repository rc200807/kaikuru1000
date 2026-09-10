'use client'

/**
 * 店舗ポータルの全画面で使い回すマスタを配る Context。
 *
 * サーバー（`(store)/layout.tsx`）で解決済みの値を注入するので、
 * これらのマスタに対するクライアント往復は**ゼロ**になる。
 * 日本→iad1 は1往復 0.22〜0.45 秒かかるので、画面あたり2〜4本の削減になる。
 *
 * ⚠ Provider 外（管理ポータル・契約書ページ）では **null を返す**。
 *   `DealDetailView` のような共用コンポーネントは null のときだけ従来どおり
 *   自分で取得する。管理ポータルの挙動を1ミリも変えないための約束。
 */
import { createContext, useContext } from 'react'
import type { StoreMasters } from '@/lib/store-bootstrap'

const StoreMastersContext = createContext<StoreMasters | null>(null)

/** Provider 配下なら解決済みのマスタ、外なら null */
export function useStoreMasters(): StoreMasters | null {
  return useContext(StoreMastersContext)
}

export function StoreMastersProvider({
  value,
  children,
}: {
  value: StoreMasters | null
  children: React.ReactNode
}) {
  return <StoreMastersContext.Provider value={value}>{children}</StoreMastersContext.Provider>
}
