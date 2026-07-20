'use client'

// タブ別データ取得フック（フィルタ+タブをキーにメモリキャッシュ。戻り時の再フェッチを抑制）
import { useState, useEffect } from 'react'
import type { AnalyticsResponse, AnalyticsTab } from '@/lib/analytics/types'

const cache = new Map<string, AnalyticsResponse>()

export function clearAnalyticsCache() {
  cache.clear()
}

export function useAnalyticsData(tab: AnalyticsTab, query: string) {
  const key = `${tab}?${query}`
  const [data, setData] = useState<AnalyticsResponse | null>(cache.get(key) ?? null)
  const [loading, setLoading] = useState(!cache.has(key))
  const [error, setError] = useState<string | null>(null)

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

  return { data, loading, error }
}
