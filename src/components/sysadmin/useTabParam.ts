'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

/**
 * URL クエリ `?tab=` とタブ状態を同期するフック。
 * 不正値・未指定はデフォルトタブにフォールバックし、
 * デフォルトタブ選択時はクエリを付けない（正規URLを1つに保つ）。
 */
export function useTabParam<T extends string>(validKeys: readonly T[], defaultKey: T) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const raw = sp.get('tab')
  const tab: T = (validKeys as readonly string[]).includes(raw ?? '') ? (raw as T) : defaultKey
  const setTab = (k: T) => {
    const qs = new URLSearchParams(sp.toString())
    if (k === defaultKey) qs.delete('tab')
    else qs.set('tab', k)
    const q = qs.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }
  return [tab, setTab] as const
}
