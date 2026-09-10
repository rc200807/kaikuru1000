'use client'

// タブ別データ取得フック（フィルタ+タブをキーにメモリキャッシュ。戻り時の再フェッチを抑制）
import { useState, useEffect, useCallback, useRef } from 'react'
import type { AnalyticsResponse, AnalyticsTab } from '@/lib/analytics/types'

const cache = new Map<string, AnalyticsResponse>()

export function clearAnalyticsCache() {
  cache.clear()
}

export function useAnalyticsData(tab: AnalyticsTab, query: string) {
  const key = `${tab}?${query}`
  const [data, setData] = useState<AnalyticsResponse | null>(cache.get(key) ?? null)
  const [loading, setLoading] = useState(!cache.has(key))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortedRef = useRef(false)

  useEffect(() => {
    const cached = cache.get(key)
    if (cached) {
      setData(cached)
      setLoading(false)
      setError(null)
      return
    }
    let aborted = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/analytics/${tab}?${query}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<AnalyticsResponse>
      })
      .then(d => {
        if (aborted) return
        cache.set(key, d)
        setData(d)
        setLoading(false)
      })
      .catch(e => {
        if (aborted) return
        setError(e instanceof Error ? e.message : '読み込みに失敗しました')
        setLoading(false)
      })
    return () => { aborted = true }
  }, [key, tab, query])

  // アンマウント後の setState を避けるためのフラグ。
  // StrictMode の二重マウント（mount→cleanup→mount）で立ちっぱなしにならないよう、
  // マウントのたびに false に戻すこと（戻さないと refresh が永久に「集計中」のままになる）
  useEffect(() => {
    abortedRef.current = false
    return () => { abortedRef.current = true }
  }, [])

  /**
   * サーバー側のスナップショットを捨てて集計し直す。
   * アクセス解析の概要は結果をキャッシュして即表示しているので、
   * 「いま」の数字が見たいときの逃げ道として用意している。
   */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/analytics/${tab}?${query}&refresh=1`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as AnalyticsResponse
      if (abortedRef.current) return
      cache.set(key, d)
      setData(d)
    } catch (e) {
      if (!abortedRef.current) setError(e instanceof Error ? e.message : '読み込みに失敗しました')
    } finally {
      if (!abortedRef.current) setRefreshing(false)
    }
  }, [key, tab, query])

  return { data, loading, error, refresh, refreshing }
}
