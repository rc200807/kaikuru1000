'use client'

// 一覧画面のフィルタ・ソート・ページ状態をURLクエリと双方向同期するフック。
// リロードしても条件が残り、URLをそのまま共有できる。
import { useState, useEffect, useCallback, useRef } from 'react'

export function useListQueryState(keys: readonly string[]) {
  const [params, setParamsState] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)
  const keysRef = useRef(keys)
  keysRef.current = keys

  // 初回マウント時にURLから復元
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const initial: Record<string, string> = {}
    for (const k of keysRef.current) {
      const v = sp.get(k)
      if (v) initial[k] = v
    }
    setParamsState(initial)
    setReady(true)
  }, [])

  // 変更をURLへ反映（管理外のキー: customer / tab などは保持。history entryは増やさない）
  useEffect(() => {
    if (!ready) return
    const url = new URL(window.location.href)
    for (const k of keysRef.current) {
      const v = params[k]
      if (v) url.searchParams.set(k, v)
      else url.searchParams.delete(k)
    }
    window.history.replaceState(null, '', url.toString())
  }, [params, ready])

  /** 部分更新。空文字は削除扱い。フィルタ変更時はpageを1に戻す */
  const setParams = useCallback((patch: Record<string, string>, opts?: { keepPage?: boolean }) => {
    setParamsState(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(patch)) {
        if (v) next[k] = v
        else delete next[k]
      }
      if (!opts?.keepPage && !('page' in patch)) delete next.page
      return next
    })
  }, [])

  /** すべてのフィルタをリセットして置き換え */
  const replaceParams = useCallback((next: Record<string, string>) => {
    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(next)) if (v) cleaned[k] = v
    setParamsState(cleaned)
  }, [])

  return { params, setParams, replaceParams, ready }
}

/** paramsから指定キーだけをクエリ文字列化（保存ビュー・API呼び出し用） */
export function serializeParams(params: Record<string, string>, keys: readonly string[]): string {
  const sp = new URLSearchParams()
  for (const k of keys) {
    if (params[k]) sp.set(k, params[k])
  }
  return sp.toString()
}
